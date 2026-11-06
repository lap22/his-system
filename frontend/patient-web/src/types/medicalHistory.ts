import { z } from 'zod'

const clinicalTimestampSchema = z.iso.datetime({ local: true, offset: true })
const rowVersionSchema = z.string()
  .regex(/^[A-Za-z0-9+/]{10}[AEIMQUYcgkosw048]=$/, 'Invalid concurrency token')

// Future patient-visible contract only. It mirrors the proposed backend
// MedicalRecordResponse and intentionally accepts Finalized records only.
export const patientMedicalRecordSchema = z.object({
  id: z.uuid(),
  appointmentId: z.uuid(),
  patientProfileId: z.uuid(),
  doctorId: z.uuid(),
  chiefComplaint: z.string().max(2000).nullable(),
  symptoms: z.string().max(2000).nullable(),
  diagnosis: z.string().max(2000).nullable(),
  treatment: z.string().max(2000).nullable(),
  doctorNotes: z.string().max(4000).nullable(),
  status: z.literal('Finalized'),
  rowVersion: rowVersionSchema,
  createdAt: clinicalTimestampSchema,
  updatedAt: clinicalTimestampSchema.nullable(),
  finalizedAt: clinicalTimestampSchema,
  finalizedByUserId: z.uuid(),
})

export const patientMedicalRecordsSchema = z.array(patientMedicalRecordSchema)
export type PatientMedicalRecord = z.infer<typeof patientMedicalRecordSchema>
