import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { BookingContext } from '../../hooks/useBookingController'
import type { BookingState } from '../../hooks/useBookingController'
import { appointmentKeys, useCreateAppointment } from '../../hooks/useCreateAppointment'
import { appointmentsApi, appointmentBookingError } from '../../services/appointmentsApi'
import { authSession } from '../../services/authSession'
import { appointmentMatchesRequest, clearBookingAttempt, findReconciledAppointment, readBookingAttempt, saveBookingAttempt } from '../../services/bookingAttemptStorage'
import type { BookingAttempt, BookingResultSource, BookingSelection } from '../../services/bookingAttemptStorage'
import { doctorDirectoryApi } from '../../services/doctorDirectoryApi'
import { patientProfilesApi } from '../../services/patientProfilesApi'
import type { Appointment, AppointmentBookingForm } from '../../types/appointment'
import { normalizeAppointmentTime } from '../../utils/appointmentFormatting'

const emptyState = (): BookingState => ({ stage: 'idle', selection: null, attempt: null, appointment: null,
  source: null, failure: null, message: null, open: false, revision: 0, storageError: false })
const isBusy = (state: BookingState) => ['preparing', 'pending', 'reconciling'].includes(state.stage)
const isBlocked = (state: BookingState) => isBusy(state) || ['uncertain', 'blocked'].includes(state.stage) || state.storageError

function restore(userId: string): BookingState {
  const saved = readBookingAttempt(userId)
  if (!saved) return emptyState()
  if (saved === 'unreadable') return { ...emptyState(), stage: 'blocked', storageError: true,
    message: 'Saved booking protection could not be read. New bookings are paused. Contact the hospital to verify any previous request.' }
  return { ...emptyState(), stage: saved.kind === 'resolved' ? 'success' : 'uncertain',
    attempt: saved.attempt, selection: saved.attempt.selection,
    appointment: saved.kind === 'resolved' ? saved.appointment : null,
    source: saved.kind === 'resolved' ? saved.source : null,
    message: saved.kind === 'unresolved' ? 'A previous booking request still needs verification. New bookings are paused.' : null }
}

export function BookingProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [state, setState] = useState<BookingState>(() => restore(userId))
  const current = useRef(state)
  const working = useRef(false)
  const create = useCreateAppointment()
  const client = useQueryClient()
  const change = (next: BookingState) => { current.current = next; setState(next) }
  const samePatient = () => {
    const auth = authSession.getSnapshot()
    return auth.status === 'authenticated' && auth.user?.role === 'Patient' && auth.user.userId === userId
  }
  const showStorageProblem = () => change({ ...current.current, stage: 'blocked', storageError: true, open: true,
    message: 'Booking protection cannot be saved in this browser. No new booking will be sent. Enable session storage or contact the hospital to verify the previous request.' })
  const remember = (appointment: Appointment, attempt: BookingAttempt) => {
    if (!samePatient()) return
    client.setQueryData(appointmentKeys.detail(appointment.id), appointment)
    void client.invalidateQueries({ queryKey: appointmentKeys.all })
    void client.invalidateQueries({ queryKey: ['appointmentSlots', attempt.request.doctorId, attempt.request.appointmentDate] })
  }
  const resolved = (attempt: BookingAttempt, appointment: Appointment, source: BookingResultSource) => {
    const saved = saveBookingAttempt(userId, { kind: 'resolved', attempt, appointment, source })
    if (source !== 'created') remember(appointment, attempt)
    change({ ...current.current, stage: 'success', selection: attempt.selection, attempt, appointment, source,
      failure: null, message: saved ? null : 'The appointment is verified, but browser booking protection could not be updated. Keep this appointment reference and contact the hospital if the problem persists.',
      open: true, revision: current.current.revision + 1, storageError: !saved })
  }
  const runReconciliation = async (attempt: BookingAttempt) => {
    change({ ...current.current, stage: 'reconciling', failure: null, message: null })
    try {
      const appointments = await appointmentsApi.my()
      if (!samePatient()) return
      const match = findReconciledAppointment(attempt, appointments)
      if (match) resolved(attempt, match, 'reconciled')
      else change({ ...current.current, stage: 'uncertain',
        message: 'No single verifiable matching appointment was found. This does not prove the request failed. New bookings remain paused. Check again or ask the hospital to verify the details below.' })
    } catch {
      if (samePatient()) change({ ...current.current, stage: 'uncertain',
        message: 'Your appointments could not be checked. The request remains unresolved. Check your connection and sign in with the same Patient account before checking again, or contact the hospital.' })
    }
  }

  const startReview = (selection: BookingSelection) => {
    if (working.current || isBlocked(current.current)) {
      change({ ...current.current, open: true })
      return
    }
    if (!samePatient()) return
    const saved = readBookingAttempt(userId)
    if (saved === 'unreadable' || saved?.kind === 'unresolved') {
      change({ ...restore(userId), open: true, revision: current.current.revision + 1 })
      return
    }
    if (!clearBookingAttempt(userId)) { showStorageProblem(); return }
    create.reset()
    change({ ...emptyState(), stage: 'review', selection, open: true, revision: current.current.revision })
  }
  const submitBooking = async (values: AppointmentBookingForm) => {
    const review = current.current
    if (working.current || !['review', 'error'].includes(review.stage) || !review.selection || !samePatient()) return
    // An old in-flight response may have restored a guard after a layout remount.
    const saved = readBookingAttempt(userId)
    if (saved) { change({ ...restore(userId), open: true, revision: review.revision + 1 }); return }
    working.current = true
    change({ ...review, stage: 'preparing', failure: null, message: null })
    const selection = review.selection
    const request = { patientProfileId: values.patientProfileId, doctorId: selection.doctor.id,
      appointmentDate: selection.date, startTime: selection.slot.startTime, symptoms: values.symptoms.trim() || null }
    let attempt: BookingAttempt | null = null
    let sent = false
    try {
      const [slots, appointments, profiles] = await Promise.all([
        doctorDirectoryApi.availableSlots(request.doctorId, request.appointmentDate),
        appointmentsApi.my(), patientProfilesApi.list(),
      ])
      if (!samePatient()) return
      // Another controller may have persisted a request while these reads ran.
      if (readBookingAttempt(userId)) {
        change({ ...restore(userId), open: true, revision: current.current.revision + 1 })
        return
      }
      const failure = appointmentBookingError(null)
      if (!profiles.some((profile) => profile.id === request.patientProfileId)) {
        change({ ...current.current, stage: 'error', failure: { ...failure, message: 'Choose a current patient profile.',
          fieldErrors: { patientProfileId: 'This profile is no longer available.' } } })
        return
      }
      const previous = appointments.filter((appointment) => appointmentMatchesRequest(appointment, request))
      attempt = { userId, selection, request, previousAppointmentIds: previous.map((appointment) => appointment.id), startedAt: new Date().toISOString() }
      const active = previous.filter((appointment) => appointment.status !== 'Cancelled')
      if (active.length === 1) { resolved(attempt, active[0], 'existing'); return }
      const available = slots.some((slot) => slot.isAvailable && slot.reason === 'Available'
        && normalizeAppointmentTime(slot.startTime) === normalizeAppointmentTime(selection.slot.startTime)
        && normalizeAppointmentTime(slot.endTime) === normalizeAppointmentTime(selection.slot.endTime))
      if (!available || active.length > 1) {
        change({ ...current.current, stage: 'error', revision: current.current.revision + 1,
          failure: { ...failure, message: 'This appointment time cannot currently be booked. No booking request was sent. Close this dialog and refresh appointment times.' } })
        void client.invalidateQueries({ queryKey: ['appointmentSlots', request.doctorId, request.appointmentDate] })
        return
      }
      // Persist BEFORE the POST: a reload/unmount must recover as unresolved.
      if (!saveBookingAttempt(userId, { kind: 'unresolved', attempt })) { showStorageProblem(); return }
      change({ ...current.current, stage: 'pending', attempt })
      sent = true
      const appointment = await create.mutateAsync(request)
      resolved(attempt, appointment, 'created')
    } catch (error) {
      const failure = appointmentBookingError(error)
      if (sent && attempt && failure.uncertain) {
        attempt = { ...attempt, knownAppointmentId: failure.appointmentId }
        const stored = saveBookingAttempt(userId, { kind: 'unresolved', attempt })
        change({ ...current.current, stage: 'uncertain', attempt, failure, storageError: !stored,
          revision: current.current.revision + 1, message: failure.message })
        if (samePatient()) await runReconciliation(attempt)
      } else {
        const cleared = !sent || clearBookingAttempt(userId)
        change({ ...current.current, stage: cleared ? 'error' : 'blocked', storageError: !cleared,
          revision: current.current.revision + (failure.refreshAvailability ? 1 : 0),
          failure: { ...failure, uncertain: false, message: sent ? failure.message : 'Current booking details could not be verified. No booking request was sent. Please retry when the service is available.' } })
      }
    } finally { working.current = false }
  }
  const reconcile = async () => {
    const attempt = current.current.attempt
    if (working.current || !attempt || current.current.stage !== 'uncertain' || !samePatient()) return
    working.current = true
    try { await runReconciliation(attempt) } finally { working.current = false }
  }
  const closeDialog = () => {
    if (working.current || isBusy(current.current)) return
    if (['review', 'error'].includes(current.current.stage)) {
      change({ ...emptyState(), revision: current.current.revision })
    } else change({ ...current.current, open: false })
  }
  const acknowledge = () => {
    if (working.current || current.current.stage !== 'success') return
    if (!clearBookingAttempt(userId)) { change({ ...current.current, storageError: true }); return }
    change({ ...emptyState(), revision: current.current.revision })
  }
  return <BookingContext.Provider value={{ state, busy: isBusy(state), blocked: isBlocked(state),
    startReview, submitBooking, reconcile, closeDialog, acknowledge,
    showDialog: () => change({ ...current.current, open: true }) }}>{children}</BookingContext.Provider>
}
