import { z } from 'zod'
import { clinicalDraftSchema, clinicalFinalizationReviewSchema } from './clinicalDraft'

// PROPOSED FUTURE CONTRACTS ONLY. No current backend endpoint implements these
// schemas, and no production request flow imports them.
export const proposedMedicalRecordStatusSchema = z.enum(['Draft', 'Finalized'])
const proposedTimestamp = z.iso.datetime({ local: true, offset: true })
// Canonical Base64 for exactly one SQL Server rowversion (8 bytes).
const proposedRowVersionSchema = z.string()
  .regex(/^[A-Za-z0-9+/]{10}[AEIMQUYcgkosw048]=$/, 'Invalid concurrency token')

const proposedNullableContentSchema = z.object({
  chiefComplaint: clinicalDraftSchema.shape.chiefComplaint.nullable(),
  symptoms: clinicalDraftSchema.shape.symptoms.nullable(),
  diagnosis: clinicalDraftSchema.shape.diagnosis.nullable(),
  treatment: clinicalDraftSchema.shape.treatment.nullable(),
  doctorNotes: clinicalDraftSchema.shape.doctorNotes.nullable(),
})
const proposedDraftContentSchema = proposedNullableContentSchema.partial()

export const proposedCreateMedicalRecordRequestSchema = proposedDraftContentSchema.extend({
  appointmentId: z.uuid(),
})

export const proposedUpdateMedicalRecordRequestSchema = proposedDraftContentSchema.extend({
  rowVersion: proposedRowVersionSchema,
})

export const proposedFinalizeMedicalRecordRequestSchema = clinicalFinalizationReviewSchema.extend({
  rowVersion: proposedRowVersionSchema,
})

export const proposedMedicalRecordResponseSchema = proposedNullableContentSchema.extend({
  id: z.uuid(), appointmentId: z.uuid(), patientProfileId: z.uuid(), doctorId: z.uuid(),
  status: proposedMedicalRecordStatusSchema, rowVersion: proposedRowVersionSchema,
  createdAt: proposedTimestamp, updatedAt: proposedTimestamp.nullable(),
  finalizedAt: proposedTimestamp.nullable(), finalizedByUserId: z.uuid().nullable(),
})

export type ProposedMedicalRecordResponse = z.infer<typeof proposedMedicalRecordResponseSchema>

