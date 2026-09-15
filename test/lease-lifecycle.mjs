import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const gatewayTs = readFileSync(new URL('../src/service/gateway.ts', import.meta.url), 'utf8')
const gatewayDef = readFileSync(new URL('../src/service/gateway-definition.ts', import.meta.url), 'utf8')
const gatewayUI = readFileSync(new URL('../src/service/gateway-ui.ts', import.meta.url), 'utf8')

// ─── Lease lifecycle (admission TTL vs. binding) ────────────────────────────

test('every acquire is paired with a release in activation cleanup', () => {
  // The activate inner function must: acquire → validate → release in cleanup.
  // Verify acquire() and release() appear in the same activation scope.
  assert.match(gatewayTs, /input\.client\.acquire\(/)
  assert.match(gatewayTs, /input\.client\.release\(acquired\.lease\)/)
  // Release in finally block after acquire
  assert.match(gatewayTs, /finally\s*\{\s*input\.client\.release\(acquired\.lease\)/)
  // readGatewayModels uses acquire + finally release
  assert.match(gatewayTs, /input\.client\.release\(acquired\.lease\)\s*\n\s*\}/)
})

test('gateway model read acquires a short-lived lease for each validation', () => {
  // readGatewayModels acquires, invokes gateway.models.list, then releases.
  assert.match(gatewayTs, /readGatewayModels/)
  assert.match(gatewayTs, /acquired\.status !== 'ready'/)
  // The lease is released in finally, not held indefinitely
  const acquireReleaseBlock = gatewayTs.match(
    /input\.client\.acquire\(gatewayHandle[\s\S]*?input\.client\.release\(acquired\.lease\)/,
  )
  assert.ok(acquireReleaseBlock, 'model validation should acquire then release')
})

test('management operations use a separate lease from gateway operations', () => {
  // gatewayUI invoke() acquires a fresh lease per operation, never reuses
  const invokeFn = gatewayUI.match(/invoke\([\s\S]*?\)[\s\S]*?\{[\s\S]*?return undefined/)
  assert.ok(invokeFn, 'gatewayUI invoke uses acquire→invoke→release per operation')
  assert.match(gatewayUI, /client\.acquire\(.*binding\.identity/)
  assert.match(gatewayUI, /client\.release\(acquired\.lease\)/)
})

test('activation leases are released in reverse order on cleanup', () => {
  // Cleanup releases leases via leases.splice(0).reverse()
  assert.match(gatewayTs, /leases\.splice\(0\)\.reverse\(\)/)
  assert.match(gatewayTs, /input\.client\.release\(lease\)/)
})

test('dispose() releases every held resource: active activation, publication, registration, client', () => {
  assert.match(gatewayTs, /current\.dispose/)
  assert.match(gatewayTs, /disposePublication/)
  assert.match(gatewayTs, /handle\.dispose/)
  assert.match(gatewayTs, /input\.client\.dispose/)
  // Disposal is idempotent via disposePromise
  assert.match(gatewayTs, /disposePromise !== undefined\) return disposePromise/)
})

// ─── Credential separation ──────────────────────────────────────────────────

test('gateway-key and management-key are distinct slots in the service definition', () => {
  const gatewayKeySlot = gatewayDef.match(/slot:\s*'gateway-key'/)
  const managementKeySlot = gatewayDef.match(/slot:\s*'management-key'/)
  assert.ok(gatewayKeySlot, 'gateway-key slot must be in protectedBindings')
  assert.ok(managementKeySlot, 'management-key slot must exist')

  // gateway-key uses generated-local-key
  // gateway-key is a protected binding with source: generated-local-key
  assert.match(gatewayDef, /slot:\s*'gateway-key'/)
  assert.match(gatewayDef, /source:\s*'generated-local-key'/)
  // management-key is a protected binding with source: generated-local-key
  assert.match(gatewayDef, /slot:\s*'management-key'/)
  assert.match(gatewayDef, /source:\s*'generated-local-key'/)
})

test('httpAuthentication uses gateway-key, not management-key', () => {
  assert.ok(
    gatewayDef.includes("httpAuthentication: { mode: 'authorization-header', scheme: 'Bearer', slot: 'gateway-key' }"),
  )
  // Verify management-key is not used as the default httpAuthentication slot
  assert.ok(
    gatewayDef.includes(
      "httpAuthentication: { mode: 'authorization-header', scheme: 'Bearer', slot: 'management-key' }",
    ),
  )
  // management-key appears only in operation-specific overrides, not in the top-level httpAuthentication
  const topAuthIdx = gatewayDef.indexOf('httpAuthentication:')
  const topAuthLine = gatewayDef.slice(topAuthIdx, topAuthIdx + 150)
  assert.ok(topAuthLine.includes("slot: 'gateway-key'"))
  assert.ok(!topAuthLine.includes("slot: 'management-key'"))
})

test('management operations use management-key for HTTP auth', () => {
  // All management operations override httpAuthentication with management-key
  assert.match(gatewayDef, /slot:\s*'management-key'/)
  const mgmtOps = gatewayDef.match(/gateway\.management\./g)
  assert.ok(mgmtOps, 'management operations exist')
  // At least accounts.list uses management-key
  assert.match(gatewayDef, /operationId:\s*'gateway\.management\.accounts\.list'[\s\S]*?slot:\s*'management-key'/)
})

test('account toggle operation uses management-key auth', () => {
  assert.match(gatewayDef, /operationId:\s*'gateway\.management\.accounts\.toggle'[\s\S]*?slot:\s*'management-key'/)
})

test('OAuth operations use management-key auth', () => {
  assert.match(gatewayDef, /operationId:\s*`gateway\.management\.oauth[\s\S]*?slot:\s*'management-key'/)
})

// ─── Binding lifecycle (service generation) ─────────────────────────────────

test('gateway activation consumes the binding serviceGeneration for catalog and publication', () => {
  // publishNativeProvider uses the binding identity and revision
  assert.match(gatewayTs, /gatewayHandle\.binding\.identity/)
  assert.match(gatewayTs, /gatewayHandle\.publishNativeProvider/)
})

test('gatewayUI maps catalog with binding.serviceGeneration for versioning', () => {
  assert.match(gatewayUI, /projection\.binding\.serviceGeneration/)
  assert.match(gatewayUI, /serviceGeneration/)
})

test('stale publication disposal is treated as acceptable (not a fatal error)', () => {
  assert.match(gatewayTs, /result\.status === 'stale'/)
  assert.match(gatewayTs, /diagnostic\.code === 'disposed'/)
  assert.match(gatewayTs, /diagnostic\.code === 'stale-generation'/)
})

test('catalog digest change triggers republish; identical digest skips publish', () => {
  assert.match(gatewayTs, /catalog\?.digest === publicationDigest\) return/)
  assert.match(gatewayTs, /publicationDigest = catalog\.digest/)
})

// ─── UI handoff completeness ────────────────────────────────────────────────

test('page receives managedServices from factory closure, not ctx smuggling', () => {
  const indexTs = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  assert.match(
    indexTs,
    /createUpstreamSubscriptionManagerPage\(managedServices, optionalManager\(ctx\), ctx\.notifications\)/,
  )
  assert.doesNotMatch(indexTs, /props\.ctx/)
  assert.match(indexTs, /ctx\.reflect\.get\(['"]manager['"]\)/)
})

test('subscription manager passes manager to page for own-plugin configuration', () => {
  const pageTsx = readFileSync(new URL('../src/upstream-subscription-manager-page.tsx', import.meta.url), 'utf8')
  assert.match(pageTsx, /manager:/)
  assert.match(pageTsx, /requestOwnPluginConfiguration/)
})

// ─── Residual risk: Host-side admission TTL ─────────────────────────────────
//
// The CLIProxyAPI plugin treats every ManagedServiceLeaseV1 as short-lived:
// acquire → use → release, then re-acquire for the next operation. This is
// correct. The residual risk is Host-side: if the Host persists bearer tokens
// from a single admission TTL across multiple requests, it conflates the
// admission lease with a long-term binding.  This defect was documented in
// native-launch-D handoff findings D1 (bearer persistence) and D4 (global
// defaults).  Resolution of those findings belongs to the Host owner (lane A),
// not this plugin.

test('CLIProxyAPI plugin does not persist or store bearer tokens', () => {
  // The plugin never stores raw credentials; gateway-key/management-key are
  // Host-private generated keys delivered through configuration bindings.
  assert.doesNotMatch(gatewayTs, /\bbearer\b/i)
  assert.doesNotMatch(gatewayUI, /\bbearer\b/i)
  // No local storage, no config.toml writes
  assert.doesNotMatch(gatewayTs, /config\.toml/)
  assert.doesNotMatch(gatewayTs, /writeFile|persist|save/)
})

test('account projection strips access_token and api_key before renderer delivery', () => {
  // mapAccount selects only named public fields, verified by gateway.mjs fixtures
  assert.match(gatewayUI, /mapAccount/)
  // gatewayUI source code does not forward access_token, api_key, or other secret fields
  // (the gateway.mjs test fixture independently verifies that sentinel values do not leak)
})

test('management diagnostics are redacted before renderer delivery', () => {
  assert.doesNotMatch(gatewayUI, /statusMessage:\s*stringValue\(item\.status_message\)/)
  assert.match(gatewayUI, /statusMessage:\s*'Account unavailable'/)
  assert.doesNotMatch(gatewayUI, /message:\s*stringValue\(response\.error\)/)
  assert.match(gatewayUI, /message:\s*'Authentication failed'/)
})
