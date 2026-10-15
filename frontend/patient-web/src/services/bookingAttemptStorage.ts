import { z } from 'zod'
import { appointmentSchema, createAppointmentRequestSchema } from '../types/appointment'
import type { Appointment, CreateAppointmentRequest } from '../types/appointment'
import { appointmentSlotSchema } from '../types/appointmentAvailability'
import { normalizeAppointmentTime } from '../utils/appointmentFormatting'

export const bookingSelectionSchema = z.object({
  doctor: z.object({ id: z.uuid(), fullName: z.string(), departmentName: z.string() }),
  date: z.iso.date(),
  slot: appointmentSlotSchema,
})
const attemptSchema = z.object({
  userId: z.uuid(), selection: bookingSelectionSchema, request: createAppointmentRequestSchema,
  previousAppointmentIds: z.array(z.uuid()), startedAt: z.iso.datetime(), knownAppointmentId: z.uuid().optional(),
})
const storedSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('unresolved'), attempt: attemptSchema }),
  z.object({ kind: z.literal('resolved'), attempt: attemptSchema, appointment: appointmentSchema,
    source: z.enum(['created', 'existing', 'reconciled']) }),
])

export type BookingSelection = z.infer<typeof bookingSelectionSchema>
export type BookingAttempt = z.infer<typeof attemptSchema>
export type StoredBooking = z.infer<typeof storedSchema>
export type BookingResultSource = Extract<StoredBooking, { kind: 'resolved' }>['source']
const key = (userId: string) => `his-booking-attempt-${userId}`

// Session-scoped and account-scoped. No token, password or server idempotency key is stored.
export function readBookingAttempt(userId: string): StoredBooking | null | 'unreadable' {
  try {
    const raw = sessionStorage.getItem(key(userId))
    if (!raw) return null
    const parsed = storedSchema.safeParse(JSON.parse(raw))
    if (!parsed.success || parsed.data.attempt.userId !== userId) return 'unreadable'
    const { request, selection } = parsed.data.attempt
    if (selection.doctor.id !== request.doctorId || selection.date !== request.appointmentDate
      || normalizeAppointmentTime(selection.slot.startTime) !== normalizeAppointmentTime(request.startTime)) return 'unreadable'
    if (parsed.data.kind === 'resolved' && !appointmentMatchesRequest(parsed.data.appointment, request)) return 'unreadable'
    return parsed.data
  } catch { return 'unreadable' }
}

export function saveBookingAttempt(userId: string, value: StoredBooking): boolean {
  try {
    sessionStorage.setItem(key(userId), JSON.stringify(value))
    return true
  } catch { return false }
}

export function clearBookingAttempt(userId: string): boolean {
  try { sessionStorage.removeItem(key(userId)); return true } catch { return false }
}

export function appointmentMatchesRequest(appointment: Appointment, request: CreateAppointmentRequest): boolean {
  return appointment.patientProfileId === request.patientProfileId && appointment.doctorId === request.doctorId
    && appointment.appointmentDate === request.appointmentDate
    && normalizeAppointmentTime(appointment.startTime) === normalizeAppointmentTime(request.startTime)
}

export function findReconciledAppointment(attempt: BookingAttempt, appointments: Appointment[]): Appointment | null {
  const matches = appointments.filter((appointment) => appointmentMatchesRequest(appointment, attempt.request)
    && !attempt.previousAppointmentIds.includes(appointment.id)
    && (!attempt.knownAppointmentId || appointment.id === attempt.knownAppointmentId))
  // Neither absence nor multiple possible records proves an outcome. Client clock
  // timestamps are diagnostic only and never exclude a server-confirmed match.
  return matches.length === 1 ? matches[0] : null
}
