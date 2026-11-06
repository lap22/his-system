import { z } from 'zod'

export type TransitionStorage = { read(): string | null; write(value: string): void; remove(): void }
export type TransitionState<T> = { phase: 'idle' | 'pending' | 'checking' | 'unresolved' | 'success' | 'error'; message: string; record?: T; action?: string }
type RecordIdentity = { id: string; doctorId: string; status: string }
type Dependencies<T> = {
  userId: string; doctorId: string; id: string; storage: TransitionStorage; noun: string; legacyAction?: string
  active(): boolean
  transition(action: string): { from: string; to: string } | undefined
  mutate(row: T, action: string): Promise<T>
  read(): Promise<T>
  update(row: T): void
  classify(error: unknown): { definitive: boolean; message: string }
}
const markerSchema = z.object({ version: z.literal(1), userId: z.uuid(), doctorId: z.uuid(), id: z.uuid(), action: z.string().optional() })

// Shared appointment/queue protection. Only reference IDs and intent are persisted.
export function createGuardedTransition<T extends RecordIdentity>(deps: Dependencies<T>) {
  let state: TransitionState<T> = { phase: 'idle', message: '' }
  const listeners = new Set<() => void>()
  const publish = (next: TransitionState<T>) => { state = next; listeners.forEach(listener => listener()) }
  const owned = (row: T) => row.id === deps.id && row.doctorId === deps.doctorId
  try {
    const value = deps.storage.read()
    if (value !== null) {
      const parsed = markerSchema.safeParse(JSON.parse(value))
      const valid = parsed.success && parsed.data.userId === deps.userId && parsed.data.doctorId === deps.doctorId && parsed.data.id === deps.id
      const action = valid ? parsed.data.action ?? deps.legacyAction : undefined
      state = { phase: 'unresolved', action: action && deps.transition(action) ? action : undefined, message: `A previous ${deps.noun} needs verification. Do not resubmit. Check its status or contact the hospital.` }
    }
  } catch { state = { phase: 'unresolved', message: 'Action protection is unavailable. Check with the hospital before proceeding.' } }
  function finish(row: T, action: string, phase: 'success' | 'error', message: string) {
    if (!deps.active() || !owned(row)) return
    deps.update(row)
    try { deps.storage.remove() }
    catch { publish({ phase: 'unresolved', action, record: row, message: 'The status was verified, but local action protection could not be cleared. Do not resubmit.' }); return }
    publish({ phase, action, record: row, message })
  }
  async function reconcile(definitive = false, rejectionMessage = '') {
    if (!deps.active()) return
    const action = state.action
    const transition = action ? deps.transition(action) : undefined
    publish({ phase: 'checking', action, message: 'Checking the current status…' })
    try {
      const row = await deps.read()
      if (!deps.active()) return
      if (!owned(row)) throw new Error('Unexpected record identity.')
      if (!transition || (row.status === transition.from && !definitive)) {
        deps.update(row)
        publish({ phase: 'unresolved', action, record: row, message: `The hospital currently reports ${row.status}, but the earlier action may still complete. Do not resubmit. Check later or contact the hospital.` })
      } else finish(row, action!, row.status === transition.to ? 'success' : 'error', row.status === transition.to
        ? `The hospital confirms the current status is ${row.status}.` : rejectionMessage || `The current status is ${row.status}.`)
    } catch {
      if (deps.active()) publish({ phase: 'unresolved', action, message: rejectionMessage || 'The outcome could not be verified. Do not resubmit. Check again or contact the hospital.' })
    }
  }
  return {
    getSnapshot: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    async submit(row: T, action: string) {
      const transition = deps.transition(action)
      if (!deps.active() || !owned(row) || !transition || row.status !== transition.from || ['pending', 'checking', 'unresolved'].includes(state.phase)
        || (state.phase === 'success' && state.action === action) || (state.record && state.record.status !== row.status)) return
      try { deps.storage.write(JSON.stringify({ version: 1, userId: deps.userId, doctorId: deps.doctorId, id: deps.id, action })) }
      catch { publish({ phase: 'unresolved', action, message: 'Action protection could not be saved. No request was sent. Check browser storage and contact the hospital.' }); return }
      publish({ phase: 'pending', action, message: `Submitting ${deps.noun}…` })
      try {
        const result = await deps.mutate(row, action)
        if (!deps.active()) return
        if (!owned(result) || result.status !== transition.to) throw new Error('Unexpected transition result.')
        finish(result, action, 'success', `The hospital confirms the current status is ${result.status}.`)
      } catch (error) {
        if (!deps.active()) return
        const rejection = deps.classify(error)
        await reconcile(rejection.definitive, rejection.message)
      }
    },
    async verify() { if (!['pending', 'checking'].includes(state.phase) && deps.active()) await reconcile() },
  }
}
