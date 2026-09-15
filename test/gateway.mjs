import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import { binding, expectedNativeCatalog, identity, lease, projection, uiBinding } from './support/gateway-fixture.mjs'

const gatewayModule = await import('../dist/gateway.mjs')
const {
  CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1,
  CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1,
  CLI_PROXY_UPSTREAM_REGISTRY_SERVICE_V1,
  CLI_PROXY_GATEWAY_MANAGEMENT_V1,
  CLI_PROXY_NATIVE_PROVIDER_ID,
  CLI_PROXY_GATEWAY_SERVICE_ID,
  activateCliProxyGateway,
  cliProxyGatewayDefinition,
  contextServices,
  managedServiceUI,
} = gatewayModule

test('declares a separate Host-private CLIProxyAPI management credential', () => {
  assert.equal(cliProxyGatewayDefinition.serviceId, CLI_PROXY_GATEWAY_SERVICE_ID)
  assert.deepEqual(CLI_PROXY_GATEWAY_MANAGEMENT_V1, {
    credentialSlot: 'management-key',
    path: '/v0/management',
  })
  assert.deepEqual(
    cliProxyGatewayDefinition.protectedBindings.find(binding => binding.slot === 'management-key'),
    {
      slot: 'management-key',
      source: 'generated-local-key',
      target: 'configuration',
      pointer: '/remote-management/secret-key',
    },
  )
  assert.notEqual(
    CLI_PROXY_GATEWAY_MANAGEMENT_V1.credentialSlot,
    cliProxyGatewayDefinition.httpAuthentication.slot,
  )
})

const compositionSchemaFiles = new Map([
  ['codex-upstreams', '../schemas/cli-proxy-gateway-codex-upstream.v1.schema.json'],
  ['openai-upstreams', '../schemas/cli-proxy-gateway-openai-upstream.v1.schema.json'],
])
const compositionValidators = new Map(
  await Promise.all([...compositionSchemaFiles].map(async ([slot, file]) => {
    const schema = JSON.parse(await readFile(new URL(file, import.meta.url), 'utf8'))
    return [slot, new Ajv2020({ allErrors: true, strict: true }).compile(schema)]
  })),
)

const syntheticSources = Object.freeze({
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

const descriptor = (source, overrides = {}) => ({
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

function providerRoot() {
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
  }
}

function validateMaterializationRequest(request) {
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

function activationInput(client, signal) {
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

function gatewayFixture({
  kinds = ['responses', 'chat'],
  gatewayModels = [],
  toggleGatewayModels,
  oauthGatewayModels,
  oauthPollStatuses = ['wait'],
  missingSourceModel = false,
  missingGatewayModel = false,
  gatewayDisposeError,
  clientDisposeError,
  publicationFailure,
  publicationDisposeError,
  publicationDisposeDiagnostic,
} = {}) {
  const { root, target } = providerRoot()
  const sources = []
  let ownedGatewayModels = [...gatewayModels]
  let oauthPollIndex = 0
  const sourceLeases = new Map()
  const sourceByService = new Map()
  const registerSource = source => {
    sources.push(source)
    sourceLeases.set(source.serviceId, lease(source.pluginId, source.serviceId, source.serviceGeneration))
    sourceByService.set(source.serviceId, source)
    const consumer = root.bind({
      producer: { pluginId: source.pluginId, pluginGeneration: source.pluginGeneration },
      target,
      signal: new AbortController().signal,
    })
    const result = consumer.value.register({
      source: identity(source.pluginId, source.serviceId),
      descriptor: descriptor(source),
    })
    assert.equal(result.status, 'registered')
  }
  for (const kind of kinds) registerSource(syntheticSources[kind])

  const events = []
  const released = []
  const activePublications = new Map()
  const publicationHandles = []
  const publicationDisposeResults = []
  const lifecycle = { cleanup: undefined }
  const gatewayBinding = binding('cli-proxy-api', 'gateway-runtime', 'gateway-service')
  const gatewayUIBinding = uiBinding('cli-proxy-api', 'gateway-runtime', 'host-one')
  const registration = {
    binding: gatewayBinding,
    revision: undefined,
    async inspect() {
      events.push(['inspect'])
      return projection(gatewayBinding)
    },
    async ensureReady(options) {
      events.push(['ensure-ready', options])
      return { status: 'ready', projection: projection(gatewayBinding) }
    },
    async dispose() {
      events.push(['registration-dispose'])
      if (gatewayDisposeError !== undefined) throw gatewayDisposeError
      return { status: 'accepted', projection: projection(gatewayBinding) }
    },
    async publishNativeProvider(input, options) {
      events.push(['publish-native', input, options])
      if (publicationFailure?.providerId === input.providerId) {
        return {
          status: 'rejected',
          diagnostic: { code: publicationFailure.code, retryable: publicationFailure.code === 'failed' },
        }
      }
      const activeProjection = {
        providerId: input.providerId,
        owner: {
          pluginId: 'cli-proxy-api',
          hostGeneration: 'host-one',
          pluginGeneration: 'gateway-generation',
        },
        service: { serviceId: 'gateway-runtime', serviceGeneration: 'gateway-service' },
        compositionOrigin: input.compositionOrigin,
        catalog: structuredClone(input.catalog),
        state: 'active',
      }
      const handle = {
        publication: activeProjection,
        async dispose() {
          events.push(['publication-dispose', input.providerId])
          if (publicationDisposeError?.providerId === input.providerId) throw publicationDisposeError.error
          let result
          if (publicationDisposeDiagnostic?.providerId === input.providerId) {
            result = {
              status: 'stale',
              diagnostic: { code: publicationDisposeDiagnostic.code, retryable: false },
            }
          } else {
            const active = activePublications.get(input.providerId)
            if (active === undefined) {
              result = { status: 'stale', diagnostic: { code: 'disposed', retryable: false } }
            } else if (active !== handle) {
              result = { status: 'stale', diagnostic: { code: 'stale-generation', retryable: false } }
            } else {
              activePublications.delete(input.providerId)
              result = { status: 'disposed', projection: { ...activeProjection, state: 'revoked' } }
            }
          }
          publicationDisposeResults.push([input.providerId, result])
          return result
        },
      }
      activePublications.set(input.providerId, handle)
      publicationHandles.push(handle)
      return { status: 'accepted', publication: handle }
    },
  }
  const client = {
    async acquire(sourceIdentity) {
      events.push(['acquire', sourceIdentity.serviceId])
      if (sourceIdentity.serviceId === 'gateway-runtime') {
        const gateway = lease('cli-proxy-api', 'gateway-runtime', 'gateway-service', ['gateway.models.list'])
        return { status: 'ready', projection: projection(gatewayBinding), lease: gateway }
      }
      const source = sourceByService.get(sourceIdentity.serviceId)
      const sourceLease = sourceLeases.get(sourceIdentity.serviceId)
      return {
        status: 'ready',
        projection: projection(sourceLease.binding, source.authenticated),
        lease: sourceLease,
      }
    },
    async invoke(activeLease, operationId, value, options) {
      events.push(['invoke', activeLease.binding.identity.serviceId, operationId, value, options])
      if (operationId === 'gateway.models.list') {
        const models = [
          ...new Set([
            ...sources.map(source => `${source.prefix}/${source.modelId}`),
            ...ownedGatewayModels,
          ]),
        ].map(id => ({ id }))
        return {
          status: 'accepted',
          invocationHandle: 'msi_gateway',
          operationId,
          responseSchema: 'https://schemas.example.test/models.json',
          value: { data: missingGatewayModel ? models.slice(0, -1) : models },
        }
      }
      if (operationId === 'gateway.management.accounts.list') {
        return {
          status: 'accepted',
          invocationHandle: 'msi_accounts',
          operationId,
          responseSchema: 'https://schemas.example.test/accounts.json',
          value: {
            files: [{
              id: 'account-one',
              auth_index: 'auth-index-one',
              provider: 'codex',
              email: 'user@example.test',
              status: 'active',
              disabled: false,
              unavailable: false,
              runtime_only: false,
              source: 'file',
              status_message: 'must-not-leak-status',
              access_token: 'must-not-leak',
              api_key: 'must-not-leak-either',
            }],
          },
        }
      }
      if (operationId === 'gateway.management.accounts.toggle') {
        if (toggleGatewayModels !== undefined) ownedGatewayModels = [...toggleGatewayModels]
        return {
          status: 'accepted',
          invocationHandle: 'msi_account_toggle',
          operationId,
          responseSchema: 'https://schemas.example.test/operation.json',
          value: { status: 'ok', disabled: value.disabled },
        }
      }
      if (operationId === 'gateway.management.oauth.codex.start') {
        return {
          status: 'accepted',
          invocationHandle: 'msi_oauth_start',
          operationId,
          responseSchema: 'https://schemas.example.test/operation.json',
          value: { status: 'ok', url: 'https://login.example.test/oauth', state: 'oauth-state-one' },
        }
      }
      if (operationId === 'gateway.management.oauth.poll') {
        const status = oauthPollStatuses[Math.min(oauthPollIndex, oauthPollStatuses.length - 1)]
        oauthPollIndex += 1
        if (status === 'ok' && oauthGatewayModels !== undefined) ownedGatewayModels = [...oauthGatewayModels]
        return {
          status: 'accepted',
          invocationHandle: 'msi_oauth_poll',
          operationId,
          responseSchema: 'https://schemas.example.test/operation.json',
          value: { status, ...(status === 'error' ? { error: 'must-not-leak-oauth-error' } : {}) },
        }
      }
      if (operationId === 'gateway.management.oauth.cancel') {
        return {
          status: 'accepted',
          invocationHandle: 'msi_oauth_cancel',
          operationId,
          responseSchema: 'https://schemas.example.test/operation.json',
          value: { status: 'ok', cancelled: true },
        }
      }
      const source = sourceByService.get(activeLease.binding.identity.serviceId)
      return {
        status: 'accepted',
        invocationHandle: `msi_${activeLease.binding.identity.serviceId}`,
        operationId,
        responseSchema: 'https://schemas.example.test/models.json',
        value: { data: [{ id: missingSourceModel ? 'other-model' : source.sourceModelId }] },
      }
    },
    async materialize(request) {
      events.push(['materialize', request])
      validateMaterializationRequest(request)
      return {
        status: 'accepted',
        materializationHandle: 'msm_gateway',
        target: gatewayBinding,
        revision: request.revision,
        sources: request.sources.map(source => ({ source: source.source, binding: source.lease.binding })),
      }
    },
    release(activeLease) {
      released.push(activeLease.leaseHandle)
      events.push(['release', activeLease.binding.identity.serviceId])
    },
    dispose() {
      events.push(['client-dispose'])
      if (clientDisposeError !== undefined) throw clientDisposeError
    },
  }
  const context = {
    effect(execute) {
      lifecycle.cleanup = execute()
      events.push(['effect'])
      return lifecycle.cleanup
    },
    managedServices: {
      async register(definition, options) {
        events.push(['register', definition, options])
        registration.revision = options.revision
        return registration
      },
    },
    cliProxyUpstreams: root.providerValue,
  }
  const hostRevokePublication = providerId => {
    activePublications.delete(providerId)
    events.push(['host-revoke-publication', providerId])
  }
  const hostReplacePublication = providerId => {
    const replacement = Object.freeze({ providerId, generation: 'host-replacement' })
    activePublications.set(providerId, replacement)
    events.push(['host-replace-publication', providerId])
    return replacement
  }
  return {
    activePublications,
    client,
    context,
    events,
    hostReplacePublication,
    hostRevokePublication,
    lifecycle,
    publicationDisposeResults,
    publicationHandles,
    registerSource,
    registration,
    released,
    sources,
    gatewayBinding,
    gatewayUIBinding,
  }
}

function rootCollections(request) {
  return Object.fromEntries(
    request.bindings.filter(item => item.targetPointer === undefined).map(item => [
      item.targetSlot,
      item.source.value,
    ]),
  )
}

function compositionLeaves(request) {
  return request.bindings.filter(item => item.targetPointer !== undefined)
}

function expectedRootCollections(sources) {
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
  }
}

test('exports one versioned context service with owner-local registry access', () => {
  assert.equal(contextServices.length, 1)
  assert.equal(contextServices[0].service, CLI_PROXY_UPSTREAM_REGISTRY_SERVICE_V1)
  const { root } = providerRoot()
  assert.equal(root.providerValue.pluginGeneration, 'gateway-generation')
})

test('projects the active upstream registry through the Node UI source without exposing secrets', async () => {
  const fixture = gatewayFixture()
  const controller = new AbortController()
  await activateCliProxyGateway(fixture.context, activationInput(fixture.client, controller.signal))
  const extension = managedServiceUI.create({
    binding: fixture.gatewayUIBinding,
    registration: fixture.registration,
    client: fixture.client,
    signal: controller.signal,
  })

  const catalogResult = await extension.readCatalog()
  assert.equal(catalogResult.status, 'available')
  assert.deepEqual(
    catalogResult.catalog.providers.map(provider => ({
      id: provider.id,
      origin: provider.endpoint.origin,
      secretConfigured: provider.endpoint.secretConfigured,
      models: provider.models.mappings.map(model => model.modelId),
    })),
    [
      {
        id: 'responses-source',
        origin: 'managed://synthetic-responses/synthetic-responses-service',
        secretConfigured: false,
        models: ['responses/family/fast'],
      },
      {
        id: 'chat-source',
        origin: 'managed://synthetic-chat/synthetic-chat-service',
        secretConfigured: true,
        models: ['chat/family/balanced'],
      },
    ],
  )
  assert.equal(
    catalogResult.catalog.providers.some(provider => provider.endpoint.origin.includes('plugins.example')),
    false,
  )

  const accountsResult = await extension.readAccounts()
  assert.equal(accountsResult.status, 'available')
  assert.deepEqual(accountsResult.accounts.accounts, [{
    accountId: 'account-one',
    authIndex: 'auth-index-one',
    provider: 'codex',
    label: 'user@example.test',
    status: 'active',
    statusMessage: 'Account unavailable',
    disabled: false,
    unavailable: false,
    authKind: 'oauth',
    sourceKind: 'file',
    runtimeOnly: false,
    email: 'user@example.test',
  }])
  assert.doesNotMatch(JSON.stringify(accountsResult), /must-not-leak/)
  assert.deepEqual(
    fixture.events.filter(event => event[0] === 'invoke' && event[2].startsWith('gateway.management.')).map(
      event => event.slice(1, 4),
    ),
    [['gateway-runtime', 'gateway.management.accounts.list', undefined]],
  )

  await fixture.lifecycle.cleanup()
})

test('routes account and OAuth controls and refreshes the gateway model publication', async () => {
  const fixture = gatewayFixture({
    kinds: [],
    gatewayModels: ['account-model-old'],
    toggleGatewayModels: ['account-model-new'],
    oauthGatewayModels: ['account-model-new'],
    oauthPollStatuses: ['wait', 'ok'],
  })
  const controller = new AbortController()
  await activateCliProxyGateway(fixture.context, activationInput(fixture.client, controller.signal))
  const extension = managedServiceUI.create({
    binding: fixture.gatewayUIBinding,
    registration: fixture.registration,
    client: fixture.client,
    signal: controller.signal,
  })
  const accountsResult = await extension.readAccounts()
  assert.equal(accountsResult.status, 'available')
  const common = {
    binding: fixture.gatewayUIBinding,
    expectedRevision: accountsResult.accounts.revision,
    userGesture: { kind: 'explicit-click', at: new Date().toISOString() },
  }
  const toggled = await extension.toggleAccount({
    $schema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-account-toggle.v1.schema.json',
    contract: 'cordisx.managed-service-cli-proxy-account-toggle/v1',
    schemaVersion: 1,
    requestId: 'toggle-one',
    accountId: 'account-one',
    authIndex: 'auth-index-one',
    disabled: true,
    ...common,
  })
  assert.equal(toggled.status, 'accepted')
  const started = await extension.startOAuth({
    $schema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-start.v1.schema.json',
    contract: 'cordisx.managed-service-cli-proxy-oauth-start/v1',
    schemaVersion: 1,
    requestId: 'oauth-one',
    provider: 'codex',
    ...common,
  })
  assert.equal(started.status, 'accepted')
  assert.equal((await extension.pollOAuth(started.sessionId)).state, 'wait')
  const cancelled = await extension.cancelOAuth({
    $schema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-cancel.v1.schema.json',
    contract: 'cordisx.managed-service-cli-proxy-oauth-cancel/v1',
    schemaVersion: 1,
    requestId: 'cancel-one',
    sessionId: started.sessionId,
    ...common,
  })
  assert.equal(cancelled.status, 'accepted')
  assert.equal(cancelled.cancelled, true)
  const completed = await extension.startOAuth({
    $schema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-start.v1.schema.json',
    contract: 'cordisx.managed-service-cli-proxy-oauth-start/v1',
    schemaVersion: 1,
    requestId: 'oauth-two',
    provider: 'codex',
    ...common,
  })
  assert.equal(completed.status, 'accepted')
  assert.equal((await extension.pollOAuth(completed.sessionId)).state, 'completed')
  assert.deepEqual(
    fixture.events.filter(event => event[0] === 'invoke' && event[2].startsWith('gateway.management.')).map(
      event => [event[2], event[3]],
    ),
    [
      ['gateway.management.accounts.list', undefined],
      ['gateway.management.accounts.toggle', {
        name: 'account-one',
        auth_index: 'auth-index-one',
        disabled: true,
      }],
      ['gateway.management.oauth.codex.start', { is_webui: true }],
      ['gateway.management.oauth.poll', { state: 'oauth-state-one' }],
      ['gateway.management.oauth.cancel', { state: 'oauth-state-one' }],
      ['gateway.management.oauth.codex.start', { is_webui: true }],
      ['gateway.management.oauth.poll', { state: 'oauth-state-one' }],
    ],
  )
  assert.deepEqual(
    fixture.events.filter(event => event[0] === 'publish-native').map(event => event[1].catalog),
    [expectedNativeCatalog(['account-model-old']), expectedNativeCatalog(['account-model-new'])],
  )
  assert.deepEqual(
    fixture.events.filter(event => event[0] === 'publication-dispose'),
    [['publication-dispose', CLI_PROXY_NATIVE_PROVIDER_ID]],
  )
  assert.equal(
    fixture.events.filter(event => event[0] === 'invoke' && event[2] === 'gateway.models.list').length,
    3,
  )

  await fixture.lifecycle.cleanup()
})

test('root disposal invalidates old registrar and provider facade', () => {
  const { root, target } = providerRoot()
  const source = syntheticSources.responses
  const bindingValue = root.bind({
    producer: { pluginId: source.pluginId, pluginGeneration: source.pluginGeneration },
    target,
    signal: new AbortController().signal,
  })
  const registrar = bindingValue.value
  assert.equal(
    registrar.register({ source: identity(source.pluginId, source.serviceId), descriptor: descriptor(source) }).status,
    'registered',
  )
  root.dispose()
  assert.equal(
    registrar.register({
      source: identity(source.pluginId, source.serviceId),
      descriptor: descriptor(source, { revision: 2 }),
    }).status,
    'stale-generation',
  )
  assert.equal(root.providerValue.catalog('gateway-generation').code, 'stale-generation')
  assert.throws(() =>
    root.bind({
      producer: { pluginId: 'synthetic-other', pluginGeneration: 'synthetic-other-one' },
      target,
      signal: new AbortController().signal,
    }), /stale/)
})

test('consumer binding disposal revokes only its producer generation', () => {
  const { root, target } = providerRoot()
  const responses = syntheticSources.responses
  const chat = syntheticSources.chat
  const responsesBinding = root.bind({
    producer: { pluginId: responses.pluginId, pluginGeneration: responses.pluginGeneration },
    target,
    signal: new AbortController().signal,
  })
  const chatBinding = root.bind({
    producer: { pluginId: chat.pluginId, pluginGeneration: chat.pluginGeneration },
    target,
    signal: new AbortController().signal,
  })
  responsesBinding.value.register({
    source: identity(responses.pluginId, responses.serviceId),
    descriptor: descriptor(responses),
  })
  chatBinding.value.register({
    source: identity(chat.pluginId, chat.serviceId),
    descriptor: descriptor(chat),
  })
  responsesBinding.dispose()
  assert.deepEqual(
    root.providerValue.catalog('gateway-generation').groups[0].providers.map(provider => provider.providerId),
    [chat.upstreamId],
  )
})

for (
  const scenario of [
    { name: 'responses-only', kinds: ['responses'] },
    { name: 'chat-only', kinds: ['chat'] },
    { name: 'mixed', kinds: ['responses', 'chat'] },
  ]
) {
  test(`materializes schema-valid ${scenario.name} collection roots and authority leaves`, async () => {
    const fixture = gatewayFixture({ kinds: scenario.kinds })
    const controller = new AbortController()
    await activateCliProxyGateway(fixture.context, activationInput(fixture.client, controller.signal))

    const request = fixture.events.find(event => event[0] === 'materialize')[1]
    assert.equal(request.revision, fixture.events.find(event => event[0] === 'register')[2].revision)
    assert.deepEqual(request.sources.map(source => source.source), fixture.sources.map(source => source.upstreamId))
    const roots = rootCollections(request)
    assert.deepEqual(roots, expectedRootCollections(fixture.sources))
    assert.deepEqual(
      compositionLeaves(request),
      fixture.sources.flatMap(source => {
        const slot = source.wireApi === 'responses' ? 'codex-upstreams' : 'openai-upstreams'
        const leaves = [{
          targetSlot: slot,
          targetPointer: '/0/base-url',
          source: { kind: 'source-origin', source: source.upstreamId, origin: 'api' },
        }]
        if (source.authenticated) {
          leaves.push({
            targetSlot: slot,
            targetPointer: '/0/api-key-entries/0/api-key',
            source: { kind: 'source-authorization', source: source.upstreamId },
          })
        }
        return leaves
      }),
    )
    const validationIndex = fixture.events.findIndex(event =>
      event[0] === 'invoke' && event[1] === 'gateway-runtime' && event[2] === 'gateway.models.list'
    )
    const publicationEvents = fixture.events.filter(event => event[0] === 'publish-native')
    assert.equal(publicationEvents.length, 1)
    assert.equal(fixture.publicationHandles.length, 1)
    const publicationEvent = publicationEvents[0]
    assert.ok(fixture.events.indexOf(publicationEvent) > validationIndex)
    assert.deepEqual(publicationEvent[1], {
      providerId: CLI_PROXY_NATIVE_PROVIDER_ID,
      compositionOrigin: 'api',
      catalog: expectedNativeCatalog(fixture.sources.map(source => `${source.prefix}/${source.modelId}`)),
    })
    assert.deepEqual(publicationEvent[2], { signal: controller.signal })
    assert.equal('binding' in publicationEvent[1], false)

    assert.equal(typeof fixture.lifecycle.cleanup, 'function')
    await fixture.lifecycle.cleanup()
  })
}

test('starts without upstreams and publishes account-backed gateway models immediately', async () => {
  const fixture = gatewayFixture({ kinds: [], gatewayModels: ['zeta-model', 'alpha-model', 'alpha-model'] })
  await activateCliProxyGateway(
    fixture.context,
    activationInput(fixture.client, new AbortController().signal),
  )

  assert.equal(fixture.events.filter(event => event[0] === 'register').length, 1)
  assert.equal(fixture.events.filter(event => event[0] === 'materialize').length, 1)
  assert.deepEqual(rootCollections(fixture.events.find(event => event[0] === 'materialize')[1]), {
    'codex-upstreams': [],
    'openai-upstreams': [],
  })
  assert.deepEqual(fixture.events.filter(event => event[0] === 'publish-native').map(event => event[1]), [{
    providerId: CLI_PROXY_NATIVE_PROVIDER_ID,
    compositionOrigin: 'api',
    catalog: expectedNativeCatalog(['alpha-model', 'zeta-model']),
  }])

  await fixture.lifecycle.cleanup()
})

test('starts without upstreams and leaves an empty gateway unpublished', async () => {
  const fixture = gatewayFixture({ kinds: [] })
  await activateCliProxyGateway(
    fixture.context,
    activationInput(fixture.client, new AbortController().signal),
  )

  assert.equal(fixture.events.filter(event => event[0] === 'register').length, 1)
  assert.equal(fixture.events.filter(event => event[0] === 'materialize').length, 1)
  assert.equal(fixture.events.filter(event => event[0] === 'ensure-ready').length, 1)
  assert.equal(fixture.events.filter(event => event[0] === 'publish-native').length, 0)
  assert.equal(typeof fixture.lifecycle.cleanup, 'function')

  await fixture.lifecycle.cleanup()
})

test('registry changes rematerialize and republish only the CLIProxyAPI provider when models change', async () => {
  const fixture = gatewayFixture({ kinds: [] })
  await activateCliProxyGateway(
    fixture.context,
    activationInput(fixture.client, new AbortController().signal),
  )

  fixture.registerSource(syntheticSources.responses)
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(fixture.events.filter(event => event[0] === 'register').length, 1)
  assert.equal(fixture.events.filter(event => event[0] === 'materialize').length, 2)
  assert.deepEqual(
    fixture.events.filter(event => event[0] === 'publish-native').map(event => event[1].providerId),
    [CLI_PROXY_NATIVE_PROVIDER_ID],
  )

  fixture.registerSource(syntheticSources.chat)
  await new Promise(resolve => setTimeout(resolve, 0))

  assert.equal(fixture.events.filter(event => event[0] === 'register').length, 1)
  assert.equal(fixture.events.filter(event => event[0] === 'materialize').length, 3)
  const published = fixture.events.filter(event => event[0] === 'publish-native').map(event => event[1].providerId)
  assert.deepEqual(published, [CLI_PROXY_NATIVE_PROVIDER_ID, CLI_PROXY_NATIVE_PROVIDER_ID])
  assert.deepEqual(
    fixture.events.filter(event => event[0] === 'publication-dispose'),
    [['publication-dispose', CLI_PROXY_NATIVE_PROVIDER_ID]],
  )

  await fixture.lifecycle.cleanup()
})

test('shares async disposal across abort and effect cleanup while completing every cleanup', async () => {
  const gatewayDisposeError = new Error('synthetic gateway dispose failed')
  const clientDisposeError = new Error('synthetic client dispose failed')
  const publicationDisposeError = new Error('synthetic publication dispose failed')
  const fixture = gatewayFixture({
    gatewayDisposeError,
    clientDisposeError,
    publicationDisposeError: { providerId: CLI_PROXY_NATIVE_PROVIDER_ID, error: publicationDisposeError },
  })
  const controller = new AbortController()
  await activateCliProxyGateway(fixture.context, activationInput(fixture.client, controller.signal))

  controller.abort()
  const first = fixture.lifecycle.cleanup()
  const second = fixture.lifecycle.cleanup()
  assert.strictEqual(first, second)
  await assert.rejects(first, error => {
    assert.equal(error instanceof AggregateError, true)
    assert.deepEqual(error.errors, [publicationDisposeError, gatewayDisposeError, clientDisposeError])
    return true
  })
  assert.deepEqual(fixture.released, [
    'msl_gateway-runtime',
    'msl_synthetic-chat-service',
    'msl_synthetic-responses-service',
  ])
  assert.deepEqual(fixture.events.slice(-2), [['registration-dispose'], ['client-dispose']])
})

test('accepts cleanup after the Host already revoked a native publication', async () => {
  const fixture = gatewayFixture({ kinds: ['responses'] })
  const providerId = CLI_PROXY_NATIVE_PROVIDER_ID
  await activateCliProxyGateway(
    fixture.context,
    activationInput(fixture.client, new AbortController().signal),
  )

  fixture.hostRevokePublication(providerId)
  await fixture.lifecycle.cleanup()

  assert.deepEqual(fixture.publicationDisposeResults, [[providerId, {
    status: 'stale',
    diagnostic: { code: 'disposed', retryable: false },
  }]])
  assert.equal(fixture.activePublications.has(providerId), false)
  assert.deepEqual(fixture.released, ['msl_gateway-runtime', 'msl_synthetic-responses-service'])
  assert.deepEqual(fixture.events.slice(-2), [['registration-dispose'], ['client-dispose']])
})

test('old publication cleanup leaves a Host replacement active', async () => {
  const fixture = gatewayFixture({ kinds: ['responses'] })
  const providerId = CLI_PROXY_NATIVE_PROVIDER_ID
  await activateCliProxyGateway(
    fixture.context,
    activationInput(fixture.client, new AbortController().signal),
  )

  const replacement = fixture.hostReplacePublication(providerId)
  await fixture.lifecycle.cleanup()

  assert.deepEqual(fixture.publicationDisposeResults, [[providerId, {
    status: 'stale',
    diagnostic: { code: 'stale-generation', retryable: false },
  }]])
  assert.strictEqual(fixture.activePublications.get(providerId), replacement)
  assert.deepEqual(
    fixture.events.filter(event => event[0] === 'publication-dispose'),
    [['publication-dispose', providerId]],
  )
})

test('aggregates unexpected native publication cleanup diagnostics', async () => {
  const providerId = CLI_PROXY_NATIVE_PROVIDER_ID
  const fixture = gatewayFixture({
    kinds: ['responses'],
    publicationDisposeDiagnostic: { providerId, code: 'failed' },
  })
  await activateCliProxyGateway(
    fixture.context,
    activationInput(fixture.client, new AbortController().signal),
  )

  await assert.rejects(fixture.lifecycle.cleanup(), error => {
    assert.equal(error instanceof AggregateError, true)
    assert.match(error.errors[0].message, /native publication cleanup failed: failed/)
    return true
  })
  assert.deepEqual(fixture.released, ['msl_gateway-runtime', 'msl_synthetic-responses-service'])
  assert.deepEqual(fixture.events.slice(-2), [['registration-dispose'], ['client-dispose']])
})

for (const code of ['stale-generation', 'failed']) {
  test(`cleans up when the CLIProxyAPI native publication is rejected as ${code}`, async () => {
    const fixture = gatewayFixture({
      publicationFailure: { providerId: CLI_PROXY_NATIVE_PROVIDER_ID, code },
    })
    await assert.rejects(
      activateCliProxyGateway(fixture.context, activationInput(fixture.client, new AbortController().signal)),
      new RegExp(`cli-proxy-api native publication failed: ${code}`),
    )
    assert.deepEqual(
      fixture.events.filter(event => event[0] === 'publish-native').map(event => event[1].providerId),
      [CLI_PROXY_NATIVE_PROVIDER_ID],
    )
    assert.deepEqual(fixture.events.filter(event => event[0] === 'publication-dispose'), [])
    assert.deepEqual(fixture.released, [
      'msl_gateway-runtime',
      'msl_synthetic-chat-service',
      'msl_synthetic-responses-service',
    ])
    assert.deepEqual(fixture.events.slice(-2), [['registration-dispose'], ['client-dispose']])
  })
}

test('preserves the activation error while aggregating complete cleanup failures', async () => {
  const gatewayDisposeError = new Error('synthetic gateway dispose failed')
  const clientDisposeError = new Error('synthetic client dispose failed')
  const fixture = gatewayFixture({
    kinds: ['responses'],
    missingSourceModel: true,
    gatewayDisposeError,
    clientDisposeError,
  })
  await assert.rejects(
    activateCliProxyGateway(fixture.context, activationInput(fixture.client, new AbortController().signal)),
    error => {
      assert.equal(error instanceof AggregateError, true)
      assert.match(error.errors[0].message, /omitted declared models/)
      assert.strictEqual(error.cause, error.errors[0])
      assert.deepEqual(error.errors.slice(1), [gatewayDisposeError, clientDisposeError])
      return true
    },
  )
  assert.deepEqual(fixture.released, ['msl_synthetic-responses-service'])
  assert.deepEqual(fixture.events.slice(-2), [['registration-dispose'], ['client-dispose']])
})

test('fails after gateway validation when the composed catalog is incomplete', async () => {
  const fixture = gatewayFixture({ missingGatewayModel: true })
  await assert.rejects(
    activateCliProxyGateway(fixture.context, activationInput(fixture.client, new AbortController().signal)),
    /omitted composed models/,
  )
  assert.deepEqual(fixture.released, [
    'msl_gateway-runtime',
    'msl_synthetic-chat-service',
    'msl_synthetic-responses-service',
  ])
})
