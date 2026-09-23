package cordisxgatewayintegration

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/pluginhost"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
	"github.com/router-for-me/CLIProxyAPI/v7/sdk/api/handlers"
	"gopkg.in/yaml.v3"
)

type receipt struct {
	Connection string
	Path       string
	Auth       string
	Session    string
	Model      string
	Body       map[string]any
	Headers    http.Header
}

type bridgeFixture struct {
	t        *testing.T
	host     *pluginhost.Host
	handler  *handlers.BaseAPIHandler
	receipts []receipt
	mu       sync.Mutex
	servers  []*httptest.Server
}

func TestGatewayBridgeUsesRealCLIProxyAPIPluginHost(t *testing.T) {
	gin.SetMode(gin.TestMode)
	fixture := newBridgeFixture(t, true, true)

	t.Run("two-connections-same-model", func(t *testing.T) {
		bodyA, okA := fixture.execute("connection-a/shared", http.Header{
			"Session-Id":          {"header-session"},
			"Authorization":       {"Bearer attacker"},
			"X-Untrusted-Session": {"attacker-session"},
		}, map[string]any{"metadata": map[string]any{"thread": "body-attacker"}})
		if !okA || string(bodyA) != `{"connection":"connection-a"}` {
			t.Fatalf("connection-a response = %s, ok=%v", bodyA, okA)
		}

		bodyB, okB := fixture.execute("connection-b/shared", http.Header{
			"Authorization": {"Bearer attacker"},
			"Session-Id":    {"header-attacker"},
		}, map[string]any{"metadata": map[string]any{"thread": "body-session"}})
		if !okB || string(bodyB) != `{"connection":"connection-b"}` {
			t.Fatalf("connection-b response = %s, ok=%v", bodyB, okB)
		}

		got := fixture.snapshot()
		if len(got) != 2 {
			t.Fatalf("receipts = %d, want 2", len(got))
		}
		assertReceipt(t, got[0], "connection-a", "fixture-key-a", "header-session")
		assertReceipt(t, got[1], "connection-b", "fixture-key-b", "body-session")
		if got[0].Headers.Get("Session-Id") != "" || got[0].Headers.Get("X-Untrusted-Session") != "" || got[1].Headers.Get("Session-Id") != "" {
			t.Fatalf("untrusted session carrier reached upstream: %#v", got)
		}
		if got[0].Headers.Get("Authorization") == "Bearer attacker" || got[1].Headers.Get("Authorization") == "Bearer attacker" {
			t.Fatalf("untrusted authorization reached upstream: %#v", got)
		}
	})

	t.Run("streaming", func(t *testing.T) {
		start := fixture.count()
		raw := []byte(`{"model":"connection-a/shared","stream":true,"metadata":{"thread":"ignored"}}`)
		ctx := requestContext(context.Background(), raw, http.Header{"Session-Id": {"stream-session"}})
		data, _, errors := fixture.handler.ExecuteStreamWithAuthManager(ctx, "openai", "connection-a/shared", raw, "")
		var output strings.Builder
		for data != nil || errors != nil {
			select {
			case chunk, ok := <-data:
				if !ok {
					data = nil
				} else {
					output.Write(chunk)
				}
			case err, ok := <-errors:
				if !ok {
					errors = nil
				} else if err != nil {
					t.Fatalf("stream error: %+v", err)
				}
			case <-time.After(5 * time.Second):
				t.Fatal("stream timed out")
			}
		}
		if fixture.count() != start+1 || !strings.Contains(output.String(), "stream-one") || !strings.Contains(output.String(), "[DONE]") {
			t.Fatalf("unexpected stream output %q", output.String())
		}
	})

	t.Run("cancellation-closes-host-http-stream", func(t *testing.T) {
		started := make(chan struct{})
		canceled := make(chan struct{})
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			close(started)
			w.Header().Set("Content-Type", "text/event-stream")
			w.WriteHeader(http.StatusOK)
			if flusher, ok := w.(http.Flusher); ok {
				flusher.Flush()
			}
			<-r.Context().Done()
			close(canceled)
		}))
		defer server.Close()
		fixture.reconfigure(true, true, server.URL)

		raw := []byte(`{"model":"connection-a/shared","stream":true}`)
		base, cancel := context.WithCancel(context.Background())
		ctx := requestContext(base, raw, http.Header{"Session-Id": {"cancel-session"}})
		data, _, errors := fixture.handler.ExecuteStreamWithAuthManager(ctx, "openai", "connection-a/shared", raw, "")
		select {
		case <-started:
		case <-time.After(5 * time.Second):
			t.Fatal("upstream stream did not start")
		}
		cancel()
		for data != nil || errors != nil {
			select {
			case _, ok := <-data:
				if !ok {
					data = nil
				}
			case _, ok := <-errors:
				if !ok {
					errors = nil
				}
			case <-time.After(5 * time.Second):
				t.Fatal("canceled downstream stream did not close")
			}
		}
		select {
		case <-canceled:
		case <-time.After(5 * time.Second):
			t.Fatal("host HTTP stream remained open after cancellation")
		}
		fixture.reconfigure(true, true, "")
	})

	t.Run("required-adapter-failures-never-reach-upstream", func(t *testing.T) {
		start := fixture.count()
		_, ok := fixture.execute("connection-a/shared", nil, map[string]any{})
		if ok || fixture.count() != start {
			t.Fatal("missing required session reached upstream")
		}

		fixture.reconfigure(false, true, "")
		_, ok = fixture.execute("connection-a/shared", http.Header{"Session-Id": {"blocked"}}, map[string]any{})
		if ok || fixture.count() != start {
			t.Fatal("disabled required adapter reached upstream")
		}

		fixture.reconfigure(true, false, "")
		_, ok = fixture.execute("connection-a/shared", http.Header{"Session-Id": {"blocked"}}, map[string]any{})
		if ok || fixture.count() != start {
			t.Fatal("mismatched required adapter reached upstream")
		}

		fixture.reconfigure(true, true, "")
		body, ok := fixture.execute("connection-a/shared", http.Header{"Session-Id": {"restored"}}, map[string]any{})
		if !ok || string(body) != `{"connection":"connection-a"}` || fixture.count() != start+1 {
			t.Fatalf("restored adapter did not resume exact route: %s, ok=%v", body, ok)
		}
	})

	t.Run("disabled-bridge-owns-protected-model-without-fallthrough", func(t *testing.T) {
		start := fixture.count()
		fixture.reconfigure(true, true, "", false)
		registry.GetGlobalRegistry().RegisterClient("fallback-client", "openai", []*registry.ModelInfo{{
			ID: "connection-a/shared", Object: "model",
		}})
		defer registry.GetGlobalRegistry().UnregisterClient("fallback-client")
		_, ok := fixture.execute("connection-a/shared", http.Header{"Session-Id": {"blocked"}}, map[string]any{})
		if ok || fixture.count() != start {
			t.Fatal("disabled bridge fell through to a same-id provider")
		}
	})
}

func newBridgeFixture(t *testing.T, adapterEnabled, matchingRevision bool) *bridgeFixture {
	t.Helper()
	root := os.Getenv("CORDISX_GATEWAY_REPO")
	if root == "" {
		var err error
		root, err = filepath.Abs(filepath.Join("..", ".."))
		if err != nil {
			t.Fatal(err)
		}
	}
	pluginRoot := filepath.Join(root, "runtime", "cli-proxy-plugins")
	extension := pluginhost.PluginExtension(runtime.GOOS)
	pluginPath := filepath.Join(pluginRoot, runtime.GOOS, runtime.GOARCH, "cordisx-gateway-bridge"+extension)
	if _, err := os.Stat(pluginPath); err != nil {
		t.Fatalf("native bridge is missing at %s: %v", pluginPath, err)
	}
	fixture := &bridgeFixture{t: t}
	makeServer := func(connection string) *httptest.Server {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw, _ := io.ReadAll(r.Body)
			body := map[string]any{}
			_ = json.Unmarshal(raw, &body)
			metadata, _ := body["metadata"].(map[string]any)
			fixture.mu.Lock()
			fixture.receipts = append(fixture.receipts, receipt{
				Connection: connection,
				Path:       r.URL.Path,
				Auth:       r.Header.Get("Authorization"),
				Session:    r.Header.Get("X-Session"),
				Model:      fmt.Sprint(body["model"]),
				Body:       body,
				Headers:    r.Header.Clone(),
			})
			fixture.mu.Unlock()
			w.Header().Set("Content-Type", "text/event-stream")
			if fmt.Sprint(body["stream"]) == "true" {
				_, _ = io.WriteString(w, "data: {\"choices\":[{\"delta\":{\"content\":\"stream-one\"}}]}\n\n")
				_, _ = io.WriteString(w, "data: [DONE]\n\n")
				return
			}
			_ = metadata
			_, _ = io.WriteString(w, fmt.Sprintf(`{"connection":%q}`, connection))
		}))
		fixture.servers = append(fixture.servers, server)
		return server
	}
	a, b := makeServer("connection-a"), makeServer("connection-b")
	fixture.host = pluginhost.New()
	initialConfig := config.Config{}
	fixture.handler = handlers.NewBaseAPIHandlers(&initialConfig.SDKConfig, nil)
	fixture.handler.SetPluginHost(fixture.host)
	fixture.reconfigureWithEndpoints(pluginRoot, a.URL, b.URL, adapterEnabled, matchingRevision, true)
	t.Cleanup(func() {
		fixture.host.ShutdownAll()
		for _, server := range fixture.servers {
			server.Close()
		}
	})
	return fixture
}

func (fixture *bridgeFixture) reconfigure(adapterEnabled, matchingRevision bool, overrideA string, enabled ...bool) {
	fixture.t.Helper()
	pluginRoot := filepath.Dir(filepath.Dir(filepath.Dir(fixture.pluginPath())))
	a := fixture.servers[0].URL
	if overrideA != "" {
		a = overrideA
	}
	bridgeEnabled := true
	if len(enabled) > 0 {
		bridgeEnabled = enabled[0]
	}
	fixture.reconfigureWithEndpoints(pluginRoot, a, fixture.servers[1].URL, adapterEnabled, matchingRevision, bridgeEnabled)
}

func (fixture *bridgeFixture) reconfigureWithEndpoints(pluginRoot, endpointA, endpointB string, adapterEnabled, matchingRevision, bridgeEnabled bool) {
	fixture.t.Helper()
	adapterRevision := 1
	if !matchingRevision {
		adapterRevision = 2
	}
	connectionAEnabled := adapterEnabled && matchingRevision
	if !connectionAEnabled {
		endpointA = ""
	}
	configYAML := fmt.Sprintf(`plugins:
  enabled: true
  dir: %q
  configs:
    cordisx-gateway-bridge:
      enabled: true
      active: %t
      priority: 100
      revision: fixture
      adapters:
        - adapterId: header-session
          revision: 1
          enabled: %t
          requiredSession: true
          sessionSources:
            - kind: header
              name: Session-Id
          request:
            clearHeaders: [Session-Id, X-Untrusted-Session]
            setHeaders:
              X-Session: "{{session}}"
              X-Connection: "{{connectionId}}"
            setBody:
              /metadata/session: "{{session}}"
        - adapterId: body-session
          revision: 1
          enabled: true
          requiredSession: true
          sessionSources:
            - kind: body-json-pointer
              pointer: /metadata/thread
          request:
            clearHeaders: [Session-Id]
            setHeaders:
              X-Session: "{{session}}"
            setBody:
              /metadata/session: "{{session}}"
      connections:
        - connectionId: connection-a
          revision: 1
          enabled: %t
          adapterId: header-session
          adapterRevision: %d
          adapterRequired: true
          adapterAvailable: %t
          wireApi: responses
          endpointPath: /responses
          endpoint: %q
          authorization: bearer
          credential: fixture-key-a
          models:
            - sourceModelId: shared-model
              gatewayModelId: connection-a/shared
              displayName: Shared A
              isDefault: true
        - connectionId: connection-b
          revision: 1
          enabled: true
          adapterId: body-session
          adapterRevision: 1
          adapterRequired: true
          adapterAvailable: true
          wireApi: responses
          endpointPath: /responses
          endpoint: %q
          authorization: bearer
          credential: fixture-key-b
          models:
            - sourceModelId: shared-model
              gatewayModelId: connection-b/shared
              displayName: Shared B
              isDefault: true
`, pluginRoot, bridgeEnabled, adapterEnabled, connectionAEnabled, adapterRevision, matchingRevision, endpointA, endpointB)
	var cfg config.Config
	if err := yaml.Unmarshal([]byte(configYAML), &cfg); err != nil {
		fixture.t.Fatal(err)
	}
	fixture.host.ApplyConfig(context.Background(), &cfg)
	fixture.handler.UpdateClients(&cfg.SDKConfig)
}

func (fixture *bridgeFixture) pluginPath() string {
	root := os.Getenv("CORDISX_GATEWAY_REPO")
	if root == "" {
		root, _ = filepath.Abs(filepath.Join("..", ".."))
	}
	return filepath.Join(root, "runtime", "cli-proxy-plugins", runtime.GOOS, runtime.GOARCH, "cordisx-gateway-bridge"+pluginhost.PluginExtension(runtime.GOOS))
}

func (fixture *bridgeFixture) execute(model string, headers http.Header, body map[string]any) ([]byte, bool) {
	fixture.t.Helper()
	body["model"] = model
	raw, err := json.Marshal(body)
	if err != nil {
		fixture.t.Fatal(err)
	}
	ctx := requestContext(context.Background(), raw, headers)
	response, _, errMessage := fixture.handler.ExecuteWithAuthManager(ctx, "openai-response", model, raw, "")
	return response, errMessage == nil
}

func requestContext(parent context.Context, body []byte, headers http.Header) context.Context {
	ginContext, _ := gin.CreateTestContext(httptest.NewRecorder())
	ginContext.Request = httptest.NewRequest(http.MethodPost, "http://127.0.0.1/v1/responses", strings.NewReader(string(body))).WithContext(parent)
	ginContext.Request.Header = headers.Clone()
	return context.WithValue(parent, "gin", ginContext)
}

func (fixture *bridgeFixture) count() int {
	fixture.mu.Lock()
	defer fixture.mu.Unlock()
	return len(fixture.receipts)
}

func (fixture *bridgeFixture) snapshot() []receipt {
	fixture.mu.Lock()
	defer fixture.mu.Unlock()
	return append([]receipt(nil), fixture.receipts...)
}

func assertReceipt(t *testing.T, got receipt, connection, credential, session string) {
	t.Helper()
	if got.Connection != connection || got.Path != "/responses" || got.Auth != "Bearer "+credential || got.Session != session || got.Model != "shared-model" {
		t.Fatalf("unexpected receipt: %#v", got)
	}
	metadata, _ := got.Body["metadata"].(map[string]any)
	if fmt.Sprint(metadata["session"]) != session {
		t.Fatalf("body session = %#v, want %q", metadata["session"], session)
	}
}
