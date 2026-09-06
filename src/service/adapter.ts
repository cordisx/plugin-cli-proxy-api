import type {
  PlatformProviderAdapterV1,
  PlatformProviderFactoryConfigurationV1,
  PlatformProviderModelRefV1,
  PlatformProviderResultV1,
  PlatformProviderSessionRefV1,
  PlatformProviderSessionV1,
} from '@cordisx/protocol/platform-provider/v1'
import { BrokerClient } from './broker-client.js'
import { LifecycleProjection } from './lifecycle.js'
import { model, object, session, sessionDetail, text } from './values.js'

function failure(
  code: 'session-not-found' | 'unsupported' | 'rejected' | 'adapter-failure' | 'stale-generation',
  message: string,
): PlatformProviderResultV1<never> {
  return { ok: false, error: { code, message } }
}

export class CliProxyPlatformProviderAdapter implements PlatformProviderAdapterV1 {
  readonly models: PlatformProviderAdapterV1['models']
  readonly sessions: PlatformProviderAdapterV1['sessions']
  readonly turns: PlatformProviderAdapterV1['turns']
  readonly approvals: PlatformProviderAdapterV1['approvals']
  private readonly client: BrokerClient
  private readonly lifecycle: LifecycleProjection
  private readonly sessionModels = new Map<string, string>()
  private disposed = false

  constructor(
    readonly providerId: string,
    readonly providerGeneration: string,
    readonly configuration: PlatformProviderFactoryConfigurationV1,
    broker: ConstructorParameters<typeof BrokerClient>[0],
    private readonly signal: AbortSignal,
  ) {
    this.client = new BrokerClient(broker)
    this.lifecycle = new LifecycleProjection(providerId, providerGeneration, broker)
    this.models = { list: async input => await this.listModels(input) }
    this.sessions = {
      list: async input => await this.listSessions(input),
      read: async ref => await this.readSession(ref),
      create: async input => await this.createSession(input),
      control: async input => await this.controlSession(input),
    }
    this.turns = {
      submit: async input => await this.submitTurn(input),
      control: async input => await this.controlTurn(input),
      introduce: async input => await this.introduce(input),
    }
    this.approvals = { decide: async input => await this.decideApproval(input) }
  }

  subscribeLifecycle: PlatformProviderAdapterV1['subscribeLifecycle'] = listener => this.lifecycle.subscribe(listener)

  async drain(): Promise<void> {
    await this.client.drain()
  }

  async dispose(_reason: Parameters<PlatformProviderAdapterV1['dispose']>[0]): Promise<void> {
    if (this.disposed) return
    this.disposed = true
    await this.lifecycle.dispose()
    this.sessionModels.clear()
  }

  private unavailable(): PlatformProviderResultV1<never> | undefined {
    return this.disposed || this.signal.aborted
      ? failure('stale-generation', 'CLIProxy provider generation is retired')
      : undefined
  }

  private checkSession(ref: PlatformProviderSessionRefV1): PlatformProviderResultV1<never> | undefined {
    const unavailable = this.unavailable()
    if (unavailable !== undefined) return unavailable
    return ref.providerId !== this.providerId || ref.remoteSessionId.trim() === ''
      ? failure('rejected', 'Session reference is outside this provider')
      : undefined
  }

  private checkModel(ref: PlatformProviderModelRefV1): PlatformProviderResultV1<never> | undefined {
    const unavailable = this.unavailable()
    if (unavailable !== undefined) return unavailable
    return ref.providerId !== this.providerId || ref.modelId.trim() === ''
      ? failure('rejected', 'Model reference is outside this provider')
      : undefined
  }

  private async listModels(
    input: Parameters<PlatformProviderAdapterV1['models']['list']>[0],
  ): ReturnType<PlatformProviderAdapterV1['models']['list']> {
    const unavailable = this.unavailable()
    if (unavailable !== undefined) return unavailable
    const result = await this.client.request('models.list', 'model/list', {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: 100,
      includeHidden: false,
    }, this.signal)
    if (!result.ok) return result
    const response = object(result.value)
    if (!Array.isArray(response?.data)) return failure('adapter-failure', 'CLIProxy returned an invalid model page')
    const models = response.data.flatMap(candidate => {
      const projection = model(this.providerId, candidate)
      return projection === undefined ? [] : [projection]
    })
    const nextCursor = text(response.nextCursor)
    return { ok: true, value: { models, ...(nextCursor === undefined ? {} : { nextCursor }) } }
  }

  private async listSessions(
    input: Parameters<PlatformProviderAdapterV1['sessions']['list']>[0],
  ): ReturnType<PlatformProviderAdapterV1['sessions']['list']> {
    const unavailable = this.unavailable()
    if (unavailable !== undefined) return unavailable
    const result = await this.client.request('sessions.list', 'thread/list', {
      ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      limit: input.limit,
      sortKey: 'updated_at',
      sortDirection: 'desc',
      modelProviders: [this.providerId],
      archived: false,
      ...(input.workspace === undefined ? {} : { workspace: { workspaceHandle: input.workspace.workspaceHandle } }),
      ...(input.search === undefined ? {} : { searchTerm: input.search }),
    }, this.signal)
    if (!result.ok) return result
    const response = object(result.value)
    if (!Array.isArray(response?.data)) return failure('adapter-failure', 'CLIProxy returned an invalid session page')
    const sessions = response.data.flatMap(candidate => {
      const id = text(object(candidate)?.id)
      const projection = session(this.providerId, candidate, id === undefined ? undefined : this.sessionModels.get(id))
      return projection === undefined ? [] : [projection]
    })
    const nextCursor = text(response.nextCursor)
    return { ok: true, value: { sessions, ...(nextCursor === undefined ? {} : { nextCursor }) } }
  }

  private async readSession(
    ref: PlatformProviderSessionRefV1,
  ): ReturnType<PlatformProviderAdapterV1['sessions']['read']> {
    const invalid = this.checkSession(ref)
    if (invalid !== undefined) return invalid
    const result = await this.client.request('sessions.read', 'thread/read', {
      threadId: ref.remoteSessionId,
      includeTurns: true,
    }, this.signal)
    if (!result.ok) return result
    const response = object(result.value)
    const projection = sessionDetail(
      this.providerId,
      response?.thread,
      this.sessionModels.get(ref.remoteSessionId),
    )
    return projection === undefined
      ? failure('session-not-found', 'CLIProxy session was not found')
      : { ok: true, value: projection }
  }

  private async createSession(
    input: Parameters<PlatformProviderAdapterV1['sessions']['create']>[0],
  ): ReturnType<PlatformProviderAdapterV1['sessions']['create']> {
    const invalid = this.checkModel(input.model)
    if (invalid !== undefined) return invalid
    const result = await this.client.request('sessions.create', 'thread/start', {
      model: input.model.modelId,
      modelProvider: this.providerId,
      workspace: { workspaceHandle: input.workspace.workspaceHandle },
      ...(input.initialMessage === undefined ? {} : { initialMessage: input.initialMessage }),
    }, this.signal)
    if (!result.ok) return result
    const response = object(result.value)
    const raw = response?.thread
    const id = text(object(raw)?.id)
    if (id !== undefined) this.sessionModels.set(id, input.model.modelId)
    const projection = sessionDetail(this.providerId, raw, input.model.modelId)
    return projection === undefined
      ? failure('adapter-failure', 'CLIProxy returned an invalid created session')
      : { ok: true, value: projection }
  }

  private async controlSession(
    input: Parameters<PlatformProviderAdapterV1['sessions']['control']>[0],
  ): ReturnType<PlatformProviderAdapterV1['sessions']['control']> {
    const invalid = this.checkSession(input.session)
    if (invalid !== undefined) return invalid
    if (input.action === 'delete') {
      const result = await this.client.request('sessions.control', 'thread/delete', {
        threadId: input.session.remoteSessionId,
      }, this.signal)
      return result.ok ? { ok: true, value: { deleted: true } } : result
    }
    if (input.action === 'archive') {
      const current = await this.readSession(input.session)
      if (!current.ok) return current
      const result = await this.client.request('sessions.control', 'thread/archive', {
        threadId: input.session.remoteSessionId,
      }, this.signal)
      return result.ok ? { ok: true, value: { ...current.value, state: 'archived' } } : result
    }
    const method = input.action === 'continue'
      ? 'thread/resume'
      : input.action === 'fork'
      ? 'thread/fork'
      : 'thread/unarchive'
    const result = await this.client.request('sessions.control', method, {
      threadId: input.session.remoteSessionId,
    }, this.signal)
    if (!result.ok) return result
    const response = object(result.value)
    const raw = response?.thread
    const id = text(object(raw)?.id)
    const remembered = id === undefined ? undefined : this.sessionModels.get(id)
    const projection = session(this.providerId, raw, text(response?.model) ?? remembered)
    return projection === undefined
      ? failure('adapter-failure', 'CLIProxy returned an invalid controlled session')
      : { ok: true, value: { ...projection, state: 'active' } }
  }

  private async submitTurn(
    input: Parameters<PlatformProviderAdapterV1['turns']['submit']>[0],
  ): ReturnType<PlatformProviderAdapterV1['turns']['submit']> {
    const invalid = this.checkSession(input.session)
    if (invalid !== undefined) return invalid
    const result = await this.client.request('turns.submit', 'turn/start', {
      threadId: input.session.remoteSessionId,
      input: [{ type: 'text', text: input.message, text_elements: [] }],
    }, this.signal)
    if (!result.ok) return result
    const turnId = text(object(object(result.value)?.turn)?.id)
    return turnId === undefined
      ? failure('adapter-failure', 'CLIProxy returned an invalid turn')
      : { ok: true, value: { turnId } }
  }

  private async controlTurn(
    input: Parameters<PlatformProviderAdapterV1['turns']['control']>[0],
  ): ReturnType<PlatformProviderAdapterV1['turns']['control']> {
    const invalid = this.checkSession(input.session)
    if (invalid !== undefined) return invalid
    const method = input.action === 'steer' ? 'turn/steer' : 'turn/interrupt'
    const result = await this.client.request('turns.control', method, {
      threadId: input.session.remoteSessionId,
      ...(input.action === 'steer'
        ? {
          expectedTurnId: input.turnId,
          input: [{ type: 'text', text: input.message ?? '', text_elements: [] }],
        }
        : { turnId: input.turnId }),
    }, this.signal)
    if (!result.ok) return result
    return { ok: true, value: { turnId: text(object(result.value)?.turnId) ?? input.turnId } }
  }

  private async introduce(
    input: Parameters<PlatformProviderAdapterV1['turns']['introduce']>[0],
  ): ReturnType<PlatformProviderAdapterV1['turns']['introduce']> {
    const invalid = this.checkSession(input.session)
    if (invalid !== undefined) return invalid
    const result = await this.client.request('turns.introduce', 'turn/start', {
      threadId: input.session.remoteSessionId,
      input: [],
      clientUserMessageId: input.operationId,
    }, this.signal)
    if (!result.ok) return result
    const turnId = text(object(object(result.value)?.turn)?.id)
    return turnId === undefined
      ? failure('adapter-failure', 'CLIProxy returned an invalid introduction turn')
      : { ok: true, value: { turnId, messageId: `cli-proxy-introduction:${input.operationId}` } }
  }

  private async decideApproval(
    input: Parameters<PlatformProviderAdapterV1['approvals']['decide']>[0],
  ): ReturnType<PlatformProviderAdapterV1['approvals']['decide']> {
    const invalid = this.checkSession(input.session)
    return invalid ?? await this.lifecycle.decide(input)
  }
}
