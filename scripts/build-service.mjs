import { mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

await mkdir(new URL('../dist/', import.meta.url), { recursive: true })
await build({
  entryPoints: {
    service: new URL('../src/service/index.ts', import.meta.url).pathname,
    gateway: new URL('../src/service/gateway.ts', import.meta.url).pathname,
  },
  outdir: new URL('../dist/', import.meta.url).pathname,
  outExtension: { '.js': '.mjs' },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  sourcemap: false,
  legalComments: 'none',
})
