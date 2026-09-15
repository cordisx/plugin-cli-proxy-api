import type { Context } from '@deepseek-ai/cordis'

export type PluginConfigurationOpenOutcome =
  | { readonly status: 'opened' }
  | { readonly status: 'unavailable' }
  | { readonly status: 'failed'; readonly message: string }

export async function requestOwnPluginConfiguration(
  manager: Context['manager'] | undefined,
): Promise<PluginConfigurationOpenOutcome> {
  if (manager === undefined) return { status: 'unavailable' }
  try {
    return { status: await manager.openOwnPluginConfiguration() }
  } catch (err) {
    return { status: 'failed', message: err instanceof Error ? err.message : 'Unknown error' }
  }
}
