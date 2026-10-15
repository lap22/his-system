import axios from 'axios'
import { z } from 'zod'
import { apiClient } from './apiClient'
import { departmentSchema, doctorSchema } from '../types/doctorDirectory'
import { appointmentSlotsSchema } from '../types/appointmentAvailability'

export const doctorDirectoryApi = {
  async departments(signal?: AbortSignal) {
    const response = await apiClient.get('/departments', { signal })
    return z.array(departmentSchema).parse(response.data).filter((department) => department.isActive)
  },
  async doctors(departmentId: string, signal?: AbortSignal) {
    const response = await apiClient.get('/doctors', {
      params: { isActive: true, ...(departmentId ? { departmentId } : {}) },
      signal,
    })
    return z.array(doctorSchema).parse(response.data).filter((doctor) => doctor.isActive)
  },
  async doctor(id: string, signal?: AbortSignal) {
    const response = await apiClient.get(`/doctors/${id}`, { signal })
    return doctorSchema.parse(response.data)
  },
  async availableSlots(doctorId: string, date: string, signal?: AbortSignal) {
    const response = await apiClient.get(`/doctors/${doctorId}/available-slots`, {
      params: { date },
      signal,
    })
    return appointmentSlotsSchema.parse(response.data)
  },
}

export function directoryErrorMessage(error: unknown, resource: string): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Unable to reach the hospital service. Please try again.'
    if (error.response.status === 401) return 'Please sign in to continue.'
    if (error.response.status === 403) return `You do not have permission to view ${resource}.`
    if (error.response.status === 404) return 'This doctor is no longer available.'
    const body = z.object({ message: z.string().min(1) }).safeParse(error.response.data)
    if (body.success) return body.data.message
  }
  if (error instanceof z.ZodError) return `The hospital returned an unexpected response for ${resource}. Please try again.`
  return `Unable to load ${resource}. Please try again.`
}
