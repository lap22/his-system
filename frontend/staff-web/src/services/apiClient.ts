import axios from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { authResponseSchema } from '../types/auth'
import { authSession } from './authSession'

const options = {
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
}
// Auth endpoints use a separate client so refresh never intercepts itself.
export const authClient = axios.create(options)
export const apiClient = axios.create(options)
type RetryConfig = InternalAxiosRequestConfig & { authRetried?: boolean; authGeneration?: number; authUserId?: string }
let refreshing: Promise<void> | null = null

export function refreshSession(): Promise<void> {
  if (refreshing) return refreshing
  const session = authSession.getSnapshot().session
  if (!session) return Promise.reject(new Error('Please sign in.'))
  const generation = authSession.getGeneration()
  refreshing = (async () => {
    try {
      const response = await authClient.post('/Auth/refresh', { refreshToken: session.refreshToken })
      const next = authResponseSchema.parse(response.data)
      if (authSession.getGeneration() !== generation) {
        try { await authClient.post('/Auth/logout', { refreshToken: next.refreshToken }) }
        catch { /* A late refresh must never restore the local session. */ }
        throw new Error('Session changed.')
      }
      authSession.setSession(next, authSession.getSnapshot().status === 'authenticated')
    } catch (error) {
      if (authSession.getGeneration() === generation &&
          (!axios.isAxiosError(error) || [400, 401, 403].includes(error.response?.status ?? 0))) {
        authSession.clear()
      }
      throw error
    } finally { refreshing = null }
  })()
  return refreshing
}

apiClient.interceptors.request.use((config: RetryConfig) => {
  const session = authSession.getSnapshot().session
  config.authGeneration = authSession.getGeneration()
  config.authUserId = session?.userId
  if (session) config.headers.set('Authorization', 'Bearer ' + session.accessToken)
  else config.headers.delete('Authorization')
  return config
})
apiClient.interceptors.response.use((response) => response, async (error: unknown) => {
  if (!axios.isAxiosError(error)) throw error
  const config = error.config as RetryConfig | undefined
  // 403 is a permission error; it must not refresh or log the user out.
  if (error.response?.status !== 401 || !config) throw error
  const session = authSession.getSnapshot().session
  if (!session) throw error
  if (config.authUserId !== session.userId) throw error
  if (config.authRetried) {
    if (config.authGeneration === authSession.getGeneration()) authSession.clear()
    throw error
  }
  const sentToken = config.headers.get('Authorization')
  config.authRetried = true
  if (sentToken === 'Bearer ' + session.accessToken) await refreshSession()
  if (!authSession.getSnapshot().session) throw error
  return apiClient.request(config)
})

export function authErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Unable to reach the hospital service. Please try again.'
    if (error.response.status === 403) return 'You do not have permission to access this resource.'
    if (error.response.status === 401) return 'Invalid credentials or an expired session. Please sign in again.'
    if (error.response.status === 400) {
      const data: unknown = error.response.data
      if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string') return data.message
      return 'Check your details and try again.'
    }
  }
  return 'Unable to complete your request. Please try again.'
}
