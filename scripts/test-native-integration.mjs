import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const source = process.env.CLIPROXY_SOURCE ?? '/private/tmp/cliproxy-src'
const fixture = path.join(root, 'test/native-gateway-bridge')
const work = path.join(root, '.cache/native-gateway-bridge')

await rm(work, { recursive: true, force: true })
await mkdir(work, { recursive: true })
await Promise.all([
  copyFile(path.join(fixture, 'gateway_bridge_test.go'), path.join(work, 'gateway_bridge_test.go')),
  copyFile(path.join(fixture, 'go.mod'), path.join(work, 'go.mod')),
])
const moduleText = await readFile(path.join(work, 'go.mod'), 'utf8')
await writeFile(
  path.join(work, 'go.mod'),
  `${moduleText.trimEnd()}\n\nreplace github.com/router-for-me/CLIProxyAPI/v7 => ${source}\n`,
)
await execFileAsync('go', ['test', '-mod=mod', '-count=1', '-timeout', '90s', '-v', '.'], {
  cwd: work,
  env: {
    ...process.env,
    CORDISX_GATEWAY_REPO: root,
  },
  maxBuffer: 16 * 1024 * 1024,
})
