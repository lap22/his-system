import { z } from 'zod'

const timestampSchema = z.iso.datetime({ local: true, offset: true })

export const departmentSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema.nullable(),
})

export const doctorSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  email: z.string(),
  departmentId: z.uuid(),
  departmentName: z.string(),
  fullName: z.string(),
  phone: z.string().nullable(),
  specialization: z.string(),
  licenseNumber: z.string(),
  yearsOfExperience: z.number().int(),
  biography: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: timestampSchema,
  updatedAt: timestampSchema.nullable(),
})

export type Department = z.infer<typeof departmentSchema>
export type Doctor = z.infer<typeof doctorSchema>
