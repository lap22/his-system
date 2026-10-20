import Refresh from '@mui/icons-material/Refresh'
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, Skeleton, Tab, Tabs, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { AppointmentCard } from '../components/appointments/AppointmentCard'
import { useMyAppointments } from '../hooks/useAppointments'
import { usePatientProfiles } from '../hooks/usePatientProfiles'
import { appointmentReadError } from '../services/appointmentsApi'
import { profileErrorMessage } from '../services/patientProfilesApi'
import { appointmentStatusSchema } from '../types/appointment'
import type { AppointmentStatus } from '../types/appointment'
import { appointmentStatusLabels, selectAppointments } from '../utils/myAppointments'
import type { AppointmentPeriod } from '../utils/myAppointments'

export function MyAppointmentsPage() {
  const query = useMyAppointments()
  const profiles = usePatientProfiles()
  const [profileId, setProfileId] = useState('All')
  const [period, setPeriod] = useState<AppointmentPeriod>('upcoming')
  const [status, setStatus] = useState<AppointmentStatus | 'All'>('All')
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 60_000); return () => window.clearInterval(timer) }, [])
  const selectedProfile = profiles.data?.find((profile) => profile.id === profileId)
  const validProfile = profileId === 'All' || Boolean(selectedProfile)
  const appointments = validProfile ? query.data ?? [] : []
  const matches = selectAppointments(appointments, period, status, now, profileId)
  const upcoming = selectAppointments(appointments, 'upcoming', status, now, profileId).length
  const history = selectAppointments(appointments, 'history', status, now, profileId).length
  const profileDescription = selectedProfile ? ` for ${selectedProfile.fullName}` : ' across all your patient profiles'
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <Typography component="h1" variant="h1">My Appointments</Typography>
      <Button startIcon={<Refresh />} disabled={query.isFetching} onClick={() => { void query.refetch() }}>Refresh appointments</Button>
    </Box>
    <Typography color="text.secondary">View all your patient profiles or choose one profile below. Dates and times use hospital time (Asia/Ho_Chi_Minh, UTC+7).</Typography>
    <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' } }}>
      <FormControl disabled={profiles.isPending}>
        <InputLabel id="appointment-profile-label">Patient profile</InputLabel>
        <Select labelId="appointment-profile-label" label="Patient profile" value={profileId}
          onChange={(event) => setProfileId(event.target.value)} sx={{ '& .MuiSelect-select': { whiteSpace: 'normal' } }}>
          <MenuItem value="All">All Profiles</MenuItem>
          {profiles.data?.map((profile) => <MenuItem key={profile.id} value={profile.id} sx={{ whiteSpace: 'normal' }}>
            {profile.fullName} ({profile.relationship}){profile.isDefault ? ' — Default' : ''}
          </MenuItem>)}
          {!validProfile ? <MenuItem value={profileId} disabled>Selected profile unavailable</MenuItem> : null}
        </Select>
      </FormControl>
      <FormControl>
        <InputLabel id="appointment-status-label">Appointment status</InputLabel>
        <Select labelId="appointment-status-label" label="Appointment status" value={status} onChange={(event) => setStatus(event.target.value as AppointmentStatus | 'All')}>
          <MenuItem value="All">All statuses</MenuItem>
          {appointmentStatusSchema.options.map((value) => <MenuItem key={value} value={value}>{appointmentStatusLabels[value]}</MenuItem>)}
        </Select>
      </FormControl>
    </Box>
    {profiles.isPending ? <Typography role="status">Loading patient profiles...</Typography> : null}
    {profiles.isError ? <Alert severity="error" action={<Button disabled={profiles.isFetching} onClick={() => { void profiles.refetch() }}>Retry profiles</Button>}>
      {profileErrorMessage(profiles.error)}{profiles.data ? ' Previously loaded profile information may be out of date.' : ''}</Alert> : null}
    {!validProfile && !profiles.isPending ? <Alert severity="warning">The selected profile is unavailable. Choose one of your current profiles or All Profiles.</Alert> : null}
    <Tabs value={period} onChange={(_, value: AppointmentPeriod) => setPeriod(value)} aria-label="Appointment period" variant="fullWidth">
      <Tab value="upcoming" label={`Upcoming${query.data && validProfile ? ` (${upcoming})` : ''}`} id="appointments-upcoming-tab" aria-controls="appointments-panel" />
      <Tab value="history" label={`History${query.data && validProfile ? ` (${history})` : ''}`} id="appointments-history-tab" aria-controls="appointments-panel" />
    </Tabs>
    <Box role="tabpanel" id="appointments-panel" aria-labelledby={`appointments-${period}-tab`} sx={{ display: 'grid', gap: 2 }} aria-busy={query.isFetching}>
      <Typography variant="body2" color="text.secondary">{period === 'upcoming'
        ? 'Ongoing and future appointments, with the next appointment first.'
        : 'Past appointment times and appointments marked Completed, Cancelled or No show, with the latest first.'}</Typography>
      {query.isFetching && !query.isPending ? <Typography role="status">Updating appointments...</Typography> : null}
      {query.isPending ? <Box role="status" aria-label="Loading appointments" sx={{ display: 'grid', gap: 2 }}>
        {[0, 1, 2].map((key) => <Skeleton key={key} variant="rounded" height={200} />)}</Box> : null}
      {query.isError ? <Alert severity="error" action={<Button disabled={query.isFetching} onClick={() => { void query.refetch() }}>Retry</Button>}>
        {appointmentReadError(query.error)}{query.data ? ' Previously loaded information may be out of date.' : ''}</Alert> : null}
      {query.isSuccess && validProfile && matches.length === 0 ? <Alert severity="info">
        {`No ${period} appointments${profileDescription}${status === 'All' ? '' : ` with status ${appointmentStatusLabels[status]}`}.`}</Alert> : null}
      {query.data && validProfile ? <>
        <Typography role="status" aria-live="polite" color="text.secondary">{matches.length} {matches.length === 1 ? 'appointment' : 'appointments'}{profileDescription}</Typography>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' } }}>
          {matches.map((appointment) => <AppointmentCard key={appointment.id} appointment={appointment} />)}
        </Box>
      </> : null}
    </Box>
  </Box>
}
