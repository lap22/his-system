import { queueEntrySchema } from '../types/doctorQueue'

export type QueueRealtimeScope = { userId: string; doctorId: string; generation: number }
export type QueueConnection = {
  start(): Promise<void>; stop(): Promise<void>
  on(event: string, handler: (payload: unknown) => void): void
  off(event: string, handler: (payload: unknown) => void): void
  onreconnecting(handler: () => void): void
  onreconnected(handler: () => void): void
  onclose(handler: () => void): void
}
type Refetch = (date?: string) => void
type Snapshot = { status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'unavailable'; message: string }
type Lease = {
  scope: QueueRealtimeScope; refs: number; disposed: boolean; callbacks: Set<Refetch>
  connection?: QueueConnection; handler?: (payload: unknown) => void; unsubscribe?: () => void; stopping?: Promise<void>
}

export function createQueueRealtimeManager(deps: {
  create(token: () => Promise<string>): QueueConnection
  token(scope: QueueRealtimeScope): Promise<string>
  active(scope: QueueRealtimeScope): boolean
  subscribeAuth(listener: () => void): () => void
  stopTimeoutMs?: number
}) {
  let snapshot: Snapshot = { status: 'disconnected', message: 'Realtime disconnected. Manual refresh remains available.' }
  const listeners = new Set<() => void>()
  let current: Lease | undefined
  let barrier = Promise.resolve()
  let cleanupFailed = false
  const publish = (status: Snapshot['status'], message: string) => { snapshot = { status, message }; listeners.forEach(listener => listener()) }
  function stop(lease: Lease, quiet = false) {
    if (lease.disposed) return lease.stopping ?? Promise.resolve()
    lease.disposed = true
    lease.unsubscribe?.()
    lease.callbacks.clear()
    if (lease.connection && lease.handler) lease.connection.off('QueueUpdated', lease.handler)
    if (current === lease) { current = undefined; if (!quiet) publish('disconnected', 'Realtime stopped. Manual refresh remains available.') }
    let task: Promise<void>
    try { task = lease.connection?.stop() ?? Promise.resolve() } catch { task = Promise.reject(new Error('Realtime cleanup failed.')) }
    lease.stopping = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Realtime cleanup timed out.')), deps.stopTimeoutMs ?? 5_000)
      task.then(() => { clearTimeout(timer); resolve() }, () => { clearTimeout(timer); reject(new Error('Realtime cleanup failed.')) })
    }).catch(() => { cleanupFailed = true; publish('unavailable', 'Realtime cleanup could not be verified. Reload before reconnecting; manual refresh is available.') })
    barrier = Promise.all([barrier, lease.stopping]).then(() => undefined)
    return lease.stopping
  }
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    acquire(scope: QueueRealtimeScope, refetch: Refetch) {
      const matches = current && !current.disposed && current.scope.userId === scope.userId && current.scope.doctorId === scope.doctorId && current.scope.generation === scope.generation
      let lease = matches ? current! : undefined
      if (!lease) {
        if (current) void stop(current)
        lease = { scope, refs: 0, disposed: false, callbacks: new Set() }
        current = lease
        const ownedLease = lease
        const live = () => !ownedLease.disposed && current === ownedLease && deps.active(scope)
        const pending = new Set<string | undefined>()
        let scheduled = false
        const notify = (date?: string) => {
          pending.add(date)
          if (scheduled) return
          scheduled = true
          queueMicrotask(() => {
            scheduled = false
            if (live()) {
              const dates = pending.has(undefined) ? [undefined] : [...pending]
              for (const date of dates) ownedLease.callbacks.forEach(callback => callback(date))
            }
            pending.clear()
          })
        }
        ownedLease.unsubscribe = deps.subscribeAuth(() => { if (!deps.active(scope)) void stop(ownedLease) })
        publish('connecting', 'Connecting realtime queue updates…')
        void Promise.resolve().then(async () => {
          await barrier
          if (!live()) return
          if (cleanupFailed) { publish('unavailable', 'Realtime cleanup is unverified. Reload before reconnecting.'); return }
          try {
            const connection = deps.create(async () => {
              if (!live()) throw new Error('Session changed.')
              const token = await deps.token(scope)
              if (!live()) throw new Error('Session changed.')
              return token
            })
            ownedLease.connection = connection
            ownedLease.handler = payload => {
              if (!live()) return
              const parsed = queueEntrySchema.safeParse(payload)
              // Unknown payloads can only cause an authorized scoped GET, never cache writes.
              if (!parsed.success) notify()
              else if (parsed.data.doctorId === scope.doctorId) notify(parsed.data.appointmentDate)
            }
            connection.on('QueueUpdated', ownedLease.handler)
            connection.onreconnecting(() => { if (live()) publish('reconnecting', 'Reconnecting… Manual refresh and periodic GET remain available.') })
            connection.onreconnected(() => { if (live()) { publish('connected', 'Realtime connected.'); notify() } })
            connection.onclose(() => { if (live()) publish('unavailable', 'Realtime disconnected after bounded reconnect attempts. Reconnect manually or refresh the queue.') })
            await connection.start()
            if (live()) { publish('connected', 'Realtime connected.'); notify() }
            else await stop(ownedLease)
          } catch {
            if (live()) { publish('unavailable', 'Realtime connection unavailable. Reconnect manually or refresh the queue.'); await stop(ownedLease, true) }
          }
        })
      }
      lease.refs += 1
      lease.callbacks.add(refetch)
      let released = false
      return () => {
        if (released) return
        released = true; lease.callbacks.delete(refetch); lease.refs -= 1
        if (lease.refs === 0) void stop(lease)
      }
    },
  }
}
