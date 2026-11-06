import type { UserRole } from '../types/auth'

export const doctorHome = '/doctor/dashboard'

export function isDoctorPath(value: unknown): value is string {
  return typeof value === 'string' && /^\/doctor\/(dashboard|schedule|queue|appointments(?:\/[A-Za-z0-9-]+)?)$/.test(value)
}

export function canAccessDoctor(role: unknown): boolean {
  return role === 'Doctor'
}

export function loginDestination(role: UserRole, state: unknown, generation: number, userId: string): string {
  if (role !== 'Doctor') return '/'
  if (state && typeof state === 'object' && 'from' in state && 'generation' in state && 'userId' in state
    && isDoctorPath(state.from) && typeof state.generation === 'number' && state.generation + 1 === generation
    && (state.userId === null || state.userId === userId)) return state.from
  return doctorHome
}
