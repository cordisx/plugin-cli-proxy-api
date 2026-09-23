import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { identity } from './gateway-fixture.mjs'

const gatewayModule = await import('../../dist/gateway.mjs')
const {
  CLI_PROXY_GATEWAY_ADAPTER_CONTRACT_V1,
  CLI_PROXY_GATEWAY_ADAPTER_SCHEMA_V1,
  CLI_PROXY_GATEWAY_CONNECTION_CONTRACT_V1,
  CLI_PROXY_GATEWAY_CONNECTION_SCHEMA_V1,
  CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1,
  CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1,
  cliProxyGatewayDefinition,
  contextServices,
} = gatewayModule

const compositionSchemaFiles = new Map([
  ['codex-upstreams', '../../schemas/cli-proxy-gateway-codex-upstream.v1.schema.json'],
  ['openai-upstreams', '../../schemas/cli-proxy-gateway-openai-upstream.v1.schema.json'],
  ['gateway-extensions', '../../schemas/cli-proxy-gateway-extension-plan.v1.schema.json'],
])
const compositionValidators = new Map(
  await Promise.all([...compositionSchemaFiles].map(async ([slot, file]) => {
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    for (
      const dependency of [
        '../../schemas/cli-proxy-gateway-adapter.v1.schema.json',
        '../../schemas/cli-proxy-gateway-connection.v1.schema.json',
      ]
    ) ajv.addSchema(JSON.parse(await readFile(new URL(dependency, import.meta.url), 'utf8')))
    const schema = JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'))
    return [slot, ajv.compile(schema)]
  })),
)

export const syntheticSources = Object.freeze({
  responses: Object.freeze({
    pluginId: 'synthetic-responses',
    pluginGeneration: 'synthetic-responses-one',
    serviceId: 'synthetic-responses-service',
    serviceGeneration: 'synthetic-responses-service-one',
    upstreamId: 'responses-source',
    displayName: 'Synthetic Responses',
    prefix: 'responses',
    wireApi: 'responses',
    sourceModelId: 'responses-model',
    modelId: 'family/fast',
    authenticated: false,
  }),
  chat: Object.freeze({
    pluginId: 'synthetic-chat',
    pluginGeneration: 'synthetic-chat-one',
    serviceId: 'synthetic-chat-service',
    serviceGeneration: 'synthetic-chat-service-one',
    upstreamId: 'chat-source',
    displayName: 'Synthetic Chat',
    prefix: 'chat',
    wireApi: 'chat-completions',
    sourceModelId: 'chat-model',
    modelId: 'family/balanced',
    authenticated: true,
  }),
})

export const syntheticExtensions = Object.freeze({
  header: Object.freeze({
    pluginId: 'synthetic-header-extension',
    pluginGeneration: 'synthetic-header-extension-one',
    serviceId: 'synthetic-header-connection',
    serviceGeneration: 'synthetic-header-connection-one',
    authenticated: true,
  }),
  body: Object.freeze({
    pluginId: 'synthetic-body-extension',
    pluginGeneration: 'synthetic-body-extension-one',
    serviceId: 'synthetic-body-connection',
    serviceGeneration: 'synthetic-body-connection-one',
    authenticated: true,
  }),
})

export const extensionAdapter = (adapterId, sessionSources) => ({
  $schema: CLI_PROXY_GATEWAY_ADAPTER_SCHEMA_V1,
  contract: CLI_PROXY_GATEWAY_ADAPTER_CONTRACT_V1,
  schemaVersion: 1,
  adapterId,
  revision: 1,
  enabled: true,
  requiredSession: true,
  sessionSources,
  request: {
    clearHeaders: ['X-Untrusted-Session'],
    setHeaders: { 'X-Session': '{{session}}', 'X-Connection': '{{connectionId}}' },
    setBody: { '/metadata/session': '{{session}}' },
  },
})

export const extensionConnection = (connectionId, adapterId) => ({
  $schema: CLI_PROXY_GATEWAY_CONNECTION_SCHEMA_V1,
  contract: CLI_PROXY_GATEWAY_CONNECTION_CONTRACT_V1,
  schemaVersion: 1,
  connectionId,
  revision: 1,
  enabled: true,
  wireApi: 'responses',
  endpointPath: '/v1/responses',
  authorization: 'bearer',
  adapter: { adapterId, revision: 1, required: true },
  models: [{
    sourceModelId: 'shared-model',
    modelId: 'shared',
    displayName: `Shared ${connectionId}`,
    enabled: true,
    isDefault: true,
  }],
})

export const descriptor = (source, overrides = {}) => ({
  $schema: CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1,
  contract: CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1,
  schemaVersion: 1,
  revision: 1,
  upstreamId: source.upstreamId,
  displayName: source.displayName,
  enabled: true,
  wireApi: source.wireApi,
  prefix: source.prefix,
  order: source.wireApi === 'responses' ? 10 : 20,
  requestTimeoutMs: 30_000,
  group: { groupId: 'synthetic', displayName: 'Synthetic', order: 10 },
  models: [{
    sourceModelId: source.sourceModelId,
    modelId: source.modelId,
    enabled: true,
    isDefault: source.wireApi === 'responses',
    ...(source.wireApi === 'chat-completions' ? { inputModalities: ['text'] } : {}),
  }],
  ...overrides,
})

export function providerRoot() {
  const controller = new AbortController()
  const target = {
    pluginId: 'cli-proxy-api',
    pluginGeneration: 'gateway-generation',
    serviceId: 'gateway-runtime',
    serviceGeneration: 'gateway-service-generation',
  }
  return {
    controller,
    target,
    root: contextServices[0].create({ target, signal: controller.signal }),
    extensionRoot: contextServices[1].create({ target, signal: controller.signal }),
  }
}

export function validateMaterializationRequest(request) {
  const compositionSlots = cliProxyGatewayDefinition.protectedBindings.filter(item => item.source === 'composition')
  const declaredSources = new Set(request.sources.map(source => source.source))
  for (const slot of compositionSlots) {
    const slotBindings = request.bindings.filter(binding => binding.targetSlot === slot.slot)
    assert.ok(slotBindings.length > 0, `missing composition slot ${slot.slot}`)
    const roots = slotBindings.filter(binding => binding.targetPointer === undefined)
    assert.equal(roots.length, 1, `composition slot ${slot.slot} must have exactly one root binding`)
    assert.equal(roots[0].source.kind, 'safe-literal')
    const validate = compositionValidators.get(slot.slot)
    assert.equal(validate(roots[0].source.value), true, JSON.stringify(validate.errors))
  }
  for (const item of request.bindings) {
    if (item.source.kind === 'source-origin' || item.source.kind === 'source-authorization') {
      assert.equal(declaredSources.has(item.source.source), true, `undeclared composition source ${item.source.source}`)
    }
  }
}

export function activationInput(client, signal) {
  return {
    owner: {
      ownerHandle: 'mso_gateway',
      pluginId: 'cli-proxy-api',
      sourceDigest: `sha256:${'a'.repeat(64)}`,
      hostGeneration: 'host-one',
      pluginGeneration: 'gateway-generation',
    },
    client,
    signal,
  }
}

export function rootCollections(request) {
  return Object.fromEntries(
    request.bindings.filter(item => item.targetPointer === undefined).map(item => [
      item.targetSlot,
      item.source.value,
    ]),
  )
}

export function compositionLeaves(request) {
  return request.bindings.filter(item => item.targetPointer !== undefined)
}

export function expectedRootCollections(sources, extensionRevision) {
  return {
    'codex-upstreams': sources.filter(source => source.wireApi === 'responses').map(source => ({
      'api-key': null,
      prefix: source.prefix,
      'base-url': null,
      'request-retry': 0,
      models: [{
        name: source.sourceModelId,
        alias: source.modelId,
        'display-name': source.modelId,
        'force-mapping': true,
      }],
    })),
    'openai-upstreams': sources.filter(source => source.wireApi === 'chat-completions').map(source => ({
      name: source.upstreamId,
      disabled: false,
      prefix: source.prefix,
      'base-url': null,
      'api-key-entries': [{ 'api-key': null }],
      'request-retry': 0,
      models: [{
        name: source.sourceModelId,
        alias: source.modelId,
        'display-name': source.modelId,
        'force-mapping': true,
        'input-modalities': ['text'],
      }],
    })),
    'gateway-extensions': {
      enabled: true,
      active: false,
      revision: extensionRevision,
      adapters: [],
      connections: [],
    },
  }
}

export function extensionSourceIdentity(source) {
  return identity(source.pluginId, source.serviceId)
}
