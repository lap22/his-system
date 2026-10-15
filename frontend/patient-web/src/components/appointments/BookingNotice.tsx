import { Alert, Button } from '@mui/material'
import { useBookingController } from '../../hooks/useBookingController'

export function BookingNotice() {
  const booking = useBookingController()
  const { state } = booking
  if (['idle', 'review'].includes(state.stage)) return null
  const result = state.stage === 'success'
  return <Alert severity={result ? 'success' : booking.blocked ? 'warning' : 'error'} sx={{ mb: 3 }}
    action={<Button onClick={booking.showDialog} aria-label="Review booking status">Review</Button>}>
    {result ? 'Your appointment details are ready to review.' : booking.busy ? 'Your booking request is being checked. New bookings are paused.'
      : booking.blocked ? 'A booking request needs verification. New bookings are paused until its outcome is resolved.'
        : 'Your booking request was not completed. Review the details before trying again.'}
  </Alert>
}
