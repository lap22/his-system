import ArrowBack from '@mui/icons-material/ArrowBack'
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useRef, useState } from 'react'
import { Link as RouterLink, useParams } from 'react-router-dom'
import { z } from 'zod'
import { AppointmentStatusChip } from '../components/appointments/AppointmentStatusChip'
import { DoctorDetails } from '../components/doctors/DoctorDetails'
import { useAppointment } from '../hooks/useAppointments'
import { useCancelAppointment } from '../hooks/useCancelAppointment'
import { appointmentReadError } from '../services/appointmentsApi'
import type { Appointment } from '../types/appointment'
import { formatAppointmentDate, formatAppointmentTime, formatAppointmentTimestamp } from '../utils/appointmentFormatting'
import { appointmentStatusLabels, canCancelAppointment } from '../utils/myAppointments'

function Information({ label, value }: { label: string; value: string }) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Typography></Box>
}

function AppointmentDetails({ id }: { id: string }) {
  const query = useAppointment(id)
  const cancellation = useCancelAppointment(id)
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'))
  const [reviewed, setReviewed] = useState<Appointment | null>(null)
  const [reason, setReason] = useState('')
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const cancellationTrigger = useRef<HTMLButtonElement | null>(null)
  const detailsHeading = useRef<HTMLHeadingElement | null>(null)
  const restoreCancellationFocus = () => {
    const trigger = cancellationTrigger.current
    const target = trigger?.isConnected && !trigger.disabled ? trigger : detailsHeading.current
    target?.focus()
  }
  const appointment = query.data
  const busy = cancellation.pending || cancellation.checking
  const canCancel = query.isSuccess && !query.isFetching && appointment && canCancelAppointment(appointment.status)
    && cancellation.protection === 'clear' && !busy
  const closeConfirmation = () => { if (!busy) setReviewed(null) }
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Button component={RouterLink} to="/appointments" startIcon={<ArrowBack />} sx={{ justifySelf: 'start' }}>My Appointments</Button>
    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <Typography component="h1" variant="h1" ref={detailsHeading} tabIndex={-1}>Appointment details</Typography>
      <Button disabled={query.isFetching || busy} onClick={() => { void query.refetch() }}>Refresh appointment</Button>
    </Box>
    {query.isFetching ? <Typography role="status">{query.isPending ? 'Loading appointment...' : 'Updating appointment...'}</Typography> : null}
    {query.isError ? <Alert severity="error" action={<Button disabled={query.isFetching || busy} onClick={() => { void query.refetch() }}>Retry</Button>}>
      {appointmentReadError(query.error)}{appointment ? ' Previously loaded information may be out of date.' : ''}</Alert> : null}
    {cancellation.success && !reviewed ? <Alert severity="success" role="status">The hospital confirms this appointment is cancelled.</Alert> : null}
    {cancellation.failure && !reviewed ? <Alert severity={cancellation.failure.uncertain ? 'warning' : 'error'}>{cancellation.failure.message}</Alert> : null}
    {cancellation.protection !== 'clear' ? <Alert severity="warning" action={
      <Button onClick={() => { void cancellation.verify() }} disabled={busy}>Check cancellation status</Button>
    }>{cancellation.protection === 'unresolved'
      ? 'A previous cancellation needs verification. Another cancellation will not be sent. Check the status or contact the hospital with the appointment reference.'
      : 'Browser cancellation protection could not be verified. Cancellation is disabled. Enable session storage or contact the hospital with the appointment reference.'}</Alert> : null}
    {cancellation.verificationMessage ? <Alert severity={appointment?.status === 'Cancelled' ? 'success' : 'warning'} role="status">{cancellation.verificationMessage}</Alert> : null}
    {appointment ? <Card variant="outlined"><CardContent sx={{ display: 'grid', gap: 2.5 }}>
      <Box><AppointmentStatusChip status={appointment.status} /></Box>
      <Box sx={{ display: 'grid', gap: 2.5, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
        <Information label="Doctor" value={appointment.doctorName} />
        <Information label="Department" value={appointment.departmentName} />
        <Information label="Patient profile" value={appointment.patientName} />
        <Information label="Appointment date" value={formatAppointmentDate(appointment.appointmentDate)} />
        <Information label="Hospital time (Asia/Ho_Chi_Minh, UTC+7)" value={`${formatAppointmentTime(appointment.startTime)} – ${formatAppointmentTime(appointment.endTime)}`} />
        <Information label="Requested at (hospital time)" value={formatAppointmentTimestamp(appointment.createdAt)} />
      </Box>
      <Information label="Symptoms" value={appointment.symptoms || 'Not provided'} />
      {appointment.cancelledAt ? <Information label="Cancelled at (hospital time)" value={formatAppointmentTimestamp(appointment.cancelledAt)} /> : null}
      {appointment.status === 'Cancelled' || appointment.cancellationReason ? <Information label="Cancellation reason" value={appointment.cancellationReason || 'No reason provided'} /> : null}
      {appointment.updatedAt ? <Information label="Last updated (hospital time)" value={formatAppointmentTimestamp(appointment.updatedAt)} /> : null}
      <Information label="Appointment reference" value={appointment.id} />
      <Information label="Patient profile reference" value={appointment.patientProfileId} />
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2 }}>
        <Button onClick={() => setDoctorId(appointment.doctorId)}>View doctor information</Button>
        {canCancelAppointment(appointment.status) ? <Button color="error" variant="outlined" disabled={!canCancel}
          onClick={(event) => { cancellationTrigger.current = event.currentTarget; setReason(''); setReviewed(appointment) }}>Cancel appointment</Button> : null}
      </Box>
      <Typography color="text.secondary" variant="body2">Only Pending and Confirmed appointments can be cancelled. Checked in, In progress, Completed, Cancelled and No show appointments cannot be cancelled. The hospital checks the current status again when you confirm.</Typography>
    </CardContent></Card> : null}
    <Dialog open={Boolean(reviewed)} onClose={closeConfirmation} fullWidth maxWidth="sm" fullScreen={fullScreen} aria-labelledby="cancel-appointment-title"
      disableRestoreFocus slotProps={{ transition: { onExited: restoreCancellationFocus } }}>
      <DialogTitle id="cancel-appointment-title">{cancellation.success ? 'Appointment cancelled' : 'Cancel this appointment?'}</DialogTitle>
      <Box component="form" noValidate onSubmit={(event) => {
        event.preventDefault()
        if (canCancel && !cancellation.success && reason.length <= 1000) void cancellation.cancel(reason)
      }}>
        <DialogContent sx={{ display: 'grid', gap: 2 }} aria-busy={busy}>
          {reviewed ? <>
            <Information label="Doctor" value={reviewed.doctorName} />
            <Information label="Patient profile" value={reviewed.patientName} />
            <Information label="Appointment" value={`${formatAppointmentDate(reviewed.appointmentDate)}, ${formatAppointmentTime(reviewed.startTime)} – ${formatAppointmentTime(reviewed.endTime)} (UTC+7)`} />
          </> : null}
          {cancellation.success ? <Alert severity="success" role="status">The hospital confirms that this appointment is cancelled.</Alert> : <>
            <Typography>This cancels the appointment for the selected patient profile. Only Pending and Confirmed appointments are eligible.</Typography>
            <TextField label="Cancellation reason (optional)" value={reason} multiline minRows={3} fullWidth autoFocus
              disabled={busy || cancellation.protection !== 'clear'} onChange={(event) => setReason(event.target.value)}
              error={reason.length > 1000} helperText="Up to 1,000 characters." slotProps={{ htmlInput: { maxLength: 1000 } }} />
          </>}
          {cancellation.failure ? <Alert severity={cancellation.failure.uncertain ? 'warning' : 'error'}>{cancellation.failure.message}</Alert> : null}
          {cancellation.protection !== 'clear' ? <Alert severity="warning">Further cancellation is blocked. Close this confirmation and use Check cancellation status, or contact the hospital.</Alert> : null}
          {busy ? <Typography role="status">Verifying your appointment and cancellation. Please wait...</Typography> : null}
          {!cancellation.success && query.isSuccess && appointment && !canCancelAppointment(appointment.status) ? <Alert severity="info">The current status is {appointmentStatusLabels[appointment.status]}. This appointment cannot be cancelled again.</Alert> : null}
        </DialogContent>
        <DialogActions sx={{ flexWrap: 'wrap', gap: 1 }}>
          <Button disabled={busy} onClick={closeConfirmation}>{cancellation.success ? 'Done' : cancellation.protection === 'clear' ? 'Keep appointment' : 'Close'}</Button>
          {!cancellation.success ? <Button type="submit" color="error" variant="contained" disabled={!canCancel || reason.length > 1000}>Confirm cancellation</Button> : null}
        </DialogActions>
      </Box>
    </Dialog>
    <DoctorDetails id={doctorId} onClose={() => setDoctorId(null)} />
  </Box>
}

export function AppointmentDetailsPage() {
  const { id } = useParams()
  if (!id || !z.uuid().safeParse(id).success) return <Alert severity="error">This appointment reference is invalid. <Button component={RouterLink} to="/appointments">My Appointments</Button></Alert>
  return <AppointmentDetails key={id.toLowerCase()} id={id.toLowerCase()} />
}
