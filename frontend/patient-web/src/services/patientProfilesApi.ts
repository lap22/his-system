import { z } from 'zod'
import axios from 'axios'
import { apiClient } from './apiClient'
import type { PatientProfile, PatientProfileRequest } from '../types/patientProfile'
import { patientProfileSchema, patientProfilesSchema } from '../types/patientProfile'

const endpoint = '/patient-profiles'

export const patientProfilesApi = {
  async list(): Promise<PatientProfile[]> {
    const response = await apiClient.get(endpoint)
    return patientProfilesSchema.parse(response.data)
  },

  async get(id: string): Promise<PatientProfile> {
    const response = await apiClient.get(`${endpoint}/${id}`)
    return patientProfileSchema.parse(response.data)
  },

  async create(request: PatientProfileRequest): Promise<PatientProfile> {
    const response = await apiClient.post(endpoint, request)
    return patientProfileSchema.parse(response.data)
  },

  async update(id: string, request: PatientProfileRequest): Promise<PatientProfile> {
    const response = await apiClient.put(`${endpoint}/${id}`, request)
    return patientProfileSchema.parse(response.data)
  },

  async remove(id: string): Promise<void> {
    await apiClient.delete(`${endpoint}/${id}`)
  },
}

export function profileDeletionErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error) && error.response?.status === 409) {
    const body = z.object({ message: z.string().min(1) }).safeParse(error.response.data)
    return body.success
      ? body.data.message
      : 'This patient profile cannot be deleted because it has appointment history.'
  }
  return profileErrorMessage(error)
}

export function profileErrorMessage(error: unknown): string {
  const fallback = 'Unable to save this profile. Please try again.'
  const parsed = z.object({
    response: z.object({
      status: z.number().optional(),
      data: z.unknown(),
    }).optional(),
  }).safeParse(error)
  if (!parsed.success) return fallback

  const { status, data } = parsed.data.response ?? {}
  if (!data) {
    if (status === 401) return 'Please sign in to manage patient profiles.'
    if (status === 403) return 'Only Patient accounts can manage patient profiles.'
    if (status === 404) return 'This profile was not found or is no longer available.'
    return fallback
  }

  if (typeof data === 'object' && data !== null) {
    if ('message' in data && typeof data.message === 'string') return data.message
    if ('title' in data && typeof data.title === 'string') return data.title
    if ('errors' in data && typeof data.errors === 'object' && data.errors !== null) {
      const first = Object.values(data.errors).flat().find((value) => typeof value === 'string')
      if (typeof first === 'string') return first
    }
  }

  return fallback
}
