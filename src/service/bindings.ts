import type {
  PlatformProviderBrokerBindingV1,
  PlatformProviderOperationV1,
} from '@cordisx/protocol/platform-provider/v1'

export const VALUE_SCHEMA =
  'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/platform-provider-broker-value.v1.schema.json'

const request = (operation: PlatformProviderOperationV1, method: string): PlatformProviderBrokerBindingV1 => ({
  operation,
  direction: 'request',
  method,
  requestSchema: VALUE_SCHEMA,
  resultSchema: VALUE_SCHEMA,
})
const event = (operation: PlatformProviderOperationV1, method: string): PlatformProviderBrokerBindingV1 => ({
  operation,
  direction: 'event',
  method,
  eventSchema: VALUE_SCHEMA,
  responseSchema: VALUE_SCHEMA,
})

export const BROKER_BINDINGS: readonly PlatformProviderBrokerBindingV1[] = Object.freeze([
  request('models.list', 'model/list'),
  request('sessions.list', 'thread/list'),
  request('sessions.read', 'thread/read'),
  request('sessions.create', 'thread/start'),
  request('sessions.control', 'thread/resume'),
  request('sessions.control', 'thread/fork'),
  request('sessions.control', 'thread/archive'),
  request('sessions.control', 'thread/unarchive'),
  request('sessions.control', 'thread/delete'),
  request('turns.submit', 'turn/start'),
  request('turns.control', 'turn/steer'),
  request('turns.control', 'turn/interrupt'),
  request('turns.introduce', 'turn/start'),
  event('turns.submit', 'turn/started'),
  event('turns.submit', 'turn/completed'),
  event('turns.submit', 'turn/failed'),
  event('turns.submit', 'item/agentMessage/delta'),
  event('turns.submit', 'item/completed'),
  event('approvals.decide', 'approval/requested'),
  event('approvals.decide', 'approval/resolved'),
  event('approvals.decide', 'item/commandExecution/requestApproval'),
  event('approvals.decide', 'item/fileChange/requestApproval'),
])
