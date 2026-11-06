import axios from 'axios'
import { z } from 'zod'
import { apiClient } from './apiClient'
import { appointmentFiltersSchema, doctorAppointmentSchema } from '../types/doctorAppointments'
import type { AppointmentFilters, DoctorAppointment } from '../types/doctorAppointments'

export function validateOwnedAppointment(data: unknown, doctorId: string, id?: string): DoctorAppointment {
  const row = doctorAppointmentSchema.parse(data)
  if (row.doctorId !== doctorId || (id !== undefined && row.id !== id)) throw new Error('Appointment identity could not be verified.')
  return row
}
export const doctorAppointmentsApi = {
  async list(doctorId: string, filters: AppointmentFilters, signal?: AbortSignal) {
    z.uuid().parse(doctorId)
    const params = appointmentFiltersSchema.parse(filters)
    const response = await apiClient.get('/Appointments', { params, signal })
    return z.array(doctorAppointmentSchema).parse(response.data).map(row => {
      const owned = validateOwnedAppointment(row, doctorId)
      if ((params.date && row.appointmentDate !== params.date) || (params.status && row.status !== params.status)) throw new Error('Appointment filters could not be verified.')
      return owned
    })
  },
  async detail(doctorId: string, id: string, signal?: AbortSignal) {
    z.uuid().parse(doctorId); z.uuid().parse(id)
    return validateOwnedAppointment((await apiClient.get(`/Appointments/${id}`, { signal })).data, doctorId, id)
  },
  async confirm(appointment: DoctorAppointment) {
    doctorAppointmentSchema.parse(appointment)
    if (appointment.status !== 'Pending') throw new Error('Only Pending appointments can be confirmed.')
    const response = await apiClient.patch(`/Appointments/${appointment.id}/confirm`, undefined, { skipAuthRetry: true })
    const row = validateOwnedAppointment(response.data, appointment.doctorId, appointment.id)
    if (response.status !== 200 || row.status !== 'Confirmed' || row.patientProfileId !== appointment.patientProfileId ||
      row.appointmentDate !== appointment.appointmentDate || row.startTime !== appointment.startTime || row.endTime !== appointment.endTime) {
      throw new Error('Confirmation response could not be verified.')
    }
    return row
  },
}
export function appointmentReadError(error: unknown) {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Your session has expired. Sign in again.'
    if (error.response?.status === 403) return 'You do not have permission to view this appointment information.'
    if (error.response?.status === 404) return 'The appointment was not found or is not assigned to your Doctor account.'
    if (!error.response) return 'The hospital service could not be reached. Check your connection and retry.'
  }
  return 'Appointment information could not be verified. Please refresh or retry.'
}
export function confirmationError(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  const messages: Record<number, string> = {
    400: 'The hospital rejected this confirmation. Only Pending appointments can be confirmed.',
    401: 'Your session has expired. Sign in again before confirming.',
    403: 'You do not have permission to confirm this appointment.',
    404: 'This appointment was not found or is not assigned to you.',
    409: 'The appointment changed concurrently. Check its current status.',
  }
  return { definitive: status !== undefined && Object.hasOwn(messages, status),
    message: status && messages[status] ? messages[status] : 'The confirmation outcome is uncertain. Do not submit again until its status is verified.' }
}
