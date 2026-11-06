import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { useAuth } from './useAuth'
import { useCurrentDoctor } from './useCurrentDoctor'
import { doctorQueueApi } from '../services/doctorQueueApi'

export const doctorQueueKeys = {
  root: (userId: string, doctorId: string) => ['doctorQueue', userId, doctorId] as const,
  date: (userId: string, doctorId: string, date: string) => [...doctorQueueKeys.root(userId, doctorId), date] as const,
}
export function useDoctorQueue(date: string) {
  const { user, status } = useAuth()
  const doctor = useCurrentDoctor()
  return useQuery({ queryKey: doctorQueueKeys.date(user?.userId ?? '', doctor.data?.id ?? '', date),
    queryFn: ({ signal }) => doctorQueueApi.list(doctor.data!.id, date, signal),
    enabled: status === 'authenticated' && user?.role === 'Doctor' && doctor.isSuccess && z.iso.date().safeParse(date).success,
    staleTime: 10_000, retry: false, refetchInterval: 30_000 })
}
