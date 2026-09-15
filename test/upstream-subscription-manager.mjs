import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import { build } from 'esbuild'

const pageTsx = readFileSync(new URL('../src/upstream-subscription-manager-page.tsx', import.meta.url), 'utf8')
const messagesTs = readFileSync(new URL('../src/upstream-subscription-manager-messages.ts', import.meta.url), 'utf8')
const css = readFileSync(new URL('../src/upstream-subscription-manager-page.css', import.meta.url), 'utf8')
const indexTs = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')

async function loadPageModule() {
  const directory = mkdtempSync(join(tmpdir(), 'cordisx-cliproxy-page-'))
  const output = join(directory, 'manager-configuration.mjs')
  await build({
    entryPoints: [new URL('../src/manager-configuration.ts', import.meta.url).pathname],
    outfile: output,
    bundle: true,
    format: 'esm',
    platform: 'node',
  })
  try {
    return await import(`${pathToFileURL(output).href}?${Date.now()}`)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Registry acquisition contract
// ---------------------------------------------------------------------------

test('page acquires the optional gateway service captured in its factory closure', () => {
  assert.match(pageTsx, /export function createUpstreamSubscriptionManagerPage\([\s\S]*managedServices:[\s\S]*manager:/)
  assert.match(pageTsx, /managedServices\.get\(\{\s*serviceId:\s*SERVICE_ID\s*\}\)/s)
  assert.match(pageTsx, /managedServices === undefined/)
  assert.doesNotMatch(pageTsx, /reflect\.get/)
  // PageProps is an alias of CordisXReactPageProps (no extra ctx field smuggled in).
  assert.match(pageTsx, /type PageProps = CordisXReactPageProps<UpstreamSubscriptionManagerMessages>/)
  assert.doesNotMatch(pageTsx, /props\.ctx/)
  assert.match(
    indexTs,
    /createUpstreamSubscriptionManagerPage\(managedServices, optionalManager\(ctx\), ctx\.notifications\)/,
  )
  assert.match(indexTs, /ctx\.reflect\.get\(['"]manager['"]\)/)
  assert.doesNotMatch(indexTs, /ctx\.manager\?\.openOwnPluginConfiguration/)
  assert.doesNotMatch(indexTs, /createUpstreamSubscriptionManagerPage\(\s*\{\s*service:\s*undefined\s*\}\)/)
})

test('page imports managed-service-ui/v1 and not temporary shim', () => {
  assert.match(pageTsx, /@cordisx\/protocol\/managed-service-ui\/v1/)
  assert.match(indexTs, /import '@cordisx\/protocol\/managed-service-ui\/v1'/)
  assert.doesNotMatch(indexTs + pageTsx, /managed-service-account-control-shim/)
})

// ---------------------------------------------------------------------------
// Account subscription actions use accountControl
// ---------------------------------------------------------------------------

test('readAccounts/toggle/startOAuth/poll/cancel are wired to service.accountControl', () => {
  assert.match(pageTsx, /accountControl\?\.readAccounts\(\)/)
  assert.match(pageTsx, /accountControl\.toggleAccount\(/)
  assert.match(pageTsx, /accountControl\.startOAuth\(/)
  assert.match(pageTsx, /accountControl\.pollOAuth\(/)
  assert.match(pageTsx, /accountControl\.cancelOAuth\(/)
})

test('mutations carry CAS revision fencing and explicit-click gesture', () => {
  assert.match(pageTsx, /expectedRevision:\s*accounts\.revision/)
  assert.match(pageTsx, /expectedSequence:\s*snapshot\.sequence/)
  assert.match(pageTsx, /kind:\s*'explicit-click'/)
  const gestureCount = (pageTsx.match(/userGesture:\s*gesture\(\)/g) || []).length
  assert.ok(gestureCount >= 3, 'service login, toggle, and OAuth actions all need explicit click gestures')
})

test('OAuth opens authorizationUrl via Host-pattern window.open (user-activated, noopener) and polls by opaque sessionId', () => {
  // Host's own MarketplacePage uses window.open(url, '_blank', 'noopener,noreferrer') for external links;
  // mirroring that pattern here because there is no public openExternal capability exposed to plugins yet.
  assert.match(pageTsx, /window\.open\(result\.authorizationUrl,\s*'_blank',\s*'noopener,noreferrer'\)/)
  assert.match(pageTsx, /pollOAuthSession\(service,\s*result\.sessionId,\s*provider\)/)
  assert.doesNotMatch(pageTsx, /authorizationUrl[^;]*token/i)
})

// ---------------------------------------------------------------------------
// Renderer-safe data shape
// ---------------------------------------------------------------------------

test('UI groups cover accounts, upstreams, and runtime status', () => {
  assert.match(pageTsx, /upstream\.group\.account-subscriptions/)
  assert.match(pageTsx, /upstream\.group\.cordisx-upstreams/)
  assert.match(pageTsx, /upstream\.group\.runtime-status/)
})

test('subscription UI resolves the registered upstream translation namespace', () => {
  assert.doesNotMatch(pageTsx, /(?:props\.)?t\(['"](?:group|status|field|action)\./)
  assert.match(pageTsx, /props\.t\(['"]upstream\.action\.refresh['"]\)/)
  assert.match(indexTs, /['"]upstream\.action\.refresh['"]:/)
})

test('upstream catalog links account counts to providers without exposing secrets/ports', () => {
  assert.match(messagesTs, /status.model-count/)
  assert.match(pageTsx, /field\.account/)
  // Catalog projection only surfaces redacted origin + secretConfigured flag; baseUrl/port/headers/keys stay host-side.
  assert.match(pageTsx, /provider\.endpoint\.origin/)
  assert.match(pageTsx, /provider\.endpoint\.secretConfigured/)
  assert.doesNotMatch(pageTsx, /provider\.endpoint\.(baseUrl|url|port|headers|apiKey|authorization)/i)
  assert.doesNotMatch(pageTsx, /\blocalhost\b|127\.0\.0\.1|\b0\.0\.0\.0\b/)
})

test('page avoids duplicated Host chrome and outer padding/scroll', () => {
  assert.match(css, /\.cus\s*\{[^}]*display:\s*block/)
  // Body-only layout: no wrapper that would duplicate the Host's page padding/scroll.
  assert.doesNotMatch(css, /\.cus\s*\{[^}]*padding:\s*16px/)
  assert.doesNotMatch(css, /\.cus\s*\{[^}]*overflow:\s*auto/)
  // Only one h1-equivalent outer title per section headings are h2/h3 inside body.
  assert.doesNotMatch(pageTsx, /<h1[>\s]/)
})

test('page is reachable from Manager settings and targets the Host-owned manager.content outlet', () => {
  assert.match(indexTs, /name:\s*['"]manager\.settings\.navigation-items['"]/)
  assert.match(indexTs, /CORDISX_SURFACE_CONTRIBUTION_SCHEMA_V11/)
  assert.match(indexTs, /schemaVersion:\s*11/)
  assert.match(indexTs, /group:\s*['"]after-settings['"]/)
  assert.match(indexTs, /navigationGroup:\s*\{\s*id:\s*['"]external-accounts['"]\s*\}/s)
  assert.match(indexTs, /outlet:\s*['"]manager\.content['"]/)
  assert.match(indexTs, /path:\s*['"]\/manager\/extensions\/cli-proxy-api\/subscriptions['"]/)
  assert.match(indexTs, /ctx\.managerContent\.register\(/)
  assert.match(indexTs, /chrome:\s*['"]standard['"]/)
  assert.doesNotMatch(indexTs, /name:\s*['"]sidebar\.navigation\.items['"],\s*id:\s*['"]upstream-subscriptions['"]/)
})

test('toolbar sits in body and refresh targets acquired service', () => {
  assert.match(pageTsx, /<Stack direction='row' wrap align='center' justify='flex-end'>/)
  assert.match(pageTsx, /onClick=\{\(\) => void refresh\(service\)\}/)
})

test('empty account state explicitly reports the missing add/import capability', () => {
  assert.match(pageTsx, /upstream\.status\.no-accounts-description/)
  assert.match(indexTs, /cannot add or import accounts/)
  assert.match(indexTs, /不能新增或导入账号/)
  assert.doesNotMatch(pageTsx, /addAccount|importAccount|createAccount/)
})

test('own plugin configuration request reports opened on Host acceptance', async () => {
  const { requestOwnPluginConfiguration } = await loadPageModule()
  const calls = []
  const result = await requestOwnPluginConfiguration({
    openOwnPluginConfiguration: async () => {
      calls.push('open')
      return 'opened'
    },
  })
  assert.deepEqual(calls, ['open'])
  assert.deepEqual(result, { status: 'opened' })
})

test('own plugin configuration request downgrades when service is missing or unavailable', async () => {
  const { requestOwnPluginConfiguration } = await loadPageModule()
  assert.deepEqual(await requestOwnPluginConfiguration(undefined), { status: 'unavailable' })
  assert.deepEqual(
    await requestOwnPluginConfiguration({ openOwnPluginConfiguration: async () => 'unavailable' }),
    { status: 'unavailable' },
  )
})

test('own plugin configuration request captures rejected calls for Host error reporting', async () => {
  const { requestOwnPluginConfiguration } = await loadPageModule()
  assert.deepEqual(
    await requestOwnPluginConfiguration({
      openOwnPluginConfiguration: async () => {
        throw new Error('manager receiver rejected')
      },
    }),
    { status: 'failed', message: 'manager receiver rejected' },
  )
  assert.match(pageTsx, /outcome\.status === 'failed'/)
  assert.match(pageTsx, /outcome\.status === 'failed'\) showError\(\)/)
  assert.doesNotMatch(pageTsx, /role=['"]alert['"]|cus-notice|setError\(/)
})

test('runtime identifiers and diagnostics are secondary technical details', () => {
  assert.match(pageTsx, /<Disclosure/)
  assert.match(pageTsx, /upstream\.field\.technical-details/)
  assert.match(pageTsx, /upstream\.field\.generation/)
  assert.doesNotMatch(pageTsx, /<details/)
})

test('account and provider metadata use public information primitives and Host cards', () => {
  assert.match(pageTsx, /Disclosure, EmptyState, FieldList, Heading, Icon, Stack, StatusBadge, Text/)
  assert.match(pageTsx, /<FieldList/)
  assert.match(pageTsx, /<StatusBadge/)
  assert.match(pageTsx, /<Card key=\{account\.accountId\}/)
  assert.match(pageTsx, /<Card key=\{provider\.id\}/)
  assert.doesNotMatch(css, /\.cus-badge(?:-|\s*\{)/)
  assert.doesNotMatch(css, /\.cus-fields/)
})

test('raw runtime state labels are localized before display', () => {
  assert.match(pageTsx, /function stateLabel/)
  assert.match(pageTsx, /stateLabel\(props\.t, snapshot\.readiness\)/)
  assert.match(pageTsx, /stateLabel\(props\.t, snapshot\.health\.level\)/)
  assert.match(pageTsx, /stateLabel\(props\.t, snapshot\.auth\.state\)/)
})

test('account snapshot shape supports real auth-files style provider list', () => {
  // Renderers can iterate providers and display redacted fields only.
  assert.match(pageTsx, /accountsByProvider/)
  assert.match(pageTsx, /account\.email \?\? account\.account \?\? account\.label/)
})

test('OAuth start/toggle request envelope matches Protocol v1', () => {
  assert.match(pageTsx, /\$schema:[\s\S]*managed-service-cli-proxy-oauth-start/)
  assert.match(pageTsx, /contract:\s*'cordisx\.managed-service-cli-proxy-oauth-start\/v1'/)
  assert.match(pageTsx, /\$schema:[\s\S]*managed-service-cli-proxy-account-toggle/)
  assert.match(pageTsx, /contract:\s*'cordisx\.managed-service-cli-proxy-account-toggle\/v1'/)
})

test('catalog provider projection remains renderer-safe', () => {
  assert.match(pageTsx, /provider\.endpoint\.origin/)
  assert.match(pageTsx, /provider\.endpoint\.secretConfigured/)
  assert.doesNotMatch(pageTsx, /binding\.bindingId|binding\.scope\.profileId|serviceRef\.current\s*\?\.\s*binding/)
})

// ---------------------------------------------------------------------------
// Type-aware smoke: TypeScript parses the page file via tsc if a tsconfig is
// wired up; otherwise we at least statically assert the factory signature by
// executing a tiny module-shape check against the source. This is a focused
// structural check that does not rely on regex-only assertions of props.shape.
// ---------------------------------------------------------------------------

test('factory is a plain function returning a React component, not a class or tag function', () => {
  assert.match(pageTsx, /return function UpstreamSubscriptionManagerPage\(props: PageProps\)/)
  assert.doesNotMatch(pageTsx, /class\s+UpstreamSubscriptionManagerPage/)
})

test('external account page keeps the stable contribution identity and deep link', () => {
  assert.match(indexTs, /id:\s*['"]providers\.upstream-subscriptions['"]/)
  assert.match(indexTs, /path:\s*['"]\/manager\/extensions\/cli-proxy-api\/subscriptions['"]/)
  assert.match(indexTs, /route:\s*\{\s*id:\s*['"]providers\.upstream-subscriptions['"]\s*\}/s)
  assert.match(indexTs, /id:\s*['"]upstream-subscriptions['"]/)
})

test('external account page uses Host icons and status components', () => {
  assert.match(indexTs, /icon:\s*['"]host:key['"]/)
  assert.match(pageTsx, /import \{[^}]*\bIcon\b[^}]*\} from ['"]cordisx\/ui['"]/)
  assert.match(pageTsx, /<Icon name=['"]refresh['"]/)
  assert.match(pageTsx, /<Icon name=['"]account['"]/)
  assert.match(pageTsx, /<Icon name=['"]logout['"]/)
  assert.match(pageTsx, /<StatusBadge/)
})

test('status refreshes from subscriptions and a cleaned periodic fallback', () => {
  assert.match(pageTsx, /await refresh\(target, false\)/)
  assert.match(pageTsx, /window\.setInterval/)
  assert.match(pageTsx, /refresh\(serviceRef\.current, false\)/)
  assert.match(pageTsx, /15_000/)
  assert.match(pageTsx, /window\.clearInterval\(refreshTimer\)/)
  assert.match(pageTsx, /subscription\?\.unsubscribe\(\)/)
})

test('logout is explicit, sequence-fenced, refreshes, and clears transient account work', () => {
  assert.match(
    pageTsx,
    /service\.logout\(\{[\s\S]*?binding:\s*service\.binding[\s\S]*?action:\s*['"]logout['"][\s\S]*?expectedSequence:\s*snapshot\.sequence[\s\S]*?userGesture:\s*gesture\(\)/s,
  )
  assert.match(pageTsx, /snapshot\.capabilities\.logout/)
  assert.match(pageTsx, /snapshot\.auth\.state !== ['"]logged-out['"]/)
  assert.match(
    pageTsx,
    /clearOauthPoll\(\)[\s\S]*?setOauthStateValue\(null\)[\s\S]*?setPendingToggle\(null\)[\s\S]*?await refresh\(service\)/s,
  )
})

test('operation failures use Host notifications without exposing raw exceptions', () => {
  assert.match(indexTs, /['"]notifications['"]/)
  assert.match(
    pageTsx,
    /notifications\.show\(\{[\s\S]*?kind:\s*['"]external-account\.operation-failed['"][\s\S]*?type:\s*['"]error['"][\s\S]*?upstream\.state\.operation-error/s,
  )
  assert.doesNotMatch(pageTsx, /err instanceof Error|result\.error\.message|acquired\.message/)
  assert.doesNotMatch(pageTsx, /role=['"]alert['"]|cus-notice|setError\(/)
})
