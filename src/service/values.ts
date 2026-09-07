import type {
  PlatformProviderJsonValue,
  PlatformProviderModelV1,
  PlatformProviderSessionDetailV1,
  PlatformProviderSessionRefV1,
  PlatformProviderSessionV1,
  PlatformProviderTurnV1,
  PlatformProviderWorkspaceRefV1,
} from '@cordisx/protocol/platform-provider/v1'

export function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

export function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function iso(seconds: unknown): string | undefined {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0
    ? new Date(seconds * 1_000).toISOString()
    : undefined
}

export function workspace(value: unknown): PlatformProviderWorkspaceRefV1 | undefined {
  const handle = text(object(value)?.workspaceHandle)
  return handle?.startsWith('ppw_') ? { workspaceHandle: handle as `ppw_${string}` } : undefined
}

export function sessionRef(providerId: string, value: unknown): PlatformProviderSessionRefV1 | undefined {
  const remoteSessionId = text(value)
  return remoteSessionId === undefined ? undefined : { providerId, remoteSessionId }
}

function turnState(value: unknown): PlatformProviderTurnV1['state'] {
  return value === 'inProgress'
    ? 'in-progress'
    : value === 'completed'
    ? 'completed'
    : value === 'interrupted'
    ? 'interrupted'
    : value === 'failed'
    ? 'failed'
    : 'unknown'
}

function userText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const result = value.flatMap(item => {
    const candidate = object(item)
    return candidate?.type === 'text' && typeof candidate.text === 'string' ? [candidate.text] : []
  }).join('\n')
  return result === '' ? undefined : result
}

function turnItem(value: unknown, index: number): PlatformProviderTurnV1['items'][number] {
  const item = object(value)
  const itemId = text(item?.id) ?? `unknown-${index}`
  if (item?.type === 'userMessage') {
    const content = userText(item.content)
    return { itemId, kind: 'user-message', ...(content === undefined ? {} : { text: content }) }
  }
  if (item?.type === 'agentMessage') {
    return { itemId, kind: 'assistant-message', ...(typeof item.text === 'string' ? { text: item.text } : {}) }
  }
  if (item?.type === 'reasoning') {
    const content = [
      ...(Array.isArray(item.summary) ? item.summary : []),
      ...(Array.isArray(item.content) ? item.content : []),
    ]
      .filter((part): part is string => typeof part === 'string').join('\n')
    return { itemId, kind: 'reasoning', ...(content === '' ? {} : { text: content }) }
  }
  if (item?.type === 'commandExecution') {
    const content = text(item.aggregatedOutput) ?? text(item.command)
    return { itemId, kind: 'tool', ...(content === undefined ? {} : { text: content }) }
  }
  return { itemId, kind: 'unknown' }
}

function turns(value: unknown): readonly PlatformProviderTurnV1[] {
  if (!Array.isArray(value)) return []
  return value.map((candidate, index) => {
    const turn = object(candidate)
    const items = Array.isArray(turn?.items) ? turn.items.map(turnItem) : []
    return { turnId: text(turn?.id) ?? `unknown-${index}`, state: turnState(turn?.status), items }
  })
}

export function model(providerId: string, value: unknown): PlatformProviderModelV1 | undefined {
  const candidate = object(value)
  const modelId = text(candidate?.model) ?? text(candidate?.id)
  if (modelId === undefined || candidate?.hidden === true) return undefined
  if (candidate === undefined) return undefined
  const capabilities = Array.isArray(candidate.inputModalities)
    ? candidate.inputModalities.filter((item): item is string => typeof item === 'string')
    : undefined
  return {
    ref: { providerId, modelId },
    label: text(candidate.displayName) ?? modelId,
    ...(candidate.isDefault === true ? { isDefault: true } : {}),
    ...(capabilities === undefined || capabilities.length === 0 ? {} : { capabilities }),
  }
}

export function session(
  providerId: string,
  value: unknown,
  rememberedModel?: string,
): PlatformProviderSessionV1 | undefined {
  const candidate = object(value)
  const ref = sessionRef(providerId, candidate?.id)
  const workspaceRef = workspace(candidate?.workspace)
  if (ref === undefined || workspaceRef === undefined) return undefined
  const sourceModel = text(candidate?.model) ?? rememberedModel ?? 'unknown'
  const title = text(candidate?.name) ?? text(candidate?.preview)
  const createdAt = iso(candidate?.createdAt)
  const updatedAt = iso(candidate?.updatedAt)
  return {
    ref,
    model: { providerId, modelId: sourceModel },
    state: candidate?.status === 'archived' ? 'archived' : candidate?.status === 'deleted' ? 'deleted' : 'active',
    workspace: workspaceRef,
    ...(title === undefined ? {} : { title }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
  }
}

export function sessionDetail(
  providerId: string,
  value: unknown,
  rememberedModel?: string,
): PlatformProviderSessionDetailV1 | undefined {
  const summary = session(providerId, value, rememberedModel)
  const candidate = object(value)
  return summary === undefined ? undefined : { ...summary, turns: turns(candidate?.turns) }
}

export function json(value: unknown): PlatformProviderJsonValue {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value.map(json)
  const candidate = object(value)
  if (candidate === undefined) throw new Error('value is not JSON')
  return Object.fromEntries(Object.entries(candidate).map(([key, item]) => [key, json(item)]))
}
