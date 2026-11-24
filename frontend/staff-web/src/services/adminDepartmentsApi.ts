import axios from 'axios'
import { apiClient } from './apiClient'
import { departmentListSchema, departmentSchema, type DepartmentForm } from '../types/adminDepartments'

export const adminDepartmentsApi = {
  async list(signal?: AbortSignal) {
    const response = await apiClient.get('/departments', { signal })
    return departmentListSchema.parse(response.data)
  },
  async create(values: DepartmentForm) {
    const response = await apiClient.post('/departments', values, { skipAuthRetry: true })
    return departmentSchema.parse(response.data)
  },
  async update(id: string, values: DepartmentForm) {
    const response = await apiClient.put(`/departments/${id}`, values, { skipAuthRetry: true })
    return departmentSchema.parse(response.data)
  },
  async updateStatus(id: string, isActive: boolean) {
    const response = await apiClient.patch(`/departments/${id}/status`, { isActive }, { skipAuthRetry: true })
    return departmentSchema.parse(response.data)
  },
}

export function departmentRequestMessage(error: unknown) {
  if (!axios.isAxiosError(error)) return 'The department operation could not be completed.'
  if (!error.response) return 'The result is uncertain because the hospital service could not be reached. Refresh before trying again.'
  return {
    400: typeof error.response.data?.message === 'string' ? error.response.data.message : 'Check the department details and try again.',
    401: 'Your session has expired. Sign in again.',
    403: 'Administrator permission is required.',
    404: 'The department no longer exists. Refresh the list.',
    409: 'The department changed concurrently. Refresh before trying again.',
  }[error.response.status] ?? 'The department operation could not be completed.'
}
