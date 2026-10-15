import Refresh from '@mui/icons-material/Refresh'
import { Box, CircularProgress, IconButton, TextField, Tooltip, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { useAvailableAppointments } from '../../hooks/useDoctorDirectory'
import { availableSelection, hospitalToday, slotKey } from '../../utils/appointmentAvailability'
import { AppointmentSlotButton } from './AppointmentSlotButton'
import { DirectoryFeedback } from './DirectoryFeedback'

function AppointmentSlots({ doctorId, date }: { doctorId: string; date: string }) {
  const query = useAvailableAppointments(doctorId, date)
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const selected = query.isSuccess ? availableSelection(query.data, selectedKey) : null
  // Clear stored identity as soon as it is invalid, so a later response cannot restore it.
  if (selectedKey !== null && selected === null) setSelectedKey(null)

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
        <Typography variant="body2" color="text.secondary">Appointment times</Typography>
        <Tooltip title="Refresh appointment times">
          <span><IconButton aria-label="Refresh appointment times" onClick={() => { void query.refetch() }} disabled={query.isFetching}><Refresh /></IconButton></span>
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
            refreshing={query.isFetching}
            onSelect={() => { if (slot.isAvailable && !query.isFetching) setSelectedKey(slotKey(slot)) }}
          />)}
        </Box>
      </> : null}
      <Typography role="status" aria-live="polite" variant="body2" color={selected ? 'primary.main' : 'text.secondary'} sx={{ minHeight: 40 }}>
        {selected ? `Selected: ${date}, ${selected.startTime.slice(0, 5)} - ${selected.endTime.slice(0, 5)}` : 'No appointment time selected.'}
      </Typography>
    </Box>
  )
}

function AppointmentDateSelector({ doctorId }: { doctorId: string }) {
  const [today, setToday] = useState(() => hospitalToday())
  const [date, setDate] = useState(today)
  useEffect(() => {
    const timer = window.setInterval(() => setToday(hospitalToday()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const validDate = z.iso.date().safeParse(date).success && date >= today

  return (
    <Box component="section" aria-labelledby="available-appointments-heading" sx={{ display: 'grid', gap: 2 }}>
      <Typography id="available-appointments-heading" component="h3" variant="h3">Available Appointments</Typography>
      <TextField
        type="date" label="Appointment date" value={date}
        onChange={(event) => setDate(event.target.value)}
        error={Boolean(date) && !validDate}
        helperText={date && !validDate ? 'Choose today or a future date.' : undefined}
        slotProps={{ htmlInput: { min: today }, inputLabel: { shrink: true } }}
        sx={{ width: { xs: '100%', sm: 260 } }}
      />
      {validDate ? <AppointmentSlots key={`${doctorId}/${date}`} doctorId={doctorId} date={date} /> : null}
    </Box>
  )
}

export function AvailableAppointments({ doctorId }: { doctorId: string }) {
  return <AppointmentDateSelector key={doctorId} doctorId={doctorId} />
}
