import { z } from 'zod'

const timestamp = z.iso.datetime({ local: true, offset: true })
export const patientQueueStatusSchema = z.enum(['Waiting', 'Called', 'InService', 'Completed', 'Skipped'])
export const patientQueueEntrySchema = z.object({
  id: z.uuid(), appointmentId: z.uuid(), queueNumber: z.number().int().positive(),
  status: patientQueueStatusSchema, patientProfileId: z.uuid(), patientName: z.string().min(1),
  doctorId: z.uuid(), doctorName: z.string().min(1), appointmentDate: z.iso.date(),
  appointmentTime: z.iso.time(), checkedInAt: timestamp, calledAt: timestamp.nullable(),
  startedAt: timestamp.nullable(), completedAt: timestamp.nullable(),
})
export const patientQueueEntriesSchema = z.array(patientQueueEntrySchema)
export type PatientQueueEntry = z.infer<typeof patientQueueEntrySchema>
export type PatientQueueStatus = z.infer<typeof patientQueueStatusSchema>
