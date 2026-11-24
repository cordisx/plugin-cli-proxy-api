import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const root = process.argv[2]
if (!root || !path.isAbsolute(root)) throw new Error('provide an absolute extracted package path')
const digest = bytes => 'sha256:' + createHash('sha256').update(bytes).digest('hex')
const [packageText, runtimeText] = await Promise.all([
  readFile(path.join(root, 'cordisx-package.json')),
  readFile(path.join(root, 'runtime-manifest.json')),
])
const packageManifest = JSON.parse(packageText)
const runtimeManifest = JSON.parse(runtimeText)
assert.equal(packageManifest.runtimeManifest.digest, digest(runtimeText))
const resources = runtimeManifest.services.find(service => service.id === 'gateway-runtime')?.runtimeResources
assert.ok(Array.isArray(resources), 'gateway runtime resources are missing')
for (
  const [platform, nativeArchitecture, architecture, extension] of [
    ['darwin', 'arm64', 'arm64', 'dylib'],
    ['linux', 'amd64', 'x64', 'so'],
  ]
) {
  const relative = './runtime/cli-proxy-plugins/' + platform + '/' + nativeArchitecture + '/cordisx-gateway-bridge.'
    + extension
  const resource = resources.find(item => item.path === relative)
  assert.ok(resource, 'missing ' + platform + '/' + architecture + ' bridge declaration')
  assert.equal(resource.mode, 'executable')
  assert.deepEqual(resource.platforms, [platform])
  assert.deepEqual(resource.architectures, [architecture])
}
for (const resource of resources) {
  assert.ok(resource.path.startsWith('./') && !resource.path.split('/').includes('..'))
  const bytes = await readFile(path.join(root, resource.path))
  assert.equal(resource.byteLength, bytes.byteLength, resource.path)
  assert.equal(resource.digest, digest(bytes), resource.path)
}
