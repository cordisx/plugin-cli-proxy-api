import assert from 'node:assert/strict'
import test from 'node:test'

const service = await import('../dist/service.mjs')
const owner = {
  ownerHandle: 'ppo_test',
  pluginId: 'cli-proxy-api',
  serviceId: 'providers-runtime',
  sourceDigest: `sha256:${'a'.repeat(64)}`,
  hostGeneration: 'host-1',
  pluginGeneration: 'plugin-1',
}
const configuration = {
  $schema:
    'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/platform-provider-factory-configuration.v1.schema.json',
  contract: 'cordisx.platform-provider-factory-configuration/v1',
  schemaVersion: 1,
  configurationRevision: 4,
  providerId: 'gateway-a',
  displayName: 'Gateway A',
  enabled: true,
  requestTimeoutMs: 30000,
}

function broker() {
  let listener
  const calls = []
  const responses = []
  return {
    calls,
    responses,
    api: {
      policy: { bindings: [] },
      async exchange(request) {
        calls.push([request.operation, request.method, request.params])
        const value = request.method === 'model/list'
          ? { data: [{ id: 'gpt-test', displayName: 'GPT Test', isDefault: true }] }
          : request.method === 'thread/list'
          ? { data: [{ id: 'session-1', model: 'gpt-test', workspace: { workspaceHandle: 'ppw_test' } }] }
          : request.method === 'thread/read'
          ? {
            thread: {
              id: request.params.threadId,
              model: 'gpt-test',
              workspace: { workspaceHandle: 'ppw_test' },
              turns: [],
            },
          }
          : request.method === 'thread/delete'
          ? {}
          : request.method.startsWith('thread/')
          ? { thread: { id: 'session-1', model: 'gpt-test', workspace: { workspaceHandle: 'ppw_test' }, turns: [] } }
          : request.method === 'turn/start'
          ? { turn: { id: 'turn-1' } }
          : { turnId: 'turn-1' }
        return {
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/platform-provider-broker-result.v1.schema.json',
          contract: 'cordisx.platform-provider-broker-result/v1',
          schemaVersion: 1,
          requestId: request.requestId,
          operation: request.operation,
          method: request.method,
          status: 'accepted',
          resultSchema: request.requestSchema,
          value,
        }
      },
      subscribe(_operations, next) {
        listener = next
        return {
          subscriptionId: 'ppbs_test',
          unsubscribe() {
            listener = undefined
          },
        }
      },
      async respond(response) {
        responses.push(response)
        return 'accepted'
      },
    },
    emit: async event => await listener?.(event),
  }
}

test('registers every enabled provider through the public Host-owned service context', async () => {
  let definition
  await service.apply({
    platformProviders: {
      owner,
      async register(value) {
        definition = value
        return { registration: {}, async dispose() {} }
      },
    },
  }, {
    owner,
    configurations: [configuration, { ...configuration, providerId: 'disabled', enabled: false }],
    signal: new AbortController().signal,
  })
  assert.equal(definition.descriptor.providerId, 'gateway-a')
  assert.equal(definition.brokerRequest.bindings.length, 22)
  assert.deepEqual(definition.descriptor.operations, [
    'models.list',
    'sessions.list',
    'sessions.read',
    'sessions.create',
    'sessions.control',
    'turns.submit',
    'turns.control',
    'turns.introduce',
    'approvals.decide',
  ])
})

test('adapts models, sessions, turns, lifecycle, and approvals without private Host authority', async () => {
  let definition
  await service.apply({
    platformProviders: {
      owner,
      async register(value) {
        definition = value
        return { registration: {}, async dispose() {} }
      },
    },
  }, {
    owner,
    configurations: [configuration],
    signal: new AbortController().signal,
  })
  const transport = broker()
  const adapter = await definition.createAdapter({
    owner,
    providerId: 'gateway-a',
    providerGeneration: 'plugin-1:gateway-a',
    configuration,
    broker: transport.api,
    signal: new AbortController().signal,
  })
  assert.equal('endpoint' in adapter, false)
  assert.equal('transport' in adapter, false)
  assert.deepEqual((await adapter.models.list({})).value.models[0].ref, {
    providerId: 'gateway-a',
    modelId: 'gpt-test',
  })
  const sessions = await adapter.sessions.list({ limit: 10 })
  assert.equal(sessions.value.sessions[0].workspace.workspaceHandle, 'ppw_test')
  assert.equal((await adapter.sessions.read({ providerId: 'gateway-a', remoteSessionId: 'session-1' })).ok, true)
  assert.equal(
    (await adapter.sessions.create({
      model: { providerId: 'gateway-a', modelId: 'gpt-test' },
      workspace: { workspaceHandle: 'ppw_test' },
    })).ok,
    true,
  )
  assert.deepEqual(
    await adapter.sessions.control({
      action: 'delete',
      session: { providerId: 'gateway-a', remoteSessionId: 'session-1' },
    }),
    { ok: true, value: { deleted: true } },
  )
  assert.equal(
    (await adapter.turns.submit({
      session: { providerId: 'gateway-a', remoteSessionId: 'session-1' },
      message: 'hello',
    })).ok,
    true,
  )
  assert.equal(
    (await adapter.turns.control({
      action: 'interrupt',
      session: { providerId: 'gateway-a', remoteSessionId: 'session-1' },
      turnId: 'turn-1',
    })).ok,
    true,
  )
  assert.equal(
    (await adapter.turns.introduce({
      session: { providerId: 'gateway-a', remoteSessionId: 'session-1' },
      participantId: 'p',
      memberId: 'm',
      runId: 'r',
      operationId: 'op',
      operationDigest: 'digest',
    })).ok,
    true,
  )

  const lifecycle = []
  adapter.subscribeLifecycle(event => lifecycle.push(event))
  await transport.emit({
    eventId: 'approval-1',
    sequence: 1,
    operation: 'approvals.decide',
    method: 'item/commandExecution/requestApproval',
    eventSchema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/platform-provider-broker-value.v1.schema.json',
    payload: { threadId: 'session-1', turnId: 'turn-1', itemId: 'approval-1' },
    responseRequired: true,
  })
  assert.equal(lifecycle[0].type, 'approval.required')
  const decision = await adapter.approvals.decide({
    session: { providerId: 'gateway-a', remoteSessionId: 'session-1' },
    turnId: 'turn-1',
    approvalId: 'approval-1',
    decision: 'approved',
    operationId: 'op',
    operationDigest: 'digest',
  })
  assert.equal(decision.ok, true)
  assert.equal(transport.responses[0].value.decision, 'accept')
  await adapter.drain()
  await adapter.dispose('host-disposed')
})
