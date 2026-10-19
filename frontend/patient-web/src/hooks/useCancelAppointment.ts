import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from './useAuth'
import { appointmentKeys } from './useCreateAppointment'
import { appointmentsApi, appointmentCancellationError, appointmentReadError } from '../services/appointmentsApi'
import { authSession } from '../services/authSession'
import { clearCancellationProtection, readCancellationProtection, saveCancellationProtection } from '../services/cancellationProtection'
import type { CancellationProtection } from '../services/cancellationProtection'
import type { Appointment } from '../types/appointment'
import { appointmentStatusLabels, canCancelAppointment } from '../utils/myAppointments'

class CancellationPreparationError extends Error {}

// Mounted per account/appointment. The storage guard survives page navigation or reload.
export function useCancelAppointment(id: string) {
  const { user } = useAuth()
  const userId = user!.userId
  const client = useQueryClient()
  const working = useRef(false)
  const [protection, setProtection] = useState<CancellationProtection>(() => readCancellationProtection(userId, id))
  const [checking, setChecking] = useState(false)
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null)
  const samePatient = () => {
    const auth = authSession.getSnapshot()
    return auth.status === 'authenticated' && auth.user?.role === 'Patient' && auth.user.userId === userId
  }
  const clearGuard = () => {
    const cleared = clearCancellationProtection(userId, id)
    setProtection(cleared ? 'clear' : 'unavailable')
  }
  const remember = (appointment: Appointment) => {
    if (!samePatient()) return
    client.setQueryData(appointmentKeys.patientDetail(userId, id), appointment)
    client.setQueryData(appointmentKeys.detail(id), appointment)
    void client.invalidateQueries({ queryKey: appointmentKeys.all })
    void client.invalidateQueries({ queryKey: ['appointmentSlots', appointment.doctorId, appointment.appointmentDate] })
  }
  const mutation = useMutation({
    retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: async (reason: string) => {
      let current: Appointment
      try { current = await appointmentsApi.detail(id) }
      catch (error) { throw new CancellationPreparationError(`${appointmentReadError(error)} No cancellation request was sent.`) }
      if (!samePatient()) throw new CancellationPreparationError('Your session changed. No cancellation request was sent.')
      if (current.status === 'Cancelled') { clearGuard(); return current }
      if (!canCancelAppointment(current.status)) throw new CancellationPreparationError('This appointment can no longer be cancelled. No cancellation request was sent.')
      if (readCancellationProtection(userId, id) !== 'clear' || !saveCancellationProtection(userId, id)) {
        setProtection(readCancellationProtection(userId, id) === 'unresolved' ? 'unresolved' : 'unavailable')
        throw new CancellationPreparationError('Cancellation protection could not be verified. No cancellation request was sent. Check the current status or contact the hospital.')
      }
      setProtection('unresolved')
      try {
        const appointment = await appointmentsApi.cancel(current, reason)
        clearGuard()
        return appointment
      } catch (error) {
        if (!appointmentCancellationError(error).uncertain) clearGuard()
        throw error
      }
    },
    onSuccess: remember,
    onError: () => { if (samePatient()) void client.invalidateQueries({ queryKey: appointmentKeys.all }) },
  })
  const cancel = async (reason: string) => {
    if (working.current || protection !== 'clear' || reason.length > 1000 || !samePatient()) return
    const saved = readCancellationProtection(userId, id)
    if (saved !== 'clear') { setProtection(saved); return }
    working.current = true
    setVerificationMessage(null)
    try { await mutation.mutateAsync(reason) } catch { /* Mutation state supplies the visible error. Never retry. */ }
    finally { working.current = false }
  }
  const verify = async () => {
    if (working.current || !samePatient()) return
    working.current = true
    setChecking(true)
    try {
      const appointment = await appointmentsApi.detail(id)
      if (!samePatient()) return
      remember(appointment)
      if (appointment.status === 'Cancelled') {
        clearGuard()
        mutation.reset()
        setVerificationMessage('The hospital confirms that this appointment is cancelled.')
      } else {
        setVerificationMessage(`The current status is ${appointmentStatusLabels[appointment.status]}. This does not prove the previous cancellation failed. Do not submit it again; contact the hospital if the outcome remains unresolved.`)
      }
    } catch (error) { setVerificationMessage(`${appointmentReadError(error)} The previous cancellation remains unresolved.`) }
    finally { working.current = false; setChecking(false) }
  }
  const failure = mutation.error instanceof CancellationPreparationError
    ? { message: mutation.error.message, uncertain: false } : mutation.isError ? appointmentCancellationError(mutation.error) : null
  return { cancel, verify, protection, checking, pending: mutation.isPending, failure,
    success: mutation.isSuccess, result: mutation.data, verificationMessage }
}
