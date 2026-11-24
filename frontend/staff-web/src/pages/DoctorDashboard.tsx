import { useEffect, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Skeleton, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useDoctorAppointments } from '../hooks/useDoctorAppointments'
import { useCurrentDoctor } from '../hooks/useCurrentDoctor'
import { useDoctorQueue } from '../hooks/useDoctorQueue'
import { useQueueRealtime } from '../hooks/useQueueRealtime'
import { AppointmentReadState, DoctorAppointmentList } from '../components/DoctorAppointments'
import { dashboardSummary, formatDate, hospitalClock } from '../utils/doctorAppointments'
import { queueDashboardSummary, queueStatusLabels } from '../types/doctorQueue'

export function DoctorDashboard() {
  const query = useDoctorAppointments()
  const doctor = useCurrentDoctor()
  const [now, setNow] = useState(() => new Date())
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(timer) }, [])
  const today = hospitalClock(now).date
  const queue = useDoctorQueue(today)
  const realtime = useQueueRealtime()
  const summary = query.isSuccess ? dashboardSummary(query.data, now) : null
  const queueSummary = queue.isSuccess ? queueDashboardSummary(queue.data) : null
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Typography component="h1" variant="h4">Doctor Dashboard</Typography>
    <Typography sx={{ overflowWrap: 'anywhere' }}>Welcome, {doctor.data?.fullName}. {formatDate(hospitalClock(now).date)} · Asia/Ho_Chi_Minh</Typography>
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <Button component={Link} to="/doctor/appointments" variant="contained">Appointments</Button>
      <Button component={Link} to="/doctor/queue" variant="outlined">Open Queue</Button>
      <Button component={Link} to="/doctor/schedule" variant="outlined">My Schedule</Button>
      <Button disabled={query.isFetching || queue.isFetching} onClick={() => { void query.refetch(); void queue.refetch() }}>Refresh</Button>
    </Box>
    <Box component="section" aria-labelledby="today-queue-heading" sx={{ display: 'grid', gap: 2 }}>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        <Typography id="today-queue-heading" component="h2" variant="h5">Today’s queue</Typography>
        <Chip size="small" label={`Realtime: ${realtime.status}`} color={realtime.status === 'connected' ? 'success' : 'default'} />
      </Box>
      {queue.isPending ? <Box role="status" aria-label="Loading today’s queue"><Skeleton height={120} />Loading queue…</Box> : null}
      {queue.isError ? <Alert severity="error" action={<Button disabled={queue.isFetching} onClick={() => { void queue.refetch() }}>Retry queue</Button>}>
        Today’s queue could not be loaded. Open Queue or retry.</Alert> : null}
      {queueSummary ? <>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' } }}>
          {[['Checked in', queueSummary.total], ['Waiting', queueSummary.waiting], ['In service', queueSummary.inService], ['Completed', queueSummary.completed]].map(([label, count]) =>
            <Card key={label}><CardContent><Typography color="text.secondary">{label}</Typography><Typography variant="h4" component="p">{count}</Typography></CardContent></Card>)}
        </Box>
        <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
          <Card variant="outlined"><CardContent sx={{ display: 'grid', gap: 1 }}>
            <Typography component="h3" variant="h6">Current patient</Typography>
            {queueSummary.current ? <>
              <Typography sx={{ overflowWrap: 'anywhere' }}>#{queueSummary.current.queueNumber} · {queueSummary.current.patientName}</Typography>
              <Chip label={queueStatusLabels[queueSummary.current.status]} color="primary" sx={{ justifySelf: 'start' }} />
              <Button component={Link} to={`/doctor/appointments/${queueSummary.current.appointmentId}`}>View appointment</Button>
            </> : <Typography color="text.secondary">No examination is currently in service.</Typography>}
          </CardContent></Card>
          <Card variant="outlined"><CardContent sx={{ display: 'grid', gap: 1 }}>
            <Typography component="h3" variant="h6">Next patient</Typography>
            {queueSummary.next ? <>
              <Typography sx={{ overflowWrap: 'anywhere' }}>#{queueSummary.next.queueNumber} · {queueSummary.next.patientName}</Typography>
              <Chip label={queueStatusLabels[queueSummary.next.status]} sx={{ justifySelf: 'start' }} />
              <Button component={Link} to="/doctor/queue">Manage queue</Button>
            </> : <Typography color="text.secondary">No patient is waiting or called.</Typography>}
          </CardContent></Card>
        </Box>
      </> : null}
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
