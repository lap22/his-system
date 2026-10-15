import { useMutation, useQueryClient } from '@tanstack/react-query'
import { appointmentsApi, appointmentBookingError } from '../services/appointmentsApi'
import { authSession } from '../services/authSession'
import { patientProfileKeys } from './usePatientProfiles'

export const appointmentKeys = {
  all: ['appointments'] as const,
  detail: (id: string) => ['appointments', 'detail', id] as const,
}

export function useCreateAppointment() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: appointmentsApi.create,
    // Never queue a booking offline and unexpectedly submit it on reconnect.
    networkMode: 'always',
    retry: false,
    gcTime: 0,
    onMutate: () => ({ userId: authSession.getSnapshot().user?.userId }),
    onSuccess: (appointment, request, context) => {
      // A late response must not populate another signed-in Patient's cache.
      if (!context?.userId || context.userId !== authSession.getSnapshot().user?.userId) return
      client.setQueryData(appointmentKeys.detail(appointment.id), appointment)
      // A failed follow-up read must never turn a successful POST into an error.
      void client.invalidateQueries({ queryKey: appointmentKeys.all })
      void client.invalidateQueries({ queryKey: ['appointmentSlots', request.doctorId, request.appointmentDate] })
    },
    onError: (error, request, context) => {
      if (!context?.userId || context.userId !== authSession.getSnapshot().user?.userId) return
      const failure = appointmentBookingError(error)
      if (failure.refreshAvailability) {
        void client.invalidateQueries({ queryKey: ['appointmentSlots', request.doctorId, request.appointmentDate] })
      }
      if (failure.refreshProfiles) void client.invalidateQueries({ queryKey: patientProfileKeys.all })
    },
  })
}
