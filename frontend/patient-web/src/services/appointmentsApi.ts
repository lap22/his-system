import axios from 'axios'
import { z } from 'zod'
import { appointmentSchema, cancelAppointmentRequestSchema, createAppointmentRequestSchema } from '../types/appointment'
import type { Appointment, CreateAppointmentRequest } from '../types/appointment'
import { apiClient } from './apiClient'
import { normalizeAppointmentTime } from '../utils/appointmentFormatting'

class AppointmentOutcomeUnknownError extends Error {
  readonly appointmentId?: string
  constructor(appointmentId?: string) {
    super('The hospital accepted the request, but its confirmation could not be verified.')
    this.appointmentId = appointmentId
  }
}

export const appointmentsApi = {
  async my(signal?: AbortSignal): Promise<Appointment[]> {
    const response = await apiClient.get('/Appointments/my', { signal })
    return z.array(appointmentSchema).parse(response.data)
  },
  async detail(id: string, signal?: AbortSignal): Promise<Appointment> {
    const response = await apiClient.get(`/Appointments/${z.uuid().parse(id)}`, { signal })
    const appointment = appointmentSchema.parse(response.data)
    if (appointment.id.toLowerCase() !== id.toLowerCase()) throw new Error('Unexpected appointment reference.')
    return appointment
  },
  async cancel(appointment: Appointment, reason: string): Promise<Appointment> {
    const payload = cancelAppointmentRequestSchema.parse({ reason: reason.trim() || null })
    const response = await apiClient.patch(`/Appointments/${z.uuid().parse(appointment.id)}/cancel`, payload, { skipAuthRetry: true })
    const parsed = appointmentSchema.safeParse(response.data)
    if (response.status !== 200 || !parsed.success || parsed.data.id !== appointment.id
      || parsed.data.status !== 'Cancelled' || parsed.data.patientProfileId !== appointment.patientProfileId
      || parsed.data.doctorId !== appointment.doctorId || parsed.data.appointmentDate !== appointment.appointmentDate
      || normalizeAppointmentTime(parsed.data.startTime) !== normalizeAppointmentTime(appointment.startTime)) {
      throw new Error('The cancellation response could not be verified.')
    }
    return parsed.data
  },
  async create(request: CreateAppointmentRequest): Promise<Appointment> {
    // Parsing also strips extra fields: endTime is never sent.
    const payload = createAppointmentRequestSchema.parse(request)
    const response = await apiClient.post('/Appointments', payload, { skipAuthRetry: true })
    const result = appointmentSchema.safeParse(response.data)
    const identity = z.object({ id: z.uuid() }).safeParse(response.data)
    const appointmentId = response.status === 201 && identity.success ? identity.data.id : undefined
    if (response.status !== 201 || !result.success) throw new AppointmentOutcomeUnknownError(appointmentId)
    const appointment = result.data
    if (appointment.patientProfileId !== payload.patientProfileId || appointment.doctorId !== payload.doctorId
      || appointment.appointmentDate !== payload.appointmentDate
      || normalizeAppointmentTime(appointment.startTime) !== normalizeAppointmentTime(payload.startTime)) {
      throw new AppointmentOutcomeUnknownError(appointmentId)
    }
    return appointment
  },
}

export function appointmentReadError(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Your session has expired. Please sign in again.'
    if (error.response?.status === 403) return 'You do not have permission to view these appointments.'
    if (error.response?.status === 404) return 'This appointment was not found or is not available to your Patient account.'
    if (!error.response) return 'The hospital service could not be reached. Check your connection and try again.'
  }
  return 'Appointments could not be loaded. Please refresh or try again later.'
}

export function appointmentCancellationError(error: unknown): { message: string; uncertain: boolean } {
  if (axios.isAxiosError(error) && error.response && [400, 401, 403, 404, 409, 422].includes(error.response.status)) {
    if (error.response.status === 401) return { message: 'Your session has expired. Sign in again before continuing.', uncertain: false }
    if (error.response.status === 403) return { message: 'Only the Patient account that owns this appointment can cancel it.', uncertain: false }
    if (error.response.status === 404) return { message: 'This appointment was not found or is not available to your Patient account.', uncertain: false }
    const body = errorBodySchema.safeParse(error.response.data)
    return { message: body.success ? body.data.message ?? 'The hospital rejected this cancellation. Refresh the current appointment status.'
      : 'The hospital rejected this cancellation. Refresh the current appointment status.', uncertain: false }
  }
  return { message: 'The cancellation outcome is uncertain. Check the current status before taking further action. Do not submit another cancellation.', uncertain: true }
}

const errorBodySchema = z.object({
  message: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  errors: z.record(z.string(), z.array(z.string())).optional(),
})

export function appointmentBookingError(error: unknown): {
  message: string
  refreshAvailability: boolean
  refreshProfiles: boolean
  uncertain: boolean
  appointmentId?: string
  fieldErrors: Partial<Record<'patientProfileId' | 'symptoms', string>>
} {
  const result = { message: 'Unable to book this appointment. Please try again.', refreshAvailability: false,
    refreshProfiles: false, uncertain: false, fieldErrors: {} as Partial<Record<'patientProfileId' | 'symptoms', string>> }
  const unexpected = error != null && !axios.isAxiosError(error) && !(error instanceof z.ZodError)
  if (unexpected || (axios.isAxiosError(error) && (!error.response || error.response.status === 408 || error.response.status >= 500))) {
    return { ...result, uncertain: true, refreshAvailability: true,
      appointmentId: error instanceof AppointmentOutcomeUnknownError ? error.appointmentId : undefined,
      message: 'The booking outcome could not be confirmed. An appointment may have been created. New bookings are paused while this request is verified.' }
  }
  if (error instanceof z.ZodError) return { ...result, message: 'Check the patient profile, appointment details and symptoms before confirming.' }
  if (!axios.isAxiosError(error)) return result
  const status = error.response?.status
  if (status === 401) return { ...result, message: 'Your session has expired. Please sign in again.' }
  if (status === 403) return { ...result, message: 'Only an authorized Patient account can book appointments.' }
  const parsed = errorBodySchema.safeParse(error.response?.data)
  const body = parsed.success ? parsed.data : undefined
  const message = body?.message
  const slotMessages = new Set([
    'The selected appointment slot is no longer available.', 'The selected appointment slot is invalid.',
    'Cannot book an appointment in the past.', 'Cannot book a past appointment slot.',
    'Doctor is currently unavailable.', 'Doctor not found.',
  ])
  if (status === 409 || (message && slotMessages.has(message))) {
    return { ...result, message: message ?? 'This appointment time is no longer available. Choose another time.', refreshAvailability: true }
  }
  if (status === 404) return { ...result, message: message ?? 'The selected doctor or patient profile is no longer available.', refreshAvailability: true, refreshProfiles: true }
  if (status === 400) {
    for (const [key, messages] of Object.entries(body?.errors ?? {})) {
      if (key.toLowerCase() === 'patientprofileid') result.fieldErrors.patientProfileId = messages[0]
      if (key.toLowerCase() === 'symptoms') result.fieldErrors.symptoms = messages[0]
    }
    return { ...result, message: message ?? Object.values(body?.errors ?? {}).flat()[0] ?? body?.title ?? 'Check the booking details and try again.' }
  }
  return result
}
