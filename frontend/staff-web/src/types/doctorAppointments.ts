import { z } from 'zod'

export const appointmentStatusSchema = z.enum(['Pending', 'Confirmed', 'CheckedIn', 'InProgress', 'Completed', 'Cancelled', 'NoShow'])
const timestamp = z.iso.datetime({ local: true, offset: true })
export const doctorAppointmentSchema = z.object({
  id: z.uuid(), patientProfileId: z.uuid(), patientName: z.string(), doctorId: z.uuid(), doctorName: z.string(),
  departmentId: z.uuid(), departmentName: z.string(), appointmentDate: z.iso.date(),
  startTime: z.iso.time(), endTime: z.iso.time(), symptoms: z.string().nullable(), status: appointmentStatusSchema,
  createdAt: timestamp, updatedAt: timestamp.nullable(), cancelledAt: timestamp.nullable(), cancellationReason: z.string().nullable(),
})
export type DoctorAppointment = z.infer<typeof doctorAppointmentSchema>
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>
export const appointmentFiltersSchema = z.object({ date: z.iso.date().optional(), status: appointmentStatusSchema.optional() })
export type AppointmentFilters = z.infer<typeof appointmentFiltersSchema>
export const weekDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const doctorScheduleSchema = z.object({
  id: z.uuid(), doctorId: z.uuid(), doctorName: z.string(), dayOfWeek: z.enum(weekDays),
  startTime: z.iso.time(), endTime: z.iso.time(), slotDurationMinutes: z.number().int().positive(),
  maxPatients: z.number().int().positive(), isActive: z.boolean(),
})
export type DoctorSchedule = z.infer<typeof doctorScheduleSchema>
