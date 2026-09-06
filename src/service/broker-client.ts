import type {
  PlatformProviderBrokerRequestV1,
  PlatformProviderBrokerV1,
  PlatformProviderJsonValue,
  PlatformProviderOperationV1,
  PlatformProviderResultV1,
} from '@cordisx/protocol/platform-provider/v1'
import { VALUE_SCHEMA } from './bindings.js'
import { json } from './values.js'

export class BrokerClient {
  private sequence = 0
  private readonly pending = new Set<Promise<unknown>>()

  constructor(private readonly broker: PlatformProviderBrokerV1) {}

  async request(
    operation: PlatformProviderOperationV1,
    method: string,
    params: PlatformProviderJsonValue,
    signal?: AbortSignal,
  ): Promise<PlatformProviderResultV1<PlatformProviderJsonValue>> {
    this.sequence += 1
    const request: PlatformProviderBrokerRequestV1 = {
      $schema:
        'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/platform-provider-broker-request.v1.schema.json',
      contract: 'cordisx.platform-provider-broker-request/v1',
      schemaVersion: 1,
      requestId: `cli-proxy-${this.sequence}`,
      operation,
      method,
      requestSchema: VALUE_SCHEMA,
      params: json(params),
    }
    const exchange = this.broker.exchange(request, signal)
    this.pending.add(exchange)
    try {
      const result = await exchange
      if (result.status === 'accepted') return { ok: true, value: result.value }
      const code = result.code === 'timeout'
        ? 'timeout'
        : result.code === 'stale-generation'
        ? 'stale-generation'
        : result.code === 'disposed'
        ? 'disposed'
        : result.code === 'provider-unavailable'
        ? 'provider-unavailable'
        : 'rejected'
      return {
        ok: false,
        error: { code, message: `Broker rejected ${operation}:${method}`, retryable: code === 'timeout' },
      }
    } finally {
      this.pending.delete(exchange)
    }
  }

  async drain(): Promise<void> {
    await Promise.allSettled([...this.pending])
  }
}
