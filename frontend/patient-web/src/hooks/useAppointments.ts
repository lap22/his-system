import { useQuery } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { appointmentKeys } from './useCreateAppointment'
import { appointmentsApi } from '../services/appointmentsApi'

export function useMyAppointments() {
  const { user, status } = useAuth()
  return useQuery({ queryKey: appointmentKeys.my(user?.userId),
    queryFn: ({ signal }) => appointmentsApi.my(signal), enabled: status === 'authenticated' && user?.role === 'Patient',
    staleTime: 0, refetchOnMount: 'always', refetchInterval: 60_000, retry: false,
  })
}

export function useAppointment(id: string) {
  const { user, status } = useAuth()
  return useQuery({ queryKey: appointmentKeys.patientDetail(user?.userId, id),
    queryFn: ({ signal }) => appointmentsApi.detail(id, signal), enabled: status === 'authenticated' && user?.role === 'Patient',
    staleTime: 0, refetchOnMount: 'always', retry: false,
  })
}
