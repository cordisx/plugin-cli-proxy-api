import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'

const extension = await import('../dist/extensions.mjs')
const {
  CLI_PROXY_GATEWAY_ADAPTER_CONTRACT_V1,
  CLI_PROXY_GATEWAY_ADAPTER_SCHEMA_V1,
  CLI_PROXY_GATEWAY_CONNECTION_CONTRACT_V1,
  CLI_PROXY_GATEWAY_CONNECTION_SCHEMA_V1,
  CliProxyGatewayExtensionRegistryV1,
  createCliProxyGatewayExtensionRegistrarV1,
} = extension

const generation = 'gateway-generation'
const producer = (pluginId = 'synthetic-extension', pluginGeneration = 'producer-generation-1') => ({
  pluginId,
  pluginGeneration,
})
const source = id => ({ identityHandle: `source_${id}` })
const adapter = (overrides = {}) => ({
  $schema: CLI_PROXY_GATEWAY_ADAPTER_SCHEMA_V1,
  contract: CLI_PROXY_GATEWAY_ADAPTER_CONTRACT_V1,
  schemaVersion: 1,
  adapterId: 'session-header',
  revision: 1,
  enabled: true,
  requiredSession: true,
  sessionSources: [{ kind: 'header', name: 'Session-Id' }],
  request: {
    clearHeaders: ['X-Untrusted'],
    setHeaders: { 'X-Session': '{{session}}', 'X-Connection': '{{connectionId}}' },
    setBody: { '/metadata/session': '{{session}}' },
  },
  ...overrides,
})
const connection = (id = 'connection-a', overrides = {}) => ({
  $schema: CLI_PROXY_GATEWAY_CONNECTION_SCHEMA_V1,
  contract: CLI_PROXY_GATEWAY_CONNECTION_CONTRACT_V1,
  schemaVersion: 1,
  connectionId: id,
  revision: 1,
  enabled: true,
  source: source(id),
  wireApi: 'responses',
  endpointPath: '/responses',
  authorization: 'bearer',
  adapter: { adapterId: 'session-header', revision: 1, required: true },
  models: [{ sourceModelId: 'shared-model', modelId: 'shared', enabled: true, isDefault: true }],
  ...overrides,
})

function registry() {
  return new CliProxyGatewayExtensionRegistryV1(generation, value => value.identityHandle)
}

function registrar(extensions, authority = producer()) {
  return createCliProxyGatewayExtensionRegistrarV1(extensions, authority)
}

test('adapter and connection schemas reject private transport fields', async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const adapterSchema = JSON.parse(
    await readFile(new URL('../schemas/cli-proxy-gateway-adapter.v1.schema.json', import.meta.url), 'utf8'),
  )
  const connectionSchema = JSON.parse(
    await readFile(new URL('../schemas/cli-proxy-gateway-connection.v1.schema.json', import.meta.url), 'utf8'),
  )
  const validateAdapter = ajv.compile(adapterSchema)
  const validateConnection = ajv.compile(connectionSchema)
  assert.equal(validateAdapter(adapter()), true, JSON.stringify(validateAdapter.errors))
  assert.equal(validateAdapter({ ...adapter(), tenantId: 'private' }), false)
  assert.equal(validateConnection(connection()), true, JSON.stringify(validateConnection.errors))
  assert.equal(validateConnection({ ...connection(), endpoint: 'https://private.invalid' }), false)
  assert.equal(validateConnection({ ...connection(), token: 'secret' }), false)
})

test('registers, updates, revokes, disposes, and fences producer generations', () => {
  const extensions = registry()
  const first = registrar(extensions)
  assert.equal(first.registerAdapter(adapter()).status, 'registered')
  assert.equal(first.registerConnection(connection()).status, 'registered')
  assert.equal(first.registerAdapter(adapter()).status, 'unchanged')
  assert.equal(first.registerConnection(connection()).status, 'unchanged')
  assert.equal(first.registerAdapter(adapter({ revision: 2, requiredSession: false })).status, 'updated')
  assert.equal(
    first.registerConnection(connection('connection-a', {
      revision: 2,
      adapter: { adapterId: 'session-header', revision: 2, required: true },
    })).status,
    'updated',
  )

  const replacement = registrar(extensions, producer('synthetic-extension', 'producer-generation-2'))
  assert.equal(first.revokeConnection({ connectionId: 'connection-a', expectedRevision: 2 }).status, 'stale-generation')
  assert.equal(first.dispose().status, 'stale-generation')
  assert.equal(replacement.registerAdapter(adapter({ revision: 1 })).status, 'registered')
  assert.equal(replacement.registerConnection(connection()).status, 'registered')
  assert.equal(replacement.revokeConnection({ connectionId: 'connection-a', expectedRevision: 1 }).status, 'revoked')
  assert.equal(replacement.revokeAdapter({ adapterId: 'session-header', expectedRevision: 1 }).status, 'revoked')
  assert.equal(replacement.dispose().status, 'unchanged')
})

test('plans two exact connections sharing one source model without credential or endpoint values', () => {
  const extensions = registry()
  const registration = registrar(extensions)
  registration.registerAdapter(adapter())
  registration.registerAdapter(adapter({
    adapterId: 'session-body',
    sessionSources: [{ kind: 'body-json-pointer', pointer: '/metadata/thread' }],
    request: { setHeaders: { 'X-Session': '{{session}}' } },
  }))
  registration.registerConnection(connection('connection-b', {
    source: source('b'),
    adapter: { adapterId: 'session-body', revision: 1, required: true },
  }))
  registration.registerConnection(connection('connection-a', { source: source('a') }))

  const plan = extensions.plan(generation)
  assert.equal(plan.contract, 'cordisx.cli-proxy-gateway-extension-plan/v1')
  assert.deepEqual(plan.configuration.connections.map(item => item.connectionId), ['connection-a', 'connection-b'])
  assert.deepEqual(
    plan.configuration.connections.map(item => item.models[0].gatewayModelId),
    ['connection-a/shared', 'connection-b/shared'],
  )
  assert.equal(plan.configuration.connections.every(item => item.endpoint === null), true)
  assert.equal(plan.configuration.connections.every(item => item.credential === null), true)
  assert.deepEqual(plan.composition.map(item => item.sourceAlias), ['extension-0', 'extension-1'])
})

test('required adapter mismatch disables the protected route before materialization', () => {
  const extensions = registry()
  const registration = registrar(extensions)
  registration.registerAdapter(adapter({ enabled: false }))
  registration.registerConnection(connection())
  const plan = extensions.plan(generation)
  assert.equal(plan.configuration.connections[0].adapterAvailable, false)
  assert.equal(plan.configuration.connections[0].enabled, false)
  assert.deepEqual(plan.composition, [])
})

test('rejects cross-producer ownership and duplicate source identities', () => {
  const extensions = registry()
  const owner = registrar(extensions, producer('owner'))
  const intruder = registrar(extensions, producer('intruder'))
  owner.registerAdapter(adapter())
  owner.registerConnection(connection())
  assert.equal(intruder.registerAdapter(adapter({ revision: 2 })).diagnostic.code, 'conflicting-producer')
  assert.equal(
    intruder.registerConnection(connection('connection-b', { source: source('connection-a') })).diagnostic.code,
    'conflicting-source',
  )
})
