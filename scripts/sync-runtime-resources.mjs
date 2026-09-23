import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const runtimeManifestPath = path.join(root, 'runtime-manifest.json')
const runtimeManifest = JSON.parse(await readFile(runtimeManifestPath, 'utf8'))
const gateway = runtimeManifest.services.find(service => service.id === 'gateway-runtime')
if (gateway === undefined) throw new Error('gateway-runtime service is missing')

const dataPaths = [
  './config/cli-proxy-api.yaml',
  './schemas/cli-proxy-gateway-model-catalog.v1.schema.json',
  './schemas/cli-proxy-gateway-codex-upstream.v1.schema.json',
  './schemas/cli-proxy-gateway-openai-upstream.v1.schema.json',
  './schemas/cli-proxy-gateway-adapter.v1.schema.json',
  './schemas/cli-proxy-gateway-connection.v1.schema.json',
  './schemas/cli-proxy-gateway-extension-plan.v1.schema.json',
  './schemas/cli-proxy-management-auth-files.v1.schema.json',
  './schemas/cli-proxy-management-operation.v1.schema.json',
]

const resources = []
for (const relative of dataPaths) resources.push(await declaration(relative, 'data'))
const nativeRoot = path.join(root, 'runtime/cli-proxy-plugins')
for (const platform of await readdir(nativeRoot).catch(() => [])) {
  for (const architecture of await readdir(path.join(nativeRoot, platform)).catch(() => [])) {
    const directory = path.join(nativeRoot, platform, architecture)
    for (const file of await readdir(directory)) {
      if (!/^cordisx-gateway-bridge(?:\.dylib|\.so|\.dll)$/.test(file)) continue
      resources.push({
        ...await declaration(`./runtime/cli-proxy-plugins/${platform}/${architecture}/${file}`, 'executable'),
        platforms: [platform],
        architectures: [architecture],
      })
    }
  }
}
gateway.runtimeResources = resources
await writeFile(runtimeManifestPath, `${JSON.stringify(runtimeManifest, null, 2)}\n`)

async function declaration(relative, mode) {
  const bytes = await readFile(path.join(root, relative.slice(2)))
  return {
    path: relative,
    mode,
    digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    byteLength: bytes.byteLength,
  }
}
