import type { Context } from '@deepseek-ai/cordis'
import { useCallback, useEffect, useMemo, useRef, useState } from 'cordisx/react'
import { Button, Card, Disclosure, EmptyState, FieldList, Heading, Icon, Stack, StatusBadge, Text } from 'cordisx/ui'
import type { FieldListItem } from 'cordisx/ui'
import type { CordisXReactPageProps } from 'cordisx/contracts'
import type { UpstreamSubscriptionManagerMessages } from './upstream-subscription-manager-messages.js'
import type {
  ManagedServiceCliProxyAccountsV1,
  ManagedServiceCliProxyAccountV1,
  ManagedServiceCliProxyCatalogV1,
  ManagedServiceCliProxyModelMappingV1,
  ManagedServiceCliProxyOAuthSessionStateV1,
  ManagedServiceCliProxyProviderIdV1,
  ManagedServiceCliProxyProviderV1,
  ManagedServiceProjectionV1,
  ManagedServiceSubscriptionV1,
  ManagedServiceV1,
} from '@cordisx/protocol/managed-service-ui/v1'
import { requestOwnPluginConfiguration } from './manager-configuration.js'
import './upstream-subscription-manager-page.css'

const SERVICE_ID = 'gateway-runtime'

type AccountOAuthState = {
  readonly provider: ManagedServiceCliProxyProviderIdV1
  readonly sessionId: string
  readonly state: ManagedServiceCliProxyOAuthSessionStateV1
  readonly errorMessage?: string
}

interface AccountToggleState {
  readonly accountId: string
  readonly disabled: boolean
}

type PageProps = CordisXReactPageProps<UpstreamSubscriptionManagerMessages>

function readinessVariant(r: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (r === 'ready') return 'success'
  if (r === 'degraded') return 'warning'
  if (r === 'failed' || r === 'stopped') return 'danger'
  return 'neutral'
}

function healthVariant(h: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (h === 'healthy') return 'success'
  if (h === 'warning') return 'warning'
  if (h === 'critical') return 'danger'
  return 'neutral'
}

function authVariant(a: string): 'success' | 'warning' | 'danger' | 'neutral' {
  if (a === 'authenticated' || a === 'completed' || a === 'active') return 'success'
  if (a === 'authenticating' || a === 'pending' || a === 'wait' || a === 'warning' || a === 'disabled') return 'warning'
  if (a === 'expired' || a === 'failed' || a === 'error' || a === 'critical' || a === 'unavailable') return 'danger'
  return 'neutral'
}

function stateLabel(t: PageProps['t'], state: string): string {
  switch (state) {
    case 'ready':
      return t('upstream.status.ready')
    case 'degraded':
      return t('upstream.status.degraded')
    case 'failed':
      return t('upstream.status.failed')
    case 'stopped':
      return t('upstream.status.stopped')
    case 'healthy':
      return t('upstream.status.healthy')
    case 'warning':
      return t('upstream.status.warning')
    case 'critical':
      return t('upstream.status.critical')
    case 'missing':
      return t('upstream.status.missing')
    case 'authenticating':
      return t('upstream.status.authenticating')
    case 'authenticated':
      return t('upstream.status.authenticated')
    case 'expired':
      return t('upstream.status.expired')
    case 'logged-out':
      return t('upstream.status.logged-out')
    default:
      return t('upstream.status.unknown')
  }
}

function formatDateTime(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function authKindLabel(t: PageProps['t'], kind: ManagedServiceCliProxyAccountV1['authKind']): string {
  switch (kind) {
    case 'oauth':
      return t('upstream.status.auth-oauth')
    case 'api-key':
      return t('upstream.status.auth-api-key')
    case 'file':
      return t('upstream.status.auth-file')
    case 'plugin-virtual':
      return t('upstream.status.auth-plugin-virtual')
    default:
      return t('upstream.status.auth-unknown')
  }
}

function sourceLabel(t: PageProps['t'], source: ManagedServiceCliProxyAccountV1['sourceKind']): string {
  switch (source) {
    case 'file':
      return t('upstream.status.account-source-file')
    case 'memory':
      return t('upstream.status.account-source-memory')
    case 'plugin':
      return t('upstream.status.account-source-plugin')
  }
}

function oauthStateLabel(t: PageProps['t'], state: ManagedServiceCliProxyOAuthSessionStateV1): string {
  switch (state) {
    case 'pending':
    case 'wait':
      return t('upstream.status.oauth-pending')
    case 'completed':
      return t('upstream.status.oauth-completed')
    case 'cancelled':
      return t('upstream.status.oauth-cancelled')
    case 'error':
      return t('upstream.status.oauth-error')
    default:
      return t('upstream.status.oauth-unknown')
  }
}

function requestId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function gesture() {
  return { kind: 'explicit-click' as const, at: new Date().toISOString() }
}

function groupHeader(title: string) {
  return (
    <div className='cus-group-header'>
      <Heading level={2}>{title}</Heading>
    </div>
  )
}

function field(id: string, label: string, value: string | number | undefined): FieldListItem | undefined {
  if (value === undefined || value === '') return undefined
  return { id, label, value }
}

function fields(...items: readonly (FieldListItem | undefined)[]): readonly FieldListItem[] {
  return items.filter((item): item is FieldListItem => item !== undefined)
}

export function createUpstreamSubscriptionManagerPage(
  managedServices: Context['managedServices'] | undefined,
  manager: Context['manager'] | undefined,
  notifications: Context['notifications'],
) {
  return function UpstreamSubscriptionManagerPage(props: PageProps) {
    const [service, setService] = useState<ManagedServiceV1 | null>(null)
    const [snapshot, setSnapshot] = useState<ManagedServiceProjectionV1 | null>(null)
    const [catalog, setCatalog] = useState<ManagedServiceCliProxyCatalogV1 | null>(null)
    const [accounts, setAccounts] = useState<ManagedServiceCliProxyAccountsV1 | null>(null)
    const [accountAvailability, setAccountAvailability] = useState<'loading' | 'available' | 'unavailable'>('loading')
    const [loading, setLoading] = useState(true)
    const [serviceLoggingIn, setServiceLoggingIn] = useState(false)
    const [serviceLoggingOut, setServiceLoggingOut] = useState(false)
    const [oauthState, setOauthState] = useState<AccountOAuthState | null>(null)
    const [pendingToggle, setPendingToggle] = useState<AccountToggleState | null>(null)
    const [pendingOAuthProvider, setPendingOAuthProvider] = useState<ManagedServiceCliProxyProviderIdV1 | null>(null)
    const [pendingCancelOAuth, setPendingCancelOAuth] = useState(false)
    const [configurationOpening, setConfigurationOpening] = useState(false)
    const [configurationUnavailable, setConfigurationUnavailable] = useState(manager === undefined)
    const subscriptionRef = useRef<ManagedServiceSubscriptionV1 | null>(null)
    const oauthPollRef = useRef<number | null>(null)
    const oauthPollGenerationRef = useRef(0)
    const oauthStateRef = useRef<AccountOAuthState | null>(null)
    const serviceRef = useRef<ManagedServiceV1 | null>(null)

    const accountControl = service?.accountControl

    const showError = useCallback(() => {
      notifications.show({
        kind: 'external-account.operation-failed',
        type: 'error',
        message: props.t('upstream.state.operation-error'),
      })
    }, [notifications, props.t])

    const clearOauthPoll = useCallback(() => {
      oauthPollGenerationRef.current += 1
      if (oauthPollRef.current !== null) {
        window.clearTimeout(oauthPollRef.current)
        oauthPollRef.current = null
      }
    }, [])

    const setOauthStateValue = useCallback((value: AccountOAuthState | null) => {
      oauthStateRef.current = value
      setOauthState(value)
    }, [])

    const refresh = useCallback(async (target?: ManagedServiceV1 | null, notifyFailure = true) => {
      const current = target ?? serviceRef.current
      if (current === null) {
        if (notifyFailure) showError()
        setLoading(false)
        return
      }
      setLoading(prev => prev && snapshot === null && catalog === null && accounts === null)
      try {
        const [snapResult, catalogResult, accountsResult] = await Promise.all([
          current.snapshot(),
          current.readCatalog?.() ?? Promise.resolve(undefined),
          current.accountControl?.readAccounts() ?? Promise.resolve(undefined),
        ])

        if (snapResult.status === 'available') {
          setSnapshot(snapResult.projection)
        } else if (notifyFailure) {
          showError()
        }

        if (catalogResult?.status === 'available') {
          setCatalog(catalogResult.catalog)
        } else if (catalogResult !== undefined) {
          setCatalog(null)
        }

        if (accountsResult?.status === 'available') {
          setAccounts(accountsResult.accounts)
          setAccountAvailability('available')
        } else if (accountsResult !== undefined) {
          setAccounts(null)
          setAccountAvailability('unavailable')
        }
      } catch {
        if (notifyFailure) showError()
      } finally {
        setLoading(false)
      }
    }, [showError])

    const pollOAuthSession = useCallback(
      (target: ManagedServiceV1, sessionId: string, provider: ManagedServiceCliProxyProviderIdV1) => {
        clearOauthPoll()
        const generation = oauthPollGenerationRef.current
        const poll = async () => {
          if (generation !== oauthPollGenerationRef.current || target.accountControl === undefined) return
          try {
            const status = await target.accountControl.pollOAuth(sessionId)
            if (generation !== oauthPollGenerationRef.current) return
            const next: AccountOAuthState = {
              provider,
              sessionId,
              state: status.state,
              errorMessage: status.error?.message,
            }
            setOauthStateValue(next)
            if (status.state === 'pending' || status.state === 'wait' || status.state === 'unknown') {
              oauthPollRef.current = window.setTimeout(() => {
                void poll()
              }, 1200)
              return
            }
            if (status.state === 'completed') {
              void refresh(target)
            }
          } catch {
            if (generation === oauthPollGenerationRef.current) {
              setOauthStateValue({ provider, sessionId, state: 'error' })
              showError()
            }
          }
        }
        oauthPollRef.current = window.setTimeout(() => {
          void poll()
        }, 500)
      },
      [clearOauthPoll, refresh, setOauthStateValue, showError],
    )

    const subscribe = useCallback(async (target: ManagedServiceV1) => {
      const subResult = await target.subscribe()
      if (subResult.status !== 'subscribed') return
      subscriptionRef.current?.unsubscribe().catch(() => {})
      subscriptionRef.current = subResult.subscription
      const consumer = async () => {
        for await (const page of subResult.subscription.pages) {
          for (const update of page.updates) {
            if (update.kind === 'snapshot-replaced') {
              setSnapshot(update.projection)
            } else if (update.kind === 'state-changed') {
              setSnapshot(prev => {
                if (prev === null) return null
                return { ...prev, sequence: update.sequence, ...update.delta } as ManagedServiceProjectionV1
              })
            }
          }
          await refresh(target, false)
        }
      }
      void consumer().catch(() => {
        if (subscriptionRef.current === subResult.subscription) {
          showError()
        }
      })
    }, [refresh, showError])

    useEffect(() => {
      let disposed = false
      void (async () => {
        if (managedServices === undefined) {
          showError()
          setLoading(false)
          return
        }
        const acquired = await managedServices.get({ serviceId: SERVICE_ID })
        if (disposed) return
        if (acquired.status !== 'available') {
          showError()
          setLoading(false)
          return
        }
        serviceRef.current = acquired.service
        setService(acquired.service)
        await refresh(acquired.service)
        await subscribe(acquired.service)
      })().catch(() => {
        showError()
        setLoading(false)
      })
      const refreshTimer = window.setInterval(() => {
        if (!disposed && serviceRef.current !== null) void refresh(serviceRef.current, false)
      }, 15_000)
      return () => {
        window.clearInterval(refreshTimer)
        disposed = true
        clearOauthPoll()
        const subscription = subscriptionRef.current
        subscriptionRef.current = null
        subscription?.unsubscribe().catch(() => {})
      }
    }, [clearOauthPoll, managedServices, props.t, refresh, showError, subscribe])

    const loginService = useCallback(async () => {
      if (service === null || snapshot === null) return
      setServiceLoggingIn(true)
      try {
        const result = await service.authenticate({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-login-request.v1.schema.json' as const,
          contract: 'cordisx.managed-service-login-request/v1' as const,
          schemaVersion: 1 as const,
          requestId: requestId('svc-login'),
          binding: service.binding,
          action: 'login' as const,
          expectedSequence: snapshot.sequence,
          userGesture: gesture(),
        })
        if (result.status === 'accepted') {
          await refresh(service)
        } else {
          showError()
        }
      } catch {
        showError()
      } finally {
        setServiceLoggingIn(false)
      }
    }, [refresh, service, showError, snapshot])

    const logoutService = useCallback(async () => {
      if (service === null || snapshot === null) return
      setServiceLoggingOut(true)
      try {
        const result = await service.logout({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-logout-request.v1.schema.json' as const,
          contract: 'cordisx.managed-service-logout-request/v1' as const,
          schemaVersion: 1 as const,
          requestId: requestId('svc-logout'),
          binding: service.binding,
          action: 'logout' as const,
          expectedSequence: snapshot.sequence,
          userGesture: gesture(),
        })
        if (result.status === 'accepted') {
          clearOauthPoll()
          setOauthStateValue(null)
          setPendingOAuthProvider(null)
          setPendingCancelOAuth(false)
          setPendingToggle(null)
          await refresh(service)
        } else {
          showError()
        }
      } catch {
        showError()
      } finally {
        setServiceLoggingOut(false)
      }
    }, [clearOauthPoll, refresh, service, setOauthStateValue, showError, snapshot])

    const startOAuth = useCallback(async (provider: ManagedServiceCliProxyProviderIdV1) => {
      if (service === null || accountControl === undefined || accounts === null) return
      setPendingOAuthProvider(provider)
      try {
        const result = await accountControl.startOAuth({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-start.v1.schema.json' as const,
          contract: 'cordisx.managed-service-cli-proxy-oauth-start/v1' as const,
          schemaVersion: 1 as const,
          requestId: requestId('oauth-start'),
          binding: service.binding,
          provider,
          expectedRevision: accounts.revision,
          userGesture: gesture(),
        })
        if (result.status === 'accepted') {
          window.open(result.authorizationUrl, '_blank', 'noopener,noreferrer')
          setOauthStateValue({ provider, sessionId: result.sessionId, state: 'pending' })
          pollOAuthSession(service, result.sessionId, provider)
          await refresh(service)
        } else {
          showError()
        }
      } catch {
        showError()
      } finally {
        setPendingOAuthProvider(null)
      }
    }, [accountControl, accounts, pollOAuthSession, refresh, service, setOauthStateValue, showError])

    const cancelOAuth = useCallback(async () => {
      const current = oauthStateRef.current
      if (service === null || accountControl === undefined || accounts === null || current === null) return
      setPendingCancelOAuth(true)
      try {
        const result = await accountControl.cancelOAuth({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-oauth-cancel.v1.schema.json' as const,
          contract: 'cordisx.managed-service-cli-proxy-oauth-cancel/v1' as const,
          schemaVersion: 1 as const,
          requestId: requestId('oauth-cancel'),
          binding: service.binding,
          sessionId: current.sessionId,
          expectedRevision: accounts.revision,
          userGesture: gesture(),
        })
        if (result.status === 'accepted') {
          setOauthStateValue({ ...current, state: 'cancelled' })
          clearOauthPoll()
          await refresh(service)
        } else {
          showError()
        }
      } catch {
        showError()
      } finally {
        setPendingCancelOAuth(false)
      }
    }, [accountControl, accounts, clearOauthPoll, refresh, service, setOauthStateValue, showError])

    const toggleAccount = useCallback(async (accountId: string, disabled: boolean) => {
      if (service === null || accountControl === undefined || accounts === null) return
      setPendingToggle({ accountId, disabled })
      try {
        const result = await accountControl.toggleAccount({
          $schema:
            'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-cli-proxy-account-toggle.v1.schema.json' as const,
          contract: 'cordisx.managed-service-cli-proxy-account-toggle/v1' as const,
          schemaVersion: 1 as const,
          requestId: requestId('account-toggle'),
          binding: service.binding,
          accountId,
          disabled,
          expectedRevision: accounts.revision,
          userGesture: gesture(),
        })
        if (result.status === 'accepted') {
          await refresh(service)
        } else {
          showError()
        }
      } catch {
        showError()
      } finally {
        setPendingToggle(null)
      }
    }, [accountControl, accounts, refresh, service, showError])

    const openPluginConfiguration = useCallback(async () => {
      setConfigurationOpening(true)
      setConfigurationUnavailable(false)
      const outcome = await requestOwnPluginConfiguration(manager)
      if (outcome.status === 'unavailable') setConfigurationUnavailable(true)
      if (outcome.status === 'failed') showError()
      setConfigurationOpening(false)
    }, [manager, showError])

    const configurationAction = manager === undefined
      ? undefined
      : (
        <Button
          variant='primary'
          aria-busy={configurationOpening}
          disabled={configurationOpening}
          onClick={() => void openPluginConfiguration()}
        >
          {props.t('upstream.action.open-plugin-configuration')}
        </Button>
      )

    const configurationNotice = configurationUnavailable
      ? (
        <Text tone='muted' className='cus-empty-note cus-small'>
          {props.t('upstream.status.configuration-unavailable')}
        </Text>
      )
      : null

    const accountsByProvider = useMemo(() => {
      const map = new Map<string, ManagedServiceCliProxyAccountV1[]>()
      for (const account of accounts?.accounts ?? []) {
        const list = map.get(account.provider) ?? []
        list.push(account)
        map.set(account.provider, list)
      }
      return map
    }, [accounts])

    const renderModel = (model: ManagedServiceCliProxyModelMappingV1) => (
      <li key={`${model.modelId}:${model.sourceModelId}`} className='cus-model'>
        <span className='cus-model-id'>{model.modelId}</span>
        <span className='cus-model-name'>{model.displayName}</span>
        {model.isDefault && <StatusBadge tone='info'>{props.t('upstream.status.default')}</StatusBadge>}
        {!model.enabled && <StatusBadge>{props.t('upstream.status.disabled')}</StatusBadge>}
      </li>
    )

    const renderAccountRow = (account: ManagedServiceCliProxyAccountV1) => {
      const isToggling = pendingToggle?.accountId === account.accountId
      const isOauthStarting = pendingOAuthProvider === account.provider
      const showOAuthForAccount = oauthState?.provider === account.provider
        && (account.authKind === 'oauth' || account.status === 'unavailable')
      const canLogin = accountControl !== undefined && account.authKind === 'oauth' && account.status !== 'active'
      const accountLabel = account.email ?? account.account ?? account.label
      const accountStatusLabel = account.disabled
        ? props.t('upstream.status.account-disabled')
        : account.unavailable
        ? props.t('upstream.status.account-unavailable')
        : props.t('upstream.status.account-active')

      return (
        <Card key={account.accountId} className='cus-account'>
          <div className='cus-account-header'>
            <div className='cus-account-identity'>
              <div className='cus-account-title-row'>
                <Text className='cus-account-label'>{accountLabel}</Text>
                <StatusBadge tone={authVariant(account.status)}>{accountStatusLabel}</StatusBadge>
                <StatusBadge>{authKindLabel(props.t, account.authKind)}</StatusBadge>
                {account.runtimeOnly
                  ? (
                    <StatusBadge tone='warning'>
                      {props.t('upstream.status.account-runtime-only')}
                    </StatusBadge>
                  )
                  : null}
              </div>
              <FieldList
                density='compact'
                columns={2}
                items={fields(
                  field('provider', props.t('upstream.field.provider'), account.provider),
                  field('source', props.t('upstream.field.source'), sourceLabel(props.t, account.sourceKind)),
                  field('auth-index', props.t('upstream.field.auth-type'), account.authIndex),
                  field('project', props.t('upstream.field.project'), account.projectId),
                  field('note', props.t('upstream.field.note'), account.note),
                  field('updated', props.t('upstream.field.updated'), formatDateTime(account.updatedAt)),
                  field('last-refresh', props.t('upstream.field.last-refresh'), formatDateTime(account.lastRefreshAt)),
                )}
              />
              {account.statusMessage !== undefined && account.statusMessage !== ''
                ? <Text tone='danger' className='cus-diagnostic-text cus-small'>{account.statusMessage}</Text>
                : null}
              {showOAuthForAccount
                ? (
                  <div className='cus-oauth-status'>
                    <StatusBadge tone={authVariant(oauthState.state)}>
                      {oauthStateLabel(props.t, oauthState.state)}
                    </StatusBadge>
                    {oauthState.errorMessage !== undefined
                      ? <Text tone='danger' className='cus-small'>{oauthState.errorMessage}</Text>
                      : null}
                    {(oauthState.state === 'pending' || oauthState.state === 'wait')
                      ? (
                        <Button
                          className='cus-button'
                          variant='secondary'
                          aria-busy={pendingCancelOAuth}
                          disabled={pendingCancelOAuth || accountControl === undefined}
                          onClick={() => void cancelOAuth()}
                        >
                          {props.t('upstream.action.oauth-cancel')}
                        </Button>
                      )
                      : null}
                  </div>
                )
                : null}
            </div>
            <div className='cus-account-actions'>
              {canLogin
                ? (
                  <Button
                    className='cus-button'
                    variant='secondary'
                    aria-busy={isOauthStarting}
                    disabled={isOauthStarting || isToggling || accountControl === undefined}
                    onClick={() => void startOAuth(account.provider)}
                  >
                    <Icon name='account' />
                    {props.t('upstream.action.oauth-start', { provider: account.provider })}
                  </Button>
                )
                : null}
              <Button
                className='cus-button'
                variant={account.disabled ? 'primary' : 'secondary'}
                aria-busy={isToggling}
                disabled={isToggling || accountControl === undefined || account.unavailable}
                onClick={() => void toggleAccount(account.accountId, !account.disabled)}
              >
                {account.disabled ? props.t('upstream.action.enable') : props.t('upstream.action.disable')}
              </Button>
            </div>
          </div>
          {account.models !== undefined && account.models.length > 0
            ? (
              <ul className='cus-models'>
                {account.models.map(model => (
                  <li key={model.id} className='cus-model'>
                    <span className='cus-model-id'>{model.id}</span>
                    <span className='cus-model-name'>{model.displayName ?? model.id}</span>
                    {model.ownedBy !== undefined
                      ? <StatusBadge>{model.ownedBy}</StatusBadge>
                      : null}
                  </li>
                ))}
              </ul>
            )
            : null}
        </Card>
      )
    }

    const renderAccountSubscriptions = () => {
      if (service === null) {
        return (
          <section className='cus-section'>
            {groupHeader(props.t('upstream.group.account-subscriptions'))}
            <EmptyState title={props.t('upstream.status.service-unavailable')} action={configurationAction} />
            {configurationNotice}
          </section>
        )
      }
      if (accountControl === undefined) {
        return (
          <section className='cus-section'>
            {groupHeader(props.t('upstream.group.account-subscriptions'))}
            <EmptyState title={props.t('upstream.status.account-controls-unavailable')} action={configurationAction} />
            {configurationNotice}
          </section>
        )
      }
      if (accounts === null) {
        return (
          <section className='cus-section'>
            {groupHeader(props.t('upstream.group.account-subscriptions'))}
            <EmptyState
              title={accountAvailability === 'loading'
                ? props.t('state.loading')
                : props.t('upstream.status.account-controls-unavailable')}
              action={accountAvailability === 'loading' ? undefined : configurationAction}
            />
            {accountAvailability === 'loading' ? null : configurationNotice}
          </section>
        )
      }
      if (accounts.accounts.length === 0) {
        return (
          <section className='cus-section'>
            {groupHeader(props.t('upstream.group.account-subscriptions'))}
            <EmptyState
              title={props.t('upstream.status.no-accounts')}
              description={props.t('upstream.status.no-accounts-description')}
              action={configurationAction}
            />
            {configurationNotice}
          </section>
        )
      }

      const providers = [...accountsByProvider.keys()].sort()
      return (
        <section className='cus-section'>
          {groupHeader(props.t('upstream.group.account-subscriptions'))}
          <div className='cus-stack'>
            {providers.map(provider => (
              <section key={provider} className='cus-subsection'>
                <div className='cus-subsection-header'>
                  <Heading level={3}>{provider}</Heading>
                  <StatusBadge>
                    {props.t('upstream.status.account-count', { count: accountsByProvider.get(provider)?.length ?? 0 })}
                  </StatusBadge>
                </div>
                <div className='cus-stack'>
                  {(accountsByProvider.get(provider) ?? []).map(renderAccountRow)}
                </div>
              </section>
            ))}
          </div>
        </section>
      )
    }

    const renderProvider = (provider: ManagedServiceCliProxyProviderV1) => {
      const linkedAccounts = accountsByProvider.get(provider.id) ?? []
      return (
        <Card key={provider.id} className='cus-provider'>
          <div className='cus-subsection-header'>
            <div className='cus-subsection-title'>
              <Heading level={3}>{provider.displayName}</Heading>
              <Text tone='muted' className='cus-small'>{provider.id}</Text>
            </div>
            <div className='cus-badges'>
              <StatusBadge tone={provider.enabled ? 'info' : 'neutral'}>
                {provider.enabled ? props.t('upstream.status.enabled') : props.t('upstream.status.disabled')}
              </StatusBadge>
              <StatusBadge tone={healthVariant(provider.health)}>
                {props.t('upstream.status.health', { health: stateLabel(props.t, provider.health) })}
              </StatusBadge>
              <StatusBadge tone={authVariant(provider.auth)}>
                {props.t('upstream.status.auth-state', { state: stateLabel(props.t, provider.auth) })}
              </StatusBadge>
            </div>
          </div>
          <FieldList
            density='compact'
            columns={2}
            items={fields(
              field('endpoint', props.t('upstream.field.endpoint'), provider.endpoint.origin),
              field(
                'credential',
                props.t('upstream.field.credential'),
                provider.endpoint.secretConfigured
                  ? props.t('upstream.status.secret-configured')
                  : props.t('upstream.status.secret-missing'),
              ),
              field('models', props.t('upstream.field.models'), provider.models.mappings.length),
              field('accounts', props.t('upstream.field.account'), linkedAccounts.length),
            )}
          />
          {provider.lastError !== undefined
            ? (
              <Text tone='danger' className='cus-diagnostic-text cus-small'>
                [{provider.lastError.code}] {provider.lastError.message}
              </Text>
            )
            : null}
          {provider.models.mappings.length > 0
            ? (
              <ul className='cus-models'>
                {provider.models.mappings.map(renderModel)}
              </ul>
            )
            : null}
        </Card>
      )
    }

    const renderCordisXUpstreams = () => (
      <section className='cus-section'>
        {groupHeader(props.t('upstream.group.cordisx-upstreams'))}
        {catalog === null
          ? <EmptyState title={props.t('upstream.status.no-catalog')} />
          : catalog.providers.length === 0
          ? (
            <EmptyState
              title={props.t('upstream.status.no-upstreams')}
              description={props.t('upstream.status.no-upstreams-description')}
            />
          )
          : (
            <div className='cus-stack'>
              {catalog.providers.map(renderProvider)}
            </div>
          )}
      </section>
    )

    const renderRuntimeStatus = () => {
      if (snapshot === null) return null
      return (
        <section className='cus-section'>
          {groupHeader(props.t('upstream.group.runtime-status'))}
          <div className='cus-subsection'>
            <div className='cus-inline-status'>
              <Text tone='muted' className='cus-small'>
                {props.t('upstream.status.service-auth', { state: stateLabel(props.t, snapshot.auth.state) })}
              </Text>
              {snapshot.auth.providerLabel !== undefined
                ? <StatusBadge>{snapshot.auth.providerLabel}</StatusBadge>
                : null}
              {snapshot.capabilities.explicitLogin && snapshot.userAction.available
                ? (
                  <Button
                    className='cus-button'
                    variant='secondary'
                    aria-busy={serviceLoggingIn}
                    disabled={serviceLoggingIn}
                    onClick={() => void loginService()}
                  >
                    <Icon name='account' />
                    {props.t('upstream.action.login-service')}
                  </Button>
                )
                : null}
              {snapshot.capabilities.logout && snapshot.auth.state !== 'logged-out'
                ? (
                  <Button
                    className='cus-button'
                    variant='secondary'
                    aria-busy={serviceLoggingOut}
                    disabled={serviceLoggingOut || serviceLoggingIn}
                    onClick={() => void logoutService()}
                  >
                    <Icon name='logout' />
                    {props.t('upstream.action.logout-service')}
                  </Button>
                )
                : null}
            </div>
            <div className='cus-subsection-header'>
              <div className='cus-subsection-title'>
                <Heading level={3}>{snapshot.displayName}</Heading>
                <Text tone='muted' className='cus-small'>{snapshot.serviceKind}</Text>
              </div>
              <div className='cus-badges'>
                <StatusBadge tone={readinessVariant(snapshot.readiness)}>
                  {props.t('upstream.status.readiness', { readiness: stateLabel(props.t, snapshot.readiness) })}
                </StatusBadge>
                <StatusBadge tone={healthVariant(snapshot.health.level)}>
                  {props.t('upstream.status.health', { health: stateLabel(props.t, snapshot.health.level) })}
                </StatusBadge>
              </div>
            </div>
            <Disclosure
              summary={props.t('upstream.field.technical-details')}
              tone={snapshot.diagnostics.length > 0 ? 'warning' : 'neutral'}
            >
              <FieldList
                density='compact'
                columns={2}
                items={fields(
                  field('runtime-revision', props.t('upstream.field.revision'), snapshot.revision ?? '—'),
                  field('generation', props.t('upstream.field.generation'), snapshot.serviceGeneration ?? '—'),
                  field('sequence', props.t('upstream.field.sequence'), snapshot.sequence),
                  field('accounts-revision', props.t('upstream.group.account-subscriptions'), accounts?.revision),
                  field('catalog-revision', props.t('upstream.group.cordisx-upstreams'), catalog?.revision),
                )}
              />
              {snapshot.diagnostics.length > 0
                ? (
                  <div className='cus-diagnostic-list'>
                    {snapshot.diagnostics.map((diagnostic, index) => (
                      <Text key={`${diagnostic.code}-${index}`} tone='danger' className='cus-diagnostic-text cus-small'>
                        [{diagnostic.code}] {diagnostic.message}
                      </Text>
                    ))}
                  </div>
                )
                : null}
            </Disclosure>
          </div>
        </section>
      )
    }

    const renderBody = () => {
      if (loading && snapshot === null) return <EmptyState title={props.t('state.loading')} />
      if (!loading && service === null) {
        return (
          <EmptyState
            title={props.t('upstream.status.service-unavailable')}
            action={configurationAction}
          />
        )
      }
      return (
        <div className='cus-layout'>
          <Stack direction='row' wrap align='center' justify='flex-end'>
            <Button
              variant='secondary'
              className='cus-button'
              disabled={loading || service === null}
              onClick={() => void refresh(service)}
            >
              <Icon name='refresh' />
              {props.t('upstream.action.refresh')}
            </Button>
          </Stack>
          {renderAccountSubscriptions()}
          {renderCordisXUpstreams()}
          {renderRuntimeStatus()}
        </div>
      )
    }

    return (
      <div className='cus' data-cordisx-upstream-manager='true'>
        {renderBody()}
      </div>
    )
  }
}
