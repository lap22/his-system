import axios from 'axios'
import { apiClient } from './apiClient'
import { doctorAdminListSchema, doctorAdminSchema, type CreateDoctorForm, type UpdateDoctorForm } from '../types/adminDoctors'

export class DoctorMutationUncertainError extends Error {}
const payload = (values: UpdateDoctorForm) => ({ ...values, phone: values.phone || null, biography: values.biography || null, avatarUrl: values.avatarUrl || null })

async function detail(id: string, signal?: AbortSignal) {
  const response = await apiClient.get(`/doctors/${id}`, { signal })
  return doctorAdminSchema.parse(response.data)
}
async function list(signal?: AbortSignal) {
  const response = await apiClient.get('/doctors', { signal })
  return doctorAdminListSchema.parse(response.data)
}
function uncertain(error: unknown) { return axios.isAxiosError(error) && !error.response }
function matchesUpdate(row: Awaited<ReturnType<typeof detail>>, values: UpdateDoctorForm) {
  const expected = payload(values)
  return row.departmentId === expected.departmentId && row.fullName === expected.fullName.trim() &&
    row.phone === expected.phone && row.specialization === expected.specialization.trim() &&
    row.licenseNumber === expected.licenseNumber.trim() && row.yearsOfExperience === expected.yearsOfExperience &&
    row.biography === expected.biography && row.avatarUrl === expected.avatarUrl
}

export const adminDoctorsApi = {
  list, detail,
  async create(values: CreateDoctorForm) {
    try {
      const response = await apiClient.post('/doctors', { ...payload(values), email: values.email, password: values.password }, { skipAuthRetry: true })
      return doctorAdminSchema.parse(response.data)
    } catch (error) {
      if (!uncertain(error)) throw error
      const matches = (await list()).filter(row => row.email.toLowerCase() === values.email.trim().toLowerCase() || row.licenseNumber === values.licenseNumber.trim())
      if (matches.length === 1 && matches[0].email.toLowerCase() === values.email.trim().toLowerCase() && matches[0].licenseNumber === values.licenseNumber.trim()) return matches[0]
      throw new DoctorMutationUncertainError('Doctor creation outcome is uncertain. Refresh and verify before trying again.')
    }
  },
  async update(id: string, values: UpdateDoctorForm) {
    try {
      const response = await apiClient.put(`/doctors/${id}`, payload(values), { skipAuthRetry: true })
      return doctorAdminSchema.parse(response.data)
    } catch (error) {
      if (!uncertain(error)) throw error
      const current = await detail(id)
      if (matchesUpdate(current, values)) return current
      throw new DoctorMutationUncertainError('Doctor update outcome is uncertain. The current server record does not confirm the requested change.')
    }
  },
  async updateStatus(id: string, isActive: boolean) {
    try {
      const response = await apiClient.patch(`/doctors/${id}/status`, { isActive }, { skipAuthRetry: true })
      return doctorAdminSchema.parse(response.data)
    } catch (error) {
      if (!uncertain(error)) throw error
      const current = await detail(id)
      if (current.isActive === isActive) return current
      throw new DoctorMutationUncertainError('Doctor status outcome is uncertain. Refresh and verify before trying again.')
    }
  },
}

export function doctorRequestMessage(error: unknown) {
  if (error instanceof DoctorMutationUncertainError) return error.message
  if (!axios.isAxiosError(error)) return 'The Doctor operation could not be completed.'
  if (!error.response) return 'The hospital service could not be reached.'
  return ({ 400: typeof error.response.data?.message === 'string' ? error.response.data.message : 'Check the Doctor details.',
    401: 'Your session has expired. Sign in again.', 403: 'Administrator permission is required.',
    404: 'The Doctor no longer exists. Refresh the list.', 409: 'The Doctor changed concurrently. Refresh before trying again.' })[error.response.status]
    ?? 'The Doctor operation could not be completed.'
}
