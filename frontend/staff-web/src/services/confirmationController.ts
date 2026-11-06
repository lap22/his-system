import type { DoctorAppointment } from '../types/doctorAppointments'
import { confirmationError } from './doctorAppointmentsApi'
import { createGuardedTransition } from './guardedTransition'
import type { TransitionState, TransitionStorage } from './guardedTransition'

export type ConfirmationState = Omit<TransitionState<DoctorAppointment>, 'record'> & { appointment?: DoctorAppointment }
export type ConfirmationStorage = TransitionStorage
type Dependencies = {
  userId: string; doctorId: string; id: string; storage: ConfirmationStorage
  active(): boolean
  confirm(appointment: DoctorAppointment): Promise<DoctorAppointment>
  read(): Promise<DoctorAppointment>
  update(appointment: DoctorAppointment): void
}
export function createConfirmationController(deps: Dependencies) {
  const core = createGuardedTransition({ ...deps, noun: 'appointment confirmation', legacyAction: 'confirm',
    transition: action => action === 'confirm' ? { from: 'Pending', to: 'Confirmed' } : undefined,
    mutate: (row: DoctorAppointment) => deps.confirm(row), classify: confirmationError })
  let previous = core.getSnapshot()
  let mapped = { ...previous, appointment: previous.record }
  return { subscribe: core.subscribe, verify: core.verify,
    submit: (row: DoctorAppointment) => core.submit(row, 'confirm'),
    getSnapshot: () => { const current = core.getSnapshot(); if (current !== previous) { previous = current; mapped = { ...current, appointment: current.record } } return mapped },
  }
}
