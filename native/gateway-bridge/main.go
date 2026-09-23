package main

/*
#include <stdint.h>
#include <stdlib.h>

typedef struct {
	void* ptr;
	size_t len;
} cliproxy_buffer;

typedef int (*cliproxy_host_call_fn)(void*, const char*, const uint8_t*, size_t, cliproxy_buffer*);
typedef void (*cliproxy_host_free_fn)(void*, size_t);

typedef struct {
	uint32_t abi_version;
	void* host_ctx;
	cliproxy_host_call_fn call;
	cliproxy_host_free_fn free_buffer;
} cliproxy_host_api;

typedef int (*cliproxy_plugin_call_fn)(char*, uint8_t*, size_t, cliproxy_buffer*);
typedef void (*cliproxy_plugin_free_fn)(void*, size_t);
typedef void (*cliproxy_plugin_shutdown_fn)(void);

typedef struct {
	uint32_t abi_version;
	cliproxy_plugin_call_fn call;
	cliproxy_plugin_free_fn free_buffer;
	cliproxy_plugin_shutdown_fn shutdown;
} cliproxy_plugin_api;

extern int cliproxyPluginCall(char*, uint8_t*, size_t, cliproxy_buffer*);
extern void cliproxyPluginFree(void*, size_t);
extern void cliproxyPluginShutdown(void);

static const cliproxy_host_api* stored_host;

static void store_host_api(const cliproxy_host_api* host) {
	stored_host = host;
}

static int call_host_api(const char* method, const uint8_t* request, size_t request_len, cliproxy_buffer* response) {
	if (stored_host == NULL || stored_host->call == NULL) {
		return 1;
	}
	return stored_host->call(stored_host->host_ctx, method, request, request_len, response);
}

static void free_host_buffer(void* ptr, size_t len) {
	if (stored_host != NULL && stored_host->free_buffer != NULL && ptr != NULL) {
		stored_host->free_buffer(ptr, len);
	}
}
*/
import "C"

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"sync"
	"unsafe"

	"gopkg.in/yaml.v3"
)

const (
	abiVersion         uint32 = 1
	pluginSchema       uint32 = 3
	pluginID                  = "cordisx-gateway-bridge"
	providerID                = "cordisx-gateway-bridge"
	sessionTemplate           = "{{session}}"
	connectionTemplate        = "{{connectionId}}"
	modelTemplate             = "{{sourceModelId}}"
)

type envelope struct {
	OK     bool            `json:"ok"`
	Result json.RawMessage `json:"result,omitempty"`
	Error  *envelopeError  `json:"error,omitempty"`
}

type envelopeError struct {
	Code       string `json:"code"`
	Message    string `json:"message"`
	HTTPStatus int    `json:"http_status,omitempty"`
}

type lifecycleRequest struct {
	ConfigYAML []byte `json:"config_yaml"`
}

type sessionSource struct {
	Kind    string `yaml:"kind"`
	Name    string `yaml:"name"`
	Pointer string `yaml:"pointer"`
}

type adapter struct {
	AdapterID       string          `yaml:"adapterId"`
	Revision        int64           `yaml:"revision"`
	Enabled         bool            `yaml:"enabled"`
	RequiredSession bool            `yaml:"requiredSession"`
	SessionSources  []sessionSource `yaml:"sessionSources"`
	Request         struct {
		ClearHeaders []string       `yaml:"clearHeaders"`
		SetHeaders   map[string]any `yaml:"setHeaders"`
		SetBody      map[string]any `yaml:"setBody"`
	} `yaml:"request"`
}

type connectionModel struct {
	SourceModelID  string `yaml:"sourceModelId"`
	GatewayModelID string `yaml:"gatewayModelId"`
	DisplayName    string `yaml:"displayName"`
	IsDefault      bool   `yaml:"isDefault"`
}

type connection struct {
	ConnectionID     string            `yaml:"connectionId"`
	Revision         int64             `yaml:"revision"`
	Enabled          bool              `yaml:"enabled"`
	AdapterID        string            `yaml:"adapterId"`
	AdapterRevision  int64             `yaml:"adapterRevision"`
	AdapterRequired  bool              `yaml:"adapterRequired"`
	AdapterAvailable bool              `yaml:"adapterAvailable"`
	WireAPI          string            `yaml:"wireApi"`
	EndpointPath     string            `yaml:"endpointPath"`
	Endpoint         string            `yaml:"endpoint"`
	Authorization    string            `yaml:"authorization"`
	Credential       string            `yaml:"credential"`
	Models           []connectionModel `yaml:"models"`
}

type bridgeConfig struct {
	Enabled     bool         `yaml:"enabled"`
	Active      bool         `yaml:"active"`
	Revision    string       `yaml:"revision"`
	Adapters    []adapter    `yaml:"adapters"`
	Connections []connection `yaml:"connections"`
}

type runtimePlan struct {
	config      bridgeConfig
	adapters    map[string]adapter
	connections map[string]connection
	models      map[string]connectionModel
}

type modelRouteRequest struct {
	RequestedModel string `json:"RequestedModel"`
}

type executorRequest struct {
	Model           string              `json:"Model"`
	Format          string              `json:"Format"`
	Stream          bool                `json:"Stream"`
	Headers         map[string][]string `json:"Headers"`
	Query           url.Values          `json:"Query"`
	OriginalRequest []byte              `json:"OriginalRequest"`
	SourceFormat    string              `json:"SourceFormat"`
	Payload         []byte              `json:"Payload"`
	StreamID        string              `json:"stream_id"`
	HostCallbackID  string              `json:"host_callback_id"`
}

type hostHTTPResponse struct {
	StatusCode int                 `json:"StatusCode"`
	Headers    map[string][]string `json:"Headers"`
	Body       []byte              `json:"Body"`
}

type hostHTTPStreamResponse struct {
	StatusCode int                 `json:"status_code"`
	Headers    map[string][]string `json:"headers"`
	StreamID   string              `json:"stream_id"`
}

type hostHTTPStreamReadResponse struct {
	Payload []byte `json:"payload"`
	Error   string `json:"error"`
	Done    bool   `json:"done"`
}

var state = struct {
	sync.RWMutex
	plan runtimePlan
}{plan: emptyPlan()}

func main() {}

//export cliproxy_plugin_init
func cliproxy_plugin_init(host *C.cliproxy_host_api, plugin *C.cliproxy_plugin_api) C.int {
	if host == nil || plugin == nil || uint32(host.abi_version) != abiVersion {
		return 1
	}
	C.store_host_api(host)
	plugin.abi_version = C.uint32_t(abiVersion)
	plugin.call = C.cliproxy_plugin_call_fn(C.cliproxyPluginCall)
	plugin.free_buffer = C.cliproxy_plugin_free_fn(C.cliproxyPluginFree)
	plugin.shutdown = C.cliproxy_plugin_shutdown_fn(C.cliproxyPluginShutdown)
	return 0
}

//export cliproxyPluginCall
func cliproxyPluginCall(method *C.char, request *C.uint8_t, requestLen C.size_t, response *C.cliproxy_buffer) C.int {
	if response != nil {
		response.ptr = nil
		response.len = 0
	}
	if method == nil {
		writeResponse(response, errorEnvelope("invalid_method", "method is required", 0))
		return 1
	}
	rawRequest := []byte(nil)
	if request != nil && requestLen > 0 {
		rawRequest = C.GoBytes(unsafe.Pointer(request), C.int(requestLen))
	}
	raw, errHandle := handleMethod(C.GoString(method), rawRequest)
	if errHandle != nil {
		writeResponse(response, errorEnvelope("gateway_bridge_error", errHandle.Error(), httpStatus(errHandle)))
		return 1
	}
	writeResponse(response, raw)
	return 0
}

//export cliproxyPluginFree
func cliproxyPluginFree(ptr unsafe.Pointer, length C.size_t) {
	if ptr != nil {
		C.free(ptr)
	}
	_ = length
}

//export cliproxyPluginShutdown
func cliproxyPluginShutdown() {
	state.Lock()
	state.plan = emptyPlan()
	state.Unlock()
}

func handleMethod(method string, raw []byte) ([]byte, error) {
	switch method {
	case "plugin.register", "plugin.reconfigure":
		if err := configure(raw); err != nil {
			return nil, err
		}
		return okEnvelope(map[string]any{
			"schema_version": pluginSchema,
			"metadata": map[string]any{
				"Name": "CordisX Gateway Bridge", "Version": "1.0.0", "Author": "CordisX",
				"GitHubRepository": "https://github.com/cordisx/plugin-cli-proxy-api", "ConfigFields": []any{},
			},
			"capabilities": map[string]any{
				"model_provider": true, "model_router": true, "executor": true,
				"executor_model_scope":    "static",
				"executor_input_formats":  []string{"openai", "openai-response"},
				"executor_output_formats": []string{"openai", "openai-response"},
			},
		})
	case "executor.identifier":
		return okEnvelope(map[string]string{"identifier": providerID})
	case "model.static":
		return staticModels()
	case "model.for_auth":
		return okEnvelope(map[string]any{"Provider": providerID, "Models": []any{}})
	case "model.route":
		return routeModel(raw)
	case "executor.execute":
		return execute(raw)
	case "executor.execute_stream":
		return executeStream(raw)
	case "executor.count_tokens", "executor.http_request":
		return nil, statusError{status: http.StatusNotImplemented, message: "operation is not supported by the gateway bridge"}
	default:
		return nil, fmt.Errorf("unknown method: %s", method)
	}
}

func emptyPlan() runtimePlan {
	return runtimePlan{adapters: map[string]adapter{}, connections: map[string]connection{}, models: map[string]connectionModel{}}
}

func configure(raw []byte) error {
	var request lifecycleRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		return fmt.Errorf("decode lifecycle request: %w", err)
	}
	var config bridgeConfig
	if err := yaml.Unmarshal(request.ConfigYAML, &config); err != nil {
		return fmt.Errorf("decode bridge configuration: %w", err)
	}
	plan := emptyPlan()
	plan.config = config
	for _, item := range config.Adapters {
		if item.AdapterID == "" || item.Revision < 1 {
			return fmt.Errorf("invalid adapter configuration")
		}
		plan.adapters[item.AdapterID] = item
	}
	for _, item := range config.Connections {
		if item.ConnectionID == "" || item.EndpointPath == "" || item.Revision < 1 {
			return fmt.Errorf("invalid connection configuration")
		}
		if item.Enabled && item.Endpoint == "" {
			return fmt.Errorf("invalid connection configuration")
		}
		if _, exists := plan.connections[item.ConnectionID]; exists {
			return fmt.Errorf("duplicate connection %s", item.ConnectionID)
		}
		plan.connections[item.ConnectionID] = item
		for _, model := range item.Models {
			if _, exists := plan.models[model.GatewayModelID]; exists {
				return fmt.Errorf("duplicate gateway model %s", model.GatewayModelID)
			}
			plan.models[model.GatewayModelID] = model
		}
	}
	state.Lock()
	state.plan = plan
	state.Unlock()
	return nil
}

func snapshot() runtimePlan {
	state.RLock()
	defer state.RUnlock()
	return state.plan
}

func staticModels() ([]byte, error) {
	plan := snapshot()
	ids := make([]string, 0, len(plan.models))
	for id := range plan.models {
		ids = append(ids, id)
	}
	slices.Sort(ids)
	models := make([]map[string]any, 0, len(ids))
	for _, id := range ids {
		model := plan.models[id]
		connection := plan.connections[strings.SplitN(id, "/", 2)[0]]
		if !connectionReady(plan, connection) {
			continue
		}
		models = append(models, map[string]any{
			"ID": id, "Object": "model", "OwnedBy": providerID,
			"DisplayName": model.DisplayName, "Name": model.SourceModelID,
		})
	}
	return okEnvelope(map[string]any{"Provider": providerID, "Models": models})
}

func routeModel(raw []byte) ([]byte, error) {
	var request modelRouteRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		return nil, fmt.Errorf("decode route request: %w", err)
	}
	plan := snapshot()
	_, exists := plan.models[request.RequestedModel]
	if !exists {
		return okEnvelope(map[string]any{"Handled": false})
	}
	return okEnvelope(map[string]any{
		"Handled": true, "TargetKind": "self", "Reason": "cordisx protected connection",
	})
}

func connectionReady(plan runtimePlan, connection connection) bool {
	if !plan.config.Active || !connection.Enabled || connection.ConnectionID == "" {
		return false
	}
	adapter, exists := plan.adapters[connection.AdapterID]
	return !connection.AdapterRequired || (exists && adapter.Enabled && adapter.Revision == connection.AdapterRevision && connection.AdapterAvailable)
}

func execute(raw []byte) ([]byte, error) {
	request, connection, adapter, model, err := prepare(raw)
	if err != nil {
		return nil, err
	}
	upstream, err := outboundRequest(request, connection, adapter, model)
	if err != nil {
		return nil, err
	}
	var response hostHTTPResponse
	if err := callHost("host.http.do", upstream, &response); err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return nil, statusError{status: response.StatusCode, message: "gateway upstream rejected request"}
	}
	return okEnvelope(map[string]any{"Payload": response.Body, "Headers": response.Headers})
}

func executeStream(raw []byte) ([]byte, error) {
	request, connection, adapter, model, err := prepare(raw)
	if err != nil {
		return nil, err
	}
	if request.StreamID == "" {
		return nil, fmt.Errorf("stream id is required")
	}
	upstream, err := outboundRequest(request, connection, adapter, model)
	if err != nil {
		return nil, err
	}
	var response hostHTTPStreamResponse
	if err := callHost("host.http.do_stream", upstream, &response); err != nil {
		return nil, err
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_ = callHost("host.http.stream_close", map[string]string{"stream_id": response.StreamID}, nil)
		return nil, statusError{status: response.StatusCode, message: "gateway upstream rejected stream"}
	}
	go forwardStream(request.StreamID, response.StreamID)
	return okEnvelope(map[string]any{"headers": response.Headers})
}

func prepare(raw []byte) (executorRequest, connection, adapter, connectionModel, error) {
	var request executorRequest
	if err := json.Unmarshal(raw, &request); err != nil {
		return request, connection{}, adapter{}, connectionModel{}, fmt.Errorf("decode executor request: %w", err)
	}
	plan := snapshot()
	model, exists := plan.models[request.Model]
	if !exists {
		return request, connection{}, adapter{}, model, statusError{status: http.StatusNotFound, message: "gateway model is not registered"}
	}
	connectionID := strings.SplitN(model.GatewayModelID, "/", 2)[0]
	connection := plan.connections[connectionID]
	if !connectionReady(plan, connection) {
		return request, connection, adapter{}, model, statusError{status: http.StatusServiceUnavailable, message: "required gateway adapter is unavailable"}
	}
	selectedAdapter, exists := plan.adapters[connection.AdapterID]
	if connection.AdapterRequired && (!exists || !selectedAdapter.Enabled || selectedAdapter.Revision != connection.AdapterRevision) {
		return request, connection, adapter{}, model, statusError{status: http.StatusServiceUnavailable, message: "gateway adapter is unavailable"}
	}
	if !exists || !selectedAdapter.Enabled || selectedAdapter.Revision != connection.AdapterRevision {
		selectedAdapter = adapter{}
	}
	return request, connection, selectedAdapter, model, nil
}

func outboundRequest(request executorRequest, connection connection, adapter adapter, model connectionModel) (map[string]any, error) {
	body := request.Payload
	if len(body) == 0 {
		body = request.OriginalRequest
	}
	var document any
	if err := json.Unmarshal(body, &document); err != nil {
		return nil, statusError{status: http.StatusBadRequest, message: "gateway request body must be JSON"}
	}
	session := sessionValue(adapter.SessionSources, request.Headers, document)
	if adapter.RequiredSession && session == "" {
		return nil, statusError{status: http.StatusBadRequest, message: "required gateway session is missing"}
	}
	if err := setPointer(&document, "/model", model.SourceModelID); err != nil {
		return nil, err
	}
	vars := map[string]string{sessionTemplate: session, connectionTemplate: connection.ConnectionID, modelTemplate: model.SourceModelID}
	for pointer, template := range adapter.Request.SetBody {
		if err := setPointer(&document, pointer, expandTemplate(template, vars)); err != nil {
			return nil, statusError{status: http.StatusBadRequest, message: "invalid gateway body transform"}
		}
	}
	encoded, err := json.Marshal(document)
	if err != nil {
		return nil, fmt.Errorf("encode gateway request: %w", err)
	}
	headers := cloneHeaders(request.Headers)
	deleteHeader(headers, "Authorization")
	deleteHeader(headers, "Host")
	deleteHeader(headers, "Content-Length")
	for _, name := range adapter.Request.ClearHeaders {
		deleteHeader(headers, name)
	}
	for name, template := range adapter.Request.SetHeaders {
		value := expandTemplate(template, vars)
		text, ok := value.(string)
		if !ok {
			raw, err := json.Marshal(value)
			if err != nil {
				return nil, fmt.Errorf("encode gateway header transform: %w", err)
			}
			text = string(raw)
		}
		headers[http.CanonicalHeaderKey(name)] = []string{text}
	}
	if connection.Authorization == "bearer" {
		if connection.Credential == "" {
			return nil, statusError{status: http.StatusServiceUnavailable, message: "gateway connection credential is unavailable"}
		}
		headers["Authorization"] = []string{"Bearer " + connection.Credential}
	}
	headers["Content-Type"] = []string{"application/json"}
	target, err := joinEndpoint(connection.Endpoint, connection.EndpointPath)
	if err != nil {
		return nil, statusError{status: http.StatusServiceUnavailable, message: "gateway connection endpoint is invalid"}
	}
	return map[string]any{
		"host_callback_id": request.HostCallbackID,
		"method":           http.MethodPost,
		"url":              target,
		"headers":          headers,
		"body":             encoded,
	}, nil
}

func forwardStream(pluginStreamID, upstreamStreamID string) {
	defer func() {
		_ = callHost("host.http.stream_close", map[string]string{"stream_id": upstreamStreamID}, nil)
		_ = callHost("host.stream.close", map[string]string{"stream_id": pluginStreamID}, nil)
	}()
	for {
		var chunk hostHTTPStreamReadResponse
		if err := callHost("host.http.stream_read", map[string]string{"stream_id": upstreamStreamID}, &chunk); err != nil {
			_ = callHost("host.stream.close", map[string]string{"stream_id": pluginStreamID, "error": err.Error()}, nil)
			return
		}
		if chunk.Error != "" {
			_ = callHost("host.stream.close", map[string]string{"stream_id": pluginStreamID, "error": chunk.Error}, nil)
			return
		}
		if len(chunk.Payload) > 0 {
			if err := callHost("host.stream.emit", map[string]any{"stream_id": pluginStreamID, "payload": chunk.Payload}, nil); err != nil {
				return
			}
		}
		if chunk.Done {
			return
		}
	}
}

func sessionValue(sources []sessionSource, headers map[string][]string, body any) string {
	for _, source := range sources {
		if source.Kind == "header" {
			for name, values := range headers {
				if strings.EqualFold(name, source.Name) && len(values) > 0 && strings.TrimSpace(values[0]) != "" {
					return strings.TrimSpace(values[0])
				}
			}
			continue
		}
		if source.Kind == "body-json-pointer" {
			if value, ok := getPointer(body, source.Pointer).(string); ok && strings.TrimSpace(value) != "" {
				return strings.TrimSpace(value)
			}
		}
	}
	return ""
}

func expandTemplate(value any, vars map[string]string) any {
	switch item := value.(type) {
	case string:
		if replacement, ok := vars[item]; ok {
			return replacement
		}
		for token, replacement := range vars {
			item = strings.ReplaceAll(item, token, replacement)
		}
		return item
	case []any:
		out := make([]any, len(item))
		for index, child := range item {
			out[index] = expandTemplate(child, vars)
		}
		return out
	case map[string]any:
		out := make(map[string]any, len(item))
		for key, child := range item {
			out[key] = expandTemplate(child, vars)
		}
		return out
	default:
		return value
	}
}

func pointerTokens(pointer string) ([]string, error) {
	if pointer == "" || pointer[0] != '/' {
		return nil, fmt.Errorf("invalid JSON pointer")
	}
	parts := strings.Split(pointer[1:], "/")
	for index := range parts {
		parts[index] = strings.ReplaceAll(strings.ReplaceAll(parts[index], "~1", "/"), "~0", "~")
	}
	return parts, nil
}

func getPointer(root any, pointer string) any {
	parts, err := pointerTokens(pointer)
	if err != nil {
		return nil
	}
	current := root
	for _, part := range parts {
		object, ok := current.(map[string]any)
		if !ok {
			return nil
		}
		current, ok = object[part]
		if !ok {
			return nil
		}
	}
	return current
}

func setPointer(root *any, pointer string, value any) error {
	parts, err := pointerTokens(pointer)
	if err != nil {
		return err
	}
	current, ok := (*root).(map[string]any)
	if !ok {
		return fmt.Errorf("request body is not an object")
	}
	for _, part := range parts[:len(parts)-1] {
		next, exists := current[part]
		if !exists {
			child := map[string]any{}
			current[part] = child
			current = child
			continue
		}
		child, ok := next.(map[string]any)
		if !ok {
			return fmt.Errorf("JSON pointer crosses a non-object value")
		}
		current = child
	}
	current[parts[len(parts)-1]] = value
	return nil
}

func joinEndpoint(origin, endpointPath string) (string, error) {
	base, err := url.Parse(origin)
	if err != nil || base.Scheme == "" || base.Host == "" {
		return "", fmt.Errorf("invalid origin")
	}
	reference, err := url.Parse(strings.TrimPrefix(endpointPath, "/"))
	if err != nil {
		return "", err
	}
	if !strings.HasSuffix(base.Path, "/") {
		base.Path += "/"
	}
	return base.ResolveReference(reference).String(), nil
}

func cloneHeaders(source map[string][]string) map[string][]string {
	out := make(map[string][]string, len(source))
	for name, values := range source {
		out[http.CanonicalHeaderKey(name)] = append([]string(nil), values...)
	}
	return out
}

func deleteHeader(headers map[string][]string, target string) {
	for name := range headers {
		if strings.EqualFold(name, target) {
			delete(headers, name)
		}
	}
}

func callHost(method string, request any, response any) error {
	raw, err := json.Marshal(request)
	if err != nil {
		return err
	}
	cMethod := C.CString(method)
	defer C.free(unsafe.Pointer(cMethod))
	var cRequest unsafe.Pointer
	if len(raw) > 0 {
		cRequest = C.CBytes(raw)
		defer C.free(cRequest)
	}
	var output C.cliproxy_buffer
	rc := C.call_host_api(cMethod, (*C.uint8_t)(cRequest), C.size_t(len(raw)), &output)
	var result []byte
	if output.ptr != nil && output.len > 0 {
		result = C.GoBytes(output.ptr, C.int(output.len))
	}
	if output.ptr != nil {
		C.free_host_buffer(output.ptr, output.len)
	}
	if rc != 0 {
		return fmt.Errorf("host callback %s failed", method)
	}
	var wrapper envelope
	if err := json.Unmarshal(result, &wrapper); err != nil {
		return fmt.Errorf("decode host callback %s: %w", method, err)
	}
	if !wrapper.OK {
		if wrapper.Error != nil {
			return statusError{status: wrapper.Error.HTTPStatus, message: wrapper.Error.Message}
		}
		return fmt.Errorf("host callback %s failed", method)
	}
	if response == nil || len(wrapper.Result) == 0 {
		return nil
	}
	return json.Unmarshal(wrapper.Result, response)
}

type statusError struct {
	status  int
	message string
}

func (error_ statusError) Error() string { return error_.message }

func httpStatus(err error) int {
	if value, ok := err.(statusError); ok {
		return value.status
	}
	return 0
}

func okEnvelope(result any) ([]byte, error) {
	raw, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	return json.Marshal(envelope{OK: true, Result: raw})
}

func errorEnvelope(code, message string, status int) []byte {
	raw, _ := json.Marshal(envelope{OK: false, Error: &envelopeError{Code: code, Message: message, HTTPStatus: status}})
	return raw
}

func writeResponse(response *C.cliproxy_buffer, raw []byte) {
	if response == nil || len(raw) == 0 {
		return
	}
	ptr := C.CBytes(raw)
	if ptr == nil {
		return
	}
	response.ptr = ptr
	response.len = C.size_t(len(raw))
}
