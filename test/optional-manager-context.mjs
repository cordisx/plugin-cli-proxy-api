import assert from 'node:assert/strict'
import test from 'node:test'
import { Context, Service } from '@deepseek-ai/cordis'

const element = (type, props) => ({ type, props })
const component = props => element('component', props)
const React = new Proxy({
  Fragment: Symbol('Fragment'),
  Suspense: component,
  lazy: () => component,
  useCallback: callback => callback,
  useEffect: () => undefined,
  useMemo: factory => factory(),
  useRef: initial => ({ current: initial }),
  useState: initial => [initial === true ? false : initial, () => undefined],
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

function createServicePlugin(name, value) {
  return class extends Service {
    constructor(ctx) {
      super(ctx, name)
      Object.assign(this, value)
    }
  }
}

async function createHost({ manager } = {}) {
  const root = new Context()
  const pages = []
  const serviceFibers = []
  const services = {
    i18n: { define: () => undefined },
    slots: { register: () => undefined },
    pages: { register: (...args) => pages.push(args) },
    routes: { register: () => undefined, navigate: async () => undefined },
    managerContent: { register: () => undefined },
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
    modelProviders: {
      list: () => [],
      subscribe: () => () => undefined,
      refresh: async () => undefined,
      present: () => ({ dispose: () => undefined }),
      insert: () => ({ dispose: () => undefined }),
    },
    notifications: { show: () => ({ dismiss: () => undefined }) },
  }

  for (const [name, value] of Object.entries(services)) {
    serviceFibers.push(await root.plugin(createServicePlugin(name, value)))
  }
  if (manager !== undefined) {
    serviceFibers.push(await root.plugin(manager))
  }

  return { root, pages, serviceFibers }
}

function findProp(value, name) {
  if (value === null || typeof value !== 'object') return undefined
  if (Object.hasOwn(value, name)) return value[name]
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const result = findProp(child, name)
    if (result !== undefined) return result
  }
}

async function disposeFibers(...fibers) {
  for (const fiber of fibers.reverse()) await fiber.dispose()
}

test('real Cordis context activates with optional manager and preserves the plugin caller', async () => {
  const callers = []
  class ManagerService extends Service {
    constructor(ctx) {
      super(ctx, 'manager')
    }

    async openOwnPluginConfiguration() {
      callers.push(this.ctx.fiber.name)
      return 'opened'
    }
  }

  const host = await createHost({ manager: ManagerService })
  const pluginFiber = await host.root.plugin(plugin, plugin.Config({}))
  try {
    const registration = host.pages.find(([metadata]) => metadata.id === 'providers.upstream-subscriptions')
    assert.ok(registration, 'upstream subscription page should register')
    const rendered = registration[1]({ t: key => key })
    const action = findProp(rendered, 'action')
    assert.equal(typeof action?.props?.onClick, 'function')
    action.props.onClick()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual(callers, ['cli-proxy-api'])
  } finally {
    await disposeFibers(...host.serviceFibers, pluginFiber)
  }
})

test('real Cordis context activates without manager and keeps the unavailable downgrade', async () => {
  const host = await createHost()
  const pluginFiber = await host.root.plugin(plugin, plugin.Config({}))
  try {
    const registration = host.pages.find(([metadata]) => metadata.id === 'providers.upstream-subscriptions')
    assert.ok(registration, 'upstream subscription page should register')
    const rendered = registration[1]({ t: key => key })
    assert.equal(findProp(rendered, 'action'), undefined)
  } finally {
    await disposeFibers(...host.serviceFibers, pluginFiber)
  }
})
