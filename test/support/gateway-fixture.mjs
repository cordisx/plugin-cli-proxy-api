import { createHash } from 'node:crypto'

export const identity = (pluginId, serviceId) => ({
  source: `https://plugins.example.test/${pluginId}`,
  pluginId,
  serviceId,
})

export const binding = (pluginId, serviceId, generation) => ({
  registrationHandle: `msr_${serviceId}`,
  serviceHandle: `mss_${serviceId}`,
  identity: identity(pluginId, serviceId),
  hostGeneration: 'host-one',
  serviceGeneration: generation,
})

export const uiBinding = (pluginId, serviceId, generation) => ({
  bindingId: `binding-${serviceId}`,
  identity: identity(pluginId, serviceId),
  scope: { profileId: 'profile-one', generation },
})

export const lease = (pluginId, serviceId, generation, operations = ['models.list']) => ({
  leaseHandle: `msl_${serviceId}`,
  binding: binding(pluginId, serviceId, generation),
  brokerHandle: `msb_${serviceId}`,
  operations,
})

export const projection = (serviceBinding, authenticated = true) => ({
  $schema:
    'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-projection.v1.schema.json',
  contract: 'cordisx.managed-service-projection/v1',
  schemaVersion: 1,
  binding: serviceBinding,
  state: 'ready',
  health: 'ready',
  processOwnership: 'host-owned',
  configuration: { state: 'not-required' },
  authentication: { state: 'not-required' },
  httpAuthorization: authenticated
    ? { state: 'configured', authorizationHandle: `msa_${serviceBinding.identity.serviceId}` }
    : { state: 'not-required' },
  connection: { brokerHandle: `msb_${serviceBinding.identity.serviceId}` },
})

export function expectedNativeCatalog(modelIds) {
  const routes = [...new Set(modelIds)].sort().map(modelId => ({ alias: modelId, gatewayModelId: modelId }))
  const generation = `sha256:${
    createHash('sha256').update(JSON.stringify(routes.map(route => route.gatewayModelId))).digest('hex')
  }`
  const catalog = { generation, defaultAlias: routes[0].alias, routes }
  const digest = `sha256:${
    createHash('sha256').update(
      JSON.stringify([generation, catalog.defaultAlias, routes.map(route => [route.alias, route.gatewayModelId])]),
    ).digest('hex')
  }`
  return { ...catalog, digest }
}
