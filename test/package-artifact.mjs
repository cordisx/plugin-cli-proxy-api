import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import test from 'node:test'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const schemas = new URL('../node_modules/@cordisx/protocol/schemas/', import.meta.url)
async function validator(name) {
  const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true })
  addFormats(ajv)
  for (const file of await readdir(schemas)) {
    if (file.endsWith('.schema.json')) ajv.addSchema(JSON.parse(await readFile(new URL(file, schemas), 'utf8')))
  }
  const schema = JSON.parse(await readFile(new URL(name, schemas), 'utf8'))
  return ajv.getSchema(schema.$id)
}

test('publishes schema-valid v9 package and runtime manifests with an exact digest', async () => {
  const [packageText, runtimeText] = await Promise.all([
    readFile(new URL('../cordisx-package.json', import.meta.url), 'utf8'),
    readFile(new URL('../runtime-manifest.json', import.meta.url), 'utf8'),
  ])
  const packageManifest = JSON.parse(packageText)
  const runtimeManifest = JSON.parse(runtimeText)
  const [validatePackage, validateRuntime] = await Promise.all([
    validator('plugin-package.v9.schema.json'),
    validator('plugin-manifest.v9.schema.json'),
  ])
  assert.equal(validatePackage(packageManifest), true, JSON.stringify(validatePackage.errors))
  assert.equal(validateRuntime(runtimeManifest), true, JSON.stringify(validateRuntime.errors))
  assert.equal(
    packageManifest.runtimeManifest.digest,
    `sha256:${createHash('sha256').update(runtimeText).digest('hex')}`,
  )
  await readFile(new URL(`..${packageManifest.entry.slice(1)}`, import.meta.url))
  await readFile(new URL(`..${runtimeManifest.services[0].entry.slice(1)}`, import.meta.url))
})
