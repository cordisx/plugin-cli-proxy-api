import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('production graph retains the plugin-owned stylesheet', async () => {
  const artifact = JSON.parse(await readFile(new URL('../dist/runtime/artifact.json', import.meta.url), 'utf8'))
  assert.equal(artifact.contract, 'cordisx.plugin-generation-artifact/v1')
  assert.equal(artifact.entry, './module.js')
  assert.equal(artifact.initialStyles.length, 1)
  assert.deepEqual(artifact.sharedImports, [
    'cordisx/contracts',
    'cordisx/react',
    'cordisx/react/jsx-runtime',
    'cordisx/ui',
  ])

  const stylesheet = await readFile(new URL(`../dist/runtime/${artifact.initialStyles[0]}`, import.meta.url), 'utf8')
  assert.match(stylesheet, /\.cxp-fleet/)
  assert.match(stylesheet, /\.cxp-toolbar-action/)
  assert.doesNotMatch(stylesheet, /\.cxr-|\.cxm-/)
})
