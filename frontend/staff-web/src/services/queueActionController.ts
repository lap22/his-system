import { createGuardedTransition } from './guardedTransition'
import type { TransitionStorage } from './guardedTransition'
import { doctorQueueApi, queueError } from './doctorQueueApi'
import { queueActionSchema, queueTransitions } from '../types/doctorQueue'
import type { QueueEntry } from '../types/doctorQueue'

export function createQueueActionController(deps: {
  userId: string; doctorId: string; entry: QueueEntry; storage: TransitionStorage; active(): boolean
  update(row: QueueEntry): void
  mutate?: typeof doctorQueueApi.act
  read?: () => Promise<QueueEntry>
}) {
  return createGuardedTransition({ ...deps, id: deps.entry.id, noun: 'queue action', classify: queueError,
    transition: action => { const parsed = queueActionSchema.safeParse(action); return parsed.success ? queueTransitions[parsed.data] : undefined },
    mutate: (row: QueueEntry, action: string) => (deps.mutate ?? doctorQueueApi.act)(row, queueActionSchema.parse(action)),
    read: deps.read ?? (async () => {
      const rows = await doctorQueueApi.list(deps.doctorId, deps.entry.appointmentDate)
      const match = rows.find(row => row.id === deps.entry.id && row.appointmentId === deps.entry.appointmentId && row.patientProfileId === deps.entry.patientProfileId)
      if (!match) throw new Error('Queue entry could not be reconciled.')
      return match
    }),
  })
}
