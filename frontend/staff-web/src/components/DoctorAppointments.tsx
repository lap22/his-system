import { Alert, Box, Button, Card, CardContent, Chip, Skeleton, Stack, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import type { AppointmentStatus, DoctorAppointment } from '../types/doctorAppointments'
import { appointmentStatusLabels, formatDate, formatTime } from '../utils/doctorAppointments'
import { appointmentReadError } from '../services/doctorAppointmentsApi'

export function DoctorAppointmentStatus({ status }: { status: AppointmentStatus }) {
  return <Chip label={appointmentStatusLabels[status]} size="small" color={status === 'Pending' ? 'warning' : status === 'Completed' ? 'success' : 'default'} />
}
export function AppointmentReadState({ pending, error, retry, fetching }: { pending: boolean; error: unknown; retry(): void; fetching?: boolean }) {
  if (pending) return <Box role="status" aria-label="Loading appointments"><Skeleton height={100} /><Skeleton height={100} /><span>Loading appointment information…</span></Box>
  if (error) return <Alert severity="error" action={<Button disabled={fetching} onClick={retry}>Retry</Button>}>{appointmentReadError(error)}</Alert>
  return null
}
export function DoctorAppointmentList({ rows, empty = 'No appointments match this view.' }: { rows: DoctorAppointment[]; empty?: string }) {
  if (!rows.length) return <Alert severity="info">{empty}</Alert>
  return <Stack component="ul" spacing={2} sx={{ listStyle: 'none', p: 0, m: 0 }}>
    {rows.map(row => <Card component="li" key={row.id}><CardContent>
      <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 2 }}>
        <Box sx={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
          <Typography variant="h6" component="h2">{row.patientName}</Typography>
          <Typography>{row.doctorName} · {row.departmentName}</Typography>
          <Typography>{formatDate(row.appointmentDate)} · {formatTime(row.startTime)}–{formatTime(row.endTime)} (hospital time)</Typography>
        </Box>
        <DoctorAppointmentStatus status={row.status} />
        <Button component={Link} to={`/doctor/appointments/${row.id}`} aria-label={`View appointment details for ${row.patientName}`}>View Details</Button>
      </Box>
    </CardContent></Card>)}
  </Stack>
}
