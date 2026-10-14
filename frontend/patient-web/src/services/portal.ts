import type { UserRole } from '../types/auth'
export const portal = {
  name: 'HIS Patient Portal',
  roles: ['Patient'] as UserRole[],
  otherUrl: import.meta.env.VITE_STAFF_PORTAL_URL || 'http://localhost:5174',
}
