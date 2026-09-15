import { createHash } from 'node:crypto'
import type { ManagedServiceDefinitionV1 } from '@cordisx/protocol/managed-service-runtime/v1'

export const CLI_PROXY_GATEWAY_MODEL_CATALOG_SCHEMA_V1 =
  'https://raw.githubusercontent.com/cordisx/plugin-cli-proxy-api/main/schemas/cli-proxy-gateway-model-catalog.v1.schema.json' as const
export const CLI_PROXY_GATEWAY_CODEX_UPSTREAMS_SCHEMA_V1 =
  'https://raw.githubusercontent.com/cordisx/plugin-cli-proxy-api/main/schemas/cli-proxy-gateway-codex-upstream.v1.schema.json' as const
export const CLI_PROXY_GATEWAY_OPENAI_UPSTREAMS_SCHEMA_V1 =
  'https://raw.githubusercontent.com/cordisx/plugin-cli-proxy-api/main/schemas/cli-proxy-gateway-openai-upstream.v1.schema.json' as const
const CLI_PROXY_MANAGEMENT_AUTH_FILES_SCHEMA_V1 =
  'https://raw.githubusercontent.com/cordisx/plugin-cli-proxy-api/main/schemas/cli-proxy-management-auth-files.v1.schema.json' as const
const CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1 =
  'https://raw.githubusercontent.com/cordisx/plugin-cli-proxy-api/main/schemas/cli-proxy-management-operation.v1.schema.json' as const

export const CLI_PROXY_GATEWAY_SERVICE_ID = 'gateway-runtime'
export const CLI_PROXY_GATEWAY_MANAGEMENT_V1 = Object.freeze({
  credentialSlot: 'management-key',
  path: '/v0/management',
})

export const cliProxyGatewayDefinition = {
  $schema:
    'https://raw.githubusercontent.com/cordisx/cordisx-protocol/main/schemas/managed-service-definition.v1.schema.json',
  contract: 'cordisx.managed-service-definition/v1',
  schemaVersion: 1,
  serviceId: CLI_PROXY_GATEWAY_SERVICE_ID,
  launch: {
    executable: { kind: 'named-command', command: 'cli-proxy-api' },
    arguments: [],
    startupTimeoutMs: 15_000,
  },
  configuration: {
    template: './config/cli-proxy-api.yaml',
    format: 'yaml',
    delivery: { kind: 'generation-private-process-file', argument: '--config' },
  },
  compositionOrigins: [{ id: 'api', path: '/v1' }],
  protectedBindings: [
    {
      slot: 'assigned-port',
      source: 'host-assigned-loopback',
      target: 'configuration',
      pointer: '/port',
      serialization: 'port',
    },
    {
      slot: 'gateway-key',
      source: 'generated-local-key',
      target: 'configuration',
      pointer: '/api-keys/0',
    },
    {
      slot: CLI_PROXY_GATEWAY_MANAGEMENT_V1.credentialSlot,
      source: 'generated-local-key',
      target: 'configuration',
      pointer: '/remote-management/secret-key',
    },
    {
      slot: 'codex-upstreams',
      source: 'composition',
      target: 'configuration',
      pointer: '/codex-api-key',
      valueSchema: CLI_PROXY_GATEWAY_CODEX_UPSTREAMS_SCHEMA_V1,
    },
    {
      slot: 'openai-upstreams',
      source: 'composition',
      target: 'configuration',
      pointer: '/openai-compatibility',
      valueSchema: CLI_PROXY_GATEWAY_OPENAI_UPSTREAMS_SCHEMA_V1,
    },
  ],
  authentication: { mode: 'none' },
  httpAuthentication: { mode: 'authorization-header', scheme: 'Bearer', slot: 'gateway-key' },
  discovery: { kind: 'host-assigned-loopback' },
  operations: [
    {
      operationId: 'gateway.models.list',
      method: 'GET',
      path: '/v1/models',
      responseSchema: CLI_PROXY_GATEWAY_MODEL_CATALOG_SCHEMA_V1,
      timeoutMs: 5_000,
    },
    {
      operationId: 'gateway.management.accounts.list',
      method: 'GET',
      path: '/v0/management/auth-files',
      responseSchema: CLI_PROXY_MANAGEMENT_AUTH_FILES_SCHEMA_V1,
      timeoutMs: 5_000,
      httpAuthentication: { mode: 'authorization-header', scheme: 'Bearer', slot: 'management-key' },
    },
    {
      operationId: 'gateway.management.accounts.toggle',
      method: 'PATCH',
      path: '/v0/management/auth-files/status',
      requestSchema: CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1,
      responseSchema: CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1,
      timeoutMs: 5_000,
      httpAuthentication: { mode: 'authorization-header', scheme: 'Bearer', slot: 'management-key' },
    },
    ...(['anthropic', 'codex', 'antigravity', 'kimi', 'xai'] as const).map(provider => ({
      operationId: `gateway.management.oauth.${provider}.start`,
      method: 'GET' as const,
      path: `/v0/management/${provider}-auth-url` as `/${string}`,
      requestSchema: CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1,
      requestEncoding: 'query' as const,
      responseSchema: CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1,
      timeoutMs: 30_000,
      httpAuthentication: { mode: 'authorization-header' as const, scheme: 'Bearer' as const, slot: 'management-key' },
    })),
    {
      operationId: 'gateway.management.oauth.poll',
      method: 'GET',
      path: '/v0/management/get-auth-status',
      requestSchema: CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1,
      requestEncoding: 'query',
      responseSchema: CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1,
      timeoutMs: 5_000,
      httpAuthentication: { mode: 'authorization-header', scheme: 'Bearer', slot: 'management-key' },
    },
    {
      operationId: 'gateway.management.oauth.cancel',
      method: 'DELETE',
      path: '/v0/management/oauth-session',
      requestSchema: CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1,
      requestEncoding: 'query',
      responseSchema: CLI_PROXY_MANAGEMENT_OPERATION_SCHEMA_V1,
      timeoutMs: 5_000,
      httpAuthentication: { mode: 'authorization-header', scheme: 'Bearer', slot: 'management-key' },
    },
  ],
  health: { path: '/v1/models', intervalMs: 250, timeoutMs: 1_000 },
} as const satisfies ManagedServiceDefinitionV1

export const cliProxyGatewayDefinitionRevision = `sha256:${
  createHash('sha256').update(
    JSON.stringify(cliProxyGatewayDefinition),
  ).digest('hex')
}` as const
