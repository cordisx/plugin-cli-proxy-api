import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return (await Promise.all(entries.map(async entry => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? await sourceFiles(file) : [file]
  }))).flat()
}

test('renderer source imports only public CordisX package boundaries', async () => {
  const files = (await sourceFiles(fileURLToPath(new URL('../src', import.meta.url))))
    .filter(file => /\.(?:ts|tsx)$/.test(file))
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    assert.doesNotMatch(source, /from ['"]\.\.\//, `${file} imports outside the plugin source root`)
    assert.doesNotMatch(
      source,
      /packages\/cli\/src|service-config|app-server|secret-store/,
      `${file} imports Host-private code`,
    )
  }
})
