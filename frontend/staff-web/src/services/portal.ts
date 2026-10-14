import type { UserRole } from '../types/auth'
export const portal = {
  name: 'HIS Staff Portal',
  roles: ['Doctor', 'Admin'] as UserRole[],
  otherUrl: import.meta.env.VITE_PATIENT_PORTAL_URL || 'http://localhost:5173',
}
