import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'

const registryModule = await import('../dist/service.mjs')
const {
  CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1,
  CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1,
  CliProxyUpstreamRegistryV1,
  createCliProxyUpstreamRegistrarV1,
} = registryModule

const generation = 'plugin-generation-1'
const producer = (pluginId = 'producer-a', pluginGeneration = 'producer-generation-1') => ({
  pluginId,
  pluginGeneration,
})
const source = id => ({ identityHandle: `source_${id}` })
const descriptor = (overrides = {}) => ({
  $schema: CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1,
  contract: CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1,
  schemaVersion: 1,
  revision: 1,
  upstreamId: 'provider-a',
  displayName: 'Provider A',
  enabled: true,
  wireApi: 'chat-completions',
  prefix: 'provider-a',
  order: 10,
  requestTimeoutMs: 30_000,
  group: { groupId: 'general', displayName: 'General', order: 10 },
  models: [
    {
      sourceModelId: 'source-model-a',
      modelId: 'model-a',
      displayName: 'Model A',
      enabled: true,
      isDefault: true,
      inputModalities: ['text'],
    },
  ],
  ...overrides,
})

function registry() {
  return new CliProxyUpstreamRegistryV1(generation, value => value.identityHandle)
}

function registrar(upstreams, authority = producer()) {
  return createCliProxyUpstreamRegistrarV1(upstreams, authority)
}

function register(upstreams, value, authority = producer()) {
  return registrar(upstreams, authority).register(value)
}

test('upstream descriptor schema accepts only the generic public declaration', async () => {
  const schema = JSON.parse(
    await readFile(new URL('../schemas/cli-proxy-upstream-descriptor.v1.schema.json', import.meta.url), 'utf8'),
  )
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  assert.equal(validate(descriptor()), true, JSON.stringify(validate.errors))
  assert.equal(validate({ ...descriptor(), endpoint: 'https://private.invalid' }), false)
  assert.equal(validate({ ...descriptor(), token: 'secret' }), false)
})

test('registers, updates, and revokes exact upstream revisions', () => {
  const upstreams = registry()
  const registration = registrar(upstreams)
  assert.deepEqual(
    registration.register({ source: source('a'), descriptor: descriptor() }),
    {
      status: 'registered',
      registryRevision: 1,
    },
  )
  assert.deepEqual(
    registration.register({ source: source('a'), descriptor: descriptor() }),
    {
      status: 'unchanged',
      registryRevision: 1,
    },
  )
  const reordered = {
    models: descriptor().models,
    group: descriptor().group,
    requestTimeoutMs: 30_000,
    order: 10,
    prefix: 'provider-a',
    enabled: true,
    wireApi: 'chat-completions',
    displayName: 'Provider A',
    upstreamId: 'provider-a',
    revision: 1,
    schemaVersion: 1,
    contract: CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1,
    $schema: CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1,
  }
  assert.equal(
    registration.register({ source: source('a'), descriptor: reordered }).status,
    'unchanged',
  )
  assert.deepEqual(
    registration.register({
      source: source('a'),
      descriptor: descriptor({ revision: 2, displayName: 'Provider A Updated' }),
    }),
    { status: 'updated', registryRevision: 2 },
  )
  assert.deepEqual(
    registration.revoke({ upstreamId: 'provider-a', expectedRevision: 1 }),
    {
      status: 'rejected',
      diagnostic: { code: 'stale-revision', field: 'expectedRevision', message: 'Upstream revision is stale' },
    },
  )
  assert.deepEqual(
    registration.revoke({ upstreamId: 'provider-a', expectedRevision: 2 }),
    { status: 'revoked', registryRevision: 3 },
  )
})

test('rejects stale generations and conflicting active identities without mutating the catalog', () => {
  const upstreams = registry()
  const authority = producer()
  const registration = registrar(upstreams, authority)
  registration.register({ source: source('a'), descriptor: descriptor() })
  const before = upstreams.catalog(generation)
  assert.equal(
    upstreams.register(
      {
        source: source('b'),
        descriptor: descriptor({ upstreamId: 'provider-b', prefix: 'provider-b' }),
      },
      'retired-generation',
      authority,
    ).status,
    'stale-generation',
  )
  assert.equal(
    register(upstreams, {
      source: source('a'),
      descriptor: descriptor({ upstreamId: 'provider-b', prefix: 'provider-b' }),
    }).diagnostic.code,
    'conflicting-source',
  )
  assert.equal(
    register(upstreams, {
      source: source('b'),
      descriptor: descriptor({ upstreamId: 'provider-b' }),
    }).diagnostic.code,
    'conflicting-prefix',
  )
  assert.deepEqual(upstreams.catalog(generation), before)
})

test('supports explicit alias pools and rejects conflicting public alias metadata', () => {
  const upstreams = registry()
  const pooled = descriptor({
    models: [
      {
        sourceModelId: 'source-model-a',
        modelId: 'model-pool',
        displayName: 'Model Pool',
        enabled: true,
        isDefault: true,
        inputModalities: ['text'],
      },
      {
        sourceModelId: 'source-model-b',
        modelId: 'model-pool',
        displayName: 'Model Pool',
        enabled: true,
        isDefault: true,
        inputModalities: ['text'],
      },
    ],
  })
  assert.equal(register(upstreams, { source: source('a'), descriptor: pooled }).status, 'registered')
  assert.deepEqual(upstreams.catalog(generation).groups[0].providers[0].models[0].sourceModelIds, [
    'source-model-a',
    'source-model-b',
  ])

  const invalid = register(registry(), {
    source: source('a'),
    descriptor: descriptor({
      models: [
        { sourceModelId: 'source-model-a', modelId: 'alias', enabled: true, isDefault: true },
        { sourceModelId: 'source-model-b', modelId: 'alias', enabled: true, isDefault: false },
      ],
    }),
  })
  assert.equal(invalid.diagnostic.code, 'conflicting-model-alias')
})

test('projects deterministic groups, aliases, provenance, and CLIProxyAPI configuration semantics', () => {
  const left = registry()
  const right = registry()
  const registrations = [
    {
      source: source('b'),
      descriptor: descriptor({
        upstreamId: 'provider-b',
        displayName: 'Provider B',
        prefix: 'provider-b',
        order: 20,
        group: { groupId: 'specialized', displayName: 'Specialized', order: 20 },
        models: [{ sourceModelId: 'source-model-b', modelId: 'model-b', enabled: true, isDefault: true }],
      }),
    },
    { source: source('a'), descriptor: descriptor() },
  ]
  for (const registration of registrations) register(left, registration)
  for (const registration of [...registrations].reverse()) register(right, registration)

  const leftCatalog = left.catalog(generation)
  const rightCatalog = right.catalog(generation)
  assert.deepEqual(leftCatalog.groups, rightCatalog.groups)
  assert.deepEqual(leftCatalog.upstreamRevisions, { 'provider-a': 1, 'provider-b': 1 })
  assert.equal(leftCatalog.catalogDigest, rightCatalog.catalogDigest)
  assert.deepEqual(leftCatalog.groups.map(group => group.groupId), ['general', 'specialized'])
  assert.equal(leftCatalog.groups[0].providers[0].models[0].gatewayModelId, 'provider-a/model-a')

  const plan = left.gatewayPlan(generation)
  assert.equal(plan.registryRevision, 2)
  assert.equal(plan.catalogDigest, leftCatalog.catalogDigest)
  assert.deepEqual(plan.configuration['openai-compatibility'][0], {
    name: 'provider-a',
    disabled: false,
    prefix: 'provider-a',
    'base-url': null,
    'api-key-entries': [{ 'api-key': null }],
    'request-retry': 0,
    models: [
      {
        name: 'source-model-a',
        alias: 'model-a',
        'display-name': 'Model A',
        'force-mapping': true,
        'input-modalities': ['text'],
      },
    ],
  })
  assert.deepEqual(plan.composition.map(item => item.upstreamId), ['provider-a', 'provider-b'])
  assert.equal(plan.composition[0].origin.targetPointer, '/openai-compatibility/0/base-url')
  assert.equal(plan.composition[0].authorization.targetPointer, '/openai-compatibility/0/api-key-entries/0/api-key')
  assert.equal(JSON.stringify(plan).includes('source_a'), true)
  assert.equal(JSON.stringify(plan).includes('private.invalid'), false)
})

test('routes a Responses-only upstream through codex-api-key without chat fallback', () => {
  const upstreams = registry()
  register(upstreams, {
    source: source('responses'),
    descriptor: descriptor({
      upstreamId: 'responses-provider',
      displayName: 'Responses Provider',
      prefix: 'responses-provider',
      wireApi: 'responses',
    }),
  })
  const plan = upstreams.gatewayPlan(generation)
  assert.equal(plan.configuration['openai-compatibility'].length, 0)
  assert.deepEqual(plan.configuration['codex-api-key'][0], {
    'api-key': null,
    prefix: 'responses-provider',
    'base-url': null,
    'request-retry': 0,
    models: [{ name: 'source-model-a', alias: 'model-a', 'display-name': 'Model A', 'force-mapping': true }],
  })
  assert.equal(plan.composition[0].origin.targetPointer, '/codex-api-key/0/base-url')
  assert.equal(plan.composition[0].authorization.targetPointer, '/codex-api-key/0/api-key')

  const responsesOnly = path => {
    if (path === '/v1/chat/completions') throw new Error('chat completions are unsupported')
    assert.equal(path, '/v1/responses')
    return { status: 200 }
  }
  const selectedPath = plan.configuration['codex-api-key'].length === 1
    ? '/v1/responses'
    : '/v1/chat/completions'
  assert.deepEqual(responsesOnly(selectedPath), { status: 200 })
  assert.throws(() => responsesOnly('/v1/chat/completions'), /unsupported/)
})

test('exposes the exact versioned registrar service shape for producer plugins', () => {
  const upstreams = registry()
  const registration = registrar(upstreams)
  assert.deepEqual(registration.producer, producer())
  assert.equal(registration.register({ source: source('a'), descriptor: descriptor() }).status, 'registered')
  assert.equal(registration.revoke({ upstreamId: 'provider-a', expectedRevision: 1 }).status, 'revoked')
  assert.equal(registration.dispose().status, 'unchanged')
})

test('fences delayed cleanup from a replaced producer generation', () => {
  const upstreams = registry()
  const oldProducer = registrar(upstreams, producer('producer-a', 'generation-old'))
  assert.equal(oldProducer.register({ source: source('old'), descriptor: descriptor() }).status, 'registered')

  const newProducer = registrar(upstreams, producer('producer-a', 'generation-new'))
  assert.equal(
    newProducer.register({
      source: source('new'),
      descriptor: descriptor({ displayName: 'Provider A New' }),
    }).status,
    'registered',
  )
  assert.equal(oldProducer.revoke({ upstreamId: 'provider-a', expectedRevision: 1 }).status, 'stale-generation')
  assert.equal(oldProducer.dispose().status, 'stale-generation')
  assert.equal(upstreams.catalog(generation).groups[0].providers[0].displayName, 'Provider A New')
  assert.equal(newProducer.dispose().status, 'revoked')
})

test('rejects cross-producer updates and revocations', () => {
  const upstreams = registry()
  const producerA = registrar(upstreams, producer('producer-a'))
  const producerB = registrar(upstreams, producer('producer-b'))
  assert.equal(producerA.register({ source: source('a'), descriptor: descriptor() }).status, 'registered')
  assert.equal(
    producerB.register({
      source: source('b'),
      descriptor: descriptor({ revision: 2, displayName: 'Hijacked Provider' }),
    }).diagnostic.code,
    'conflicting-producer',
  )
  assert.equal(
    producerB.revoke({ upstreamId: 'provider-a', expectedRevision: 1 }).diagnostic.code,
    'conflicting-producer',
  )
  assert.equal(upstreams.catalog(generation).groups[0].providers[0].displayName, 'Provider A')
})

test('root disposal makes every outstanding registrar and provider read stale', () => {
  const upstreams = registry()
  const registration = registrar(upstreams)
  assert.equal(registration.register({ source: source('a'), descriptor: descriptor() }).status, 'registered')
  upstreams.dispose()
  assert.equal(registration.dispose().status, 'stale-generation')
  assert.equal(
    registration.register({ source: source('a'), descriptor: descriptor({ revision: 2 }) }).status,
    'stale-generation',
  )
  assert.equal(upstreams.catalog(generation).code, 'stale-generation')
  assert.throws(() => registrar(upstreams, producer('producer-b')), /stale/)
})
