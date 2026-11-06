import { z } from 'zod'

export const clinicalFieldLimits = {
  chiefComplaint: 2000,
  symptoms: 2000,
  diagnosis: 2000,
  treatment: 2000,
  doctorNotes: 4000,
} as const

const boundedText = (maximum: number) => z.string().max(maximum, `Use ${maximum} characters or fewer.`)

// Editing is intentionally permissive: a future Draft may be incomplete.
export const clinicalDraftSchema = z.object({
  chiefComplaint: boundedText(clinicalFieldLimits.chiefComplaint),
  symptoms: boundedText(clinicalFieldLimits.symptoms),
  diagnosis: boundedText(clinicalFieldLimits.diagnosis),
  treatment: boundedText(clinicalFieldLimits.treatment),
  doctorNotes: boundedText(clinicalFieldLimits.doctorNotes),
})

// Review represents future finalization readiness, not a backend operation.
export const clinicalFinalizationReviewSchema = clinicalDraftSchema.extend({
  chiefComplaint: boundedText(clinicalFieldLimits.chiefComplaint)
    .refine(value => value.trim().length > 0, 'Chief Complaint is required for finalization review.'),
  diagnosis: boundedText(clinicalFieldLimits.diagnosis)
    .refine(value => value.trim().length > 0, 'Diagnosis is required for finalization review.'),
})

export type ClinicalDraft = z.infer<typeof clinicalDraftSchema>
export const emptyClinicalDraft: ClinicalDraft = {
  chiefComplaint: '', symptoms: '', diagnosis: '', treatment: '', doctorNotes: '',
}

