import { z } from 'zod'

export const queueStatusSchema = z.enum(['Waiting', 'Called', 'InService', 'Completed', 'Skipped'])
export const queueActionSchema = z.enum(['call', 'start', 'complete'])
const timestamp = z.iso.datetime({ local: true, offset: true })
export const queueEntrySchema = z.object({
  id: z.uuid(), appointmentId: z.uuid(), queueNumber: z.number().int().positive(), status: queueStatusSchema,
  patientProfileId: z.uuid(), patientName: z.string(), doctorId: z.uuid(), doctorName: z.string(),
  appointmentDate: z.iso.date(), appointmentTime: z.iso.time(), checkedInAt: timestamp,
  calledAt: timestamp.nullable(), startedAt: timestamp.nullable(), completedAt: timestamp.nullable(),
})
export type QueueEntry = z.infer<typeof queueEntrySchema>
export type QueueAction = z.infer<typeof queueActionSchema>
export type QueueStatus = z.infer<typeof queueStatusSchema>
export const queueTransitions = { call: { from: 'Waiting', to: 'Called' }, start: { from: 'Called', to: 'InService' }, complete: { from: 'InService', to: 'Completed' } } as const
export const queueActionLabels = { call: 'Call Patient', start: 'Start Examination', complete: 'Complete Queue Entry' }
export const queueStatusLabels = { Waiting: 'Waiting', Called: 'Called', InService: 'In service', Completed: 'Completed', Skipped: 'Skipped' }
export function availableQueueAction(status: QueueStatus): QueueAction | undefined {
  return status === 'Waiting' ? 'call' : status === 'Called' ? 'start' : status === 'InService' ? 'complete' : undefined
}
