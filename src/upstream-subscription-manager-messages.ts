export interface UpstreamSubscriptionManagerMessages {
  'upstream.group.account-subscriptions': undefined
  'upstream.group.cordisx-upstreams': undefined
  'upstream.group.runtime-status': undefined
  'upstream.status.readiness': { readonly readiness: string }
  'upstream.status.health': { readonly health: string }
  'upstream.status.auth-state': { readonly state: string }
  'upstream.status.model-count': { readonly count: number }
  'upstream.status.endpoint-origin': { readonly origin: string }
  'upstream.status.secret-configured': undefined
  'upstream.status.secret-missing': undefined
  'upstream.status.enabled': undefined
  'upstream.status.disabled': undefined
  'upstream.status.default': undefined
  'upstream.status.no-catalog': undefined
  'upstream.status.no-upstreams': undefined
  'upstream.status.service-unavailable': undefined
  'upstream.status.account-active': undefined
  'upstream.status.account-disabled': undefined
  'upstream.status.account-unavailable': undefined
  'upstream.status.account-runtime-only': undefined
  'upstream.status.account-source-file': undefined
  'upstream.status.account-source-memory': undefined
  'upstream.status.account-source-plugin': undefined
  'upstream.status.auth-oauth': undefined
  'upstream.status.auth-api-key': undefined
  'upstream.status.auth-file': undefined
  'upstream.status.auth-plugin-virtual': undefined
  'upstream.status.auth-unknown': undefined
  'upstream.status.oauth-pending': undefined
  'upstream.status.oauth-completed': undefined
  'upstream.status.oauth-cancelled': undefined
  'upstream.status.oauth-error': undefined
  'upstream.status.oauth-unknown': undefined
  'upstream.status.account-controls-unavailable': undefined
  'upstream.status.account-count': { readonly count: number }
  'upstream.status.no-accounts': undefined
  'upstream.status.service-auth': { readonly state: string }
  'upstream.status.ready': undefined
  'upstream.status.degraded': undefined
  'upstream.status.failed': undefined
  'upstream.status.stopped': undefined
  'upstream.status.healthy': undefined
  'upstream.status.warning': undefined
  'upstream.status.critical': undefined
  'upstream.status.missing': undefined
  'upstream.status.authenticating': undefined
  'upstream.status.authenticated': undefined
  'upstream.status.expired': undefined
  'upstream.status.logged-out': undefined
  'upstream.status.unknown': undefined
  'upstream.status.no-accounts-description': undefined
  'upstream.status.no-upstreams-description': undefined
  'upstream.status.configuration-unavailable': undefined
  'upstream.field.revision': undefined
  'upstream.field.generation': undefined
  'upstream.field.sequence': undefined
  'upstream.field.provider': undefined
  'upstream.field.source': undefined
  'upstream.field.auth-type': undefined
  'upstream.field.account': undefined
  'upstream.field.project': undefined
  'upstream.field.note': undefined
  'upstream.field.updated': undefined
  'upstream.field.last-refresh': undefined
  'upstream.field.technical-details': undefined
  'upstream.field.endpoint': undefined
  'upstream.field.credential': undefined
  'upstream.field.models': undefined
  'upstream.action.refresh': undefined
  'upstream.action.open-plugin-configuration': undefined
  'upstream.action.login-service': undefined
  'upstream.action.logout-service': undefined
  'upstream.state.operation-error': undefined
  'upstream.action.oauth-start': { readonly provider: string }
  'upstream.action.oauth-cancel': undefined
  'upstream.action.enable': undefined
  'upstream.action.disable': undefined
  'state.loading': undefined
  'state.error': { readonly message: string }
}
