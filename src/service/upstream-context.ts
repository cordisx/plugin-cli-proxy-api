import type {
  ManagedServiceContextAuthorityV1,
  ManagedServiceContextBindingV1,
  ManagedServiceContextProviderRootV1,
  ManagedServiceContextProviderV1,
} from '@cordisx/protocol/managed-service-context/v1'
import type { ManagedServiceIdentityV1 } from '@cordisx/protocol/managed-service-runtime/v1'
import {
  CLI_PROXY_UPSTREAM_REGISTRY_SERVICE_V1,
  CliProxyUpstreamRegistryV1,
  createCliProxyUpstreamRegistrarV1,
} from './upstream-registry.js'

function sourceKey(source: ManagedServiceIdentityV1): string {
  return JSON.stringify([source.source, source.pluginId, source.serviceId])
}

export function createCliProxyUpstreamContextProviderV1(): ManagedServiceContextProviderV1 {
  return Object.freeze({
    service: CLI_PROXY_UPSTREAM_REGISTRY_SERVICE_V1,
    create: ({ target, signal }: {
      readonly target: ManagedServiceContextAuthorityV1
      readonly signal: AbortSignal
    }): ManagedServiceContextProviderRootV1 => {
      const registry = new CliProxyUpstreamRegistryV1<ManagedServiceIdentityV1>(
        target.pluginGeneration,
        sourceKey,
      )
      const bindings = new Set<ManagedServiceContextBindingV1>()
      let disposed = false

      const dispose = (): void => {
        if (disposed) return
        disposed = true
        for (const binding of [...bindings]) binding.dispose()
        bindings.clear()
        registry.dispose()
      }

      signal.addEventListener('abort', dispose, { once: true })
      return Object.freeze({
        providerValue: registry,
        bind: ({ producer, target: bindingTarget, signal: bindingSignal }: {
          readonly producer: { readonly pluginId: string; readonly pluginGeneration: string }
          readonly target: ManagedServiceContextAuthorityV1
          readonly signal: AbortSignal
        }) => {
          if (
            disposed
            || bindingSignal.aborted
            || bindingTarget.pluginId !== target.pluginId
            || bindingTarget.pluginGeneration !== target.pluginGeneration
            || bindingTarget.serviceId !== target.serviceId
            || bindingTarget.serviceGeneration !== target.serviceGeneration
          ) throw new Error('CLIProxyAPI upstream context generation is stale')

          const registrar = createCliProxyUpstreamRegistrarV1(registry, producer)
          let bindingDisposed = false
          const binding: ManagedServiceContextBindingV1 = Object.freeze({
            value: registrar,
            dispose: () => {
              if (bindingDisposed) return
              bindingDisposed = true
              bindings.delete(binding)
              registrar.dispose()
            },
          })
          bindings.add(binding)
          bindingSignal.addEventListener('abort', () => binding.dispose(), { once: true })
          return binding
        },
        dispose,
      })
    },
  })
}
