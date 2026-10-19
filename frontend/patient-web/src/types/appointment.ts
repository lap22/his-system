import { z } from 'zod'

export const appointmentBookingFormSchema = z.object({
  patientProfileId: z.uuid('Choose a patient profile.'),
  symptoms: z.string().max(2000, 'Use 2,000 characters or fewer.'),
})

export const createAppointmentRequestSchema = z.object({
  patientProfileId: z.uuid(),
  doctorId: z.uuid(),
  appointmentDate: z.iso.date(),
  startTime: z.iso.time(),
  symptoms: z.string().max(2000).nullable(),
})

const timestampSchema = z.iso.datetime({ local: true, offset: true })
export const appointmentStatusSchema = z.enum(['Pending', 'Confirmed', 'CheckedIn', 'InProgress', 'Completed', 'Cancelled', 'NoShow'])
export const cancelAppointmentRequestSchema = z.object({ reason: z.string().max(1000).nullable() })

// Mirrors AppointmentResponse; the server determines endTime and status.
export const appointmentSchema = z.object({
  id: z.uuid(),
  patientProfileId: z.uuid(),
  patientName: z.string(),
  doctorId: z.uuid(),
  doctorName: z.string(),
  departmentId: z.uuid(),
  departmentName: z.string(),
  appointmentDate: z.iso.date(),
  startTime: z.iso.time(),
  endTime: z.iso.time(),
  symptoms: z.string().nullable(),
  status: appointmentStatusSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema.nullable(),
  cancelledAt: timestampSchema.nullable(),
  cancellationReason: z.string().nullable(),
})

export type AppointmentBookingForm = z.infer<typeof appointmentBookingFormSchema>
export type CreateAppointmentRequest = z.infer<typeof createAppointmentRequestSchema>
export type Appointment = z.infer<typeof appointmentSchema>
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>
