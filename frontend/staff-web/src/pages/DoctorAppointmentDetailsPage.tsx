import { useRef, useState } from 'react'
import { z } from 'zod'
import { Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from '@mui/material'
import { Link, useParams } from 'react-router-dom'
import { useDoctorAppointmentDetail } from '../hooks/useDoctorAppointments'
import { useConfirmAppointment } from '../hooks/useConfirmAppointment'
import { AppointmentReadState, DoctorAppointmentStatus } from '../components/DoctorAppointments'
import type { DoctorAppointment } from '../types/doctorAppointments'
import { formatDate, formatTime, formatTimestamp } from '../utils/doctorAppointments'

function Information({ label, value }: { label: string; value: string }) {
  return <Box><Typography component="dt" variant="body2" color="text.secondary">{label}</Typography><Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{value}</Typography></Box>
}
export function DoctorAppointmentDetailsPage() {
  const { id = '' } = useParams()
  if (!z.uuid().safeParse(id).success) return <Alert severity="error">Invalid appointment identifier. <Link to="/doctor/appointments">Return to appointments</Link></Alert>
  return <AppointmentDetails key={id} id={id} />
}
function AppointmentDetails({ id }: { id: string }) {
  const query = useDoctorAppointmentDetail(id)
  const confirmation = useConfirmAppointment(id)
  const [reviewed, setReviewed] = useState<DoctorAppointment | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const busy = confirmation.phase === 'pending' || confirmation.phase === 'checking'
  const row = query.isSuccess ? query.data : undefined
  const canConfirm = row?.status === 'Pending' && !query.isFetching && !busy && confirmation.phase !== 'unresolved'
  const close = () => { if (!busy) setReviewed(null) }
  const restoreFocus = () => { const target = trigger.current; (target?.isConnected && !target.disabled ? target : heading.current)?.focus() }
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Button component={Link} to="/doctor/appointments" sx={{ justifySelf: 'start' }}>Back to appointments</Button>
    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <Typography component="h1" variant="h4" ref={heading} tabIndex={-1}>Appointment Details</Typography>
      <Button disabled={query.isFetching || busy} onClick={() => { void query.refetch() }}>Refresh appointment</Button>
    </Box>
    <AppointmentReadState pending={query.isPending} error={query.isError ? query.error : null} fetching={query.isFetching} retry={() => { void query.refetch() }} />
    {confirmation.message && <Alert severity={confirmation.phase === 'success' ? 'success' : confirmation.phase === 'error' ? 'error' : 'warning'} role="status">
      {confirmation.message}
      {confirmation.phase === 'unresolved' && <Button disabled={busy} onClick={() => { void confirmation.verify() }}>Check confirmation status</Button>}
    </Alert>}
    {row && <Card><CardContent sx={{ display: 'grid', gap: 2 }}>
      <DoctorAppointmentStatus status={row.status} />
      <Box component="dl" sx={{ display: 'grid', gap: 2, m: 0 }}>
        <Information label="Appointment reference" value={row.id} />
        <Information label="Patient" value={row.patientName} />
        <Information label="Patient profile reference" value={row.patientProfileId} />
        <Information label="Doctor" value={row.doctorName} />
        <Information label="Department" value={row.departmentName} />
        <Information label="Date and time (Asia/Ho_Chi_Minh)" value={`${formatDate(row.appointmentDate)} · ${formatTime(row.startTime)}–${formatTime(row.endTime)}`} />
        <Information label="Symptoms" value={row.symptoms || 'Not provided'} />
        {row.cancelledAt && <Information label="Cancelled at (hospital time)" value={formatTimestamp(row.cancelledAt)} />}
        {row.cancellationReason !== null && <Information label="Cancellation reason" value={row.cancellationReason || 'No reason provided'} />}
        {row.updatedAt && <Information label="Last updated (hospital time)" value={formatTimestamp(row.updatedAt)} />}
      </Box>
      {row.status === 'Pending' && <Button variant="contained" disabled={!canConfirm} onClick={event => { trigger.current = event.currentTarget; setReviewed(row) }}>Confirm appointment</Button>}
      {row.status === 'InProgress' && <Button component={Link} to={`/doctor/appointments/${row.id}/clinical`} variant="contained">Open Clinical Examination</Button>}
      {row.status === 'Pending' && <Typography color="text.secondary">Only Pending appointments can be confirmed. The hospital validates ownership and current status again.</Typography>}
    </CardContent></Card>}
    <Dialog open={reviewed !== null} onClose={close} fullWidth maxWidth="sm" aria-labelledby="doctor-confirm-title"
      disableRestoreFocus slotProps={{ transition: { onExited: restoreFocus } }}>
      <DialogTitle id="doctor-confirm-title">Confirm this appointment?</DialogTitle>
      <DialogContent><DialogContentText>{reviewed ? `${reviewed.patientName} · ${formatDate(reviewed.appointmentDate)} · ${formatTime(reviewed.startTime)}` : ''}</DialogContentText>
        <DialogContentText>The appointment will change from Pending to Confirmed.</DialogContentText>
        {confirmation.message && <Alert severity={confirmation.phase === 'success' ? 'success' : 'info'} role="status">{confirmation.message}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button autoFocus onClick={close} disabled={busy}>Close</Button>
        <Button variant="contained" disabled={!reviewed || !canConfirm || confirmation.phase === 'success'} onClick={() => { if (reviewed) void confirmation.submit(reviewed) }}>Confirm appointment</Button>
      </DialogActions>
    </Dialog>
  </Box>
}
