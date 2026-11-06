import axios from 'axios'
import { z } from 'zod'
import { apiClient } from './apiClient'

const doctorSchema = z.object({
  id: z.uuid(), userId: z.uuid(), fullName: z.string().trim().min(1),
  departmentId: z.uuid(), departmentName: z.string(), specialization: z.string(), isActive: z.boolean(),
})
export type CurrentDoctor = z.infer<typeof doctorSchema>
export class DoctorIdentityError extends Error {
  readonly code: 'missing' | 'ambiguous' | 'inactive' | 'contract'
  constructor(code: DoctorIdentityError['code']) { super(code); this.code = code }
}

export function resolveCurrentDoctor(data: unknown, userId: string): CurrentDoctor {
  const result = z.array(doctorSchema).safeParse(data)
  if (!result.success || !z.uuid().safeParse(userId).success) throw new DoctorIdentityError('contract')
  const matches = result.data.filter(doctor => doctor.userId === userId)
  if (!matches.length) throw new DoctorIdentityError('missing')
  if (matches.length !== 1) throw new DoctorIdentityError('ambiguous')
  if (!matches[0].isActive) throw new DoctorIdentityError('inactive')
  return matches[0]
}

export async function getCurrentDoctor(userId: string, signal?: AbortSignal): Promise<CurrentDoctor> {
  const response = await apiClient.get('/doctors', { signal })
  return resolveCurrentDoctor(response.data, userId)
}

export function doctorIdentityMessage(error: unknown): string {
  if (error instanceof DoctorIdentityError) return {
    missing: 'No Doctor profile is linked to this account. Contact the hospital administrator.',
    ambiguous: 'The Doctor profile mapping is ambiguous. Contact the hospital administrator.',
    inactive: 'Your Doctor profile is inactive. Contact the hospital administrator.',
    contract: 'The hospital returned an invalid Doctor profile response. Access is paused.',
  }[error.code]
  if (axios.isAxiosError(error)) {
    if (error.response?.status === 401) return 'Your session could not be verified. Sign in again before continuing.'
    if (error.response?.status === 403) return 'This account is not authorized to load Doctor information.'
    if (!error.response) return 'The hospital service could not be reached. Check your connection and retry.'
  }
  return 'Doctor information could not be loaded. Please retry.'
}
