import { createContext, useContext } from 'react'
import type { Appointment, AppointmentBookingForm } from '../types/appointment'
import type { BookingAttempt, BookingResultSource, BookingSelection } from '../services/bookingAttemptStorage'
import type { appointmentBookingError } from '../services/appointmentsApi'

export type BookingStage = 'idle' | 'review' | 'preparing' | 'pending' | 'uncertain' | 'reconciling' | 'success' | 'error' | 'blocked'
export type BookingState = {
  stage: BookingStage
  selection: BookingSelection | null
  attempt: BookingAttempt | null
  appointment: Appointment | null
  source: BookingResultSource | null
  failure: ReturnType<typeof appointmentBookingError> | null
  message: string | null
  open: boolean
  revision: number
  storageError: boolean
}
export type BookingController = {
  state: BookingState
  busy: boolean
  blocked: boolean
  startReview: (selection: BookingSelection) => void
  submitBooking: (values: AppointmentBookingForm) => Promise<void>
  reconcile: () => Promise<void>
  showDialog: () => void
  closeDialog: () => void
  acknowledge: () => void
}
export const BookingContext = createContext<BookingController | null>(null)

export function useBookingController(): BookingController {
  const context = useContext(BookingContext)
  if (!context) throw new Error('Booking controller must be inside the authenticated Patient layout.')
  return context
}
