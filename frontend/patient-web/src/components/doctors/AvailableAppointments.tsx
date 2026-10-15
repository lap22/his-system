import Refresh from '@mui/icons-material/Refresh'
import { Box, Button, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material'
import { useState } from 'react'
import { z } from 'zod'
import { useAvailableAppointments } from '../../hooks/useDoctorDirectory'
import { availableSelection, hospitalToday, slotKey } from '../../utils/appointmentAvailability'
import { useBookingController } from '../../hooks/useBookingController'
import type { Doctor } from '../../types/doctorDirectory'
import { AppointmentSlotButton } from './AppointmentSlotButton'
import { DirectoryFeedback } from './DirectoryFeedback'

type BookingContext = { doctor: Doctor }

function AppointmentSlots({ doctor, date }: BookingContext & { date: string }) {
  const booking = useBookingController()
  const query = useAvailableAppointments(doctor.id, date)
  const [selection, setSelection] = useState<{ key: string; revision: number } | null>(null)
  const selected = query.isSuccess && selection?.revision === booking.state.revision ? availableSelection(query.data, selection.key) : null
  // Clear stored identity as soon as it is invalid, so a later response cannot restore it.
  if (selection !== null && selected === null) setSelection(null)

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="body2" color="text.secondary">Appointment times</Typography>
        <Tooltip title="Refresh appointment times">
          <span><IconButton aria-label="Refresh appointment times" onClick={() => { void query.refetch() }} disabled={query.isFetching || booking.busy}><Refresh /></IconButton></span>
        </Tooltip>
      </Box>
      {query.isFetching ? <Box role="status" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CircularProgress size={20} /><Typography variant="body2" color="text.secondary">Updating appointment times...</Typography>
      </Box> : null}
      {query.isError ? <DirectoryFeedback error={query.error} resource="appointment slots" onRetry={() => { void query.refetch() }} /> : null}
      {query.isSuccess && query.data.length === 0 ? <Typography color="text.secondary">No appointment times published for this date.</Typography> : null}
      {query.isSuccess && query.data.length > 0 ? <>
        {!query.data.some((slot) => slot.isAvailable) ? <Typography color="text.secondary">No available appointments for this date.</Typography> : null}
        <Box role="group" aria-label={`Appointment times for ${date}`} sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))' }}>
          {query.data.map((slot) => <AppointmentSlotButton
            key={slotKey(slot)} slot={slot} selected={selected !== null && slotKey(selected) === slotKey(slot)}
            refreshing={query.isFetching || booking.blocked}
            onSelect={() => { if (slot.isAvailable && !query.isFetching && !booking.blocked) setSelection({ key: slotKey(slot), revision: booking.state.revision }) }}
          />)}
        </Box>
      </> : null}
      <Typography role="status" aria-live="polite" variant="body2" color={selected ? 'primary.main' : 'text.secondary'} sx={{ minHeight: 40 }}>
        {selected ? `Selected: ${date}, ${selected.startTime.slice(0, 5)} - ${selected.endTime.slice(0, 5)}` : 'No appointment time selected.'}
      </Typography>
      <Button variant="contained" sx={{ justifySelf: { xs: 'stretch', sm: 'start' } }}
        disabled={!selected || query.isFetching || booking.blocked}
        onClick={() => { if (selected && !query.isFetching && !booking.blocked) booking.startReview({ doctor: { id: doctor.id, fullName: doctor.fullName, departmentName: doctor.departmentName }, date, slot: { ...selected } }) }}>
        Review appointment
      </Button>
    </Box>
  )
}

function AppointmentDateSelector({ doctor }: BookingContext) {
  const booking = useBookingController()
  const [date, setDate] = useState(() => hospitalToday())
  const validDate = z.iso.date().safeParse(date).success

  return (
    <Box component="section" aria-labelledby="available-appointments-heading" sx={{ display: 'grid', gap: 2 }}>
      <Typography id="available-appointments-heading" component="h3" variant="h3">Available Appointments</Typography>
      <TextField
        type="date" label="Appointment date" value={date}
        disabled={booking.busy}
        onChange={(event) => setDate(event.target.value)}
        error={Boolean(date) && !validDate}
        helperText={date && !validDate ? 'Choose a valid date.' : 'Hospital dates and times (UTC+7).'}
        slotProps={{ inputLabel: { shrink: true } }}
        sx={{ width: { xs: '100%', sm: 260 } }}
      />
      {validDate ? <AppointmentSlots key={`${doctor.id}/${date}`} doctor={doctor} date={date} /> : null}
    </Box>
  )
}

export function AvailableAppointments(props: BookingContext) {
  return <AppointmentDateSelector key={props.doctor.id} {...props} />
}
