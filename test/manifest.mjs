import assert from 'node:assert/strict'
import test from 'node:test'

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
  assert.deepEqual(plugin.inject, ['i18n', 'slots', 'pages', 'routes', 'platform', 'notifications'])
})

test('registers one public page, route, and navigation contribution', () => {
  const registrations = { locales: [], pages: [], routes: [], slots: [] }
  const context = {
    i18n: { define: definition => registrations.locales.push(definition) },
    pages: { register: (...args) => registrations.pages.push(args) },
    routes: { register: definition => registrations.routes.push(definition) },
    slots: { register: (...args) => registrations.slots.push(args) },
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
  assert.equal(registrations.pages[0][0].id, 'providers.sessions')
  assert.equal(registrations.routes.length, 1)
  assert.equal(registrations.routes[0].path, '/main/providers/sessions')
  assert.equal(registrations.slots.length, 1)
  assert.equal(registrations.slots[0][0].name, 'sidebar.navigation.items')

  const Page = registrations.pages[0][1]
  const rendered = Page({ t: (key, params) => `${key}${params === undefined ? '' : JSON.stringify(params)}` })
  assert.equal(rendered.props.className, 'cxp-fleet')
  assert.equal(rendered.props['data-cordisx-provider-fleet'], 'true')
})
