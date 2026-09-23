import { createHash } from 'node:crypto'

export const CLI_PROXY_GATEWAY_ADAPTER_SCHEMA_V1 =
  'https://raw.githubusercontent.com/cordisx/plugin-cli-proxy-api/main/schemas/cli-proxy-gateway-adapter.v1.schema.json'
export const CLI_PROXY_GATEWAY_CONNECTION_SCHEMA_V1 =
  'https://raw.githubusercontent.com/cordisx/plugin-cli-proxy-api/main/schemas/cli-proxy-gateway-connection.v1.schema.json'
export const CLI_PROXY_GATEWAY_ADAPTER_CONTRACT_V1 = 'cordisx.cli-proxy-gateway-adapter/v1'
export const CLI_PROXY_GATEWAY_CONNECTION_CONTRACT_V1 = 'cordisx.cli-proxy-gateway-connection/v1'
export const CLI_PROXY_GATEWAY_EXTENSION_PLAN_CONTRACT_V1 = 'cordisx.cli-proxy-gateway-extension-plan/v1'
export const CLI_PROXY_GATEWAY_EXTENSION_REGISTRY_SERVICE_V1 = 'cliProxyGatewayExtensions'

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/
const HEADER_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]{1,128}$/
const POINTER_PATTERN = /^(?:\/(?:[^~/]|~0|~1)*)+$/
const MAX_ADAPTERS = 64
const MAX_CONNECTIONS = 128
const MAX_MODELS = 256

export type CliProxyGatewayWireApiV1 = 'responses' | 'chat-completions'
export type CliProxyGatewayTemplateV1 =
  | null
  | boolean
  | number
  | string
  | readonly CliProxyGatewayTemplateV1[]
  | { readonly [key: string]: CliProxyGatewayTemplateV1 }

export type CliProxyGatewaySessionSourceV1 =
  | { readonly kind: 'header'; readonly name: string }
  | { readonly kind: 'body-json-pointer'; readonly pointer: `/${string}` }

export interface CliProxyGatewayAdapterV1 {
  readonly $schema: typeof CLI_PROXY_GATEWAY_ADAPTER_SCHEMA_V1
  readonly contract: typeof CLI_PROXY_GATEWAY_ADAPTER_CONTRACT_V1
  readonly schemaVersion: 1
  readonly adapterId: string
  readonly revision: number
  readonly enabled: boolean
  readonly requiredSession: boolean
  readonly sessionSources: readonly CliProxyGatewaySessionSourceV1[]
  readonly request: {
    readonly clearHeaders?: readonly string[]
    readonly setHeaders?: Readonly<Record<string, CliProxyGatewayTemplateV1>>
    readonly setBody?: Readonly<Record<`/${string}`, CliProxyGatewayTemplateV1>>
  }
}

export interface CliProxyGatewayConnectionModelV1 {
  readonly sourceModelId: string
  readonly modelId: string
  readonly displayName?: string
  readonly enabled: boolean
  readonly isDefault: boolean
}

export interface CliProxyGatewayConnectionV1<Source> {
  readonly $schema: typeof CLI_PROXY_GATEWAY_CONNECTION_SCHEMA_V1
  readonly contract: typeof CLI_PROXY_GATEWAY_CONNECTION_CONTRACT_V1
  readonly schemaVersion: 1
  readonly connectionId: string
  readonly revision: number
  readonly enabled: boolean
  readonly source: Source
  readonly wireApi: CliProxyGatewayWireApiV1
  readonly endpointPath: `/${string}`
  readonly authorization: 'none' | 'bearer'
  readonly adapter: {
    readonly adapterId: string
    readonly revision: number
    readonly required: boolean
  }
  readonly models: readonly CliProxyGatewayConnectionModelV1[]
}

export interface CliProxyGatewayExtensionProducerV1 {
  readonly pluginId: string
  readonly pluginGeneration: string
}

export type CliProxyGatewayExtensionDiagnosticCodeV1 =
  | 'invalid-registration'
  | 'capacity-exceeded'
  | 'conflicting-producer'
  | 'conflicting-source'
  | 'conflicting-model'
  | 'stale-revision'
  | 'stale-generation'
  | 'not-found'

export interface CliProxyGatewayExtensionDiagnosticV1 {
  readonly code: CliProxyGatewayExtensionDiagnosticCodeV1
  readonly field?: string
  readonly message: string
}

export type CliProxyGatewayExtensionMutationResultV1 =
  | { readonly status: 'registered' | 'updated' | 'revoked'; readonly registryRevision: number }
  | { readonly status: 'unchanged'; readonly registryRevision: number }
  | { readonly status: 'rejected' | 'stale-generation'; readonly diagnostic: CliProxyGatewayExtensionDiagnosticV1 }

export interface CliProxyGatewayExtensionRegistrarV1<Source> {
  readonly producer: CliProxyGatewayExtensionProducerV1
  registerAdapter(adapter: CliProxyGatewayAdapterV1): CliProxyGatewayExtensionMutationResultV1
  revokeAdapter(
    input: { readonly adapterId: string; readonly expectedRevision: number },
  ): CliProxyGatewayExtensionMutationResultV1
  registerConnection(connection: CliProxyGatewayConnectionV1<Source>): CliProxyGatewayExtensionMutationResultV1
  revokeConnection(input: {
    readonly connectionId: string
    readonly expectedRevision: number
  }): CliProxyGatewayExtensionMutationResultV1
  dispose(): CliProxyGatewayExtensionMutationResultV1
}

export interface CliProxyGatewayExtensionConsumerContextV1<Source> {
  readonly cliProxyGatewayExtensions: CliProxyGatewayExtensionRegistrarV1<Source>
}

interface AdapterEntry {
  readonly producer: CliProxyGatewayExtensionProducerV1
  readonly adapter: CliProxyGatewayAdapterV1
}

interface ConnectionEntry<Source> {
  readonly producer: CliProxyGatewayExtensionProducerV1
  readonly sourceKey: string
  readonly connection: CliProxyGatewayConnectionV1<Source>
}

export interface CliProxyGatewayExtensionPlanV1<Source> {
  readonly contract: typeof CLI_PROXY_GATEWAY_EXTENSION_PLAN_CONTRACT_V1
  readonly schemaVersion: 1
  readonly pluginGeneration: string
  readonly registryRevision: number
  readonly planDigest: `sha256:${string}`
  readonly configuration: {
    readonly adapters: readonly CliProxyGatewayAdapterV1[]
    readonly connections: readonly {
      readonly connectionId: string
      readonly revision: number
      readonly enabled: boolean
      readonly adapterId: string
      readonly adapterRevision: number
      readonly adapterRequired: boolean
      readonly adapterAvailable: boolean
      readonly wireApi: CliProxyGatewayWireApiV1
      readonly endpointPath: `/${string}`
      readonly endpoint: null
      readonly authorization: 'none' | 'bearer'
      readonly credential: null
      readonly models: readonly {
        readonly sourceModelId: string
        readonly gatewayModelId: string
        readonly displayName: string
        readonly isDefault: boolean
      }[]
    }[]
  }
  readonly composition: readonly {
    readonly connectionId: string
    readonly sourceAlias: string
    readonly source: Source
    readonly originPointer: `/${string}`
    readonly authorizationPointer?: `/${string}`
  }[]
}

interface ValidationFailure {
  readonly code: CliProxyGatewayExtensionDiagnosticCodeV1
  readonly field?: string
  readonly message: string
}

function isText(value: string, maximum: number): boolean {
  return value.length > 0 && value.length <= maximum && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(
      ([key, item]) => [key, stableValue(item)],
    ),
  )
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function digest(value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256').update(stableStringify(value)).digest('hex')}`
}

function rejection(failure: ValidationFailure): CliProxyGatewayExtensionMutationResultV1 {
  return { status: 'rejected', diagnostic: failure }
}

function validRevision(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0
}

function validTemplate(value: CliProxyGatewayTemplateV1, depth = 0): boolean {
  if (depth > 12) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return value.length <= 8_192 && !value.includes('\u0000')
  if (Array.isArray(value)) return value.length <= 128 && value.every(item => validTemplate(item, depth + 1))
  const entries = Object.entries(value)
  return entries.length <= 128 && entries.every(([key, item]) => isText(key, 256) && validTemplate(item, depth + 1))
}

function validateAdapter(adapter: CliProxyGatewayAdapterV1): ValidationFailure | undefined {
  if (
    adapter.$schema !== CLI_PROXY_GATEWAY_ADAPTER_SCHEMA_V1
    || adapter.contract !== CLI_PROXY_GATEWAY_ADAPTER_CONTRACT_V1
    || adapter.schemaVersion !== 1
  ) return { code: 'invalid-registration', field: 'contract', message: 'Unsupported gateway adapter contract' }
  if (!ID_PATTERN.test(adapter.adapterId)) {
    return { code: 'invalid-registration', field: 'adapterId', message: 'Invalid adapter id' }
  }
  if (!validRevision(adapter.revision)) {
    return { code: 'invalid-registration', field: 'revision', message: 'Revision must be a positive safe integer' }
  }
  if (adapter.sessionSources.length > 16) {
    return { code: 'invalid-registration', field: 'sessionSources', message: 'Too many session sources' }
  }
  for (const source of adapter.sessionSources) {
    if (
      source.kind === 'header'
        ? !HEADER_PATTERN.test(source.name)
        : !POINTER_PATTERN.test(source.pointer) || source.pointer.length > 512
    ) return { code: 'invalid-registration', field: 'sessionSources', message: 'Invalid session source' }
  }
  for (const name of adapter.request.clearHeaders ?? []) {
    if (!HEADER_PATTERN.test(name)) {
      return { code: 'invalid-registration', field: 'request.clearHeaders', message: 'Invalid header name' }
    }
  }
  for (const [name, value] of Object.entries(adapter.request.setHeaders ?? {})) {
    if (!HEADER_PATTERN.test(name) || !validTemplate(value)) {
      return { code: 'invalid-registration', field: 'request.setHeaders', message: 'Invalid header transform' }
    }
  }
  for (const [pointer, value] of Object.entries(adapter.request.setBody ?? {})) {
    if (!POINTER_PATTERN.test(pointer) || pointer.length > 512 || !validTemplate(value)) {
      return { code: 'invalid-registration', field: 'request.setBody', message: 'Invalid body transform' }
    }
  }
  if (stableStringify(adapter).length > 64 * 1_024) {
    return { code: 'invalid-registration', message: 'Adapter exceeds the supported size' }
  }
  return undefined
}

function validateConnection<Source>(connection: CliProxyGatewayConnectionV1<Source>): ValidationFailure | undefined {
  if (
    connection.$schema !== CLI_PROXY_GATEWAY_CONNECTION_SCHEMA_V1
    || connection.contract !== CLI_PROXY_GATEWAY_CONNECTION_CONTRACT_V1
    || connection.schemaVersion !== 1
  ) return { code: 'invalid-registration', field: 'contract', message: 'Unsupported gateway connection contract' }
  if (!ID_PATTERN.test(connection.connectionId)) {
    return { code: 'invalid-registration', field: 'connectionId', message: 'Invalid connection id' }
  }
  if (!validRevision(connection.revision)) {
    return { code: 'invalid-registration', field: 'revision', message: 'Revision must be a positive safe integer' }
  }
  if (connection.wireApi !== 'responses' && connection.wireApi !== 'chat-completions') {
    return { code: 'invalid-registration', field: 'wireApi', message: 'Unsupported wire API' }
  }
  if (
    !connection.endpointPath.startsWith('/') || connection.endpointPath.startsWith('//')
    || connection.endpointPath.length > 512 || /[?#\u0000-\u001f\u007f]/.test(connection.endpointPath)
  ) return { code: 'invalid-registration', field: 'endpointPath', message: 'Invalid endpoint path' }
  if (!ID_PATTERN.test(connection.adapter.adapterId) || !validRevision(connection.adapter.revision)) {
    return { code: 'invalid-registration', field: 'adapter', message: 'Invalid adapter reference' }
  }
  if (connection.models.length === 0 || connection.models.length > MAX_MODELS) {
    return { code: 'invalid-registration', field: 'models', message: 'Model routes are outside the supported range' }
  }
  const gatewayModels = new Set<string>()
  const sourceModels = new Set<string>()
  let defaults = 0
  for (const model of connection.models) {
    if (!isText(model.sourceModelId, 256) || !isText(model.modelId, 256) || model.modelId.includes('/')) {
      return { code: 'invalid-registration', field: 'models', message: 'Invalid model identity' }
    }
    if (model.displayName !== undefined && !isText(model.displayName, 200)) {
      return { code: 'invalid-registration', field: 'models.displayName', message: 'Invalid model display name' }
    }
    if (gatewayModels.has(model.modelId) || sourceModels.has(model.sourceModelId)) {
      return { code: 'conflicting-model', field: 'models', message: 'Duplicate connection model route' }
    }
    gatewayModels.add(model.modelId)
    sourceModels.add(model.sourceModelId)
    if (model.enabled && model.isDefault) defaults += 1
  }
  if (!connection.models.some(model => model.enabled)) {
    return { code: 'invalid-registration', field: 'models', message: 'At least one enabled model route is required' }
  }
  if (defaults > 1) {
    return { code: 'conflicting-model', field: 'models.isDefault', message: 'Only one default model is allowed' }
  }
  return undefined
}

export class CliProxyGatewayExtensionRegistryV1<Source> {
  private readonly adapters = new Map<string, AdapterEntry>()
  private readonly connections = new Map<string, ConnectionEntry<Source>>()
  private readonly producerGenerations = new Map<string, string>()
  private readonly listeners = new Set<(revision: number) => void>()
  private revision = 0
  private disposed = false

  constructor(
    readonly pluginGeneration: string,
    private readonly sourceKey: (source: Source) => string,
  ) {
    if (!isText(pluginGeneration, 256)) throw new Error('Invalid plugin generation')
  }

  activateProducer(producer: CliProxyGatewayExtensionProducerV1, registryGeneration: string): void {
    if (this.disposed || registryGeneration !== this.pluginGeneration) {
      throw new Error('Gateway extension registry generation is stale')
    }
    if (!ID_PATTERN.test(producer.pluginId) || !isText(producer.pluginGeneration, 256)) {
      throw new Error('Invalid gateway extension producer authority')
    }
    if (this.producerGenerations.get(producer.pluginId) === producer.pluginGeneration) return
    this.producerGenerations.set(producer.pluginId, producer.pluginGeneration)
    if (this.removeProducerEntries(producer.pluginId)) this.changed()
  }

  registerAdapter(
    adapter: CliProxyGatewayAdapterV1,
    registryGeneration: string,
    producer: CliProxyGatewayExtensionProducerV1,
  ): CliProxyGatewayExtensionMutationResultV1 {
    const generationFailure = this.generationFailure(registryGeneration, producer)
    if (generationFailure !== undefined) return generationFailure
    const validation = validateAdapter(adapter)
    if (validation !== undefined) return rejection(validation)
    const current = this.adapters.get(adapter.adapterId)
    const ownership = this.ownershipFailure(current?.producer, producer)
    if (ownership !== undefined) return ownership
    if (current !== undefined) {
      const revision = this.revisionResult(current.adapter.revision, adapter.revision, current.adapter, adapter)
      if (revision !== undefined) return revision
    } else if (this.adapters.size >= MAX_ADAPTERS) {
      return rejection({ code: 'capacity-exceeded', message: 'Gateway adapter capacity was reached' })
    }
    this.adapters.set(adapter.adapterId, { producer, adapter: structuredClone(adapter) })
    this.changed()
    return { status: current === undefined ? 'registered' : 'updated', registryRevision: this.revision }
  }

  registerConnection(
    connection: CliProxyGatewayConnectionV1<Source>,
    registryGeneration: string,
    producer: CliProxyGatewayExtensionProducerV1,
  ): CliProxyGatewayExtensionMutationResultV1 {
    const generationFailure = this.generationFailure(registryGeneration, producer)
    if (generationFailure !== undefined) return generationFailure
    const validation = validateConnection(connection)
    if (validation !== undefined) return rejection(validation)
    const current = this.connections.get(connection.connectionId)
    const ownership = this.ownershipFailure(current?.producer, producer)
    if (ownership !== undefined) return ownership
    const sourceKey = this.sourceKey(connection.source)
    if (!isText(sourceKey, 512)) {
      return rejection({
        code: 'invalid-registration',
        field: 'source',
        message: 'Invalid connection source reference',
      })
    }
    if (current !== undefined) {
      const revision = this.revisionResult(
        current.connection.revision,
        connection.revision,
        { ...current.connection, source: current.sourceKey },
        { ...connection, source: sourceKey },
      )
      if (revision !== undefined) return revision
    } else if (this.connections.size >= MAX_CONNECTIONS) {
      return rejection({ code: 'capacity-exceeded', message: 'Gateway connection capacity was reached' })
    }
    for (const [connectionId, entry] of this.connections) {
      if (connectionId === connection.connectionId) continue
      if (entry.sourceKey === sourceKey) {
        return rejection({
          code: 'conflicting-source',
          field: 'source',
          message: 'Connection source is already registered',
        })
      }
      const existingModels = new Set(
        entry.connection.models.filter(model => entry.connection.enabled && model.enabled).map(model =>
          `${entry.connection.connectionId}/${model.modelId}`
        ),
      )
      if (
        connection.models.some(model =>
          connection.enabled && model.enabled && existingModels.has(
            `${connection.connectionId}/${model.modelId}`,
          )
        )
      ) return rejection({ code: 'conflicting-model', field: 'models', message: 'Gateway model is already registered' })
    }
    this.connections.set(connection.connectionId, {
      producer,
      sourceKey,
      connection: structuredClone(connection),
    })
    this.changed()
    return { status: current === undefined ? 'registered' : 'updated', registryRevision: this.revision }
  }

  revokeAdapter(
    input: { readonly adapterId: string; readonly expectedRevision: number },
    registryGeneration: string,
    producer: CliProxyGatewayExtensionProducerV1,
  ): CliProxyGatewayExtensionMutationResultV1 {
    const generationFailure = this.generationFailure(registryGeneration, producer)
    if (generationFailure !== undefined) return generationFailure
    const current = this.adapters.get(input.adapterId)
    if (current === undefined) {
      return rejection({ code: 'not-found', field: 'adapterId', message: 'Adapter is not registered' })
    }
    const ownership = this.ownershipFailure(current.producer, producer)
    if (ownership !== undefined) return ownership
    if (current.adapter.revision !== input.expectedRevision) {
      return rejection({ code: 'stale-revision', field: 'expectedRevision', message: 'Adapter revision is stale' })
    }
    this.adapters.delete(input.adapterId)
    this.changed()
    return { status: 'revoked', registryRevision: this.revision }
  }

  revokeConnection(
    input: { readonly connectionId: string; readonly expectedRevision: number },
    registryGeneration: string,
    producer: CliProxyGatewayExtensionProducerV1,
  ): CliProxyGatewayExtensionMutationResultV1 {
    const generationFailure = this.generationFailure(registryGeneration, producer)
    if (generationFailure !== undefined) return generationFailure
    const current = this.connections.get(input.connectionId)
    if (current === undefined) {
      return rejection({ code: 'not-found', field: 'connectionId', message: 'Connection is not registered' })
    }
    const ownership = this.ownershipFailure(current.producer, producer)
    if (ownership !== undefined) return ownership
    if (current.connection.revision !== input.expectedRevision) {
      return rejection({ code: 'stale-revision', field: 'expectedRevision', message: 'Connection revision is stale' })
    }
    this.connections.delete(input.connectionId)
    this.changed()
    return { status: 'revoked', registryRevision: this.revision }
  }

  disposeProducer(
    producer: CliProxyGatewayExtensionProducerV1,
    registryGeneration: string,
  ): CliProxyGatewayExtensionMutationResultV1 {
    const generationFailure = this.generationFailure(registryGeneration, producer)
    if (generationFailure !== undefined) return generationFailure
    this.producerGenerations.delete(producer.pluginId)
    if (!this.removeProducerEntries(producer.pluginId, producer.pluginGeneration)) {
      return { status: 'unchanged', registryRevision: this.revision }
    }
    this.changed()
    return { status: 'revoked', registryRevision: this.revision }
  }

  subscribe(listener: (revision: number) => void): () => void {
    if (this.disposed) throw new Error('Gateway extension registry generation is stale')
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  plan(pluginGeneration: string): CliProxyGatewayExtensionPlanV1<Source> | CliProxyGatewayExtensionDiagnosticV1 {
    if (this.disposed || pluginGeneration !== this.pluginGeneration) {
      return { code: 'stale-generation', message: 'Gateway extension plan generation is stale' }
    }
    const adapters = [...this.adapters.values()].map(entry => structuredClone(entry.adapter)).sort((left, right) =>
      left.adapterId.localeCompare(right.adapterId)
    )
    const connections: CliProxyGatewayExtensionPlanV1<Source>['configuration']['connections'][number][] = []
    const composition: CliProxyGatewayExtensionPlanV1<Source>['composition'][number][] = []
    for (
      const entry of [...this.connections.values()].sort((left, right) =>
        left.connection.connectionId.localeCompare(right.connection.connectionId)
      )
    ) {
      const connection = entry.connection
      const adapter = this.adapters.get(connection.adapter.adapterId)?.adapter
      const adapterAvailable = adapter?.enabled === true && adapter.revision === connection.adapter.revision
      const enabled = connection.enabled && (!connection.adapter.required || adapterAvailable)
      const index = connections.length
      connections.push({
        connectionId: connection.connectionId,
        revision: connection.revision,
        enabled,
        adapterId: connection.adapter.adapterId,
        adapterRevision: connection.adapter.revision,
        adapterRequired: connection.adapter.required,
        adapterAvailable,
        wireApi: connection.wireApi,
        endpointPath: connection.endpointPath,
        endpoint: null,
        authorization: connection.authorization,
        credential: null,
        models: connection.models.filter(model => model.enabled).sort((left, right) =>
          left.modelId.localeCompare(right.modelId)
        ).map(model => ({
          sourceModelId: model.sourceModelId,
          gatewayModelId: `${connection.connectionId}/${model.modelId}`,
          displayName: model.displayName ?? model.modelId,
          isDefault: model.isDefault,
        })),
      })
      if (!enabled) continue
      const sourceAlias = `extension-${index}`
      composition.push({
        connectionId: connection.connectionId,
        sourceAlias,
        source: connection.source,
        originPointer: `/connections/${index}/endpoint`,
        ...(connection.authorization === 'bearer'
          ? { authorizationPointer: `/connections/${index}/credential` as const }
          : {}),
      })
    }
    const base = {
      contract: CLI_PROXY_GATEWAY_EXTENSION_PLAN_CONTRACT_V1,
      schemaVersion: 1 as const,
      pluginGeneration: this.pluginGeneration,
      registryRevision: this.revision,
      configuration: { adapters, connections },
      composition,
    } satisfies Omit<CliProxyGatewayExtensionPlanV1<Source>, 'planDigest'>
    return { ...base, planDigest: digest({ ...base, composition: composition.map(({ source: _, ...item }) => item) }) }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.adapters.clear()
    this.connections.clear()
    this.producerGenerations.clear()
    this.listeners.clear()
    this.revision += 1
  }

  private revisionResult(
    currentRevision: number,
    nextRevision: number,
    current: unknown,
    next: unknown,
  ): CliProxyGatewayExtensionMutationResultV1 | undefined {
    if (nextRevision < currentRevision) {
      return rejection({ code: 'stale-revision', field: 'revision', message: 'Extension revision is stale' })
    }
    if (nextRevision !== currentRevision) return undefined
    return stableStringify(current) === stableStringify(next)
      ? { status: 'unchanged', registryRevision: this.revision }
      : rejection({ code: 'stale-revision', field: 'revision', message: 'Revision was reused with different content' })
  }

  private ownershipFailure(
    current: CliProxyGatewayExtensionProducerV1 | undefined,
    producer: CliProxyGatewayExtensionProducerV1,
  ): CliProxyGatewayExtensionMutationResultV1 | undefined {
    if (current === undefined) return undefined
    if (current.pluginId !== producer.pluginId) {
      return rejection({ code: 'conflicting-producer', message: 'Extension is owned by another producer' })
    }
    if (current.pluginGeneration !== producer.pluginGeneration) {
      return {
        status: 'stale-generation',
        diagnostic: { code: 'stale-generation', message: 'Extension producer generation is stale' },
      }
    }
    return undefined
  }

  private generationFailure(
    registryGeneration: string,
    producer: CliProxyGatewayExtensionProducerV1,
  ): CliProxyGatewayExtensionMutationResultV1 | undefined {
    if (
      this.disposed || registryGeneration !== this.pluginGeneration
      || this.producerGenerations.get(producer.pluginId) !== producer.pluginGeneration
    ) {
      return {
        status: 'stale-generation',
        diagnostic: { code: 'stale-generation', message: 'Gateway extension registry generation is stale' },
      }
    }
    return undefined
  }

  private removeProducerEntries(pluginId: string, pluginGeneration?: string): boolean {
    let removed = false
    for (const [adapterId, entry] of this.adapters) {
      if (
        entry.producer.pluginId !== pluginId
        || (pluginGeneration !== undefined && entry.producer.pluginGeneration !== pluginGeneration)
      ) continue
      this.adapters.delete(adapterId)
      removed = true
    }
    for (const [connectionId, entry] of this.connections) {
      if (
        entry.producer.pluginId !== pluginId
        || (pluginGeneration !== undefined && entry.producer.pluginGeneration !== pluginGeneration)
      ) continue
      this.connections.delete(connectionId)
      removed = true
    }
    return removed
  }

  private changed(): void {
    this.revision += 1
    for (const listener of this.listeners) listener(this.revision)
  }
}

export function createCliProxyGatewayExtensionRegistrarV1<Source>(
  registry: CliProxyGatewayExtensionRegistryV1<Source>,
  producer: CliProxyGatewayExtensionProducerV1,
): CliProxyGatewayExtensionRegistrarV1<Source> {
  registry.activateProducer(producer, registry.pluginGeneration)
  let disposed = false
  const currentRevision = (): number => {
    const plan = registry.plan(registry.pluginGeneration)
    return 'code' in plan ? 0 : plan.registryRevision
  }
  return Object.freeze({
    producer,
    registerAdapter: (adapter: CliProxyGatewayAdapterV1) =>
      disposed
        ? {
          status: 'stale-generation',
          diagnostic: { code: 'stale-generation', message: 'Extension registrar is disposed' },
        }
        : registry.registerAdapter(adapter, registry.pluginGeneration, producer),
    revokeAdapter: (input: { readonly adapterId: string; readonly expectedRevision: number }) =>
      disposed
        ? {
          status: 'stale-generation',
          diagnostic: { code: 'stale-generation', message: 'Extension registrar is disposed' },
        }
        : registry.revokeAdapter(input, registry.pluginGeneration, producer),
    registerConnection: (connection: CliProxyGatewayConnectionV1<Source>) =>
      disposed
        ? {
          status: 'stale-generation',
          diagnostic: { code: 'stale-generation', message: 'Extension registrar is disposed' },
        }
        : registry.registerConnection(connection, registry.pluginGeneration, producer),
    revokeConnection: (input: { readonly connectionId: string; readonly expectedRevision: number }) =>
      disposed
        ? {
          status: 'stale-generation',
          diagnostic: { code: 'stale-generation', message: 'Extension registrar is disposed' },
        }
        : registry.revokeConnection(input, registry.pluginGeneration, producer),
    dispose: () => {
      if (disposed) return { status: 'unchanged', registryRevision: currentRevision() }
      disposed = true
      return registry.disposeProducer(producer, registry.pluginGeneration)
    },
  }) as CliProxyGatewayExtensionRegistrarV1<Source>
}
