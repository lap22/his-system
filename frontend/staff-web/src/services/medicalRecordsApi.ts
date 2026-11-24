import axios from 'axios'
import { z } from 'zod'
import { apiClient } from './apiClient'
import { requireClinicalApiEnabled } from './clinicalFeature'
import {
  proposedCreateMedicalRecordRequestSchema,
  proposedFinalizeMedicalRecordRequestSchema,
  proposedMedicalRecordResponseSchema,
  proposedUpdateMedicalRecordRequestSchema,
} from '../types/proposedMedicalRecords'
import type { ClinicalDraft } from '../types/clinicalDraft'
import type { ProposedMedicalRecordResponse } from '../types/proposedMedicalRecords'

export type ClinicalRequestError = {
  status?: number
  message: string
  conflict: boolean
}

function nullable(value: string) {
  const trimmed = value.trim()
  return trimmed.length ? trimmed : null
}

function content(draft: ClinicalDraft) {
  return {
    chiefComplaint: nullable(draft.chiefComplaint),
    symptoms: nullable(draft.symptoms),
    diagnosis: nullable(draft.diagnosis),
    treatment: nullable(draft.treatment),
    doctorNotes: nullable(draft.doctorNotes),
  }
}

export function clinicalRequestError(error: unknown): ClinicalRequestError {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  const messages: Record<number, string> = {
    400: 'The clinical information is invalid. Review the highlighted fields.',
    401: 'Your session has expired. Sign in again before continuing.',
    403: 'Only the active Doctor assigned to this appointment may change its clinical record.',
    404: 'The appointment or clinical record was not found, or is not assigned to you.',
    409: 'This clinical record changed elsewhere. Reload it before making more changes.',
  }
  return {
    status,
    conflict: status === 409,
    message: status && messages[status]
      ? messages[status]
      : 'The clinical request could not be completed. No automatic retry was attempted.',
  }
}

export const medicalRecordsApi = {
  async byAppointment(appointmentId: string, signal?: AbortSignal): Promise<ProposedMedicalRecordResponse | null> {
    requireClinicalApiEnabled()
    z.uuid().parse(appointmentId)
    try {
      const response = await apiClient.get(`/MedicalRecords/appointment/${appointmentId}`, { signal })
      return proposedMedicalRecordResponseSchema.parse(response.data)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null
      throw error
    }
  },
  async create(appointmentId: string, draft: ClinicalDraft) {
    requireClinicalApiEnabled()
    const request = proposedCreateMedicalRecordRequestSchema.parse({ appointmentId, ...content(draft) })
    const response = await apiClient.post('/MedicalRecords', request, { skipAuthRetry: true })
    return proposedMedicalRecordResponseSchema.parse(response.data)
  },
  async update(id: string, rowVersion: string, draft: ClinicalDraft) {
    requireClinicalApiEnabled()
    z.uuid().parse(id)
    const request = proposedUpdateMedicalRecordRequestSchema.parse({ rowVersion, ...content(draft) })
    const response = await apiClient.put(`/MedicalRecords/${id}/draft`, request, { skipAuthRetry: true })
    return proposedMedicalRecordResponseSchema.parse(response.data)
  },
  async finalize(id: string, rowVersion: string, draft: ClinicalDraft) {
    requireClinicalApiEnabled()
    z.uuid().parse(id)
    const request = proposedFinalizeMedicalRecordRequestSchema.parse({
      rowVersion,
      chiefComplaint: draft.chiefComplaint.trim(), symptoms: draft.symptoms.trim(),
      diagnosis: draft.diagnosis.trim(), treatment: draft.treatment.trim(),
      doctorNotes: draft.doctorNotes.trim(),
    })
    const response = await apiClient.post(`/MedicalRecords/${id}/finalize`, request, { skipAuthRetry: true })
    return proposedMedicalRecordResponseSchema.parse(response.data)
  },
}
