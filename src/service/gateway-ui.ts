import { createHash } from 'node:crypto'
import type {
  ManagedServiceNodeUISourceExtensionV1,
  ManagedServiceNodeUISourceV1,
} from '@cordisx/protocol/managed-service-context/v1'
import type {
  ManagedServiceBindingV1,
  ManagedServiceCliProxyAccountsResultV1,
  ManagedServiceCliProxyAccountToggleRequestV1,
  ManagedServiceCliProxyAccountToggleResultV1,
  ManagedServiceCliProxyAccountV1,
  ManagedServiceCliProxyCatalogResultV1,
  ManagedServiceCliProxyOAuthCancelRequestV1,
  ManagedServiceCliProxyOAuthCancelResultV1,
  ManagedServiceCliProxyOAuthSessionStateV1,
  ManagedServiceCliProxyOAuthStartRequestV1,
  ManagedServiceCliProxyOAuthStartResultV1,
  ManagedServiceCliProxyOAuthStatusV1,
  ManagedServiceCliProxyProviderIdV1,
} from '@cordisx/protocol/managed-service/v1'
import type {
  ManagedServiceBoundClientV1,
  ManagedServiceIdentityV1,
  ManagedServiceRegistrationHandleV1,
  ManagedServiceSafeValueV1,
} from '@cordisx/protocol/managed-service-runtime/v1'
import { CLI_PROXY_GATEWAY_SERVICE_ID } from './gateway-definition.js'
import type { CliProxyModelCatalogV1, CliProxyUpstreamRegistryV1 } from './upstream-registry.js'

interface GatewayUIState {
  readonly pluginGeneration: string
  readonly registry: CliProxyUpstreamRegistryV1<ManagedServiceIdentityV1>
  readonly authorization: Map<string, boolean>
  activeRevision: number | undefined
  refreshGatewayModels(): Promise<void>
}

let activeState: GatewayUIState | undefined

export function bindGatewayUIState(state: GatewayUIState): () => void {
  activeState = state
  return () => {
    if (activeState === state) activeState = undefined
  }
}

function record(value: ManagedServiceSafeValueV1 | undefined): Readonly<Record<string, ManagedServiceSafeValueV1>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, ManagedServiceSafeValueV1>>
    : {}
}

function stringValue(value: ManagedServiceSafeValueV1 | undefined): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function numberValue(value: ManagedServiceSafeValueV1 | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanValue(value: ManagedServiceSafeValueV1 | undefined): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function providerId(value: string | undefined): ManagedServiceCliProxyProviderIdV1 {
  const normalized = value?.toLowerCase() ?? 'unknown'
  if (normalized === 'claude') return 'anthropic'
  if (normalized === 'openai') return 'codex'
  if (['anthropic', 'codex', 'antigravity', 'kimi', 'xai'].includes(normalized)) {
    return normalized as ManagedServiceCliProxyProviderIdV1
  }
  const safe = normalized.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'unknown'
  return `custom:${safe}`
}

function revision(value: unknown): number {
  const digest = createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 12)
  return Number.parseInt(digest, 16)
}

function bindingMatches(left: ManagedServiceBindingV1, right: ManagedServiceBindingV1): boolean {
  return left.bindingId === right.bindingId
    && left.identity.pluginId === right.identity.pluginId
    && left.identity.serviceId === right.identity.serviceId
    && left.scope.profileId === right.scope.profileId
    && left.scope.generation === right.scope.generation
}

function mapCatalog(
  state: GatewayUIState,
  catalog: CliProxyModelCatalogV1,
  binding: ManagedServiceBindingV1,
  serviceGeneration: string,
  sequence: number,
) {
  const plan = state.registry.gatewayPlan(state.pluginGeneration)
  const sourceByProvider = 'code' in plan
    ? new Map<string, ManagedServiceIdentityV1>()
    : new Map(plan.composition.map(item => [item.upstreamId, item.source]))
  return Object.freeze({
    $schema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-catalog.v1.schema.json' as const,
    contract: 'cordisx.managed-service-cli-proxy-catalog/v1' as const,
    schemaVersion: 1 as const,
    binding,
    sequence,
    observedAt: new Date().toISOString(),
    revision: catalog.registryRevision,
    serviceGeneration,
    providers: Object.freeze(catalog.groups.flatMap(group =>
      group.providers.map(provider => {
        const source = sourceByProvider.get(provider.providerId)
        const authorized = state.authorization.get(provider.providerId) ?? false
        const active = state.activeRevision === catalog.registryRevision
        return Object.freeze({
          id: provider.providerId,
          displayName: provider.displayName,
          enabled: active,
          endpoint: Object.freeze({
            origin: source === undefined
              ? 'managed://unavailable'
              : `managed://${source.pluginId}/${source.serviceId}`,
            secretConfigured: authorized,
          }),
          health: active ? 'healthy' as const : 'warning' as const,
          auth: authorized ? 'authenticated' as const : 'missing' as const,
          models: Object.freeze({
            mappings: Object.freeze(provider.models.flatMap(model =>
              model.sourceModelIds.map(sourceModelId =>
                Object.freeze({
                  sourceModelId,
                  modelId: model.gatewayModelId,
                  displayName: model.displayName,
                  enabled: active,
                  isDefault: model.isDefault,
                })
              )
            )),
          }),
        })
      })
    )),
  })
}

function mapAccount(value: ManagedServiceSafeValueV1): ManagedServiceCliProxyAccountV1 | undefined {
  const item = record(value)
  const accountId = stringValue(item.id) ?? stringValue(item.name)
  if (accountId === undefined) return undefined
  const disabled = booleanValue(item.disabled) ?? false
  const unavailable = booleanValue(item.unavailable) ?? false
  const rawModels = Array.isArray(item.models) ? item.models : []
  const models = rawModels.flatMap(model => {
    const entry = record(model)
    const id = stringValue(entry.id) ?? stringValue(entry.name)
    return id === undefined ? [] : [{
      id,
      ...(stringValue(entry.display_name) === undefined ? {} : { displayName: stringValue(entry.display_name) }),
      ...(stringValue(entry.type) === undefined ? {} : { type: stringValue(entry.type) }),
      ...(stringValue(entry.owned_by) === undefined ? {} : { ownedBy: stringValue(entry.owned_by) }),
    }]
  })
  const source = stringValue(item.source)
  const quota = record(item.quota)
  const quotaSignals = Object.fromEntries(
    Object.entries(record(quota.signals)).flatMap(([key, signal]) => typeof signal === 'string' ? [[key, signal]] : []),
  )
  const provider = providerId(stringValue(item.provider) ?? stringValue(item.type))
  const runtimeOnly = booleanValue(item.runtime_only) ?? false
  const authKind = runtimeOnly
    ? 'plugin-virtual' as const
    : provider.startsWith('custom:')
    ? 'unknown' as const
    : 'oauth' as const
  return Object.freeze({
    accountId,
    authIndex: stringValue(item.auth_index) ?? accountId,
    provider,
    label: stringValue(item.label) ?? stringValue(item.email) ?? stringValue(item.account) ?? accountId,
    status: disabled ? 'disabled' : unavailable ? 'unavailable' : 'active',
    ...(stringValue(item.status_message) === undefined ? {} : { statusMessage: 'Account unavailable' }),
    disabled,
    unavailable,
    authKind,
    sourceKind: source === 'file' || source === 'plugin' ? source : 'memory',
    runtimeOnly,
    ...(stringValue(item.email) === undefined ? {} : { email: stringValue(item.email) }),
    ...(stringValue(item.project_id) === undefined ? {} : { projectId: stringValue(item.project_id) }),
    ...(stringValue(item.account_type) === undefined ? {} : { accountType: stringValue(item.account_type) }),
    ...(stringValue(item.account) === undefined ? {} : { account: stringValue(item.account) }),
    ...(stringValue(item.note) === undefined ? {} : { note: stringValue(item.note) }),
    ...(numberValue(item.priority) === undefined ? {} : { priority: numberValue(item.priority) }),
    ...(numberValue(item.weight) === undefined ? {} : { weight: numberValue(item.weight) }),
    ...(booleanValue(item.websockets) === undefined ? {} : { websockets: booleanValue(item.websockets) }),
    ...(numberValue(item.request_retry) === undefined ? {} : { requestRetry: numberValue(item.request_retry) }),
    ...(numberValue(item.success) === undefined ? {} : { success: numberValue(item.success) }),
    ...(numberValue(item.failed) === undefined ? {} : { failed: numberValue(item.failed) }),
    ...(stringValue(item.created_at) === undefined ? {} : { createdAt: stringValue(item.created_at) }),
    ...(stringValue(item.updated_at) === undefined ? {} : { updatedAt: stringValue(item.updated_at) }),
    ...(stringValue(item.last_refresh) === undefined ? {} : { lastRefreshAt: stringValue(item.last_refresh) }),
    ...(stringValue(item.next_retry_after) === undefined ? {} : { nextRetryAfter: stringValue(item.next_retry_after) }),
    ...(models.length === 0 ? {} : { models: Object.freeze(models) }),
    ...(Object.keys(quotaSignals).length === 0 ? {} : { quotaSignals: Object.freeze(quotaSignals) }),
  })
}

async function invoke(
  client: ManagedServiceBoundClientV1,
  registration: ManagedServiceRegistrationHandleV1,
  operationId: string,
  value: ManagedServiceSafeValueV1 | undefined,
  signal: AbortSignal,
): Promise<ManagedServiceSafeValueV1 | undefined> {
  const acquired = await client.acquire(registration.binding.identity, { signal })
  if (acquired.status !== 'ready') return undefined
  try {
    const result = await client.invoke(acquired.lease, operationId, value, { signal })
    return result.status === 'accepted' ? result.value : undefined
  } finally {
    client.release(acquired.lease)
  }
}

export const managedServiceUI: ManagedServiceNodeUISourceV1 = Object.freeze({
  serviceId: CLI_PROXY_GATEWAY_SERVICE_ID,
  create(
    { binding, registration, client, signal }: Parameters<ManagedServiceNodeUISourceV1['create']>[0],
  ): ManagedServiceNodeUISourceExtensionV1 {
    const state = activeState
    let sequence = 0
    let accountsRevision = 0
    const sessions = new Map<string, ManagedServiceCliProxyProviderIdV1>()
    const unavailableAccounts = () =>
      Object.freeze({ status: 'unavailable' as const, code: 'management-disabled' as const })
    const readAccounts = async (): Promise<ManagedServiceCliProxyAccountsResultV1> => {
      if (state === undefined || signal.aborted) return unavailableAccounts()
      const projection = await registration.inspect()
      const value = await invoke(client, registration, 'gateway.management.accounts.list', undefined, signal)
      const files = record(value).files
      if (!Array.isArray(files)) return unavailableAccounts()
      const accounts = Object.freeze(files.flatMap(item => {
        const mapped = mapAccount(item)
        return mapped === undefined ? [] : [mapped]
      }))
      accountsRevision = revision(accounts)
      sequence += 1
      return Object.freeze({
        status: 'available' as const,
        accounts: Object.freeze({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-accounts.v1.schema.json' as const,
          contract: 'cordisx.managed-service-cli-proxy-accounts/v1' as const,
          schemaVersion: 1 as const,
          binding,
          sequence,
          observedAt: new Date().toISOString(),
          revision: accountsRevision,
          serviceGeneration: projection.binding.serviceGeneration,
          accounts,
        }),
      })
    }
    return Object.freeze({
      async readCatalog(): Promise<ManagedServiceCliProxyCatalogResultV1> {
        if (state === undefined || signal.aborted) {
          return Object.freeze({ status: 'unavailable' as const, code: 'owner-unavailable' as const })
        }
        const catalog = state.registry.catalog(state.pluginGeneration)
        if ('code' in catalog) {
          return Object.freeze({ status: 'unavailable' as const, code: 'stale-generation' as const })
        }
        const projection = await registration.inspect()
        sequence += 1
        return Object.freeze({
          status: 'available' as const,
          catalog: mapCatalog(state, catalog, binding, projection.binding.serviceGeneration, sequence),
        })
      },
      readAccounts,
      async toggleAccount(
        request: ManagedServiceCliProxyAccountToggleRequestV1,
      ): Promise<ManagedServiceCliProxyAccountToggleResultV1> {
        if (!bindingMatches(request.binding, binding) || request.expectedRevision !== accountsRevision) {
          return Object.freeze({
            $schema:
              'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-account-toggle-result.v1.schema.json' as const,
            contract: 'cordisx.managed-service-cli-proxy-account-toggle-result/v1' as const,
            schemaVersion: 1 as const,
            requestId: request.requestId,
            binding,
            status: 'denied' as const,
            error: Object.freeze({ code: 'stale-revision' as const, message: 'account revision changed' }),
          })
        }
        const result = await invoke(client, registration, 'gateway.management.accounts.toggle', {
          name: request.accountId,
          ...(request.authIndex === undefined ? {} : { auth_index: request.authIndex }),
          disabled: request.disabled,
        }, signal)
        sequence += 1
        if (result !== undefined && state !== undefined && !signal.aborted) {
          await state.refreshGatewayModels().catch(() => undefined)
        }
        return result === undefined
          ? Object.freeze({
            $schema:
              'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-account-toggle-result.v1.schema.json' as const,
            contract: 'cordisx.managed-service-cli-proxy-account-toggle-result/v1' as const,
            schemaVersion: 1 as const,
            requestId: request.requestId,
            binding,
            status: 'failed' as const,
            error: Object.freeze({ code: 'management-disabled' as const, message: 'management API unavailable' }),
          })
          : Object.freeze({
            $schema:
              'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-account-toggle-result.v1.schema.json' as const,
            contract: 'cordisx.managed-service-cli-proxy-account-toggle-result/v1' as const,
            schemaVersion: 1 as const,
            requestId: request.requestId,
            binding,
            status: 'accepted' as const,
            accountId: request.accountId,
            disabled: request.disabled,
            sequence,
          })
      },
      async startOAuth(
        request: ManagedServiceCliProxyOAuthStartRequestV1,
      ): Promise<ManagedServiceCliProxyOAuthStartResultV1> {
        if (!bindingMatches(request.binding, binding) || request.expectedRevision !== accountsRevision) {
          return Object.freeze({
            $schema:
              'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-result.v1.schema.json' as const,
            contract: 'cordisx.managed-service-cli-proxy-oauth-result/v1' as const,
            schemaVersion: 1 as const,
            requestId: request.requestId,
            binding,
            status: 'denied' as const,
            error: Object.freeze({ code: 'stale-revision' as const, message: 'account revision changed' }),
          })
        }
        const endpoints: Partial<Record<ManagedServiceCliProxyProviderIdV1, string>> = {
          anthropic: 'gateway.management.oauth.anthropic.start',
          codex: 'gateway.management.oauth.codex.start',
          antigravity: 'gateway.management.oauth.antigravity.start',
          kimi: 'gateway.management.oauth.kimi.start',
          xai: 'gateway.management.oauth.xai.start',
        }
        const endpoint = endpoints[request.provider]
        const value = endpoint === undefined
          ? undefined
          : await invoke(client, registration, endpoint, { is_webui: true }, signal)
        const response = record(value)
        const authorizationUrl = stringValue(response.url)
        const sessionId = stringValue(response.state)
        if (authorizationUrl === undefined || sessionId === undefined) {
          return Object.freeze({
            $schema:
              'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-result.v1.schema.json' as const,
            contract: 'cordisx.managed-service-cli-proxy-oauth-result/v1' as const,
            schemaVersion: 1 as const,
            requestId: request.requestId,
            binding,
            status: 'unavailable' as const,
            error: Object.freeze({ code: 'unsupported-provider' as const, message: 'OAuth provider unavailable' }),
          })
        }
        sessions.set(sessionId, request.provider)
        sequence += 1
        return Object.freeze({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-result.v1.schema.json' as const,
          contract: 'cordisx.managed-service-cli-proxy-oauth-result/v1' as const,
          schemaVersion: 1 as const,
          requestId: request.requestId,
          binding,
          status: 'accepted' as const,
          sessionId,
          authorizationUrl,
          sequence,
        })
      },
      async pollOAuth(sessionId: string): Promise<ManagedServiceCliProxyOAuthStatusV1> {
        const value = sessions.has(sessionId)
          ? await invoke(client, registration, 'gateway.management.oauth.poll', { state: sessionId }, signal)
          : undefined
        const response = record(value)
        const status = stringValue(response.status)
        const stateValue: ManagedServiceCliProxyOAuthSessionStateV1 = status === 'ok'
          ? 'completed'
          : status === 'error'
          ? 'error'
          : status === 'wait'
          ? 'wait'
          : 'unknown'
        if (stateValue === 'completed' || stateValue === 'error') sessions.delete(sessionId)
        if (stateValue === 'completed' && state !== undefined && !signal.aborted) {
          await state.refreshGatewayModels().catch(() => undefined)
        }
        return Object.freeze({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-status.v1.schema.json' as const,
          contract: 'cordisx.managed-service-cli-proxy-oauth-status/v1' as const,
          schemaVersion: 1 as const,
          binding,
          sessionId,
          state: stateValue,
          ...(stringValue(response.error) === undefined
            ? {}
            : { error: Object.freeze({ code: 'authentication-failed', message: 'Authentication failed' }) }),
          sequence: ++sequence,
        })
      },
      async cancelOAuth(
        request: ManagedServiceCliProxyOAuthCancelRequestV1,
      ): Promise<ManagedServiceCliProxyOAuthCancelResultV1> {
        if (!bindingMatches(request.binding, binding) || request.expectedRevision !== accountsRevision) {
          return Object.freeze({
            $schema:
              'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-cancel-result.v1.schema.json' as const,
            contract: 'cordisx.managed-service-cli-proxy-oauth-cancel-result/v1' as const,
            schemaVersion: 1 as const,
            requestId: request.requestId,
            binding,
            status: 'denied' as const,
            error: Object.freeze({ code: 'stale-revision' as const, message: 'account revision changed' }),
          })
        }
        const value = sessions.has(request.sessionId)
          ? await invoke(client, registration, 'gateway.management.oauth.cancel', { state: request.sessionId }, signal)
          : undefined
        const cancelled = booleanValue(record(value).cancelled) ?? false
        if (cancelled) sessions.delete(request.sessionId)
        if (value === undefined) {
          return Object.freeze({
            $schema:
              'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-cancel-result.v1.schema.json' as const,
            contract: 'cordisx.managed-service-cli-proxy-oauth-cancel-result/v1' as const,
            schemaVersion: 1 as const,
            requestId: request.requestId,
            binding,
            status: 'failed' as const,
            error: Object.freeze({ code: 'management-disabled' as const, message: 'management API unavailable' }),
          })
        }
        return Object.freeze({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-cancel-result.v1.schema.json' as const,
          contract: 'cordisx.managed-service-cli-proxy-oauth-cancel-result/v1' as const,
          schemaVersion: 1 as const,
          requestId: request.requestId,
          binding,
          status: 'accepted' as const,
          sessionId: request.sessionId,
          cancelled,
          sequence: ++sequence,
        })
      },
    })
  },
})
