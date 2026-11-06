import { authSession } from './authSession'
import { refreshSession } from './apiClient'
import type { QueueRealtimeScope } from './queueRealtimeManager'

export function isQueueSessionActive(scope: QueueRealtimeScope) {
  const auth = authSession.getSnapshot()
  return auth.status === 'authenticated' && auth.user?.role === 'Doctor' && auth.user.userId === scope.userId
    && authSession.getAccountGeneration() === scope.generation
}
export async function currentQueueToken(scope: QueueRealtimeScope) {
  if (!isQueueSessionActive(scope)) throw new Error('Doctor session unavailable.')
  const session = authSession.getSnapshot().session
  if (!session) throw new Error('Doctor session unavailable.')
  if (!Number.isFinite(Date.parse(session.accessTokenExpiresAt))) throw new Error('Doctor session expiry unavailable.')
  if (Date.parse(session.accessTokenExpiresAt) <= Date.now()) await refreshSession()
  if (!isQueueSessionActive(scope)) throw new Error('Doctor session changed.')
  const current = authSession.getSnapshot().session
  if (!current || !Number.isFinite(Date.parse(current.accessTokenExpiresAt)) || Date.parse(current.accessTokenExpiresAt) <= Date.now()) throw new Error('Doctor session expired.')
  return current.accessToken
}
