import axios from 'axios'
import { z } from 'zod'
import { apiClient } from './apiClient'
import { patientQueueEntriesSchema, patientQueueEntrySchema } from '../types/patientQueue'
import type { Appointment } from '../types/appointment'
import type { PatientQueueEntry } from '../types/patientQueue'
import { normalizeAppointmentTime } from '../utils/appointmentFormatting'

function verify(entry: PatientQueueEntry, appointment: Appointment) {
  if (entry.appointmentId !== appointment.id || entry.patientProfileId !== appointment.patientProfileId ||
      entry.doctorId !== appointment.doctorId || entry.appointmentDate !== appointment.appointmentDate ||
      normalizeAppointmentTime(entry.appointmentTime) !== normalizeAppointmentTime(appointment.startTime)) {
    throw new Error('Queue entry identity could not be verified.')
  }
  return entry
}

export const patientQueueApi = {
  async my(signal?: AbortSignal) {
    const rows = patientQueueEntriesSchema.parse((await apiClient.get('/Queue/my', { signal })).data)
    if (new Set(rows.map(row => row.appointmentId)).size !== rows.length) {
      throw new Error('Duplicate queue entries could not be verified.')
    }
    return rows
  },
  async checkIn(appointment: Appointment) {
    z.uuid().parse(appointment.id)
    const response = await apiClient.post(`/Queue/check-in/${appointment.id}`, undefined, { skipAuthRetry: true })
    const entry = patientQueueEntrySchema.parse(response.data)
    if (response.status !== 200 || entry.status !== 'Waiting') throw new Error('Check-in response could not be verified.')
    return verify(entry, appointment)
  },
  verify,
}

export function checkInError(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  const messages: Record<number, string> = {
    400: 'Check-in is available only for a confirmed appointment on its appointment date.',
    401: 'Your session has expired. Sign in again before checking in.',
    403: 'Only the Patient account that owns this appointment can check in.',
    404: 'This appointment was not found or does not belong to your account.',
    409: 'This appointment was already checked in or changed concurrently.',
  }
  return { definitive: status !== undefined && Object.hasOwn(messages, status),
    message: status && messages[status] ? messages[status]
      : 'The check-in outcome is uncertain. Do not submit again until the queue status is verified.' }
}
