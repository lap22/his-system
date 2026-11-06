import { z } from 'zod'
import axios from 'axios'
import { apiClient } from './apiClient'
import { doctorScheduleSchema } from '../types/doctorAppointments'

export async function getDoctorSchedules(doctorId: string, signal?: AbortSignal) {
  z.uuid().parse(doctorId)
  // Deliberately include inactive schedules; no Admin mutation endpoints are exposed.
  const response = await apiClient.get('/doctor-schedules', { params: { doctorId }, signal })
  const rows = z.array(doctorScheduleSchema).parse(response.data)
  if (rows.some(row => row.doctorId !== doctorId)) throw new Error('Schedule ownership could not be verified.')
  return rows
}

export function scheduleReadError(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Your session has expired. Sign in again to view your schedule.'
    if (error.response?.status === 403) return 'You do not have permission to view this schedule.'
    if (!error.response) return 'The hospital service could not be reached. Check your connection and retry.'
  }
  return 'Schedule information could not be verified. Please refresh or retry.'
}
