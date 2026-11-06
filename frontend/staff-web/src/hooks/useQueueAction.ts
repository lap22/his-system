import { useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { authSession } from '../services/authSession'
import { createQueueActionController } from '../services/queueActionController'
import { doctorQueueKeys } from './useDoctorQueue'
import type { QueueEntry } from '../types/doctorQueue'

const controllers = new Map<string, ReturnType<typeof createQueueActionController>>()
let account = authSession.getAccountGeneration()
const unsubscribe = authSession.subscribe(() => {
  const next = authSession.getAccountGeneration()
  if (next !== account) { account = next; controllers.clear() }
})
if (import.meta.hot) import.meta.hot.dispose(unsubscribe)

export function useQueueAction(entry: QueueEntry) {
  const { user } = useAuth()
  const client = useQueryClient()
  const generation = authSession.getAccountGeneration()
  const userId = user?.userId ?? ''
  const key = JSON.stringify([userId, entry.doctorId, entry.id])
  let controller = controllers.get(key)
  if (!controller) {
    const storageKey = `his-doctor-queue-action-v1:${userId}:${entry.doctorId}:${entry.id}`
    controller = createQueueActionController({ userId, doctorId: entry.doctorId, entry,
      active: () => generation === authSession.getAccountGeneration() && authSession.getSnapshot().user?.userId === userId && authSession.getSnapshot().user?.role === 'Doctor',
      storage: { read: () => sessionStorage.getItem(storageKey), write: value => sessionStorage.setItem(storageKey, value), remove: () => sessionStorage.removeItem(storageKey) },
      update: () => {
        // Refetch authoritative lists; never splice mutation/event payloads into ordered queues.
        void client.invalidateQueries({ queryKey: doctorQueueKeys.date(userId, entry.doctorId, entry.appointmentDate) })
        void client.invalidateQueries({ queryKey: ['doctorAppointments', userId, entry.doctorId] })
      },
    })
    controllers.set(key, controller)
  }
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return { ...state, submit: controller.submit, verify: controller.verify }
}
