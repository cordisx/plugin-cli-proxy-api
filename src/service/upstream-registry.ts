import { createHash } from 'node:crypto'

export const CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1 =
  'https://raw.githubusercontent.com/cordisx/plugin-cli-proxy-api/main/schemas/cli-proxy-upstream-descriptor.v1.schema.json'
export const CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1 = 'cordisx.cli-proxy-upstream-descriptor/v1'
export const CLI_PROXY_MODEL_CATALOG_CONTRACT_V1 = 'cordisx.cli-proxy-model-catalog/v1'
export const CLI_PROXY_GATEWAY_PLAN_CONTRACT_V1 = 'cordisx.cli-proxy-gateway-plan/v1'
export const CLI_PROXY_UPSTREAM_REGISTRY_SERVICE_V1 = 'cliProxyUpstreams'

const ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/
const PREFIX_PATTERN = /^[a-z0-9][a-z0-9._-]{0,95}$/
const MAX_MODELS = 256
const MAX_REGISTRATIONS = 64

export type CliProxyInputModalityV1 = 'text' | 'image' | 'audio'
export type CliProxyWireApiV1 = 'responses' | 'chat-completions'

export interface CliProxyModelRouteV1 {
  readonly sourceModelId: string
  readonly modelId: string
  readonly displayName?: string
  readonly enabled: boolean
  readonly isDefault: boolean
  readonly inputModalities?: readonly CliProxyInputModalityV1[]
}

export interface CliProxyUpstreamDescriptorV1 {
  readonly $schema: typeof CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1
  readonly contract: typeof CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1
  readonly schemaVersion: 1
  readonly revision: number
  readonly upstreamId: string
  readonly displayName: string
  readonly enabled: boolean
  readonly wireApi: CliProxyWireApiV1
  readonly prefix?: string
  readonly order: number
  readonly requestTimeoutMs: number
  readonly group: {
    readonly groupId: string
    readonly displayName: string
    readonly order: number
  }
  readonly models: readonly CliProxyModelRouteV1[]
}

export interface CliProxyUpstreamRegistrationV1<Source> {
  readonly source: Source
  readonly descriptor: CliProxyUpstreamDescriptorV1
}

export interface CliProxyUpstreamRevocationV1 {
  readonly upstreamId: string
  readonly expectedRevision: number
}

export interface CliProxyUpstreamProducerV1 {
  readonly pluginId: string
  readonly pluginGeneration: string
}

export type CliProxyRegistryDiagnosticCodeV1 =
  | 'invalid-registration'
  | 'capacity-exceeded'
  | 'conflicting-source'
  | 'conflicting-producer'
  | 'conflicting-prefix'
  | 'conflicting-group'
  | 'conflicting-model-alias'
  | 'conflicting-default'
  | 'stale-revision'
  | 'stale-generation'
  | 'not-found'

export interface CliProxyRegistryDiagnosticV1 {
  readonly code: CliProxyRegistryDiagnosticCodeV1
  readonly field?: string
  readonly message: string
}

export type CliProxyRegistryMutationResultV1 =
  | { readonly status: 'registered' | 'updated' | 'revoked'; readonly registryRevision: number }
  | { readonly status: 'unchanged'; readonly registryRevision: number }
  | { readonly status: 'rejected' | 'stale-generation'; readonly diagnostic: CliProxyRegistryDiagnosticV1 }

export interface CliProxyUpstreamRegistrarV1<Source> {
  readonly producer: CliProxyUpstreamProducerV1
  register(registration: CliProxyUpstreamRegistrationV1<Source>): CliProxyRegistryMutationResultV1
  revoke(input: CliProxyUpstreamRevocationV1): CliProxyRegistryMutationResultV1
  dispose(): CliProxyRegistryMutationResultV1
}

export interface CliProxyUpstreamConsumerContextV1<Source> {
  readonly cliProxyUpstreams: CliProxyUpstreamRegistrarV1<Source>
}

export interface CliProxyModelCatalogModelV1 {
  readonly modelId: string
  readonly gatewayModelId: string
  readonly displayName: string
  readonly sourceModelIds: readonly string[]
  readonly isDefault: boolean
  readonly inputModalities: readonly CliProxyInputModalityV1[]
}

export interface CliProxyModelCatalogProviderV1 {
  readonly providerId: string
  readonly displayName: string
  readonly prefix: string
  readonly wireApi: CliProxyWireApiV1
  readonly order: number
  readonly revision: number
  readonly groupId: string
  readonly requestTimeoutMs: number
  readonly models: readonly CliProxyModelCatalogModelV1[]
}

export interface CliProxyModelCatalogGroupV1 {
  readonly groupId: string
  readonly displayName: string
  readonly order: number
  readonly providers: readonly CliProxyModelCatalogProviderV1[]
}

export interface CliProxyModelCatalogV1 {
  readonly contract: typeof CLI_PROXY_MODEL_CATALOG_CONTRACT_V1
  readonly schemaVersion: 1
  readonly pluginGeneration: string
  readonly registryRevision: number
  readonly upstreamRevisions: Readonly<Record<string, number>>
  readonly groups: readonly CliProxyModelCatalogGroupV1[]
  readonly catalogDigest: `sha256:${string}`
}

export interface CliProxyGatewayCompositionV1<Source> {
  readonly upstreamId: string
  readonly source: Source
  readonly origin: {
    readonly slot: string
    readonly targetPointer: `/${string}`
  }
  readonly authorization: {
    readonly slot: string
    readonly targetPointer: `/${string}`
  }
}

export interface CliProxyGatewayPlanV1<Source> {
  readonly contract: typeof CLI_PROXY_GATEWAY_PLAN_CONTRACT_V1
  readonly schemaVersion: 1
  readonly pluginGeneration: string
  readonly registryRevision: number
  readonly catalogDigest: `sha256:${string}`
  readonly configuration: {
    readonly 'codex-api-key': readonly {
      readonly 'api-key': null
      readonly prefix: string
      readonly 'base-url': null
      readonly 'request-retry': 0
      readonly models: readonly {
        readonly name: string
        readonly alias: string
        readonly 'display-name': string
        readonly 'force-mapping': true
      }[]
    }[]
    readonly 'openai-compatibility': readonly {
      readonly name: string
      readonly disabled: false
      readonly prefix: string
      readonly 'base-url': null
      readonly 'api-key-entries': readonly [{ readonly 'api-key': null }]
      readonly 'request-retry': 0
      readonly models: readonly {
        readonly name: string
        readonly alias: string
        readonly 'display-name': string
        readonly 'force-mapping': true
        readonly 'input-modalities'?: readonly CliProxyInputModalityV1[]
      }[]
    }[]
  }
  readonly composition: readonly CliProxyGatewayCompositionV1<Source>[]
}

interface RegistryEntry<Source> {
  readonly source: Source
  readonly sourceKey: string
  readonly producer: CliProxyUpstreamProducerV1
  readonly descriptor: CliProxyUpstreamDescriptorV1
}

interface ValidationFailure {
  readonly code: CliProxyRegistryDiagnosticCodeV1
  readonly field?: string
  readonly message: string
}

function rejection(failure: ValidationFailure): CliProxyRegistryMutationResultV1 {
  return { status: 'rejected', diagnostic: failure }
}

function isText(value: string, maximum: number): boolean {
  return value.length > 0 && value.length <= maximum && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value)
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function normalizedModalities(
  values: readonly CliProxyInputModalityV1[] | undefined,
): readonly CliProxyInputModalityV1[] {
  return [...new Set(values ?? [])].sort()
}

function validateDescriptor(descriptor: CliProxyUpstreamDescriptorV1): ValidationFailure | undefined {
  if (
    descriptor.$schema !== CLI_PROXY_UPSTREAM_DESCRIPTOR_SCHEMA_V1
    || descriptor.contract !== CLI_PROXY_UPSTREAM_DESCRIPTOR_CONTRACT_V1
    || descriptor.schemaVersion !== 1
  ) {
    return { code: 'invalid-registration', field: 'contract', message: 'Unsupported upstream descriptor contract' }
  }
  if (!ID_PATTERN.test(descriptor.upstreamId)) {
    return { code: 'invalid-registration', field: 'upstreamId', message: 'Invalid upstream id' }
  }
  if (!isText(descriptor.displayName, 200)) {
    return { code: 'invalid-registration', field: 'displayName', message: 'Invalid upstream display name' }
  }
  if (descriptor.wireApi !== 'responses' && descriptor.wireApi !== 'chat-completions') {
    return { code: 'invalid-registration', field: 'wireApi', message: 'Unsupported upstream wire API' }
  }
  if (!Number.isSafeInteger(descriptor.revision) || descriptor.revision < 1) {
    return { code: 'invalid-registration', field: 'revision', message: 'Revision must be a positive safe integer' }
  }
  if (!Number.isSafeInteger(descriptor.order) || descriptor.order < -1_000 || descriptor.order > 1_000) {
    return { code: 'invalid-registration', field: 'order', message: 'Provider order is outside the supported range' }
  }
  if (
    !Number.isSafeInteger(descriptor.requestTimeoutMs)
    || descriptor.requestTimeoutMs < 1_000
    || descriptor.requestTimeoutMs > 120_000
  ) {
    return {
      code: 'invalid-registration',
      field: 'requestTimeoutMs',
      message: 'Request timeout is outside the supported range',
    }
  }
  if (!ID_PATTERN.test(descriptor.group.groupId) || !isText(descriptor.group.displayName, 200)) {
    return { code: 'invalid-registration', field: 'group', message: 'Invalid upstream group' }
  }
  if (
    !Number.isSafeInteger(descriptor.group.order) || descriptor.group.order < -1_000 || descriptor.group.order > 1_000
  ) {
    return { code: 'invalid-registration', field: 'group.order', message: 'Group order is outside the supported range' }
  }
  const prefix = descriptor.prefix ?? descriptor.upstreamId
  if (!PREFIX_PATTERN.test(prefix)) {
    return { code: 'invalid-registration', field: 'prefix', message: 'Invalid gateway prefix' }
  }
  if (descriptor.models.length === 0 || descriptor.models.length > MAX_MODELS) {
    return { code: 'invalid-registration', field: 'models', message: 'Model routes are outside the supported range' }
  }

  const sourceModels = new Set<string>()
  const aliases = new Map<string, CliProxyModelRouteV1>()
  const defaults = new Set<string>()
  for (const route of descriptor.models) {
    if (!isText(route.sourceModelId, 256) || !isText(route.modelId, 256)) {
      return { code: 'invalid-registration', field: 'models', message: 'Invalid model identity' }
    }
    if (route.displayName !== undefined && !isText(route.displayName, 200)) {
      return { code: 'invalid-registration', field: 'models.displayName', message: 'Invalid model display name' }
    }
    if (sourceModels.has(route.sourceModelId)) {
      return { code: 'conflicting-model-alias', field: 'models.sourceModelId', message: 'Duplicate source model id' }
    }
    sourceModels.add(route.sourceModelId)
    if (!route.enabled) continue
    if (route.isDefault) defaults.add(route.modelId)
    const modalities = normalizedModalities(route.inputModalities)
    if (modalities.some(value => value !== 'text' && value !== 'image' && value !== 'audio')) {
      return { code: 'invalid-registration', field: 'models.inputModalities', message: 'Unsupported input modality' }
    }
    const first = aliases.get(route.modelId)
    if (
      first !== undefined
      && (
        (first.displayName ?? first.modelId) !== (route.displayName ?? route.modelId)
        || first.isDefault !== route.isDefault
        || !sameStrings(normalizedModalities(first.inputModalities), modalities)
      )
    ) {
      return {
        code: 'conflicting-model-alias',
        field: 'models.modelId',
        message: 'Pooled model aliases must have identical public metadata',
      }
    }
    aliases.set(route.modelId, route)
  }
  if (aliases.size === 0) {
    return { code: 'invalid-registration', field: 'models', message: 'At least one enabled model route is required' }
  }
  if (defaults.size > 1) {
    return {
      code: 'conflicting-default',
      field: 'models.isDefault',
      message: 'Only one public default model is allowed',
    }
  }
  return undefined
}

function compareOrderThenId(
  left: { readonly order: number; readonly id: string },
  right: { readonly order: number; readonly id: string },
): number {
  return left.order - right.order || left.id.localeCompare(right.id)
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

export class CliProxyUpstreamRegistryV1<Source> {
  private readonly entries = new Map<string, RegistryEntry<Source>>()
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

  register(
    registration: CliProxyUpstreamRegistrationV1<Source>,
    registryGeneration: string,
    producer: CliProxyUpstreamProducerV1,
  ): CliProxyRegistryMutationResultV1 {
    const generationFailure = this.generationFailure(registryGeneration, producer)
    if (generationFailure !== undefined) return generationFailure
    const current = this.entries.get(registration.descriptor.upstreamId)
    if (current !== undefined && current.producer.pluginId !== producer.pluginId) {
      return rejection({
        code: 'conflicting-producer',
        field: 'upstreamId',
        message: 'Upstream is owned by another producer',
      })
    }
    if (current !== undefined && current.producer.pluginGeneration !== producer.pluginGeneration) {
      return {
        status: 'stale-generation',
        diagnostic: { code: 'stale-generation', message: 'Upstream producer generation is stale' },
      }
    }
    const validation = validateDescriptor(registration.descriptor)
    if (validation !== undefined) return rejection(validation)
    const sourceKey = this.sourceKey(registration.source)
    if (!isText(sourceKey, 512)) {
      return rejection({ code: 'invalid-registration', field: 'source', message: 'Invalid upstream source reference' })
    }
    if (current !== undefined) {
      if (registration.descriptor.revision < current.descriptor.revision) {
        return rejection({ code: 'stale-revision', field: 'revision', message: 'Upstream revision is stale' })
      }
      if (registration.descriptor.revision === current.descriptor.revision) {
        return stableStringify(registration.descriptor) === stableStringify(current.descriptor)
            && sourceKey === current.sourceKey
          ? { status: 'unchanged', registryRevision: this.revision }
          : rejection({
            code: 'stale-revision',
            field: 'revision',
            message: 'Revision was reused with different content',
          })
      }
    } else if (this.entries.size >= MAX_REGISTRATIONS) {
      return rejection({ code: 'capacity-exceeded', message: 'Upstream registry capacity was reached' })
    }

    for (const [upstreamId, entry] of this.entries) {
      if (upstreamId === registration.descriptor.upstreamId) continue
      if (entry.sourceKey === sourceKey) {
        return rejection({
          code: 'conflicting-source',
          field: 'source',
          message: 'Upstream source is already registered',
        })
      }
      if (entry.descriptor.enabled && registration.descriptor.enabled) {
        if (
          (entry.descriptor.prefix ?? entry.descriptor.upstreamId)
            === (registration.descriptor.prefix ?? registration.descriptor.upstreamId)
        ) {
          return rejection({
            code: 'conflicting-prefix',
            field: 'prefix',
            message: 'Gateway prefix is already registered',
          })
        }
        if (
          entry.descriptor.group.groupId === registration.descriptor.group.groupId
          && (
            entry.descriptor.group.displayName !== registration.descriptor.group.displayName
            || entry.descriptor.group.order !== registration.descriptor.group.order
          )
        ) {
          return rejection({ code: 'conflicting-group', field: 'group', message: 'Group metadata is inconsistent' })
        }
      }
    }

    this.entries.set(registration.descriptor.upstreamId, {
      source: registration.source,
      sourceKey,
      producer,
      descriptor: structuredClone(registration.descriptor),
    })
    this.revision += 1
    this.notify()
    return { status: current === undefined ? 'registered' : 'updated', registryRevision: this.revision }
  }

  revoke(
    input: CliProxyUpstreamRevocationV1,
    registryGeneration: string,
    producer: CliProxyUpstreamProducerV1,
  ): CliProxyRegistryMutationResultV1 {
    const generationFailure = this.generationFailure(registryGeneration, producer)
    if (generationFailure !== undefined) return generationFailure
    const current = this.entries.get(input.upstreamId)
    if (current === undefined) {
      return rejection({ code: 'not-found', field: 'upstreamId', message: 'Upstream is not registered' })
    }
    if (current.producer.pluginId !== producer.pluginId) {
      return rejection({
        code: 'conflicting-producer',
        field: 'upstreamId',
        message: 'Upstream is owned by another producer',
      })
    }
    if (current.producer.pluginGeneration !== producer.pluginGeneration) {
      return {
        status: 'stale-generation',
        diagnostic: { code: 'stale-generation', message: 'Upstream producer generation is stale' },
      }
    }
    if (input.expectedRevision !== current.descriptor.revision) {
      return rejection({ code: 'stale-revision', field: 'expectedRevision', message: 'Upstream revision is stale' })
    }
    this.entries.delete(input.upstreamId)
    this.revision += 1
    this.notify()
    return { status: 'revoked', registryRevision: this.revision }
  }

  activateProducer(producer: CliProxyUpstreamProducerV1, registryGeneration: string): void {
    if (this.disposed || registryGeneration !== this.pluginGeneration) {
      throw new Error('Upstream registry generation is stale')
    }
    if (!ID_PATTERN.test(producer.pluginId) || !isText(producer.pluginGeneration, 256)) {
      throw new Error('Invalid upstream producer authority')
    }
    const currentGeneration = this.producerGenerations.get(producer.pluginId)
    if (currentGeneration === producer.pluginGeneration) return
    this.producerGenerations.set(producer.pluginId, producer.pluginGeneration)
    let removed = false
    for (const [upstreamId, entry] of this.entries) {
      if (entry.producer.pluginId !== producer.pluginId) continue
      this.entries.delete(upstreamId)
      removed = true
    }
    if (removed) {
      this.revision += 1
      this.notify()
    }
  }

  disposeProducer(
    producer: CliProxyUpstreamProducerV1,
    registryGeneration: string,
  ): CliProxyRegistryMutationResultV1 {
    const generationFailure = this.generationFailure(registryGeneration, producer)
    if (generationFailure !== undefined) return generationFailure
    this.producerGenerations.delete(producer.pluginId)
    let removed = false
    for (const [upstreamId, entry] of this.entries) {
      if (
        entry.producer.pluginId !== producer.pluginId
        || entry.producer.pluginGeneration !== producer.pluginGeneration
      ) continue
      this.entries.delete(upstreamId)
      removed = true
    }
    if (!removed) return { status: 'unchanged', registryRevision: this.revision }
    this.revision += 1
    this.notify()
    return { status: 'revoked', registryRevision: this.revision }
  }

  subscribe(listener: (revision: number) => void): () => void {
    if (this.disposed) throw new Error('Upstream registry generation is stale')
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  catalog(pluginGeneration: string): CliProxyModelCatalogV1 | CliProxyRegistryDiagnosticV1 {
    if (this.disposed || pluginGeneration !== this.pluginGeneration) {
      return { code: 'stale-generation', message: 'Catalog generation is stale' }
    }
    const active = this.activeEntries()
    const groups = new Map<string, CliProxyModelCatalogGroupV1>()
    for (const entry of active) {
      const descriptor = entry.descriptor
      const groupedModels = new Map<string, CliProxyModelRouteV1[]>()
      for (const route of descriptor.models) {
        if (!route.enabled) continue
        groupedModels.set(route.modelId, [...(groupedModels.get(route.modelId) ?? []), route])
      }
      const prefix = descriptor.prefix ?? descriptor.upstreamId
      const models = [...groupedModels.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
        ([modelId, routes]): CliProxyModelCatalogModelV1 => {
          const first = routes[0]
          return {
            modelId,
            gatewayModelId: `${prefix}/${modelId}`,
            displayName: first.displayName ?? modelId,
            sourceModelIds: routes.map(route => route.sourceModelId).sort(),
            isDefault: first.isDefault,
            inputModalities: normalizedModalities(first.inputModalities),
          }
        },
      )
      const provider: CliProxyModelCatalogProviderV1 = {
        providerId: descriptor.upstreamId,
        displayName: descriptor.displayName,
        prefix,
        wireApi: descriptor.wireApi,
        order: descriptor.order,
        revision: descriptor.revision,
        groupId: descriptor.group.groupId,
        requestTimeoutMs: descriptor.requestTimeoutMs,
        models,
      }
      const existing = groups.get(descriptor.group.groupId)
      groups.set(descriptor.group.groupId, {
        groupId: descriptor.group.groupId,
        displayName: descriptor.group.displayName,
        order: descriptor.group.order,
        providers: [...(existing?.providers ?? []), provider].sort((left, right) =>
          compareOrderThenId({ order: left.order, id: left.providerId }, { order: right.order, id: right.providerId })
        ),
      })
    }
    const orderedGroups = [...groups.values()].sort((left, right) =>
      compareOrderThenId({ order: left.order, id: left.groupId }, { order: right.order, id: right.groupId })
    )
    const base: Omit<CliProxyModelCatalogV1, 'catalogDigest'> = {
      contract: CLI_PROXY_MODEL_CATALOG_CONTRACT_V1,
      schemaVersion: 1,
      pluginGeneration: this.pluginGeneration,
      registryRevision: this.revision,
      upstreamRevisions: Object.fromEntries(
        active.map(entry => [entry.descriptor.upstreamId, entry.descriptor.revision]),
      ),
      groups: orderedGroups,
    }
    return { ...base, catalogDigest: digest(base) }
  }

  gatewayPlan(pluginGeneration: string): CliProxyGatewayPlanV1<Source> | CliProxyRegistryDiagnosticV1 {
    const catalog = this.catalog(pluginGeneration)
    if ('code' in catalog) return catalog
    const active = this.activeEntries()
    const responses: CliProxyGatewayPlanV1<Source>['configuration']['codex-api-key'][number][] = []
    const chat: CliProxyGatewayPlanV1<Source>['configuration']['openai-compatibility'][number][] = []
    const composition: CliProxyGatewayCompositionV1<Source>[] = []
    for (const entry of active) {
      const descriptor = entry.descriptor
      const prefix = descriptor.prefix ?? descriptor.upstreamId
      const routes = descriptor.models.filter(route => route.enabled).sort((left, right) =>
        left.modelId.localeCompare(right.modelId) || left.sourceModelId.localeCompare(right.sourceModelId)
      )
      if (descriptor.wireApi === 'responses') {
        const index = responses.length
        responses.push({
          'api-key': null,
          prefix,
          'base-url': null,
          'request-retry': 0,
          models: routes.map(route => ({
            name: route.sourceModelId,
            alias: route.modelId,
            'display-name': route.displayName ?? route.modelId,
            'force-mapping': true,
          })),
        })
        composition.push({
          upstreamId: descriptor.upstreamId,
          source: entry.source,
          origin: {
            slot: `upstream-${descriptor.upstreamId}-origin`,
            targetPointer: `/codex-api-key/${index}/base-url`,
          },
          authorization: {
            slot: `upstream-${descriptor.upstreamId}-authorization`,
            targetPointer: `/codex-api-key/${index}/api-key`,
          },
        })
        continue
      }
      const index = chat.length
      chat.push({
        name: descriptor.upstreamId,
        disabled: false,
        prefix,
        'base-url': null,
        'api-key-entries': [{ 'api-key': null }],
        'request-retry': 0,
        models: routes.map(route => ({
          name: route.sourceModelId,
          alias: route.modelId,
          'display-name': route.displayName ?? route.modelId,
          'force-mapping': true,
          ...(route.inputModalities === undefined
            ? {}
            : { 'input-modalities': normalizedModalities(route.inputModalities) }),
        })),
      })
      composition.push({
        upstreamId: descriptor.upstreamId,
        source: entry.source,
        origin: {
          slot: `upstream-${descriptor.upstreamId}-origin`,
          targetPointer: `/openai-compatibility/${index}/base-url`,
        },
        authorization: {
          slot: `upstream-${descriptor.upstreamId}-authorization`,
          targetPointer: `/openai-compatibility/${index}/api-key-entries/0/api-key`,
        },
      })
    }
    return {
      contract: CLI_PROXY_GATEWAY_PLAN_CONTRACT_V1,
      schemaVersion: 1,
      pluginGeneration: this.pluginGeneration,
      registryRevision: this.revision,
      catalogDigest: catalog.catalogDigest,
      configuration: {
        'codex-api-key': responses,
        'openai-compatibility': chat,
      },
      composition,
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.entries.clear()
    this.producerGenerations.clear()
    this.listeners.clear()
    this.revision += 1
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.revision)
  }

  private activeEntries(): readonly RegistryEntry<Source>[] {
    return [...this.entries.values()].filter(entry => entry.descriptor.enabled).sort((left, right) =>
      compareOrderThenId(
        { order: left.descriptor.group.order, id: left.descriptor.group.groupId },
        { order: right.descriptor.group.order, id: right.descriptor.group.groupId },
      )
      || compareOrderThenId(
        { order: left.descriptor.order, id: left.descriptor.upstreamId },
        { order: right.descriptor.order, id: right.descriptor.upstreamId },
      )
    )
  }

  private generationFailure(
    registryGeneration: string,
    producer: CliProxyUpstreamProducerV1,
  ):
    | { readonly status: 'stale-generation'; readonly diagnostic: CliProxyRegistryDiagnosticV1 }
    | undefined
  {
    if (
      !this.disposed
      && registryGeneration === this.pluginGeneration
      && this.producerGenerations.get(producer.pluginId) === producer.pluginGeneration
    ) return undefined
    return {
      status: 'stale-generation',
      diagnostic: { code: 'stale-generation', message: 'Upstream producer generation is stale' },
    }
  }
}

export function createCliProxyUpstreamRegistrarV1<Source>(
  registry: CliProxyUpstreamRegistryV1<Source>,
  producer: CliProxyUpstreamProducerV1,
): CliProxyUpstreamRegistrarV1<Source> {
  const authority = Object.freeze({ ...producer })
  registry.activateProducer(authority, registry.pluginGeneration)
  return Object.freeze({
    producer: authority,
    register: (registration: CliProxyUpstreamRegistrationV1<Source>) =>
      registry.register(registration, registry.pluginGeneration, authority),
    revoke: (input: CliProxyUpstreamRevocationV1) => registry.revoke(input, registry.pluginGeneration, authority),
    dispose: () => registry.disposeProducer(authority, registry.pluginGeneration),
  })
}
