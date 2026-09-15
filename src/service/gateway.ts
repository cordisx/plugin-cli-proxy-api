import { createHash } from 'node:crypto'
import type { Fiber } from '@deepseek-ai/cordis'
import type { ManagedServiceContextProviderV1 } from '@cordisx/protocol/managed-service-context/v1'
import type {
  ManagedNativeProviderCatalogV1,
  ManagedNativeProviderPublicationHandleV1,
  ManagedServiceApplyInputV1,
  ManagedServiceApplyV1,
  ManagedServiceIdentityV1,
  ManagedServiceLeaseV1,
  ManagedServiceRegistrationHandleV1,
  ManagedServiceSafeValueV1,
  ManagedServiceServiceContextV1,
} from '@cordisx/protocol/managed-service-runtime/v1'
import { cliProxyGatewayDefinition } from './gateway-definition.js'
import { bindGatewayUIState, managedServiceUI } from './gateway-ui.js'
import { createCliProxyUpstreamContextProviderV1 } from './upstream-context.js'
import {
  CLI_PROXY_UPSTREAM_REGISTRY_SERVICE_V1,
  type CliProxyGatewayPlanV1,
  type CliProxyModelCatalogV1,
  type CliProxyRegistryDiagnosticV1,
  CliProxyUpstreamRegistryV1,
} from './upstream-registry.js'

export * from './gateway-definition.js'
export * from './upstream-registry.js'

export const contextServices: readonly ManagedServiceContextProviderV1[] = Object.freeze([
  createCliProxyUpstreamContextProviderV1(),
])
export { managedServiceUI }
export const CLI_PROXY_NATIVE_PROVIDER_ID = 'cli-proxy-api'

export type CliProxyGatewayContextV1 = ManagedServiceServiceContextV1 & Pick<Fiber, 'effect'> & {
  readonly cliProxyUpstreams: CliProxyUpstreamRegistryV1<ManagedServiceIdentityV1>
}

function activationError(
  stage: string,
  result: { readonly status: string; readonly diagnostic?: { readonly code: string } },
): Error {
  return new Error(`CLIProxyAPI ${stage} failed: ${result.diagnostic?.code ?? result.status}`)
}

function assertPlan(
  value: CliProxyGatewayPlanV1<ManagedServiceIdentityV1> | CliProxyRegistryDiagnosticV1,
): asserts value is CliProxyGatewayPlanV1<ManagedServiceIdentityV1> {
  if ('code' in value) throw new Error(`CLIProxyAPI gateway plan failed: ${value.code}`)
}

function modelIds(value: ManagedServiceSafeValueV1): ReadonlySet<string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return new Set()
  const data = (value as { readonly [key: string]: ManagedServiceSafeValueV1 }).data
  if (!Array.isArray(data)) return new Set()
  return new Set(data.flatMap(item => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return []
    return typeof item.id === 'string' ? [item.id] : []
  }))
}

function expectedSourceModels(catalog: CliProxyModelCatalogV1, upstreamId: string): readonly string[] {
  for (const group of catalog.groups) {
    const provider = group.providers.find(item => item.providerId === upstreamId)
    if (provider !== undefined) return provider.models.flatMap(model => model.sourceModelIds)
  }
  return []
}

function compareUtf8Json(left: readonly string[], right: readonly string[]): number {
  return Buffer.compare(Buffer.from(JSON.stringify(left)), Buffer.from(JSON.stringify(right)))
}

function nativeProviderCatalog(models: ReadonlySet<string>): ManagedNativeProviderCatalogV1 | undefined {
  const routes = [...models]
    .map(model => ({ alias: model, gatewayModelId: model }))
    .sort((left, right) => compareUtf8Json([left.alias], [right.alias]))
  const defaultAlias = routes[0]?.alias
  if (defaultAlias === undefined) return undefined
  const generation = `sha256:${
    createHash('sha256').update(JSON.stringify(routes.map(route => route.gatewayModelId))).digest('hex')
  }`
  const digest = `sha256:${
    createHash('sha256').update(
      JSON.stringify([generation, defaultAlias, routes.map(route => [route.alias, route.gatewayModelId])]),
    ).digest('hex')
  }` as const
  return { generation, digest, defaultAlias, routes }
}

function relativePointer(collection: 'codex-api-key' | 'openai-compatibility', pointer: `/${string}`): `/${string}` {
  const prefix = `/${collection}`
  if (!pointer.startsWith(`${prefix}/`)) throw new Error('CLIProxyAPI gateway plan contains an invalid pointer')
  return pointer.slice(prefix.length) as `/${string}`
}

export async function activateCliProxyGateway(
  context: CliProxyGatewayContextV1,
  input: ManagedServiceApplyInputV1,
): Promise<void> {
  const registry = context.cliProxyUpstreams
  let active: { readonly revision: number; readonly dispose: () => Promise<void> } | undefined
  let transition = Promise.resolve()
  let unsubscribe = (): void => undefined
  let disposePromise: Promise<void> | undefined
  let gatewayHandle: ManagedServiceRegistrationHandleV1 | undefined
  let publication: ManagedNativeProviderPublicationHandleV1 | undefined
  let publicationDigest: string | undefined
  const authorization = new Map<string, boolean>()
  let activeRevision: number | undefined
  let scheduleModelRefresh: () => Promise<void> = async () => undefined
  const uiState = {
    pluginGeneration: input.owner.pluginGeneration,
    registry,
    authorization,
    get activeRevision() {
      return activeRevision
    },
    set activeRevision(value: number | undefined) {
      activeRevision = value
    },
    refreshGatewayModels: () => scheduleModelRefresh(),
  }
  const unbindGatewayUIState = bindGatewayUIState(uiState)

  const activate = async (
    catalog: CliProxyModelCatalogV1,
    plan: CliProxyGatewayPlanV1<ManagedServiceIdentityV1>,
  ): Promise<() => Promise<void>> => {
    gatewayHandle ??= await context.managedServices.register(cliProxyGatewayDefinition, {
      revision: plan.catalogDigest,
    })
    const handle = gatewayHandle
    const leases: ManagedServiceLeaseV1[] = []
    let cleanupPromise: Promise<void> | undefined
    const cleanup = (): Promise<void> => {
      cleanupPromise ??= (async () => {
        const failures: unknown[] = []
        const attempt = async (operation: () => unknown | Promise<unknown>): Promise<void> => {
          try {
            await operation()
          } catch (error) {
            failures.push(error)
          }
        }

        for (const lease of leases.splice(0).reverse()) {
          await attempt(() => input.client.release(lease))
        }
        if (failures.length > 0) {
          throw new AggregateError(failures, 'CLIProxyAPI managed gateway cleanup failed')
        }
      })()
      return cleanupPromise
    }

    try {
      const sources = []
      authorization.clear()
      for (const composition of plan.composition) {
        const acquired = await input.client.acquire(composition.source, { signal: input.signal })
        if (acquired.status !== 'ready') throw activationError(`${composition.upstreamId} acquisition`, acquired)
        leases.push(acquired.lease)
        sources.push({ source: composition.upstreamId, lease: acquired.lease })
        authorization.set(composition.upstreamId, acquired.projection.httpAuthorization.state === 'configured')

        const discovered = await input.client.invoke(acquired.lease, 'models.list', undefined, { signal: input.signal })
        if (discovered.status !== 'accepted') {
          throw activationError(`${composition.upstreamId} model validation`, discovered)
        }
        const actual = modelIds(discovered.value)
        const missing = expectedSourceModels(catalog, composition.upstreamId).filter(model => !actual.has(model))
        if (missing.length > 0) {
          throw new Error(
            `CLIProxyAPI upstream ${composition.upstreamId} omitted declared models: ${missing.join(', ')}`,
          )
        }
      }

      const bindings: Parameters<typeof input.client.materialize>[0]['bindings'][number][] = [
        {
          targetSlot: 'codex-upstreams',
          source: { kind: 'safe-literal', value: plan.configuration['codex-api-key'] },
        },
        {
          targetSlot: 'openai-upstreams',
          source: { kind: 'safe-literal', value: plan.configuration['openai-compatibility'] },
        },
      ]
      for (const composition of plan.composition) {
        const collection = composition.origin.targetPointer.startsWith('/codex-api-key/')
          ? 'codex-api-key' as const
          : 'openai-compatibility' as const
        bindings.push({
          targetSlot: collection === 'codex-api-key' ? 'codex-upstreams' : 'openai-upstreams',
          targetPointer: relativePointer(collection, composition.origin.targetPointer),
          source: { kind: 'source-origin', source: composition.upstreamId, origin: 'api' },
        })
        if (authorization.get(composition.upstreamId)) {
          bindings.push({
            targetSlot: collection === 'codex-api-key' ? 'codex-upstreams' : 'openai-upstreams',
            targetPointer: relativePointer(collection, composition.authorization.targetPointer),
            source: { kind: 'source-authorization', source: composition.upstreamId },
          })
        }
      }

      const materialized = await input.client.materialize({
        target: handle.binding,
        revision: plan.catalogDigest,
        sources,
        bindings,
      }, { signal: input.signal })
      if (materialized.status !== 'accepted') throw activationError('materialization', materialized)

      const ready = await handle.ensureReady({
        materialization: {
          materializationHandle: materialized.materializationHandle,
          revision: materialized.revision,
        },
        signal: input.signal,
      })
      if (ready.status !== 'ready') throw activationError('readiness', ready)

      const actualGatewayModels = await readGatewayModels()
      const expectedGatewayModels = catalog.groups.flatMap(group =>
        group.providers.flatMap(provider => provider.models.map(model => model.gatewayModelId))
      )
      const missingGatewayModels = expectedGatewayModels.filter(model => !actualGatewayModels.has(model))
      if (missingGatewayModels.length > 0) {
        throw new Error(`CLIProxyAPI gateway omitted composed models: ${missingGatewayModels.join(', ')}`)
      }
      await publishGatewayModels(actualGatewayModels)
      activeRevision = catalog.registryRevision
      return cleanup
    } catch (error) {
      try {
        await cleanup()
      } catch (cleanupError) {
        const cleanupFailures = cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError]
        throw new AggregateError(
          [error, ...cleanupFailures],
          'CLIProxyAPI managed gateway activation and cleanup failed',
          { cause: error },
        )
      }
      throw error
    }
  }

  const disposePublication = async (): Promise<void> => {
    if (publication === undefined) return
    const current = publication
    publication = undefined
    publicationDigest = undefined
    const result = await current.dispose()
    const alreadyRevoked = result.status === 'stale'
      && (result.diagnostic.code === 'disposed' || result.diagnostic.code === 'stale-generation')
    if (result.status !== 'disposed' && !alreadyRevoked) {
      throw activationError('native publication cleanup', result)
    }
  }

  const readGatewayModels = async (): Promise<ReadonlySet<string>> => {
    if (gatewayHandle === undefined) throw new Error('CLIProxyAPI gateway is not registered')
    const acquired = await input.client.acquire(gatewayHandle.binding.identity, { signal: input.signal })
    if (acquired.status !== 'ready') throw activationError('validation acquisition', acquired)
    try {
      const verified = await input.client.invoke(acquired.lease, 'gateway.models.list', undefined, {
        signal: input.signal,
      })
      if (verified.status !== 'accepted') throw activationError('model validation', verified)
      return modelIds(verified.value)
    } finally {
      input.client.release(acquired.lease)
    }
  }

  const publishGatewayModels = async (models: ReadonlySet<string>): Promise<void> => {
    if (gatewayHandle === undefined) throw new Error('CLIProxyAPI gateway is not registered')
    const catalog = nativeProviderCatalog(models)
    if (catalog?.digest === publicationDigest) return
    await disposePublication()
    if (catalog === undefined || input.signal.aborted) return
    const published = await gatewayHandle.publishNativeProvider({
      providerId: CLI_PROXY_NATIVE_PROVIDER_ID,
      compositionOrigin: 'api',
      catalog,
    }, { signal: input.signal })
    if (published.status !== 'accepted') throw activationError('cli-proxy-api native publication', published)
    publication = published.publication
    publicationDigest = catalog.digest
  }

  const reconcile = async (): Promise<void> => {
    if (input.signal.aborted) return
    const catalog = registry.catalog(input.owner.pluginGeneration)
    if ('code' in catalog) throw new Error(`CLIProxyAPI catalog failed: ${catalog.code}`)
    if (active?.revision === catalog.registryRevision) return
    const previous = active
    active = undefined
    activeRevision = undefined
    await previous?.dispose()
    const plan = registry.gatewayPlan(input.owner.pluginGeneration)
    assertPlan(plan)

    if (gatewayHandle === undefined) {
      gatewayHandle = await context.managedServices.register(cliProxyGatewayDefinition, {
        revision: plan.catalogDigest,
      })
    }

    if (input.signal.aborted) return

    const cleanup = await activate(catalog, plan)
    if (input.signal.aborted) {
      await cleanup()
      return
    }
    active = { revision: catalog.registryRevision, dispose: cleanup }
  }

  const schedule = (): Promise<void> => {
    const pending = transition.then(reconcile)
    transition = pending.catch(() => undefined)
    return pending
  }

  scheduleModelRefresh = (): Promise<void> => {
    const pending = transition.then(async () => {
      if (input.signal.aborted || active === undefined) return
      await publishGatewayModels(await readGatewayModels())
    })
    transition = pending.catch(() => undefined)
    return pending
  }

  const dispose = (): Promise<void> => {
    if (disposePromise !== undefined) return disposePromise
    disposePromise = (async () => {
      unsubscribe()
      unbindGatewayUIState()
      await transition
      const failures: unknown[] = []
      const cleanup = async (operation: () => unknown | Promise<unknown>): Promise<void> => {
        try {
          await operation()
        } catch (error) {
          failures.push(...(error instanceof AggregateError ? error.errors : [error]))
        }
      }
      const current = active
      active = undefined
      if (current !== undefined) await cleanup(current.dispose)
      await cleanup(disposePublication)
      if (gatewayHandle !== undefined) {
        const handle = gatewayHandle
        gatewayHandle = undefined
        await cleanup(() => handle.dispose())
      }
      await cleanup(() => input.client.dispose())
      if (failures.length > 0) {
        throw new AggregateError(failures, 'CLIProxyAPI managed gateway cleanup failed')
      }
    })()
    return disposePromise
  }

  try {
    unsubscribe = registry.subscribe(() => {
      void schedule().catch(() => undefined)
    })
    const onAbort = (): void => {
      void dispose().catch(() => undefined)
    }
    input.signal.addEventListener('abort', onAbort, { once: true })
    context.effect(() => () => {
      input.signal.removeEventListener('abort', onAbort)
      return dispose()
    }, 'CLIProxyAPI managed gateway')
    await schedule()
    if (input.signal.aborted) await dispose()
  } catch (error) {
    try {
      await dispose()
    } catch (cleanupError) {
      const activationFailures = error instanceof AggregateError ? error.errors : [error]
      const activationCause = error instanceof AggregateError && error.cause !== undefined ? error.cause : error
      const cleanupFailures = cleanupError instanceof AggregateError ? cleanupError.errors : [cleanupError]
      throw new AggregateError(
        [...activationFailures, ...cleanupFailures],
        'CLIProxyAPI managed gateway activation and cleanup failed',
        { cause: activationCause },
      )
    }
    throw error
  }
}

const gatewayApply: ManagedServiceApplyV1 = async (context, input) => {
  await activateCliProxyGateway(context as CliProxyGatewayContextV1, input)
}

export const apply = Object.assign(gatewayApply, {
  inject: ['managedServices', CLI_PROXY_UPSTREAM_REGISTRY_SERVICE_V1] as const,
})
