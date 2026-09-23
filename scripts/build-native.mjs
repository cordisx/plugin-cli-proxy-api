import { execFile } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const execFileAsync = promisify(execFile)
const root = fileURLToPath(new URL('../', import.meta.url))
const source = path.join(root, 'native/gateway-bridge')
const extension = process.platform === 'darwin' ? '.dylib' : process.platform === 'win32' ? '.dll' : '.so'
const directory = path.join(root, 'runtime/cli-proxy-plugins', process.platform, process.arch)
const output = path.join(directory, `cordisx-gateway-bridge${extension}`)

if (!['darwin', 'linux', 'win32'].includes(process.platform) || !['arm64', 'x64'].includes(process.arch)) {
  throw new Error(`Unsupported native gateway bridge target ${process.platform}/${process.arch}`)
}

await mkdir(directory, { recursive: true })
await execFileAsync('go', ['build', '-buildmode=c-shared', '-trimpath', '-o', output, '.'], {
  cwd: source,
  env: { ...process.env, CGO_ENABLED: '1' },
})
await rm(output.replace(new RegExp(`${extension.replace('.', '\\.')}$$`), '.h'), { force: true })
