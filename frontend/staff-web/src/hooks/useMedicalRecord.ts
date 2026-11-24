import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { clinicalApiEnabled } from '../services/clinicalFeature'
import { medicalRecordsApi } from '../services/medicalRecordsApi'
import type { ClinicalDraft } from '../types/clinicalDraft'
import type { ProposedMedicalRecordResponse } from '../types/proposedMedicalRecords'

export const medicalRecordKeys = {
  appointment: (userId: string, appointmentId: string) =>
    ['medicalRecords', userId, 'appointment', appointmentId] as const,
}

export function useAppointmentMedicalRecord(appointmentId: string) {
  const { user, status } = useAuth()
  return useQuery({
    queryKey: medicalRecordKeys.appointment(user?.userId ?? '', appointmentId),
    queryFn: ({ signal }) => medicalRecordsApi.byAppointment(appointmentId, signal),
    enabled: clinicalApiEnabled && status === 'authenticated' && user?.role === 'Doctor',
    retry: false,
    staleTime: 0,
  })
}

export function useSaveMedicalRecord(appointmentId: string, record: ProposedMedicalRecordResponse | null | undefined) {
  const { user } = useAuth()
  const client = useQueryClient()
  const key = medicalRecordKeys.appointment(user?.userId ?? '', appointmentId)
  return useMutation({
    mutationFn: (draft: ClinicalDraft) => record
      ? medicalRecordsApi.update(record.id, record.rowVersion, draft)
      : medicalRecordsApi.create(appointmentId, draft),
    onSuccess: saved => client.setQueryData(key, saved),
    retry: false,
  })
}

export function useFinalizeMedicalRecord(appointmentId: string, record: ProposedMedicalRecordResponse | null | undefined) {
  const { user } = useAuth()
  const client = useQueryClient()
  const key = medicalRecordKeys.appointment(user?.userId ?? '', appointmentId)
  return useMutation({
    mutationFn: (draft: ClinicalDraft) => {
      if (!record) throw new Error('Save a draft before finalizing.')
      return medicalRecordsApi.finalize(record.id, record.rowVersion, draft)
    },
    onSuccess: saved => {
      client.setQueryData(key, saved)
      void client.invalidateQueries({ queryKey: ['doctorAppointments', user?.userId ?? ''] })
    },
    retry: false,
  })
}
