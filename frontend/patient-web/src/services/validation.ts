import { z } from 'zod'

export const appointmentRequestSchema = z.object({
  departmentId: z.string().min(1, 'Select a department'),
  preferredDate: z.string().min(1, 'Choose a preferred date'),
  reason: z.string().min(10, 'Describe the reason in at least 10 characters'),
})

export type AppointmentRequestForm = z.infer<typeof appointmentRequestSchema>
