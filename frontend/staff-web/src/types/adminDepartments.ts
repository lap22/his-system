import { z } from 'zod'

export const departmentSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(150),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string().nullable(),
})

export const departmentListSchema = z.array(departmentSchema)
export type Department = z.infer<typeof departmentSchema>

export const departmentFormSchema = z.object({
  name: z.string().trim().min(1, 'Department name is required.').max(150, 'Use at most 150 characters.'),
  description: z.string().trim().max(1000, 'Use at most 1,000 characters.'),
})
export type DepartmentForm = z.infer<typeof departmentFormSchema>
