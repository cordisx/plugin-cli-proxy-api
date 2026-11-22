import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const built = await build({
  entryPoints: [new URL('../src/managed-account-read.ts', import.meta.url).pathname],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
})
const { hasManagedAccountReader, readManagedAccounts } = await import(
  `data:text/javascript;base64,${Buffer.from(built.outputFiles[0].contents).toString('base64')}`
)

test('independent account reads take precedence without enabling mutations', async () => {
  const result = { status: 'available', accounts: { accounts: [{ accountId: 'one' }] } }
  let legacyCalls = 0
  const service = {
    async readAccounts() {
      return result
    },
    accountControl: {
      async readAccounts() {
        legacyCalls++
        return undefined
      },
    },
  }
  assert.equal(hasManagedAccountReader(service), true)
  assert.equal(await readManagedAccounts(service), result)
  assert.equal(legacyCalls, 0)
})

test('older Hosts can still read through account control', async () => {
  const control = {
    value: { status: 'available', accounts: { accounts: [] } },
    async readAccounts() {
      return this.value
    },
  }
  const service = { accountControl: control }
  assert.equal(hasManagedAccountReader(service), true)
  assert.equal(await readManagedAccounts(service), control.value)
  assert.equal(hasManagedAccountReader({}), false)
  assert.equal(await readManagedAccounts({}), undefined)
})

test('an unavailable or failed independent read does not fall back to account control', async () => {
  let legacyCalls = 0
  const unavailable = { status: 'unavailable', code: 'owner-unavailable' }
  const service = {
    async readAccounts() {
      return unavailable
    },
    accountControl: {
      async readAccounts() {
        legacyCalls++
      },
    },
  }
  assert.equal(await readManagedAccounts(service), unavailable)
  service.readAccounts = async () => {
    throw new Error('owner unavailable')
  }
  await assert.rejects(readManagedAccounts(service), /owner unavailable/)
  assert.equal(legacyCalls, 0)
})
