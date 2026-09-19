import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const protocolSchemas = process.env.CORDISX_PROTOCOL_ROOT === undefined
  ? new URL('../node_modules/@cordisx/protocol/schemas/', import.meta.url)
  : new URL('schemas/', pathToFileURL(`${resolve(process.env.CORDISX_PROTOCOL_ROOT)}/`))

async function protocolValidator(schemaFile) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
  addFormats(ajv)
  for (const file of await readdir(protocolSchemas)) {
    if (file.endsWith('.schema.json')) {
      ajv.addSchema(JSON.parse(await readFile(new URL(file, protocolSchemas), 'utf8')))
    }
  }
  const schema = JSON.parse(await readFile(new URL(schemaFile, protocolSchemas), 'utf8'))
  return ajv.getSchema(schema.$id)
}

const element = (type, props) => ({ type, props })
const component = props => element('component', props)
const React = new Proxy({
  Fragment: Symbol('Fragment'),
  Suspense: component,
  lazy: () => component,
  useCallback: callback => callback,
  useEffect: () => undefined,
  useMemo: factory => factory(),
  useState: initial => [initial, () => undefined],
}, {
  get(target, property) {
    return Reflect.get(target, property) ?? (() => undefined)
  },
})

globalThis.__cordisxSharedReactRuntime = {
  React,
  defineReactPage: page => page,
  jsxRuntime: { Fragment: React.Fragment, jsx: element, jsxs: element },
  jsxDevRuntime: { Fragment: React.Fragment, jsxDEV: element },
  ui: new Proxy({}, { get: () => component }),
}

const plugin = await import('../dist/runtime/module.js')

async function loadModelProviderRegistry() {
  const hostRoot = process.env.CORDISX_HOST_ROOT
  assert.ok(hostRoot, 'CORDISX_HOST_ROOT is required for the real registry test')
  const result = await build({
    entryPoints: [resolve(hostRoot, 'packages/cli/src/renderer/model-providers.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    write: false,
  })
  const source = Buffer.from(result.outputFiles[0].contents).toString('base64')
  return await import(`data:text/javascript;base64,${source}`)
}

test('bundles the plugin-owned 256px brand PNG for Host plugin lists', async () => {
  const source = await readFile(new URL('../assets/icon.png', import.meta.url))
  assert.equal(plugin.icon.mediaType, 'image/png')
  assert.deepEqual(Buffer.from(plugin.icon.data, 'base64'), source)
  assert.equal(source.readUInt32BE(16), 256)
  assert.equal(source.readUInt32BE(20), 256)
})

test('exports the CLIProxy renderer manifest through public Host contracts', () => {
  assert.equal(plugin.manifest.schemaVersion, 1)
  assert.equal(plugin.manifest.id, 'cli-proxy-api')
  assert.deepEqual(
    plugin.manifest.capabilities.map(item => item.name),
    [
      'models.read',
      'tasks.catalog.read',
      'tasks.content.read',
      'tasks.create',
      'tasks.control',
      'turns.submit',
      'turns.control',
    ],
  )
  assert.deepEqual(plugin.inject, [
    'i18n',
    'slots',
    'pages',
    'routes',
    'managerContent',
    'platform',
    'modelProviders',
    'notifications',
  ])
})

test('registers CLIProxyAPI branding and Manager settings without a Provider sessions navigation entry', async () => {
  const registrations = {
    effects: [],
    locales: [],
    managerContent: [],
    modelProviderEntries: [],
    modelProviderPresentations: [],
    navigations: [],
    pages: [],
    routes: [],
    slots: [],
  }
  let providerListener = () => undefined
  const contribution = (kind, input) => {
    const record = { kind, input, disposed: false }
    registrations[kind].push(record)
    return { dispose: () => record.disposed = true }
  }
  const context = {
    effect(execute) {
      const cleanup = execute()
      registrations.effects.push(cleanup)
      return cleanup
    },
    reflect: { get: name => name === 'managedServices' ? context.managedServices : undefined },
    i18n: { define: definition => registrations.locales.push(definition) },
    pages: { register: (...args) => registrations.pages.push(args) },
    routes: {
      register: definition => registrations.routes.push(definition),
      navigate: reference => registrations.navigations.push(reference),
    },
    slots: { register: (...args) => registrations.slots.push(args) },
    managerContent: { register: definition => registrations.managerContent.push(definition) },
    modelProviders: {
      list: () => [],
      subscribe(listener) {
        providerListener = listener
        return () => providerListener = () => undefined
      },
      refresh: async () => undefined,
      present: input => contribution('modelProviderPresentations', input),
      insert: input => contribution('modelProviderEntries', input),
    },
    managedServices: { get: async () => ({ status: 'unavailable', code: 'owner-unavailable', message: 'test' }) },
    notifications: { show: () => ({ dismiss: () => undefined }) },
    platform: {
      models: { list: async () => ({ ok: true, value: { models: [] } }) },
      tasks: {
        list: async () => ({ ok: true, value: { sessions: [] } }),
        read: async () => ({ ok: false, error: { message: 'unavailable' } }),
        create: async () => ({ ok: false, error: { message: 'unavailable' } }),
        control: async () => ({ ok: false, error: { message: 'unavailable' } }),
      },
      turns: {
        submit: async () => ({ ok: false, error: { message: 'unavailable' } }),
        control: async () => ({ ok: false, error: { message: 'unavailable' } }),
      },
    },
  }

  plugin.apply(context, plugin.Config({}))

  assert.equal(registrations.locales.length, 2)
  assert.equal(registrations.pages.length, 1)
  assert.equal(registrations.pages[0][0].id, 'providers.upstream-subscriptions')
  assert.equal(registrations.pages[0][0].icon, 'host:key')
  assert.equal(registrations.pages[0][0].chrome, 'standard')
  assert.equal(registrations.routes.length, 1)
  assert.equal(registrations.routes[0].path, '/manager/extensions/cli-proxy-api/subscriptions')
  assert.equal(registrations.routes[0].outlet, 'manager.content')
  assert.equal(registrations.managerContent.length, 1)
  assert.equal(registrations.managerContent[0].route.id, 'providers.upstream-subscriptions')
  assert.equal(registrations.slots.length, 1)
  assert.equal(registrations.slots[0][0].name, 'manager.settings.navigation-items')
  assert.equal(registrations.slots[0][0].schemaVersion, 11)
  assert.equal(
    registrations.slots[0][0].$schema,
    'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/surface-contribution.v11.schema.json',
  )
  assert.equal(registrations.slots[0][1].navigationGroup.id, 'external-accounts')
  assert.equal(registrations.pages.some(([metadata]) => metadata.id === 'providers.sessions'), false)
  assert.equal(registrations.routes.some(route => route.id === 'providers.sessions'), false)
  assert.equal(registrations.slots.some(([metadata]) => metadata.name === 'sidebar.navigation.items'), false)
  assert.deepEqual(registrations.modelProviderPresentations[0].input, {
    providerId: 'cli-proxy-api',
    title: 'CLIProxyAPI',
    icon: {
      kind: 'raster-image',
      image: {
        $schema:
          'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/raster-image-snapshot.v1.schema.json',
        contract: 'cordisx.raster-image-snapshot/v1',
        schemaVersion: 1,
        mediaType: plugin.icon.mediaType,
        encoding: 'base64',
        data: plugin.icon.data,
        width: 256,
        height: 256,
      },
    },
  })
  assert.equal(registrations.modelProviderEntries.length, 1)
  assert.equal(registrations.modelProviderEntries[0].input.label, 'CLIProxyAPI')
  assert.equal(registrations.modelProviderEntries[0].input.action.label, 'Open settings')
  assert.equal(registrations.modelProviderEntries[0].input.action.icon, 'host:settings')
  await registrations.modelProviderEntries[0].input.action.run(new AbortController().signal)
  assert.deepEqual(registrations.navigations, [{ id: 'providers.upstream-subscriptions' }])

  context.modelProviders.list = () => [{ providerId: 'cli-proxy-api' }]
  providerListener()
  assert.equal(registrations.modelProviderEntries[0].disposed, true)

  await registrations.effects[0]()
  assert.equal(registrations.modelProviderPresentations[0].disposed, true)
})

test('external account Manager navigation conforms to v11 while v9 stays closed', async () => {
  const document = {
    $schema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/surface-contribution.v11.schema.json',
    schemaVersion: 11,
    id: 'upstream-subscriptions',
    surface: 'manager.settings.navigation-items',
    group: 'after-settings',
    order: 120,
    item: {
      route: { id: 'providers.upstream-subscriptions' },
      navigationGroup: { id: 'external-accounts' },
    },
  }
  const validateV11 = await protocolValidator('surface-contribution.v11.schema.json')
  assert.equal(validateV11(document), true, JSON.stringify(validateV11.errors))

  const validateV9 = await protocolValidator('surface-contribution.v9.schema.json')
  assert.equal(
    validateV9({
      ...document,
      $schema:
        'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/surface-contribution.v9.schema.json',
      schemaVersion: 9,
    }),
    false,
    'v9 must reject the external-accounts group',
  )
})

test('reconciles the settings fallback through synchronous ModelProviderRegistry emissions', {
  skip: process.env.CORDISX_HOST_ROOT === undefined,
}, async () => {
  const { ModelProviderRegistry } = await loadModelProviderRegistry()
  let nativeProviders = []
  const registry = new ModelProviderRegistry(async () => nativeProviders)
  const binding = registry.bind('cli-proxy-api', 'test-generation', () => true)
  const cleanups = []
  const navigations = []
  const context = {
    effect(execute) {
      cleanups.push(execute())
    },
    reflect: { get: name => name === 'managedServices' ? context.managedServices : undefined },
    i18n: { define: () => undefined },
    pages: { register: () => undefined },
    routes: {
      register: () => undefined,
      navigate: async reference => navigations.push(reference),
    },
    slots: { register: () => undefined },
    managerContent: { register: () => undefined },
    modelProviders: binding.facade,
    managedServices: { get: async () => ({ status: 'unavailable', code: 'owner-unavailable', message: 'test' }) },
    notifications: { show: () => ({ dismiss: () => undefined }) },
    platform: {
      models: { list: async () => ({ ok: true, value: { models: [] } }) },
      tasks: {
        list: async () => ({ ok: true, value: { sessions: [] } }),
        read: async () => ({ ok: false, error: { message: 'unavailable' } }),
        create: async () => ({ ok: false, error: { message: 'unavailable' } }),
        control: async () => ({ ok: false, error: { message: 'unavailable' } }),
      },
      turns: {
        submit: async () => ({ ok: false, error: { message: 'unavailable' } }),
        control: async () => ({ ok: false, error: { message: 'unavailable' } }),
      },
    },
  }

  plugin.apply(context, plugin.Config({}))
  await binding.facade.refresh()
  assert.equal(registry.snapshot().entries.length, 1)
  assert.equal(registry.snapshot().entries[0].entry.action.icon, 'host:settings')

  nativeProviders = [{
    providerId: 'cli-proxy-api',
    pluginId: 'cli-proxy-api',
    models: [{ id: 'shared-model', label: 'Shared Model', aliases: ['shared-model'] }],
    defaultModelId: 'shared-model',
  }]
  await binding.facade.refresh()
  assert.equal(registry.snapshot().entries.length, 0)
  assert.equal(registry.snapshot().providers[0].title, 'CLIProxyAPI')

  nativeProviders = []
  await binding.facade.refresh()
  assert.equal(registry.snapshot().entries.length, 1)
  await registry.snapshot().entries[0].entry.action.run(new AbortController().signal)
  assert.deepEqual(navigations, [{ id: 'providers.upstream-subscriptions' }])

  for (const cleanup of cleanups.reverse()) await cleanup()
  binding.dispose()
  registry.dispose()
})

test('keeps the renderer plugin active when managed services are unavailable', () => {
  const registrations = { effects: 0, pages: 0, routes: 0, slots: 0 }
  const context = {
    effect(execute) {
      registrations.effects += 1
      return execute()
    },
    reflect: { get: () => undefined },
    i18n: { define: () => undefined },
    pages: { register: () => registrations.pages += 1 },
    routes: { register: () => registrations.routes += 1, navigate: async () => undefined },
    slots: { register: () => registrations.slots += 1 },
    managerContent: { register: () => undefined },
    modelProviders: {
      list: () => [],
      subscribe: () => () => undefined,
      refresh: async () => undefined,
      present: () => ({ dispose: () => undefined }),
      insert: () => ({ dispose: () => undefined }),
    },
    notifications: { show: () => ({ dismiss: () => undefined }) },
    platform: {
      models: { list: async () => ({ ok: true, value: { models: [] } }) },
      tasks: {
        list: async () => ({ ok: true, value: { sessions: [] } }),
        read: async () => ({ ok: false, error: { message: 'unavailable' } }),
        create: async () => ({ ok: false, error: { message: 'unavailable' } }),
        control: async () => ({ ok: false, error: { message: 'unavailable' } }),
      },
      turns: {
        submit: async () => ({ ok: false, error: { message: 'unavailable' } }),
        control: async () => ({ ok: false, error: { message: 'unavailable' } }),
      },
    },
  }

  assert.doesNotThrow(() => plugin.apply(context, plugin.Config({})))
  assert.deepEqual(registrations, { effects: 1, pages: 1, routes: 1, slots: 1 })
})
