import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'

const runtime = await readFile(new URL('../runtime-manifest.json', import.meta.url))
const file = new URL('../cordisx-package.json', import.meta.url)
const manifest = JSON.parse(await readFile(file, 'utf8'))
manifest.runtimeManifest.digest = `sha256:${createHash('sha256').update(runtime).digest('hex')}`
await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`)
