import { z } from 'zod'

export const doctorAdminSchema = z.object({
  id: z.uuid(), userId: z.uuid(), email: z.email(), departmentId: z.uuid(), departmentName: z.string(),
  fullName: z.string().trim().min(1), phone: z.string().nullable(), specialization: z.string().trim().min(1),
  licenseNumber: z.string().trim().min(1), yearsOfExperience: z.number().int().min(0).max(80),
  biography: z.string().nullable(), avatarUrl: z.string().nullable(), isActive: z.boolean(),
  createdAt: z.string(), updatedAt: z.string().nullable(),
})
export const doctorAdminListSchema = z.array(doctorAdminSchema)
export type AdminDoctor = z.infer<typeof doctorAdminSchema>

const profileFields = {
  departmentId: z.uuid('Select an active department.'),
  fullName: z.string().trim().min(1, 'Full name is required.').max(150),
  phone: z.string().trim().max(20),
  specialization: z.string().trim().min(1, 'Specialization is required.').max(150),
  licenseNumber: z.string().trim().min(1, 'License number is required.').max(100),
  yearsOfExperience: z.number().int().min(0).max(80),
  biography: z.string().trim().max(2000),
  avatarUrl: z.union([z.literal(''), z.url('Enter a valid URL.')]).pipe(z.string().max(1000)),
}
export const createDoctorSchema = z.object({
  email: z.email('Enter a valid email address.').max(255),
  password: z.string().min(8, 'Use at least 8 characters.').max(100),
  ...profileFields,
})
export const updateDoctorSchema = z.object(profileFields)
export type CreateDoctorForm = z.infer<typeof createDoctorSchema>
export type UpdateDoctorForm = z.infer<typeof updateDoctorSchema>

export function filterAdminDoctors(rows: readonly AdminDoctor[], search: string, departmentId: string, status: string) {
  const term = search.trim().toLocaleLowerCase()
  return rows.filter(row => (!term || row.fullName.toLocaleLowerCase().includes(term)) &&
    (!departmentId || row.departmentId === departmentId) &&
    (status === 'all' || row.isActive === (status === 'active')))
}
