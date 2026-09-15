import {
  CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1,
  CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1,
  type CliProxyUpstreamConsumerContextV1,
  type CliProxyUpstreamDescriptorV1,
} from '@cordisx/plugin-cli-proxy-api/upstream/v1'

interface SyntheticManagedServiceSource {
  readonly serviceId: string
}

const descriptor: CliProxyUpstreamDescriptorV1 = {
  $schema: CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1,
  contract: CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1,
  schemaVersion: 1,
  revision: 1,
  upstreamId: 'synthetic-provider',
  displayName: 'Synthetic Provider',
  enabled: true,
  wireApi: 'responses',
  prefix: 'synthetic-provider',
  order: 10,
  requestTimeoutMs: 30_000,
  group: {
    groupId: 'synthetic',
    displayName: 'Synthetic',
    order: 10,
  },
  models: [{
    sourceModelId: 'synthetic-model',
    modelId: 'synthetic-model',
    displayName: 'Synthetic Model',
    enabled: true,
    isDefault: true,
    inputModalities: ['text'],
  }],
}

export function registerSyntheticUpstream(
  ctx: CliProxyUpstreamConsumerContextV1<SyntheticManagedServiceSource>,
) {
  return ctx.cliProxyUpstreams.register({
    source: { serviceId: 'synthetic-service' },
    descriptor,
  })
}
