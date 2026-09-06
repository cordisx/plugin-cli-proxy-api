import { fileURLToPath } from 'node:url'
import { cordisXPluginViteConfig } from 'cordisx/vite'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default cordisXPluginViteConfig({
  root: projectRoot,
  entry: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
  outDir: fileURLToPath(new URL('./dist/runtime', import.meta.url)),
  entryFileName: 'module.js',
})
