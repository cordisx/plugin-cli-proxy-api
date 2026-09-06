import type {
  PlatformProviderBrokerEventV1,
  PlatformProviderBrokerResponseV1,
  PlatformProviderBrokerV1,
  PlatformProviderLifecycleEventV1,
  PlatformProviderLifecycleSubscriptionV1,
  PlatformProviderResultV1,
  PlatformProviderSessionRefV1,
} from '@cordisx/protocol/platform-provider/v1'
import { VALUE_SCHEMA } from './bindings.js'
import { object, text } from './values.js'

interface PendingApproval {
  readonly event: PlatformProviderBrokerEventV1
  readonly session: PlatformProviderSessionRefV1
  readonly turnId: string
  readonly approvalId: string
  readonly kind: 'command' | 'file-change'
}

export class LifecycleProjection {
  private readonly listeners = new Set<(event: PlatformProviderLifecycleEventV1) => void | Promise<void>>()
  private readonly approvals = new Map<string, PendingApproval>()
  private readonly assistantText = new Map<string, Map<string, string>>()
  private readonly unsubscribeBroker: () => void
  private sequence = 0
  private subscriptionSequence = 0

  constructor(
    private readonly providerId: string,
    private readonly providerGeneration: string,
    private readonly broker: PlatformProviderBrokerV1,
  ) {
    const subscription = broker.subscribe(['turns.submit', 'approvals.decide'], async event => {
      await this.receive(event)
    })
    this.unsubscribeBroker = () => subscription.unsubscribe()
  }

  subscribe(
    listener: (event: PlatformProviderLifecycleEventV1) => void | Promise<void>,
  ): PlatformProviderLifecycleSubscriptionV1 {
    this.listeners.add(listener)
    this.subscriptionSequence += 1
    let closed = false
    return {
      subscriptionId: `ppls_cli-proxy-${this.subscriptionSequence}`,
      unsubscribe: () => {
        if (closed) return
        closed = true
        this.listeners.delete(listener)
      },
    }
  }

  async decide(input: {
    readonly session: PlatformProviderSessionRefV1
    readonly turnId: string
    readonly approvalId: string
    readonly decision: 'approved' | 'denied' | 'cancelled'
  }): Promise<PlatformProviderResultV1<{ approvalId: string; decision: 'approved' | 'denied' | 'cancelled' }>> {
    const key = this.approvalKey(input.session.remoteSessionId, input.turnId, input.approvalId)
    const pending = this.approvals.get(key)
    if (pending === undefined || pending.session.providerId !== input.session.providerId) {
      return { ok: false, error: { code: 'session-not-found', message: 'Pending approval is unavailable' } }
    }
    const response: PlatformProviderBrokerResponseV1 = {
      $schema:
        'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/platform-provider-broker-response.v1.schema.json',
      contract: 'cordisx.platform-provider-broker-response/v1',
      schemaVersion: 1,
      eventId: pending.event.eventId,
      operation: pending.event.operation,
      method: pending.event.method,
      responseSchema: VALUE_SCHEMA,
      value: {
        decision: input.decision === 'approved' ? 'accept' : input.decision === 'denied' ? 'decline' : 'cancel',
      },
    }
    const result = await this.broker.respond(response)
    if (result !== 'accepted') {
      return {
        ok: false,
        error: {
          code: result === 'stale' ? 'stale-generation' : 'rejected',
          message: 'Approval response was rejected',
        },
      }
    }
    this.approvals.delete(key)
    await this.publish(input.session, input.turnId, 'approval.resolved', {
      approval: { approvalId: input.approvalId, kind: pending.kind, state: 'resolved', outcome: input.decision },
    })
    return { ok: true, value: { approvalId: input.approvalId, decision: input.decision } }
  }

  async dispose(): Promise<void> {
    this.unsubscribeBroker()
    this.listeners.clear()
    this.approvals.clear()
    this.assistantText.clear()
  }

  private async receive(event: PlatformProviderBrokerEventV1): Promise<void> {
    const value = object(event.payload)
    const threadId = text(value?.threadId) ?? text(object(value?.thread)?.id)
    const turnId = text(value?.turnId) ?? text(object(value?.turn)?.id)
    if (threadId === undefined || turnId === undefined) return
    const session = { providerId: this.providerId, remoteSessionId: threadId }
    if (event.method === 'item/agentMessage/delta') {
      const itemId = text(value?.itemId)
      if (itemId === undefined || typeof value?.delta !== 'string') return
      const items = this.assistantText.get(this.turnKey(threadId, turnId)) ?? new Map<string, string>()
      if (!items.has(itemId) && items.size >= 64) return
      items.set(itemId, `${items.get(itemId) ?? ''}${value.delta}`.slice(0, 1_000_000))
      this.assistantText.set(this.turnKey(threadId, turnId), items)
      return
    }
    if (event.method === 'item/completed') {
      const item = object(value?.item)
      const itemId = text(item?.id)
      if (item?.type !== 'agentMessage' || itemId === undefined || typeof item.text !== 'string') return
      const items = this.assistantText.get(this.turnKey(threadId, turnId)) ?? new Map<string, string>()
      if (!items.has(itemId) && items.size >= 64) return
      items.set(itemId, item.text.slice(0, 1_000_000))
      this.assistantText.set(this.turnKey(threadId, turnId), items)
      return
    }
    if (
      event.method === 'item/commandExecution/requestApproval'
      || event.method === 'item/fileChange/requestApproval'
    ) {
      const approvalId = text(value?.approvalId) ?? text(value?.itemId)
      if (approvalId === undefined || !event.responseRequired) return
      const kind = event.method === 'item/fileChange/requestApproval' ? 'file-change' as const : 'command' as const
      const key = this.approvalKey(threadId, turnId, approvalId)
      if (this.approvals.has(key)) return
      this.approvals.set(key, { event, session, turnId, approvalId, kind })
      await this.publish(session, turnId, 'approval.required', {
        approval: { approvalId, kind, state: 'pending' },
      })
      return
    }
    const status = object(value?.turn)?.status
    if (event.method === 'turn/started') {
      await this.publish(session, turnId, 'turn.started')
      return
    }
    if (event.method === 'turn/completed' || event.method === 'turn/failed') {
      const failed = event.method === 'turn/failed' || status === 'failed' || status === 'interrupted'
      const streamed = [...(this.assistantText.get(this.turnKey(threadId, turnId))?.values() ?? [])]
        .filter(item => item.trim() !== '').join('\n\n')
      this.assistantText.delete(this.turnKey(threadId, turnId))
      if (failed) {
        await this.publish(session, turnId, 'turn.failed', {
          failure: { code: text(object(value?.error)?.code) ?? 'TURN_FAILED', retryable: false },
        })
      } else {
        await this.publish(session, turnId, 'turn.completed', {
          ...(streamed === '' ? {} : { output: [{ type: 'text', text: streamed }] }),
        })
      }
    }
  }

  private async publish(
    session: PlatformProviderSessionRefV1,
    turnId: string,
    type: PlatformProviderLifecycleEventV1['type'],
    details: Record<string, unknown> = {},
  ): Promise<void> {
    this.sequence += 1
    const terminal = type === 'turn.completed' || type === 'turn.failed'
    const event = {
      $schema:
        'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/platform-provider-lifecycle-event.v1.schema.json',
      contract: 'cordisx.platform-provider-lifecycle-event/v1',
      schemaVersion: 1,
      eventId: `pple_cli-proxy-${this.sequence}`,
      sequence: this.sequence,
      providerId: this.providerId,
      providerGeneration: this.providerGeneration,
      session,
      turnId,
      type,
      terminal,
      ...details,
    } as PlatformProviderLifecycleEventV1
    await Promise.all([...this.listeners].map(async listener => await listener(event)))
  }

  private turnKey(threadId: string, turnId: string): string {
    return `${threadId}\u0000${turnId}`
  }

  private approvalKey(threadId: string, turnId: string, approvalId: string): string {
    return `${threadId}\u0000${turnId}\u0000${approvalId}`
  }
}
