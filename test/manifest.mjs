import assert from 'node:assert/strict'
import test from 'node:test'
import { apply, inject, manifest } from '../dist/runtime/module.js'

test('exports a minimal CordisX plugin module', () => {
  assert.equal(manifest.schemaVersion, 1)
  assert.equal(manifest.id, 'cli-proxy-api')
  assert.deepEqual(manifest.capabilities, [])
  assert.deepEqual(inject, [])
  assert.equal(typeof apply, 'function')
})
