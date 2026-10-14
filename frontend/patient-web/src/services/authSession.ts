import { authResponseSchema } from '../types/auth'
import type { AuthResponse, CurrentUserResponse } from '../types/auth'

const storageKey = 'his-auth-' + import.meta.env.VITE_PORTAL
type State = {
  session: AuthResponse | null
  user: CurrentUserResponse | null
  status: 'restoring' | 'authenticated' | 'anonymous' | 'unavailable'
  notice?: string
}
let state: State = { session: null, user: null, status: 'restoring' }
let generation = 0
const listeners = new Set<() => void>()
function publish(next: State) {
  state = next
  listeners.forEach((listener) => listener())
}
export const authSession = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
  getSnapshot: () => state,
  getGeneration: () => generation,
  readStored() {
    try {
      const value = sessionStorage.getItem(storageKey)
      return value ? authResponseSchema.parse(JSON.parse(value)) : null
    } catch {
      try { sessionStorage.removeItem(storageKey) } catch { /* Storage can be disabled. */ }
      return null
    }
  },
  setSession(session: AuthResponse, authenticated = true) {
    const { userId, email, role } = session
    generation += 1
    try { sessionStorage.setItem(storageKey, JSON.stringify(session)) } catch { /* Memory-only session remains usable. */ }
    publish({ session, user: authenticated ? { userId, email, role } : null, status: authenticated ? 'authenticated' : 'restoring' })
  },
  setUser(user: CurrentUserResponse) {
    publish({ ...state, user, status: 'authenticated' })
  },
  unavailable() { publish({ ...state, user: null, status: 'unavailable' }) },
  restoring() { publish({ ...state, user: null, status: 'restoring' }) },
  setNotice(notice: string) { publish({ ...state, notice }) },
  clear() {
    generation += 1
    try { sessionStorage.removeItem(storageKey) } catch { /* Clear in-memory credentials regardless. */ }
    publish({ session: null, user: null, status: 'anonymous' })
  },
}
