import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

await mkdir(new URL('../dist/', import.meta.url), { recursive: true })
await build({
  entryPoints: [new URL('../src/service/index.ts', import.meta.url).pathname],
  outfile: new URL('../dist/service.mjs', import.meta.url).pathname,
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
})
