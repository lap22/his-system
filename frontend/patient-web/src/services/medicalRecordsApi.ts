import axios from 'axios'
import { z } from 'zod'
import { apiClient } from './apiClient'
import { requireClinicalApiEnabled } from './clinicalFeature'
import { patientMedicalRecordsSchema } from '../types/medicalHistory'

export const medicalRecordsApi = {
  async forPatientProfile(profileId: string, signal?: AbortSignal) {
    requireClinicalApiEnabled()
    z.uuid().parse(profileId)
    const response = await apiClient.get(`/MedicalRecords/patient-profile/${profileId}`, { signal })
    const records = patientMedicalRecordsSchema.parse(response.data)
    if (records.some(record => record.patientProfileId !== profileId || record.status !== 'Finalized')) {
      throw new Error('Medical record ownership could not be verified.')
    }
    return records
  },
}

export function medicalHistoryError(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'The hospital service could not be reached. Please retry.'
    if (error.response.status === 401) return 'Your session has expired. Sign in again.'
    if (error.response.status === 403) return 'Only Patient accounts may view medical history.'
    if (error.response.status === 404) return 'This Patient Profile was not found or does not belong to your account.'
  }
  return 'Medical history could not be verified. Please retry.'
}
