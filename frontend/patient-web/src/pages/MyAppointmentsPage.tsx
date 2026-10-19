import Refresh from '@mui/icons-material/Refresh'
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Skeleton, Tab, Tabs, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { AppointmentCard } from '../components/appointments/AppointmentCard'
import { useMyAppointments } from '../hooks/useAppointments'
import { appointmentReadError } from '../services/appointmentsApi'
import { appointmentStatusSchema } from '../types/appointment'
import type { AppointmentStatus } from '../types/appointment'
import { appointmentStatusLabels, selectAppointments } from '../utils/myAppointments'
import type { AppointmentPeriod } from '../utils/myAppointments'

export function MyAppointmentsPage() {
  const query = useMyAppointments()
  const [period, setPeriod] = useState<AppointmentPeriod>('upcoming')
  const [status, setStatus] = useState<AppointmentStatus | 'All'>('All')
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const matches = selectAppointments(query.data ?? [], period, status, now)
  const upcoming = selectAppointments(query.data ?? [], 'upcoming', 'All', now).length
  const history = (query.data?.length ?? 0) - upcoming
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <Typography component="h1" variant="h1">My Appointments</Typography>
      <Button startIcon={<Refresh />} disabled={query.isFetching} onClick={() => { void query.refetch() }}>Refresh appointments</Button>
    </Box>
    <Typography color="text.secondary">Appointments for all your patient profiles. Dates and times use hospital time (Asia/Ho_Chi_Minh, UTC+7).</Typography>
    <Tabs value={period} onChange={(_, value: AppointmentPeriod) => setPeriod(value)} aria-label="Appointment period" variant="fullWidth">
      <Tab value="upcoming" label={`Upcoming${query.data ? ` (${upcoming})` : ''}`} id="appointments-upcoming-tab" aria-controls="appointments-panel" />
      <Tab value="history" label={`History${query.data ? ` (${history})` : ''}`} id="appointments-history-tab" aria-controls="appointments-panel" />
    </Tabs>
    <FormControl sx={{ width: { xs: '100%', sm: 260 } }}>
      <InputLabel id="appointment-status-label">Appointment status</InputLabel>
      <Select labelId="appointment-status-label" label="Appointment status" value={status} onChange={(event) => setStatus(event.target.value as AppointmentStatus | 'All')}>
        <MenuItem value="All">All statuses</MenuItem>
        {appointmentStatusSchema.options.map((value) => <MenuItem key={value} value={value}>{appointmentStatusLabels[value]}</MenuItem>)}
      </Select>
    </FormControl>
    <Box role="tabpanel" id="appointments-panel" aria-labelledby={`appointments-${period}-tab`} sx={{ display: 'grid', gap: 2 }} aria-busy={query.isFetching}>
      <Typography variant="body2" color="text.secondary">{period === 'upcoming'
        ? 'Ongoing and future appointments, with the next appointment first.'
        : 'Past appointment times and appointments marked Completed, Cancelled or No show, with the latest first.'}</Typography>
      {query.isFetching && !query.isPending ? <Typography role="status">Updating appointments...</Typography> : null}
      {query.isPending ? <Box role="status" aria-label="Loading appointments" sx={{ display: 'grid', gap: 2 }}>
        {[0, 1, 2].map((key) => <Skeleton key={key} variant="rounded" height={200} />)}</Box> : null}
      {query.isError ? <Alert severity="error" action={<Button disabled={query.isFetching} onClick={() => { void query.refetch() }}>Retry</Button>}>
        {appointmentReadError(query.error)}{query.data ? ' Previously loaded information may be out of date.' : ''}</Alert> : null}
      {query.isSuccess && matches.length === 0 ? <Alert severity="info">{query.data.length === 0 ? 'You have no appointments yet.'
        : `No ${period} appointments${status === 'All' ? '' : ` with status ${appointmentStatusLabels[status]}`}.`}</Alert> : null}
      {query.data ? <>
        <Typography role="status" aria-live="polite" color="text.secondary">{matches.length} {matches.length === 1 ? 'appointment' : 'appointments'}</Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
          {matches.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} />)}
        </Box>
      </> : null}
    </Box>
  </Box>
}
