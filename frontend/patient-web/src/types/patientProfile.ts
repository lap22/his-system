import { z } from 'zod'

export const relationshipOptions = ['Self', 'Father', 'Mother', 'Child', 'Spouse', 'Other'] as const
export const genderOptions = ['Male', 'Female', 'Other'] as const
export const bloodTypeOptions = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const

// SQL-loaded .NET DateTime values serialize without a timezone suffix.
const profileTimestampSchema = z.iso.datetime({ local: true, offset: true })

export const patientProfileSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  dateOfBirth: z.iso.date(),
  gender: z.enum(genderOptions),
  phone: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  bloodType: z.enum(bloodTypeOptions).nullable().optional(),
  relationship: z.enum(relationshipOptions),
  isDefault: z.boolean(),
  createdAt: profileTimestampSchema,
  updatedAt: profileTimestampSchema.nullable().optional(),
})

export const patientProfilesSchema = z.array(patientProfileSchema)

export const patientProfileFormSchema = z.object({
  fullName: z.string().trim().min(1, 'Enter the full name.').max(150, 'Use 150 characters or fewer.'),
  dateOfBirth: z.string().min(1, 'Choose a birth date.').pipe(z.iso.date('Use a valid date.')),
  gender: z.enum(genderOptions, 'Choose Male, Female, or Other.'),
  phone: z.string().trim().max(20, 'Use 20 characters or fewer.'),
  address: z.string().trim().max(500, 'Use 500 characters or fewer.'),
  bloodType: z.union([z.enum(bloodTypeOptions), z.literal('')]),
  relationship: z.enum(relationshipOptions, 'Choose a relationship.'),
  isDefault: z.boolean(),
}).refine((value) => value.dateOfBirth <= new Date().toISOString().slice(0, 10), {
  path: ['dateOfBirth'],
  message: 'Date of birth cannot be in the future.',
})

export type RelationshipType = (typeof relationshipOptions)[number]
export type Gender = (typeof genderOptions)[number]
export type BloodType = (typeof bloodTypeOptions)[number]
export type PatientProfile = z.infer<typeof patientProfileSchema>
export type PatientProfileFormValues = z.infer<typeof patientProfileFormSchema>

export type PatientProfileRequest = {
  fullName: string
  dateOfBirth: string
  gender: Gender
  phone: string | null
  address: string | null
  bloodType: BloodType | null
  relationship: RelationshipType
  isDefault: boolean
}

export function toPatientProfileRequest(values: PatientProfileFormValues): PatientProfileRequest {
  return {
    fullName: values.fullName.trim(),
    dateOfBirth: values.dateOfBirth,
    gender: values.gender,
    phone: values.phone.trim() || null,
    address: values.address.trim() || null,
    bloodType: values.bloodType || null,
    relationship: values.relationship,
    isDefault: values.isDefault,
  }
}
