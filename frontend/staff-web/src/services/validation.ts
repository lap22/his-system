import { z } from 'zod'
import { queueStatusSchema } from '../types/doctorQueue'

export const queueFilterSchema = z.object({
  date: z.iso.date(),
  status: z.union([z.literal('all'), queueStatusSchema]),
})

export type QueueFilterForm = z.infer<typeof queueFilterSchema>
