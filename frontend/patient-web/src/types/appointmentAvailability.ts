import { z } from 'zod'

export const appointmentSlotSchema = z.object({
  startTime: z.iso.time(),
  endTime: z.iso.time(),
  isAvailable: z.boolean(),
  reason: z.enum(['Available', 'Completed', 'Full', 'Past', 'Inactive']),
})

export const appointmentSlotsSchema = z.array(appointmentSlotSchema)
export type AppointmentSlot = z.infer<typeof appointmentSlotSchema>
