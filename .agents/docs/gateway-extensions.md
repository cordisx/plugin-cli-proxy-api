# Gateway extensions

The `@cordisx/plugin-cli-proxy-api/extensions/v1` entrypoint is the generic
CordisX contract for extending the managed CLIProxyAPI gateway. It is not a
provider-specific integration and must not contain private tenant, domain,
header, or product policy.

## Topology

- CordisX runs one Host-owned CLIProxyAPI managed process.
- The gateway package supplies one native `cordisx-gateway-bridge` plugin.
- Consumer plugins register adapters and connections through the
  `cliProxyGatewayExtensions` context service.
- A registration change creates one generation-fenced materialization and
  managed-service restart transaction. Disposing the consumer binding revokes
  only that producer generation.
- The bridge publishes models as `connectionId/modelId` and routes them to its
  own static executor. It never starts a proxy process per connection.

## Public contract

An adapter declares bounded session extraction and request transforms. Session
sources are an HTTP header or a body JSON Pointer. Transforms may clear headers
and set headers or body values with `{{session}}`, `{{connectionId}}`, and
`{{sourceModelId}}` substitutions.

A connection references an existing Host-managed source, a stable
`connectionId`, one adapter revision, an endpoint path, an authorization mode,
and model mappings. The Host materializer resolves the source origin and
authorization into the private process configuration. Endpoint and credential
values are neither registration fields nor renderer-visible state.

`connectionId` is the identity shared with Host profile synchronization. Host
`providerBindings` explicitly bind an existing managed connection to a target
profile and do not duplicate credentials. This package uses that identity
semantics but does not import Host-private synchronization contracts or create
a second persistent connection database.

## Fail-closed behavior

Required adapters are removed from model publication when missing, disabled,
or revision-mismatched. The native bridge remains loaded even when its active
plan is empty so known protected model IDs remain owned by its router and fail
inside the executor before an upstream request. They must not fall through to
another provider with the same model ID.

The native executor removes caller authorization, host, content-length, and
adapter-declared untrusted headers before applying connection authorization.
Missing required sessions and missing credentials fail before `host.http.do`
or `host.http.do_stream`.

## Verification boundary

`npm run test:native` builds the current-platform C-shared bridge and loads it
through the real CLIProxyAPI plugin host from `CLIPROXY_SOURCE` (default
`/private/tmp/cliproxy-src`). Its synthetic loopback tests cover two connections
with the same source model and different credentials, header and body session
sources, leakage checks, streaming, cancellation, required-adapter failures,
and disabled-plan fallback protection.

The checked-in runtime artifact is Darwin arm64. `scripts/build-native.mjs`
can build Darwin, Linux, or Windows on arm64 or x64 when run on that target, but
release artifacts must declare only binaries actually included in
`runtime-manifest.json`. This test is native ABI evidence, not a real provider,
native CordisX App, credential migration, or cross-platform acceptance test.
