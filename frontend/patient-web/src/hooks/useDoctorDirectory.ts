import { useQuery } from '@tanstack/react-query'
import { doctorDirectoryApi } from '../services/doctorDirectoryApi'

export function useDepartments() {
  return useQuery({
    queryKey: ['departments', 'active'],
    queryFn: ({ signal }) => doctorDirectoryApi.departments(signal),
  })
}

export function useDoctors(departmentId: string) {
  return useQuery({
    queryKey: ['doctors', 'active', { departmentId }],
    queryFn: ({ signal }) => doctorDirectoryApi.doctors(departmentId, signal),
  })
}

export function useDoctor(id: string | null) {
  return useQuery({
    queryKey: ['doctors', 'detail', id],
    queryFn: ({ signal }) => doctorDirectoryApi.doctor(id!, signal),
    enabled: Boolean(id),
  })
}

export function useAvailableAppointments(doctorId: string, date: string) {
  return useQuery({
    queryKey: ['appointmentSlots', doctorId, date],
    queryFn: ({ signal }) => doctorDirectoryApi.availableSlots(doctorId, date, signal),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  })
}
