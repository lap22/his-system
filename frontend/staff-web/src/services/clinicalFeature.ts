export const clinicalApiEnabled = import.meta.env.VITE_CLINICAL_API_ENABLED === 'true'

export function requireClinicalApiEnabled() {
  if (!clinicalApiEnabled) throw new Error('CLINICAL_API_DISABLED')
}
