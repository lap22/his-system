import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { patientProfilesApi } from '../services/patientProfilesApi'
import type { PatientProfileRequest } from '../types/patientProfile'

export const patientProfileKeys = {
  all: ['patientProfiles'] as const,
  detail: (id: string) => ['patientProfiles', id] as const,
}

export function usePatientProfiles() {
  return useQuery({
    queryKey: patientProfileKeys.all,
    queryFn: patientProfilesApi.list,
  })
}

export function usePatientProfile(id: string | null) {
  return useQuery({
    queryKey: id ? patientProfileKeys.detail(id) : ['patientProfiles', 'none'],
    queryFn: () => patientProfilesApi.get(id ?? ''),
    enabled: Boolean(id),
  })
}

export function useCreatePatientProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: patientProfilesApi.create,
    onSuccess: (profile) => {
      client.setQueryData(patientProfileKeys.detail(profile.id), profile)
      void client.invalidateQueries({ queryKey: patientProfileKeys.all })
    },
  })
}

export function useUpdatePatientProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: ({ id, request }: { id: string; request: PatientProfileRequest }) =>
      patientProfilesApi.update(id, request),
    onSuccess: (profile) => {
      client.setQueryData(patientProfileKeys.detail(profile.id), profile)
      void client.invalidateQueries({ queryKey: patientProfileKeys.all })
    },
  })
}

export function useDeletePatientProfile() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: patientProfilesApi.remove,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: patientProfileKeys.all })
    },
  })
}
