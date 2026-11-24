import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { clinicalApiEnabled } from '../services/clinicalFeature'
import { medicalRecordsApi } from '../services/medicalRecordsApi'
import { medicalHistoryKeys } from '../utils/medicalHistory'

export function useMedicalHistory(patientProfileId: string) {
  const { user, status } = useAuth()
  return useQuery({
    queryKey: medicalHistoryKeys.profile(user?.userId ?? '', patientProfileId),
    queryFn: ({ signal }) => medicalRecordsApi.forPatientProfile(patientProfileId, signal),
    enabled: clinicalApiEnabled && status === 'authenticated' && user?.role === 'Patient' && patientProfileId.length > 0,
    retry: false,
    staleTime: 30_000,
  })
}
