import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { getCurrentDoctor } from '../services/doctorsApi'

export const currentDoctorKey = (userId: string | undefined) => ['doctorIdentity', userId] as const

export function useCurrentDoctor() {
  const { user, status } = useAuth()
  return useQuery({
    queryKey: currentDoctorKey(user?.userId),
    queryFn: ({ signal }) => getCurrentDoctor(user!.userId, signal),
    enabled: status === 'authenticated' && user?.role === 'Doctor',
    staleTime: 30_000, retry: false,
  })
}
