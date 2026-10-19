import { Box, Button, Card, CardActions, CardContent, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'
import type { Appointment } from '../../types/appointment'
import { formatAppointmentDate, formatAppointmentTime } from '../../utils/appointmentFormatting'
import { AppointmentStatusChip } from './AppointmentStatusChip'

export function AppointmentCard({ appointment }: { appointment: Appointment }) {
  return <Card component="article" variant="outlined" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
    <CardContent sx={{ display: 'grid', gap: 1.5, flex: 1, overflowWrap: 'anywhere' }}>
      <Box><Typography component="h2" variant="h3">{appointment.doctorName}</Typography>
        <Typography color="text.secondary">{appointment.departmentName}</Typography></Box>
      <Typography><Typography component="span" color="text.secondary">Patient: </Typography>{appointment.patientName}</Typography>
      <Typography component="time" dateTime={`${appointment.appointmentDate}T${appointment.startTime}+07:00`}>
        {formatAppointmentDate(appointment.appointmentDate)}<br />
        {formatAppointmentTime(appointment.startTime)} – {formatAppointmentTime(appointment.endTime)} (UTC+7)
      </Typography>
      <Box><AppointmentStatusChip status={appointment.status} /></Box>
    </CardContent>
    <CardActions><Button component={RouterLink} to={`/appointments/${appointment.id}`}
      aria-label={`View appointment with ${appointment.doctorName} for ${appointment.patientName} on ${formatAppointmentDate(appointment.appointmentDate)} at ${formatAppointmentTime(appointment.startTime)}`}>View details</Button></CardActions>
  </Card>
}
