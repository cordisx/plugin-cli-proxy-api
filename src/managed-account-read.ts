import type {
  ManagedServiceCliProxyAccountsResultV1,
  ManagedServiceCliProxyAccountToggleRequestV1,
  ManagedServiceCliProxyAccountToggleResultV1,
  ManagedServiceV1,
} from '@cordisx/protocol/managed-service-ui/v1'

/** Account visibility does not imply authority to change accounts. */
export function hasManagedAccountReader(service: ManagedServiceV1): boolean {
  return typeof service.readAccounts === 'function' || typeof service.accountControl?.readAccounts === 'function'
}

/** Use the independent read when available, falling back only on older Hosts. */
export async function readManagedAccounts(
  service: ManagedServiceV1,
): Promise<ManagedServiceCliProxyAccountsResultV1 | undefined> {
  if (typeof service.readAccounts === 'function') return await service.readAccounts()
  if (typeof service.accountControl?.readAccounts === 'function') return await service.accountControl.readAccounts()
  return undefined
}

/** A Host may allow account toggles without also enabling OAuth. */
export function hasManagedAccountToggle(service: ManagedServiceV1): boolean {
  return typeof service.toggleAccount === 'function' || typeof service.accountControl?.toggleAccount === 'function'
}

export async function toggleManagedAccount(
  service: ManagedServiceV1,
  request: ManagedServiceCliProxyAccountToggleRequestV1,
): Promise<ManagedServiceCliProxyAccountToggleResultV1 | undefined> {
  if (typeof service.toggleAccount === 'function') return await service.toggleAccount(request)
  if (typeof service.accountControl?.toggleAccount === 'function') {
    return await service.accountControl.toggleAccount(request)
  }
  return undefined
}
