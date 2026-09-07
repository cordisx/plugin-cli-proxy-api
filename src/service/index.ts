import type {
  PlatformProviderDefinitionV2,
  PlatformProviderServiceApplyV2,
} from '@cordisx/protocol/platform-provider/v2'
import { CliProxyPlatformProviderAdapter } from './adapter.js'
import { BROKER_BINDINGS } from './bindings.js'

const OPERATIONS = [
  'models.list',
  'sessions.list',
  'sessions.read',
  'sessions.create',
  'sessions.control',
  'turns.submit',
  'turns.control',
  'turns.introduce',
  'approvals.decide',
] as const

export const apply: PlatformProviderServiceApplyV2 = async (ctx, input) => {
  for (const configuration of input.configurations) {
    if (!configuration.enabled) continue
    const definition: PlatformProviderDefinitionV2 = {
      descriptor: {
        $schema:
          'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/platform-provider-descriptor.v1.schema.json',
        contract: 'cordisx.platform-provider-descriptor/v1',
        schemaVersion: 1,
        providerId: configuration.providerId,
        displayName: configuration.displayName,
        implementationStatus: 'experimental',
        operations: OPERATIONS,
      },
      mapping: configuration.mapping,
      brokerRequest: {
        bindings: BROKER_BINDINGS as PlatformProviderDefinitionV2['brokerRequest']['bindings'],
      },
      createAdapter: async factory => {
        if (factory.owner.ownerHandle !== input.owner.ownerHandle) {
          throw new Error('Platform provider owner fence is stale')
        }
        return new CliProxyPlatformProviderAdapter(
          factory.providerId,
          factory.providerGeneration,
          factory.configuration,
          factory.broker,
          factory.signal,
        )
      },
    }
    await ctx.platformProviders.register(definition)
  }
}
