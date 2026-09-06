import { CORDISX_PLUGIN_MANIFEST_SCHEMA_V1, type CordisXPluginManifestV1 } from 'cordisx/contracts'

export const name = 'cli-proxy-api'
export const inject: readonly string[] = []

export const manifest = {
  $schema: CORDISX_PLUGIN_MANIFEST_SCHEMA_V1,
  schemaVersion: 1,
  id: 'cli-proxy-api',
  name: 'CLIProxy Providers',
  capabilities: [],
} satisfies CordisXPluginManifestV1

/** The public main branch is an inert migration scaffold until the external plugin is admitted. */
export function apply(): void {}
