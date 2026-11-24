import axios from 'axios'
import { apiClient } from './apiClient'
import { adminScheduleListSchema, adminScheduleSchema, apiTime, type ScheduleForm } from '../types/adminSchedules'

export class ScheduleMutationUncertainError extends Error {}
const body = (values: ScheduleForm) => ({ ...values, startTime: apiTime(values.startTime), endTime: apiTime(values.endTime) })
const uncertain = (error: unknown) => axios.isAxiosError(error) && !error.response
const matches = (row: Awaited<ReturnType<typeof detail>>, values: ScheduleForm) => {
  const expected = body(values)
  return row.dayOfWeek === expected.dayOfWeek && row.startTime === expected.startTime && row.endTime === expected.endTime &&
    row.slotDurationMinutes === expected.slotDurationMinutes && row.maxPatients === expected.maxPatients
}
async function list(doctorId: string, signal?: AbortSignal) {
  const response = await apiClient.get('/doctor-schedules', { params: { doctorId }, signal })
  const rows = adminScheduleListSchema.parse(response.data)
  if (rows.some(row => row.doctorId !== doctorId)) throw Error('The schedule response contained another Doctor’s data.')
  return rows
}
async function detail(id: string, doctorId: string, signal?: AbortSignal) {
  const response = await apiClient.get(`/doctor-schedules/${id}`, { signal })
  const row = adminScheduleSchema.parse(response.data)
  if (row.doctorId !== doctorId) throw Error('The schedule does not belong to the selected Doctor.')
  return row
}
export const adminSchedulesApi = { list, detail,
  async create(doctorId: string, values: ScheduleForm) {
    try { const response = await apiClient.post('/doctor-schedules', { doctorId, ...body(values) }, { skipAuthRetry: true }); return adminScheduleSchema.parse(response.data) }
    catch (error) { if (!uncertain(error)) throw error; const candidates = (await list(doctorId)).filter(row => matches(row, values)); if (candidates.length === 1) return candidates[0]; throw new ScheduleMutationUncertainError('Schedule creation outcome is uncertain. Refresh and verify before trying again.') }
  },
  async update(id: string, doctorId: string, values: ScheduleForm) {
    try { const response = await apiClient.put(`/doctor-schedules/${id}`, body(values), { skipAuthRetry: true }); return adminScheduleSchema.parse(response.data) }
    catch (error) { if (!uncertain(error)) throw error; const current = await detail(id, doctorId); if (matches(current, values)) return current; throw new ScheduleMutationUncertainError('Schedule update outcome is uncertain. The server record does not confirm the requested change.') }
  },
  async updateStatus(id: string, doctorId: string, isActive: boolean) {
    try { const response = await apiClient.patch(`/doctor-schedules/${id}/status`, { isActive }, { skipAuthRetry: true }); return adminScheduleSchema.parse(response.data) }
    catch (error) { if (!uncertain(error)) throw error; const current = await detail(id, doctorId); if (current.isActive === isActive) return current; throw new ScheduleMutationUncertainError('Schedule status outcome is uncertain. Refresh and verify before trying again.') }
  },
}
export function scheduleRequestMessage(error: unknown) {
  if (error instanceof ScheduleMutationUncertainError) return error.message
  if (!axios.isAxiosError(error)) return error instanceof Error ? error.message : 'The schedule operation could not be completed.'
  if (!error.response) return 'The hospital service could not be reached.'
  return ({ 400: typeof error.response.data?.message === 'string' ? error.response.data.message : 'Check the schedule details and overlap rules.',
    401: 'Your session has expired. Sign in again.', 403: 'Administrator permission is required.', 404: 'The schedule no longer exists.',
    409: typeof error.response.data?.message === 'string' ? error.response.data.message : 'The schedule conflicts with existing future appointments. Refresh before trying again.' })[error.response.status] ?? 'The schedule operation could not be completed.'
}
