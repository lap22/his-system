import { useSyncExternalStore } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { useCurrentDoctor } from './useCurrentDoctor'
import { doctorAppointmentKeys } from './useDoctorAppointments'
import { authSession } from '../services/authSession'
import { doctorAppointmentsApi } from '../services/doctorAppointmentsApi'
import { createConfirmationController } from '../services/confirmationController'

const controllers = new Map<string, ReturnType<typeof createConfirmationController>>()
let accountGeneration = authSession.getAccountGeneration()
const unsubscribe = authSession.subscribe(() => {
  const next = authSession.getAccountGeneration()
  if (next !== accountGeneration) { accountGeneration = next; controllers.clear() }
})
if (import.meta.hot) import.meta.hot.dispose(unsubscribe)

export function useConfirmAppointment(id: string) {
  const { user } = useAuth()
  const doctor = useCurrentDoctor()
  const client = useQueryClient()
  const generation = authSession.getAccountGeneration()
  const userId = user?.userId ?? ''
  const doctorId = doctor.data?.id ?? ''
  const key = JSON.stringify([userId, doctorId, id])
  let controller = controllers.get(key)
  if (!controller) {
    const storageKey = `his-doctor-confirmation-v1:${userId}:${doctorId}:${id}`
    controller = createConfirmationController({ userId, doctorId, id,
      active: () => generation === authSession.getAccountGeneration() && authSession.getSnapshot().user?.userId === userId && authSession.getSnapshot().user?.role === 'Doctor',
      storage: { read: () => sessionStorage.getItem(storageKey), write: value => sessionStorage.setItem(storageKey, value), remove: () => sessionStorage.removeItem(storageKey) },
      confirm: doctorAppointmentsApi.confirm,
      read: () => doctorAppointmentsApi.detail(doctorId, id),
      update: appointment => {
        client.setQueryData(doctorAppointmentKeys.detail(userId, doctorId, id), appointment)
        // The verified response is immediately visible; mark detail stale without a redundant GET.
        void client.invalidateQueries({ queryKey: doctorAppointmentKeys.detail(userId, doctorId, id), exact: true, refetchType: 'none' })
        void client.invalidateQueries({ queryKey: doctorAppointmentKeys.lists(userId, doctorId) })
      },
    })
    controllers.set(key, controller)
  }
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  return { ...state, submit: controller.submit, verify: controller.verify }
}
