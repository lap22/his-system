import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useDoctorAppointments } from '../hooks/useDoctorAppointments'
import { useCurrentDoctor } from '../hooks/useCurrentDoctor'
import { AppointmentReadState, DoctorAppointmentList } from '../components/DoctorAppointments'
import { dashboardSummary, formatDate, hospitalClock } from '../utils/doctorAppointments'

export function DoctorDashboard() {
  const query = useDoctorAppointments()
  const doctor = useCurrentDoctor()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer) }, [])
  const summary = query.isSuccess ? dashboardSummary(query.data, now) : null
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Typography component="h1" variant="h4">Doctor Dashboard</Typography>
    <Typography sx={{ overflowWrap: 'anywhere' }}>Welcome, {doctor.data?.fullName}. {formatDate(hospitalClock(now).date)} · Asia/Ho_Chi_Minh</Typography>
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <Button component={Link} to="/doctor/appointments" variant="contained">Appointments</Button>
      <Button component={Link} to="/doctor/schedule" variant="outlined">My Schedule</Button>
      <Button disabled={query.isFetching} onClick={() => { void query.refetch() }}>Refresh</Button>
    </Box>
    <AppointmentReadState pending={query.isPending} error={query.isError ? query.error : null} fetching={query.isFetching} retry={() => { void query.refetch() }} />
    {summary ? <>
      <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
        {[['Today’s appointments', summary.total], ['Pending today', summary.pending], ['Confirmed today', summary.confirmed], ['Completed today', summary.completed]].map(([label, count]) =>
          <Card key={label}><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h4" component="p">{count}</Typography></CardContent></Card>)}
      </Box>
      <Typography component="h2" variant="h5">Today’s appointments</Typography>
      <DoctorAppointmentList rows={summary.today} empty="No appointments today." />
      <Typography component="h2" variant="h5">Upcoming appointments</Typography>
      <DoctorAppointmentList rows={summary.upcoming.slice(0, 5)} empty="No upcoming appointments." />
      {summary.upcoming.length > 5 && <Alert severity="info">Showing the next five upcoming appointments. Open Appointments for the complete list.</Alert>}
    </> : null}
  </Box>
}
