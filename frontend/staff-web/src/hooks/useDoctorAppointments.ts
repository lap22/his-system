import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuth } from './useAuth'
import { useCurrentDoctor } from './useCurrentDoctor'
import { doctorAppointmentsApi } from '../services/doctorAppointmentsApi'
import { getDoctorSchedules } from '../services/doctorSchedulesApi'
import type { AppointmentFilters } from '../types/doctorAppointments'

export const doctorAppointmentKeys = {
  lists: (userId: string, doctorId: string) => ['doctorAppointments', userId, doctorId, 'list'] as const,
  list: (userId: string, doctorId: string, filters: AppointmentFilters) => [...doctorAppointmentKeys.lists(userId, doctorId), filters.date ?? '', filters.status ?? ''] as const,
  detail: (userId: string, doctorId: string, id: string) => ['doctorAppointments', userId, doctorId, 'detail', id] as const,
}
function useScope() {
  const { user, status } = useAuth()
  const doctor = useCurrentDoctor()
  return { userId: user?.userId ?? '', doctorId: doctor.data?.id ?? '', enabled: status === 'authenticated' && user?.role === 'Doctor' && doctor.isSuccess }
}
export function useDoctorAppointments(filters: AppointmentFilters | null = {}) {
  const scope = useScope()
  return useQuery({ queryKey: doctorAppointmentKeys.list(scope.userId, scope.doctorId, filters ?? {}),
    queryFn: ({ signal }) => doctorAppointmentsApi.list(scope.doctorId, filters!, signal), enabled: scope.enabled && filters !== null,
    staleTime: 30_000, retry: false, refetchInterval: 60_000 })
}
export function useDoctorAppointmentDetail(id: string) {
  const scope = useScope()
  return useQuery({ queryKey: doctorAppointmentKeys.detail(scope.userId, scope.doctorId, id),
    queryFn: ({ signal }) => doctorAppointmentsApi.detail(scope.doctorId, id, signal), enabled: scope.enabled && z.uuid().safeParse(id).success,
    staleTime: 15_000, retry: false })
}
export function useDoctorSchedules() {
  const scope = useScope()
  return useQuery({ queryKey: ['doctorSchedules', scope.userId, scope.doctorId],
    queryFn: ({ signal }) => getDoctorSchedules(scope.doctorId, signal), enabled: scope.enabled,
    staleTime: 60_000, retry: false })
}
