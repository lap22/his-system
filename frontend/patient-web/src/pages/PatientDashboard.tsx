import { Alert, Box, Button, Card, CardContent, Chip, Skeleton, Typography } from '@mui/material'
import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { AppointmentCard } from '../components/appointments/AppointmentCard'
import { useMyAppointments } from '../hooks/useAppointments'
import { usePatientProfiles } from '../hooks/usePatientProfiles'
import { appointmentReadError } from '../services/appointmentsApi'
import { profileErrorMessage } from '../services/patientProfilesApi'
import { formatAppointmentDate } from '../utils/appointmentFormatting'
import { appointmentStatusLabels, selectAppointments } from '../utils/myAppointments'

const quickActions = [
  { label: 'Book Appointment', to: '/doctors', description: 'Choose a doctor and an available time.' },
  { label: 'My Appointments', to: '/appointments', description: 'View your appointments and their current status.' },
  { label: 'Manage Profiles', to: '/profiles', description: 'Manage patient information for you and your family.' },
  { label: 'Find Doctors', to: '/doctors', description: 'Explore doctors and hospital departments.' },
]

export function PatientDashboard() {
  const appointments = useMyAppointments()
  const profiles = usePatientProfiles()
  const [now, setNow] = useState(Date.now)

  // Reclassify appointments as time passes without issuing another API request.
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])

  const upcoming = selectAppointments(appointments.data ?? [], 'upcoming', 'All', now)
  const nextAppointment = upcoming[0]
  const defaultProfile = profiles.data?.find((profile) => profile.isDefault)
  // Invalidation can retain the previous default while its replacement is loading.
  const welcomeName = profiles.isSuccess && profiles.fetchStatus === 'idle'
    ? defaultProfile?.fullName.trim().replace(/\s+/gu, ' ') : ''

  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Box>
      <Typography variant="h1" component="h1">Patient Dashboard</Typography>
      <Typography variant="h2" component="p" aria-live="polite" aria-atomic="true" sx={{ mt: 1, overflowWrap: 'anywhere' }}>
        {welcomeName ? `Welcome back, ${welcomeName}!` : 'Welcome back!'}
      </Typography>
      <Typography color="text.secondary" sx={{ mt: 1 }}>Your appointments and patient profiles, together in one place.</Typography>
    </Box>

    <Box component="nav" aria-labelledby="dashboard-actions-heading">
      <Typography id="dashboard-actions-heading" variant="h2" component="h2" sx={{ mb: 2 }}>Quick actions</Typography>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' } }}>
        {quickActions.map((action) => <Card key={action.label} sx={{ minWidth: 0 }}>
          <CardContent sx={{ display: 'grid', gap: 1 }}>
            <Button component={RouterLink} to={action.to} variant={action.label === 'Book Appointment' ? 'contained' : 'outlined'}>{action.label}</Button>
            <Typography variant="body2" color="text.secondary">{action.description}</Typography>
          </CardContent>
        </Card>)}
      </Box>
    </Box>

    <Box sx={{ display: 'grid', gap: 3, alignItems: 'start', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'minmax(0, 3fr) minmax(0, 2fr)' } }}>
      <Box component="section" aria-labelledby="dashboard-appointments-heading" aria-busy={appointments.isFetching} sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <Typography id="dashboard-appointments-heading" variant="h2" component="h2">Upcoming appointments</Typography>
        <Typography variant="body2" color="text.secondary">Ongoing and future appointments for all your patient profiles. Hospital time: Asia/Ho_Chi_Minh (UTC+7).</Typography>
        {appointments.isPending ? <Box role="status" aria-label="Loading dashboard appointments"><Skeleton variant="rounded" height={260} /></Box> : null}
        {appointments.isError ? <Alert severity="error" action={<Button color="inherit" disabled={appointments.isFetching} onClick={() => { void appointments.refetch() }}>Retry appointments</Button>}>
          {appointmentReadError(appointments.error)}{appointments.data ? ' Previously loaded information may be out of date.' : ''}
        </Alert> : null}
        {appointments.isFetching && !appointments.isPending ? <Typography role="status" variant="body2">Updating appointments...</Typography> : null}
        {appointments.data ? <>
          <Card><CardContent sx={{ display: 'grid', gap: 1.5 }}>
            <Typography variant="h3" component="p">{upcoming.length} upcoming {upcoming.length === 1 ? 'appointment' : 'appointments'}</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {(['Pending', 'Confirmed', 'CheckedIn', 'InProgress'] as const).map((status) => {
                const count = upcoming.filter((appointment) => appointment.status === status).length
                return count ? <Chip key={status} label={`${appointmentStatusLabels[status]}: ${count}`} size="small" /> : null
              })}
            </Box>
            <Button component={RouterLink} to="/appointments" sx={{ justifySelf: 'start' }}>View all appointments</Button>
          </CardContent></Card>
          {nextAppointment ? <>
            <Typography variant="h3" component="p">Next appointment</Typography>
            <AppointmentCard appointment={nextAppointment} />
          </> : !appointments.isError ? <Alert severity="info">You have no upcoming appointments. Choose Book Appointment to find an available time.</Alert> : null}
        </> : null}
      </Box>

      <Box component="section" aria-labelledby="dashboard-profile-heading" aria-busy={profiles.isFetching} sx={{ display: 'grid', gap: 2, minWidth: 0 }}>
        <Typography id="dashboard-profile-heading" variant="h2" component="h2">Default Patient Profile</Typography>
        {profiles.isPending ? <Box role="status" aria-label="Loading default patient profile"><Skeleton variant="rounded" height={260} /></Box> : null}
        {profiles.isError ? <Alert severity="error" action={<Button color="inherit" disabled={profiles.isFetching} onClick={() => { void profiles.refetch() }}>Retry profiles</Button>}>
          {profileErrorMessage(profiles.error)}{profiles.data ? ' Previously loaded information may be out of date.' : ''}
        </Alert> : null}
        {defaultProfile ? <Card><CardContent sx={{ display: 'grid', gap: 2, overflowWrap: 'anywhere' }}>
          <Box>
            <Chip label="Default profile" color="primary" size="small" sx={{ mb: 1 }} />
            <Typography component="h3" variant="h3">{defaultProfile.fullName}</Typography>
          </Box>
          <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1 }}>
            {[
              ['Relationship', defaultProfile.relationship],
              ['Date of birth', formatAppointmentDate(defaultProfile.dateOfBirth)],
              ['Gender', defaultProfile.gender],
            ].map(([label, value]) => <Box key={label}>
              <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
              <Typography component="dd" sx={{ m: 0 }}>{value}</Typography>
            </Box>)}
          </Box>
          <Button component={RouterLink} to="/profiles" sx={{ justifySelf: 'start' }}>View patient profiles</Button>
        </CardContent></Card> : profiles.isSuccess ? <Alert severity="info">
          {profiles.data.length === 0 ? 'You have no patient profiles yet.' : 'No default patient profile is selected.'} Manage Profiles to set up your default profile.
        </Alert> : null}
      </Box>
    </Box>
  </Box>
}
