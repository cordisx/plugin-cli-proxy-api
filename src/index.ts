import type { Context, Fiber } from '@deepseek-ai/cordis'
import type { BrandIconV1 } from '@cordisx/protocol/brand-icon/v1'
import type { ModelProviderContributionV1 } from '@cordisx/protocol/model-providers/v1'
import Schema from '@deepseek-ai/schemastery'
import { defineReactPage } from 'cordisx/react'
import {
  CORDISX_MANAGER_CONTENT_NAVIGATION_SCHEMA_V1,
  CORDISX_PAGE_SCHEMA_V3,
  CORDISX_PLUGIN_MANIFEST_SCHEMA_V1,
  CORDISX_ROUTE_SCHEMA_V2,
  CORDISX_SURFACE_CONTRIBUTION_SCHEMA_V11,
  type CordisXLocalizedText,
  type CordisXMessageParams,
  type CordisXPageMetadataV3,
  type CordisXPluginManifestV1,
  type CordisXPluginPresentation,
  type CordisXRouteDefinitionV2,
} from 'cordisx/contracts'
import '@cordisx/protocol/managed-service-ui/v1'
import { createUpstreamSubscriptionManagerPage } from './upstream-subscription-manager-page.js'
import { CLI_PROXY_ICON } from './icon.js'

export const name = 'cli-proxy-api'
export const inject = [
  'i18n',
  'slots',
  'pages',
  'routes',
  'managerContent',
  'platform',
  'modelProviders',
  'notifications',
]
export const icon = CLI_PROXY_ICON
const CLI_PROXY_MODEL_PROVIDER_ICON = {
  kind: 'raster-image',
  image: {
    $schema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/raster-image-snapshot.v1.schema.json',
    contract: 'cordisx.raster-image-snapshot/v1',
    schemaVersion: 1,
    mediaType: 'image/png',
    encoding: 'base64',
    data: CLI_PROXY_ICON.data,
    width: 256,
    height: 210,
  },
} as const satisfies BrandIconV1

const capabilities = [
  'models.read',
  'tasks.catalog.read',
  'tasks.content.read',
  'tasks.create',
  'tasks.control',
  'turns.submit',
  'turns.control',
] as const

export const manifest = {
  $schema: CORDISX_PLUGIN_MANIFEST_SCHEMA_V1,
  schemaVersion: 1,
  id: 'cli-proxy-api',
  name: 'CLIProxy Providers',
  capabilities: capabilities.map(capability => ({
    name: capability,
    required: false,
    reason: {
      namespace: 'cli-proxy-api',
      key: `permission.${capability}`,
      fallback: `Use ${capability} for explicitly configured external providers`,
    },
    scope: {},
  })),
} satisfies CordisXPluginManifestV1

interface Messages {
  'plugin.name': undefined
  'plugin.description': undefined
  'field.provider': undefined
  'field.model': undefined
  'field.cwd': undefined
  'field.initial-message': undefined
  'field.search': undefined
  'action.refresh': undefined
  'action.create': undefined
  'action.load-more': undefined
  'action.continue': undefined
  'action.fork': undefined
  'action.archive': undefined
  'action.restore': undefined
  'action.delete': undefined
  'action.send': undefined
  'action.steer': undefined
  'action.interrupt': undefined
  'state.loading': undefined
  'state.empty': undefined
  'state.no-models': undefined
  'state.select-session': undefined
  'state.error': { readonly message: string }
  'session.provider': { readonly provider: string }
  'session.model': { readonly model: string }
  'permission.models.read': undefined
  'permission.tasks.catalog.read': undefined
  'upstream.route.title': undefined
  'upstream.route.description': undefined
  'upstream.page.title': undefined
  'upstream.page.description': undefined
  'upstream.group.account-subscriptions': undefined
  'upstream.group.cordisx-upstreams': undefined
  'upstream.group.runtime-status': undefined
  'upstream.status.readiness': { readonly readiness: string }
  'upstream.status.health': { readonly health: string }
  'upstream.status.auth-state': { readonly state: string }
  'upstream.status.model-count': { readonly count: number }
  'upstream.status.endpoint-origin': { readonly origin: string }
  'upstream.status.secret-configured': undefined
  'upstream.status.secret-missing': undefined
  'upstream.status.enabled': undefined
  'upstream.status.disabled': undefined
  'upstream.status.default': undefined
  'upstream.status.no-catalog': undefined
  'upstream.status.no-upstreams': undefined
  'upstream.status.service-unavailable': undefined
  'upstream.status.account-active': undefined
  'upstream.status.account-disabled': undefined
  'upstream.status.account-unavailable': undefined
  'upstream.status.account-runtime-only': undefined
  'upstream.status.account-source-file': undefined
  'upstream.status.account-source-memory': undefined
  'upstream.status.account-source-plugin': undefined
  'upstream.status.auth-oauth': undefined
  'upstream.status.auth-api-key': undefined
  'upstream.status.auth-file': undefined
  'upstream.status.auth-plugin-virtual': undefined
  'upstream.status.auth-unknown': undefined
  'upstream.status.oauth-pending': undefined
  'upstream.status.oauth-completed': undefined
  'upstream.status.oauth-cancelled': undefined
  'upstream.status.oauth-error': undefined
  'upstream.status.oauth-unknown': undefined
  'upstream.status.account-controls-unavailable': undefined
  'upstream.status.account-count': { readonly count: number }
  'upstream.status.no-accounts': undefined
  'upstream.status.service-auth': { readonly state: string }
  'upstream.status.ready': undefined
  'upstream.status.degraded': undefined
  'upstream.status.failed': undefined
  'upstream.status.stopped': undefined
  'upstream.status.healthy': undefined
  'upstream.status.warning': undefined
  'upstream.status.critical': undefined
  'upstream.status.missing': undefined
  'upstream.status.authenticating': undefined
  'upstream.status.authenticated': undefined
  'upstream.status.expired': undefined
  'upstream.status.logged-out': undefined
  'upstream.status.unknown': undefined
  'upstream.status.no-accounts-description': undefined
  'upstream.status.no-upstreams-description': undefined
  'upstream.status.configuration-unavailable': undefined
  'upstream.field.revision': undefined
  'upstream.field.generation': undefined
  'upstream.field.sequence': undefined
  'upstream.field.provider': undefined
  'upstream.field.source': undefined
  'upstream.field.auth-type': undefined
  'upstream.field.account': undefined
  'upstream.field.project': undefined
  'upstream.field.note': undefined
  'upstream.field.updated': undefined
  'upstream.field.last-refresh': undefined
  'upstream.field.technical-details': undefined
  'upstream.field.endpoint': undefined
  'upstream.field.credential': undefined
  'upstream.field.models': undefined
  'upstream.action.refresh': undefined
  'upstream.action.open-plugin-configuration': undefined
  'upstream.action.login-service': undefined
  'upstream.action.logout-service': undefined
  'upstream.state.operation-error': undefined
  'upstream.action.oauth-start': { readonly provider: string }
  'upstream.action.oauth-cancel': undefined
  'upstream.action.enable': undefined
  'upstream.action.disable': undefined
  'permission.tasks.content.read': undefined
  'permission.tasks.create': undefined
  'permission.tasks.control': undefined
  'permission.turns.submit': undefined
  'permission.turns.control': undefined
}

export interface Config {
  readonly providerIds: readonly string[]
  readonly defaultCwd: string
}

export const Config = Schema.object({
  providerIds: Schema.array(
    Schema.string().required().pattern(/^[a-z0-9][a-z0-9._-]{0,95}$/),
  ).default([]).max(64)
    .extra('extra', { label: { 'zh-CN': 'Provider 过滤范围', en: 'Provider filter' } })
    .extra('description', {
      'zh-CN': '选择要显示的 Provider；留空表示全部。',
      en: 'Choose the providers to show; leave empty for all.',
    }),
  defaultCwd: Schema.string().default('').max(4096).pattern(/^[^\u0000]*$/)
    .extra('extra', { label: { 'zh-CN': '默认工作目录', en: 'Default working directory' } })
    .extra('description', {
      'zh-CN': '新会话的默认工作目录。',
      en: 'Default working directory for new sessions.',
    }),
})

export const configApplies = 'plugin-restart'

function configuredProviderIds(config: Config): readonly string[] | undefined {
  const providerIds = [...new Set(config.providerIds)]
  return providerIds.length === 0 ? undefined : providerIds
}

function message<Key extends keyof Messages>(
  key: Key,
  ...args: Messages[Key] extends CordisXMessageParams ? [params: Messages[Key]] : [params?: undefined]
): CordisXLocalizedText {
  return { namespace: 'cli-proxy-api', key, ...(args[0] === undefined ? {} : { params: args[0] }) }
}

export const presentation = {
  name: message('plugin.name'),
  description: message('plugin.description'),
} satisfies CordisXPluginPresentation

const upstreamSubscriptionPage = {
  $schema: CORDISX_PAGE_SCHEMA_V3,
  schemaVersion: 3,
  id: 'providers.upstream-subscriptions',
  title: message('upstream.page.title'),
  description: message('upstream.page.description'),
  icon: 'host:key',
  chrome: 'standard',
} satisfies CordisXPageMetadataV3

const upstreamSubscriptionRoute = {
  $schema: CORDISX_ROUTE_SCHEMA_V2,
  schemaVersion: 2,
  id: 'providers.upstream-subscriptions',
  path: '/manager/extensions/cli-proxy-api/subscriptions',
  outlet: 'manager.content',
  page: 'providers.upstream-subscriptions',
  title: message('upstream.route.title'),
  description: message('upstream.route.description'),
} satisfies CordisXRouteDefinitionV2<'manager.content'>

function optionalManagedServices(ctx: Context): Context['managedServices'] | undefined {
  const candidate = ctx as unknown as Record<string, unknown>
  const reflect = candidate.reflect as { get(name: string): unknown } | undefined
  const service = reflect === undefined ? candidate.managedServices : reflect.get('managedServices')
  return service !== null && typeof service === 'object' && typeof Reflect.get(service, 'get') === 'function'
    ? service as Context['managedServices']
    : undefined
}

function optionalManager(ctx: Context): Context['manager'] | undefined {
  const service = ctx.reflect.get('manager')
  return service !== null
      && typeof service === 'object'
      && typeof Reflect.get(service, 'openOwnPluginConfiguration') === 'function'
    ? service as Context['manager']
    : undefined
}

export function apply(ctx: Context & Pick<Fiber, 'effect'>, config: Config = Config({})): void {
  const managedServices = optionalManagedServices(ctx)
  ctx.effect(() => {
    let settingsEntry: ModelProviderContributionV1 | undefined
    let syncingSettingsEntry = false
    const syncSettingsEntry = (): void => {
      if (syncingSettingsEntry) return
      syncingSettingsEntry = true
      try {
        const available = ctx.modelProviders.list().some(provider => provider.providerId === 'cli-proxy-api')
        if (available) {
          settingsEntry?.dispose()
          settingsEntry = undefined
        } else if (settingsEntry === undefined) {
          settingsEntry = ctx.modelProviders.insert({
            id: 'settings',
            label: 'CLIProxyAPI',
            icon: CLI_PROXY_MODEL_PROVIDER_ICON,
            action: {
              label: 'Open settings',
              icon: 'host:settings',
              run: async signal => {
                if (!signal.aborted) await ctx.routes.navigate({ id: 'providers.upstream-subscriptions' })
              },
            },
          })
        }
      } finally {
        syncingSettingsEntry = false
      }
    }
    const presentation = ctx.modelProviders.present({
      providerId: 'cli-proxy-api',
      title: 'CLIProxyAPI',
      icon: CLI_PROXY_MODEL_PROVIDER_ICON,
    })
    const unsubscribe = ctx.modelProviders.subscribe(syncSettingsEntry)
    syncSettingsEntry()
    void ctx.modelProviders.refresh().then(syncSettingsEntry).catch(() => undefined)
    return () => {
      unsubscribe()
      settingsEntry?.dispose()
      presentation.dispose()
    }
  }, 'CLIProxyAPI model provider presentation')

  ctx.i18n.define<Messages>({
    namespace: 'cli-proxy-api',
    locale: 'en',
    default: true,
    messages: {
      'plugin.name': 'CLIProxy Providers',
      'plugin.description': 'Manage configured CLIProxy providers, models, and sessions.',
      'field.provider': 'Provider',
      'field.model': 'Model',
      'field.cwd': 'Working directory',
      'field.search': 'Search sessions',
      'field.initial-message': 'Initial message (recommended for persistence)',
      'action.refresh': 'Refresh',
      'action.create': 'New session',
      'action.load-more': 'Load more',
      'action.continue': 'Continue',
      'action.fork': 'Fork',
      'action.archive': 'Archive',
      'action.restore': 'Restore',
      'action.delete': 'Delete',
      'action.send': 'Send message',
      'action.steer': 'Steer active turn',
      'action.interrupt': 'Interrupt',
      'state.loading': 'Loading providers…',
      'state.empty': 'No matching sessions.',
      'state.no-models': 'No provider models are available.',
      'state.select-session': 'Select a provider session to inspect its content.',
      'state.error': 'Provider request failed: {message}',
      'session.provider': 'Provider {provider}',
      'session.model': 'Model {model}',
      'permission.models.read': 'List models from configured external providers',
      'permission.tasks.catalog.read': 'List and search external provider sessions',
      'upstream.route.title': 'CLIProxyAPI subscriptions',
      'upstream.route.description': 'Manage CLIProxyAPI account subscriptions, CordisX upstreams, and runtime status.',
      'upstream.page.title': 'CLIProxyAPI subscriptions',
      'upstream.page.description': 'View account subscriptions, CordisX upstream providers, and runtime status.',
      'upstream.group.account-subscriptions': 'Account Subscriptions',
      'upstream.group.cordisx-upstreams': 'CordisX Upstreams',
      'upstream.group.runtime-status': 'Runtime Status',
      'upstream.status.readiness': '{readiness}',
      'upstream.status.health': '{health}',
      'upstream.status.auth-state': '{state}',
      'upstream.status.model-count': '{count} models',
      'upstream.status.endpoint-origin': '{origin}',
      'upstream.status.secret-configured': 'Secret configured',
      'upstream.status.secret-missing': 'No secret',
      'upstream.status.enabled': 'Enabled',
      'upstream.status.disabled': 'Disabled',
      'upstream.status.default': 'Default',
      'upstream.status.no-catalog': 'Upstream catalog is not available.',
      'upstream.status.no-upstreams': 'No upstream providers are registered.',
      'upstream.status.service-unavailable': 'Managed service is not available.',
      'upstream.status.account-active': 'Active',
      'upstream.status.account-disabled': 'Disabled',
      'upstream.status.account-unavailable': 'Unavailable',
      'upstream.status.account-runtime-only': 'Runtime only',
      'upstream.status.account-source-file': 'File',
      'upstream.status.account-source-memory': 'Memory',
      'upstream.status.account-source-plugin': 'Plugin',
      'upstream.status.auth-oauth': 'OAuth',
      'upstream.status.auth-api-key': 'API key',
      'upstream.status.auth-file': 'File credential',
      'upstream.status.auth-plugin-virtual': 'Plugin virtual',
      'upstream.status.auth-unknown': 'Unknown auth',
      'upstream.status.oauth-pending': 'OAuth pending',
      'upstream.status.oauth-completed': 'OAuth completed',
      'upstream.status.oauth-cancelled': 'OAuth cancelled',
      'upstream.status.oauth-error': 'OAuth error',
      'upstream.status.oauth-unknown': 'OAuth unknown',
      'upstream.status.account-controls-unavailable': 'Account controls are not available.',
      'upstream.status.account-count': '{count} accounts',
      'upstream.status.no-accounts': 'No CLIProxyAPI accounts are configured.',
      'upstream.status.service-auth': 'Service auth: {state}',
      'upstream.status.ready': 'Ready',
      'upstream.status.degraded': 'Needs attention',
      'upstream.status.failed': 'Failed',
      'upstream.status.stopped': 'Stopped',
      'upstream.status.healthy': 'Healthy',
      'upstream.status.warning': 'Warning',
      'upstream.status.critical': 'Critical',
      'upstream.status.missing': 'Not signed in',
      'upstream.status.authenticating': 'Signing in',
      'upstream.status.authenticated': 'Signed in',
      'upstream.status.expired': 'Expired',
      'upstream.status.logged-out': 'Signed out',
      'upstream.status.unknown': 'Unknown',
      'upstream.status.no-accounts-description':
        'This version can manage accounts reported by CLIProxyAPI, but cannot add or import accounts. Configure accounts outside CordisX, then refresh this page.',
      'upstream.status.no-upstreams-description':
        'CordisX upstreams appear after CLIProxyAPI configuration is available to the managed service.',
      'upstream.status.configuration-unavailable':
        'Plugin configuration is unavailable in this Host. Account creation and import are not available here.',
      'upstream.field.sequence': 'Sequence',
      'upstream.field.provider': 'Provider',
      'upstream.field.source': 'Source',
      'upstream.field.auth-type': 'Auth index',
      'upstream.field.account': 'Accounts',
      'upstream.field.project': 'Project',
      'upstream.field.note': 'Note',
      'upstream.field.updated': 'Updated',
      'upstream.field.last-refresh': 'Last refresh',
      'upstream.field.technical-details': 'Technical details',
      'upstream.field.endpoint': 'Endpoint',
      'upstream.field.credential': 'Credential',
      'upstream.field.models': 'Models',
      'upstream.action.login-service': 'Refresh service login',
      'upstream.action.logout-service': 'Sign out',
      'upstream.state.operation-error': 'External account operation failed. Please try again.',
      'upstream.action.oauth-start': 'Sign in to {provider}',
      'upstream.action.oauth-cancel': 'Cancel OAuth',
      'upstream.action.enable': 'Enable',
      'upstream.action.disable': 'Disable',
      'upstream.field.revision': 'Revision',
      'upstream.field.generation': 'Generation',
      'upstream.action.refresh': 'Refresh',
      'upstream.action.open-plugin-configuration': 'Open plugin configuration',
      'permission.tasks.content.read': 'Read selected external provider session content',
      'permission.tasks.create': 'Create a session for the selected provider model',
      'permission.tasks.control': 'Continue, fork, archive, restore, or delete selected sessions',
      'permission.turns.submit': 'Send messages to selected sessions',
      'permission.turns.control': 'Steer or interrupt selected turns',
    },
  })
  ctx.i18n.define<Messages>({
    namespace: 'cli-proxy-api',
    locale: 'zh-CN',
    messages: {
      'plugin.name': 'CLIProxy 提供方',
      'plugin.description': '管理已配置的 CLIProxy 提供方、模型和会话。',
      'field.provider': 'Provider',
      'field.model': '模型',
      'field.cwd': '工作目录',
      'field.search': '搜索会话',
      'field.initial-message': '首条消息（建议填写以立即持久化）',
      'action.refresh': '刷新',
      'action.create': '新建会话',
      'action.load-more': '加载更多',
      'action.continue': '继续',
      'action.fork': '分叉',
      'action.archive': '归档',
      'action.restore': '恢复',
      'action.delete': '删除',
      'action.send': '发送消息',
      'action.steer': '引导进行中的 turn',
      'action.interrupt': '中断',
      'state.loading': '正在加载 Provider…',
      'state.empty': '没有匹配的会话。',
      'state.no-models': '没有可用的 Provider 模型。',
      'state.select-session': '选择一个 Provider 会话以查看内容。',
      'state.error': 'Provider 请求失败：{message}',
      'session.provider': 'Provider {provider}',
      'session.model': '模型 {model}',
      'permission.models.read': '读取已配置外部 Provider 的模型',
      'permission.tasks.catalog.read': '列出并搜索外部 Provider 会话',
      'upstream.route.title': 'CLIProxyAPI 订阅管理',
      'upstream.route.description': '管理 CLIProxyAPI 账户订阅、CordisX 上游和运行状态。',
      'upstream.page.title': 'CLIProxyAPI 订阅管理',
      'upstream.page.description': '查看账户订阅、CordisX 上游提供方和运行状态。',
      'upstream.group.account-subscriptions': '账号订阅',
      'upstream.group.cordisx-upstreams': 'CordisX 上游',
      'upstream.group.runtime-status': '运行状态',
      'upstream.status.readiness': '{readiness}',
      'upstream.status.health': '{health}',
      'upstream.status.auth-state': '{state}',
      'upstream.status.model-count': '{count} 个模型',
      'upstream.status.endpoint-origin': '{origin}',
      'upstream.status.secret-configured': '已配置密钥',
      'upstream.status.secret-missing': '未配置密钥',
      'upstream.status.enabled': '已启用',
      'upstream.status.disabled': '已禁用',
      'upstream.status.default': '默认',
      'upstream.status.no-catalog': '上游目录不可用。',
      'upstream.status.no-upstreams': '没有已注册的上游提供方。',
      'upstream.status.service-unavailable': '托管服务不可用。',
      'upstream.status.account-active': '可用',
      'upstream.status.account-disabled': '已禁用',
      'upstream.status.account-unavailable': '不可用',
      'upstream.status.account-runtime-only': '仅运行时',
      'upstream.status.account-source-file': '文件',
      'upstream.status.account-source-memory': '内存',
      'upstream.status.account-source-plugin': '插件',
      'upstream.status.auth-oauth': 'OAuth',
      'upstream.status.auth-api-key': 'API Key',
      'upstream.status.auth-file': '文件凭据',
      'upstream.status.auth-plugin-virtual': '插件虚拟账号',
      'upstream.status.auth-unknown': '未知认证',
      'upstream.status.oauth-pending': 'OAuth 进行中',
      'upstream.status.oauth-completed': 'OAuth 已完成',
      'upstream.status.oauth-cancelled': 'OAuth 已取消',
      'upstream.status.oauth-error': 'OAuth 失败',
      'upstream.status.oauth-unknown': 'OAuth 状态未知',
      'upstream.status.account-controls-unavailable': '账号控制暂不可用。',
      'upstream.status.account-count': '{count} 个账号',
      'upstream.status.no-accounts': '还没有配置 CLIProxyAPI 账号。',
      'upstream.status.service-auth': '服务认证：{state}',
      'upstream.status.ready': '已就绪',
      'upstream.status.degraded': '需要处理',
      'upstream.status.failed': '失败',
      'upstream.status.stopped': '已停止',
      'upstream.status.healthy': '正常',
      'upstream.status.warning': '警告',
      'upstream.status.critical': '严重',
      'upstream.status.missing': '未登录',
      'upstream.status.authenticating': '登录中',
      'upstream.status.authenticated': '已登录',
      'upstream.status.expired': '已过期',
      'upstream.status.logged-out': '已退出',
      'upstream.status.unknown': '未知',
      'upstream.status.no-accounts-description':
        '当前版本只能管理 CLIProxyAPI 已上报的账号，不能新增或导入账号。请在 CordisX 外完成账号配置后刷新此页。',
      'upstream.status.no-upstreams-description': '托管服务读取到 CLIProxyAPI 配置后，CordisX 上游会显示在这里。',
      'upstream.status.configuration-unavailable': '当前 Host 无法打开插件配置；此处也不支持新增或导入账号。',
      'upstream.field.sequence': '序列号',
      'upstream.field.provider': '提供方',
      'upstream.field.source': '来源',
      'upstream.field.auth-type': '认证索引',
      'upstream.field.account': '账号数',
      'upstream.field.project': '项目',
      'upstream.field.note': '备注',
      'upstream.field.updated': '更新时间',
      'upstream.field.last-refresh': '最近刷新',
      'upstream.field.technical-details': '技术详情',
      'upstream.field.endpoint': '端点',
      'upstream.field.credential': '凭据',
      'upstream.field.models': '模型数',
      'upstream.action.login-service': '刷新服务登录',
      'upstream.action.logout-service': '退出登录',
      'upstream.state.operation-error': '外部账号操作失败，请重试。',
      'upstream.action.oauth-start': '登录 {provider}',
      'upstream.action.oauth-cancel': '取消 OAuth',
      'upstream.action.enable': '启用',
      'upstream.action.disable': '禁用',
      'upstream.field.revision': '版本',
      'upstream.field.generation': '代际',
      'upstream.action.refresh': '刷新',
      'upstream.action.open-plugin-configuration': '打开插件配置',
      'permission.tasks.content.read': '读取所选外部 Provider 会话内容',
      'permission.tasks.create': '用所选 Provider 模型创建会话',
      'permission.tasks.control': '继续、分叉、归档、恢复或删除所选会话',
      'permission.turns.submit': '向所选会话发送消息',
      'permission.turns.control': '引导或中断所选 turn',
    },
  })
  ctx.pages.register<Messages>(
    upstreamSubscriptionPage,
    defineReactPage<Messages>(
      createUpstreamSubscriptionManagerPage(managedServices, optionalManager(ctx), ctx.notifications),
    ),
  )
  ctx.routes.register(upstreamSubscriptionRoute)
  ctx.managerContent.register({
    $schema: CORDISX_MANAGER_CONTENT_NAVIGATION_SCHEMA_V1,
    schemaVersion: 1,
    id: 'upstream-subscriptions',
    route: { id: 'providers.upstream-subscriptions' },
    header: { title: { kind: 'route' } },
  })
  ctx.slots.register({
    $schema: CORDISX_SURFACE_CONTRIBUTION_SCHEMA_V11,
    schemaVersion: 11,
    name: 'manager.settings.navigation-items',
    id: 'upstream-subscriptions',
    group: 'after-settings',
    order: 120,
  }, {
    route: { id: 'providers.upstream-subscriptions' },
    navigationGroup: { id: 'external-accounts' },
  })
}
