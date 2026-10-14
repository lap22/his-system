import { z } from 'zod'

export const queueFilterSchema = z.object({
  departmentId: z.string().min(1, 'Select a department'),
  status: z.enum(['all', 'waiting', 'in-consultation']),
})

export type QueueFilterForm = z.infer<typeof queueFilterSchema>
