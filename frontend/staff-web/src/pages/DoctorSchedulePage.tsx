import { Alert, Box, Button, Card, CardContent, Chip, Skeleton, Typography } from '@mui/material'
import { useDoctorSchedules } from '../hooks/useDoctorAppointments'
import { useCurrentDoctor } from '../hooks/useCurrentDoctor'
import { weekDays } from '../types/doctorAppointments'
import { scheduleReadError } from '../services/doctorSchedulesApi'
import { formatTime } from '../utils/doctorAppointments'

export function DoctorSchedulePage() {
  const query = useDoctorSchedules()
  const doctor = useCurrentDoctor()
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Typography component="h1" variant="h4">My Schedule</Typography>
    <Typography sx={{ overflowWrap: 'anywhere' }}>{doctor.data?.fullName} · {doctor.data?.departmentName} · Hospital time (Asia/Ho_Chi_Minh)</Typography>
    <Typography>Read-only schedule. Contact the hospital administrator to request changes.</Typography>
    <Button disabled={query.isFetching} onClick={() => { void query.refetch() }} sx={{ justifySelf: 'start' }}>Refresh schedule</Button>
    {query.isPending && <Box role="status" aria-label="Loading schedule"><Skeleton height={120} />Loading schedule…</Box>}
    {query.isError && <Alert severity="error" action={<Button disabled={query.isFetching} onClick={() => { void query.refetch() }}>Retry</Button>}>{scheduleReadError(query.error)}</Alert>}
    {query.isSuccess && !query.data.length && <Alert severity="info">No schedules are configured for your Doctor profile.</Alert>}
    {query.isSuccess && query.data.length > 0 && <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' } }}>
      {weekDays.map(day => <Card key={day}><CardContent>
        <Typography component="h2" variant="h6">{day}</Typography>
        {query.data.filter(row => row.dayOfWeek === day).map(row => <Box key={row.id} sx={{ display: 'grid', gap: 1, py: 1 }}>
          <Typography>{formatTime(row.startTime)}–{formatTime(row.endTime)}</Typography>
          <Typography>{row.slotDurationMinutes} minutes per slot · Maximum patients: {row.maxPatients}</Typography>
          <Chip label={row.isActive ? 'Active' : 'Inactive'} size="small" color={row.isActive ? 'success' : 'default'} sx={{ justifySelf: 'start' }} />
        </Box>)}
        {!query.data.some(row => row.dayOfWeek === day) && <Typography color="text.secondary">No schedule</Typography>}
      </CardContent></Card>)}
    </Box>}
  </Box>
}
