import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { appointmentKeys } from './useCreateAppointment'
import { patientQueueApi, checkInError } from '../services/patientQueueApi'
import type { Appointment } from '../types/appointment'
import type { PatientQueueEntry } from '../types/patientQueue'

export const patientQueueKeys = {
  my: (userId: string | undefined) => ['patientQueue', userId, 'my'] as const,
}

export function usePatientQueue() {
  const { user, status } = useAuth()
  return useQuery({ queryKey: patientQueueKeys.my(user?.userId), queryFn: ({ signal }) => patientQueueApi.my(signal),
    enabled: status === 'authenticated' && user?.role === 'Patient', retry: false, staleTime: 0,
    refetchOnMount: 'always', refetchInterval: 30_000 })
}

class UncertainCheckInError extends Error {}

export function useCheckInAppointment(appointment: Appointment | undefined) {
  const { user } = useAuth()
  const client = useQueryClient()
  const working = useRef(false)
  const [unresolved, setUnresolved] = useState(false)
  const [verifiedEntry, setVerifiedEntry] = useState<PatientQueueEntry | null>(null)
  const mutation = useMutation({
    retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: async () => {
      if (!appointment) throw new Error('Appointment unavailable.')
      try { return await patientQueueApi.checkIn(appointment) }
      catch (error) {
        if (checkInError(error).definitive) throw error
        try {
          const match = (await patientQueueApi.my()).find(row => row.appointmentId === appointment.id)
          if (match) return patientQueueApi.verify(match, appointment)
        } catch { /* Absence or a failed read cannot prove the POST failed. */ }
        throw new UncertainCheckInError()
      }
    },
    onSuccess: entry => {
      setUnresolved(false); setVerifiedEntry(entry)
      client.setQueryData(patientQueueKeys.my(user?.userId), (current: PatientQueueEntry[] | undefined) =>
        [...(current ?? []).filter(row => row.appointmentId !== entry.appointmentId), entry])
      void client.invalidateQueries({ queryKey: appointmentKeys.all })
    },
    onError: error => setUnresolved(error instanceof UncertainCheckInError),
  })
  const submit = async () => {
    if (working.current || mutation.isPending || unresolved || !appointment) return
    working.current = true
    try { await mutation.mutateAsync() } catch { /* Visible mutation state owns the error. */ }
    finally { working.current = false }
  }
  const failure = mutation.isError ? checkInError(mutation.error) : null
  return { submit, pending: mutation.isPending, failure, unresolved, entry: verifiedEntry ?? mutation.data ?? null }
}
