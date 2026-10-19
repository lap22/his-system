export type CancellationProtection = 'clear' | 'unresolved' | 'unavailable'
const key = (userId: string, appointmentId: string) => `his-cancellation-${userId}-${appointmentId}`

export function readCancellationProtection(userId: string, appointmentId: string): CancellationProtection {
  try {
    const value = sessionStorage.getItem(key(userId, appointmentId))
    return value === null ? 'clear' : value === 'unresolved' ? 'unresolved' : 'unavailable'
  } catch { return 'unavailable' }
}

export function saveCancellationProtection(userId: string, appointmentId: string): boolean {
  try { sessionStorage.setItem(key(userId, appointmentId), 'unresolved'); return true } catch { return false }
}

export function clearCancellationProtection(userId: string, appointmentId: string): boolean {
  try { sessionStorage.removeItem(key(userId, appointmentId)); return true } catch { return false }
}
