import { useSyncExternalStore } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { authSession } from '../services/authSession'
import { authApi } from '../services/authApi'
import { refreshSession } from '../services/apiClient'

let restoring: Promise<void> | null = null
export function restoreAuth() {
  if (restoring) return restoring
  restoring = (async () => {
    let session = authSession.getSnapshot().session
    if (!session) {
      session = authSession.readStored()
      if (!session) { authSession.clear(); return }
      authSession.setSession(session, false)
    }
    authSession.restoring()
    try {
      if (Date.parse(session.accessTokenExpiresAt) <= Date.now()) await refreshSession()
      const expectedUserId = authSession.getSnapshot().session?.userId
      const user = await authApi.me()
      if (authSession.getSnapshot().session?.userId === expectedUserId) authSession.setUser(user)
    } catch {
      if (authSession.getSnapshot().session) authSession.unavailable()
    }
  })().finally(() => { restoring = null })
  return restoring
}
export function useAuth() {
  return useSyncExternalStore(authSession.subscribe, authSession.getSnapshot)
}
export function useLogin() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (session) => { client.clear(); authSession.setSession(session) },
    gcTime: 0,
  })
}
export function useRegister() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: authApi.register,
    onSuccess: (session) => { client.clear(); authSession.setSession(session) },
    gcTime: 0,
  })
}
export function useLogout() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const refreshToken = authSession.getSnapshot().session?.refreshToken
      authSession.clear()
      client.clear()
      if (refreshToken) {
        try { await authApi.logout({ refreshToken }) }
        catch { authSession.setNotice('Signed out on this device. The server could not revoke the session; retry signing in when the service is available.') }
      }
    },
    gcTime: 0,
  })
}
