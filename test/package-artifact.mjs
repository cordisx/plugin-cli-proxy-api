import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'
import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const execFileAsync = promisify(execFile)
const schemas = process.env.CORDISX_PROTOCOL_ROOT === undefined
  ? new URL('../node_modules/@cordisx/protocol/schemas/', import.meta.url)
  : new URL('schemas/', pathToFileURL(`${resolve(process.env.CORDISX_PROTOCOL_ROOT)}/`))
const gatewayRuntimeResources = [
  {
    path: './config/cli-proxy-api.yaml',
    mode: 'data',
    digest: 'sha256:4e2806a2c9a4a490f8685ffc96cf1dc40010248a8d25437b718249f3275b198e',
    byteLength: 268,
  },
  {
    path: './schemas/cli-proxy-gateway-model-catalog.v1.schema.json',
    mode: 'data',
    digest: 'sha256:b20bf7d388ae1417eaa1e86186eab241c754fc54af3c3b4d5439308202194b30',
    byteLength: 639,
  },
  {
    path: './schemas/cli-proxy-gateway-codex-upstream.v1.schema.json',
    mode: 'data',
    digest: 'sha256:a9908de439af944ac24744721c117fd0c0a18c18e61355d343f8ad57311fafba',
    byteLength: 1253,
  },
  {
    path: './schemas/cli-proxy-gateway-openai-upstream.v1.schema.json',
    mode: 'data',
    digest: 'sha256:8f226eeaf778394f452c0c224bd163c1c68806f56c63982d0394c03d6be4483b',
    byteLength: 1925,
  },
  {
    path: './schemas/cli-proxy-management-auth-files.v1.schema.json',
    mode: 'data',
    digest: 'sha256:9785b09906567848143054d522b141f5f06234f7b16a8dc2a02ef31e6d58e76c',
    byteLength: 370,
  },
  {
    path: './schemas/cli-proxy-management-operation.v1.schema.json',
    mode: 'data',
    digest: 'sha256:c1a9e12cf48ee53825948b053ea364ce70d09122321502560defebeb3d8d0c12',
    byteLength: 218,
  },
]

const gatewayConsumerOperations = [
  'gateway.models.list',
  'gateway.management.accounts.list',
  'gateway.management.accounts.toggle',
  'gateway.management.oauth.anthropic.start',
  'gateway.management.oauth.codex.start',
  'gateway.management.oauth.antigravity.start',
  'gateway.management.oauth.kimi.start',
  'gateway.management.oauth.xai.start',
  'gateway.management.oauth.poll',
  'gateway.management.oauth.cancel',
]

async function validator(name) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
  addFormats(ajv)
  for (const file of await readdir(schemas)) {
    if (file.endsWith('.schema.json')) ajv.addSchema(JSON.parse(await readFile(new URL(file, schemas), 'utf8')))
  }
  const schema = JSON.parse(await readFile(new URL(name, schemas), 'utf8'))
  return ajv.getSchema(schema.$id)
}

test('publishes schema-valid v14 package and runtime manifests with exact request scopes', async () => {
  const [packageText, runtimeText] = await Promise.all([
    readFile(new URL('../cordisx-package.json', import.meta.url), 'utf8'),
    readFile(new URL('../runtime-manifest.json', import.meta.url), 'utf8'),
  ])
  const packageManifest = JSON.parse(packageText)
  const runtimeManifest = JSON.parse(runtimeText)
  const [validatePackage, validateRuntime] = await Promise.all([
    validator('plugin-package.v14.schema.json'),
    validator('plugin-manifest.v14.schema.json'),
  ])
  assert.equal(validatePackage(packageManifest), true, JSON.stringify(validatePackage.errors))
  assert.equal(validateRuntime(runtimeManifest), true, JSON.stringify(validateRuntime.errors))
  const runtimeExact = new Set([
    'tasks.content.read',
    'tasks.create',
    'tasks.control',
    'turns.submit',
    'turns.control',
  ])
  for (const capability of runtimeManifest.capabilities) {
    assert.deepEqual(capability.scope, runtimeExact.has(capability.name) ? { runtime: 'exact-request' } : {})
  }
  assert.equal(
    packageManifest.runtimeManifest.digest,
    `sha256:${createHash('sha256').update(runtimeText).digest('hex')}`,
  )
  await readFile(new URL(`..${packageManifest.entry.slice(1)}`, import.meta.url))
  for (const service of runtimeManifest.services) {
    await readFile(new URL(`..${service.entry.slice(1)}`, import.meta.url))
  }
  assert.deepEqual(runtimeManifest.services[1], {
    id: 'gateway-runtime',
    kind: 'managed-backend',
    owner: 'host',
    entry: './dist/gateway.mjs',
    definitionSchema:
      'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-definition.v1.schema.json',
    runtimeResources: gatewayRuntimeResources,
    consumerGrants: [{ pluginId: 'cli-proxy-api', operations: gatewayConsumerOperations }],
  })
  for (const resource of runtimeManifest.services[1].runtimeResources) {
    const bytes = await readFile(new URL(`../${resource.path.slice(2)}`, import.meta.url))
    assert.equal(resource.mode, 'data')
    assert.equal(resource.byteLength, bytes.byteLength)
    assert.equal(resource.digest, `sha256:${createHash('sha256').update(bytes).digest('hex')}`)
  }
})

test('packs gateway runtime data resources into the tarball', async () => {
  const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  const { stdout } = await execFileAsync('npm', ['pack', '--json', '--ignore-scripts'], {
    cwd: new URL('..', import.meta.url),
  })
  const [{ files }] = JSON.parse(stdout)
  const archiveFiles = new Set(files.map(file => file.path))
  for (const resource of gatewayRuntimeResources) {
    const path = resource.path.slice(2)
    assert.equal(archiveFiles.has(path), true, `tarball is missing ${path}`)
    assert.equal(
      packageManifest.files.some(entry => {
        const normalized = entry.replace(/^\.\//, '').replace(/\/$/, '')
        return path === normalized || path.startsWith(`${normalized}/`)
      }),
      true,
      `package.json files does not include ${path}`,
    )
  }
})

test('publishes the versioned upstream registration entrypoint', async () => {
  const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(packageManifest.exports['./upstream/v1'], {
    types: './dist/types/service/upstream-registry.d.ts',
    import: './dist/service.mjs',
    default: './dist/service.mjs',
  })
  const upstream = await import('@cordisx/plugin-cli-proxy-api/upstream/v1')
  assert.equal(upstream.CLI_PROXY_UPSTREAM_REGISTRY_SERVICE_V1, 'cliProxyUpstreams')
  assert.equal(typeof upstream.CliProxyUpstreamRegistryV1, 'function')
})

test('publishes the managed gateway Node module and public Protocol context ABI', async () => {
  const packageManifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.deepEqual(packageManifest.exports['./gateway/v1'], {
    types: './dist/types/service/gateway.d.ts',
    import: './dist/gateway.mjs',
    default: './dist/gateway.mjs',
  })
  const gateway = await import('@cordisx/plugin-cli-proxy-api/gateway/v1')
  assert.equal(gateway.contextServices[0].service, 'cliProxyUpstreams')
  assert.deepEqual(gateway.apply.inject, ['managedServices', 'cliProxyUpstreams'])
})

test('publishes a schema-valid managed gateway definition', async () => {
  const validateDefinition = await validator('managed-service-definition.v1.schema.json')
  const gateway = await import('@cordisx/plugin-cli-proxy-api/gateway/v1')
  assert.equal(
    validateDefinition(gateway.cliProxyGatewayDefinition),
    true,
    JSON.stringify(validateDefinition.errors),
  )
})
