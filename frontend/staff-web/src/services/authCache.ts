import type { QueryClient } from '@tanstack/react-query'
import { authSession } from './authSession'

// Includes expiry/401 cleanup, not just the explicit sign-out button.
export function bindAuthCache(client: QueryClient) {
  let account = authSession.getAccountGeneration()
  return authSession.subscribe(() => {
    const next = authSession.getAccountGeneration()
    if (account !== next) { account = next; client.clear() }
  })
}
