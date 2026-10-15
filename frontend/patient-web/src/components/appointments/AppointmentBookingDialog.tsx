import { zodResolver } from '@hookform/resolvers/zod'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography, useMediaQuery } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link as RouterLink } from 'react-router-dom'
import { useBookingController } from '../../hooks/useBookingController'
import { useAvailableAppointments } from '../../hooks/useDoctorDirectory'
import { usePatientProfiles } from '../../hooks/usePatientProfiles'
import type { BookingSelection } from '../../services/bookingAttemptStorage'
import { appointmentBookingFormSchema } from '../../types/appointment'
import type { AppointmentBookingForm } from '../../types/appointment'
import { formatAppointmentDate, formatAppointmentTime, normalizeAppointmentTime } from '../../utils/appointmentFormatting'
import { PatientProfileSelector } from './PatientProfileSelector'

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return <Box sx={{ minWidth: 0 }}><Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography sx={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{children}</Typography></Box>
}

function BookingForm({ selection }: { selection: BookingSelection }) {
  const booking = useBookingController()
  const profiles = usePatientProfiles()
  const slots = useAvailableAppointments(selection.doctor.id, selection.date)
  const initialized = useRef(false)
  const form = useForm<AppointmentBookingForm>({ resolver: zodResolver(appointmentBookingFormSchema),
    defaultValues: { patientProfileId: '', symptoms: '' } })
  useEffect(() => {
    if (!profiles.data || booking.busy) return
    if (!initialized.current) {
      initialized.current = true
      const preferred = profiles.data.find((profile) => profile.isDefault) ?? (profiles.data.length === 1 ? profiles.data[0] : undefined)
      if (preferred) form.setValue('patientProfileId', preferred.id)
    }
    const id = form.getValues('patientProfileId')
    if (id && !profiles.data.some((profile) => profile.id === id)) form.setValue('patientProfileId', '', { shouldValidate: true })
  }, [profiles.data, booking.busy, form])
  useEffect(() => {
    for (const field of ['patientProfileId', 'symptoms'] as const) {
      const message = booking.state.failure?.fieldErrors[field]
      if (message) form.setError(field, { message })
    }
  }, [booking.state.failure, form])
  const available = slots.isSuccess && slots.data.some((slot) => slot.isAvailable && slot.reason === 'Available'
    && normalizeAppointmentTime(slot.startTime) === normalizeAppointmentTime(selection.slot.startTime)
    && normalizeAppointmentTime(slot.endTime) === normalizeAppointmentTime(selection.slot.endTime))
  const canConfirm = available && !slots.isFetching && profiles.isSuccess && !profiles.isFetching && profiles.data.length > 0
  return <Box component="form" noValidate onSubmit={(event) => {
    void form.handleSubmit(async (values) => { if (canConfirm && !booking.busy) await booking.submitBooking(values) })(event)
  }}>
    <DialogContent sx={{ display: 'grid', gap: 2 }} aria-busy={booking.busy}>
      <Detail label="Doctor">{selection.doctor.fullName}</Detail>
      <Detail label="Department">{selection.doctor.departmentName}</Detail>
      <Detail label="Appointment date">{formatAppointmentDate(selection.date)}</Detail>
      <Detail label="Hospital time (UTC+7)">{formatAppointmentTime(selection.slot.startTime)} – {formatAppointmentTime(selection.slot.endTime)}</Detail>
      {booking.state.failure ? <Alert severity="error">{booking.state.failure.message}</Alert> : null}
      {!available && !slots.isFetching && !booking.busy ? <Alert severity="warning">This appointment time cannot currently be confirmed. Cancel and refresh appointment times.</Alert> : null}
      {slots.isFetching ? <Typography role="status">Checking appointment times...</Typography> : null}
      {slots.isError ? <Alert severity="error" action={<Button onClick={() => { void slots.refetch() }} disabled={booking.busy}>Retry times</Button>}>Appointment times could not be checked.</Alert> : null}
      {profiles.isPending ? <Typography role="status">Loading patient profiles...</Typography> : null}
      {profiles.isError ? <Alert severity="error" action={<Button onClick={() => { void profiles.refetch() }} disabled={booking.busy || profiles.isFetching}>Retry profiles</Button>}>Patient profiles could not be loaded.</Alert> : null}
      {profiles.isSuccess && profiles.data.length === 0 ? <Alert severity="info">Add a patient profile before booking.
        <Button component={RouterLink} to="/profiles" disabled={booking.busy}>Add a patient profile</Button></Alert> : null}
      {profiles.data && profiles.data.length > 0 ? <Controller control={form.control} name="patientProfileId" render={({ field, fieldState }) => <PatientProfileSelector
        profiles={profiles.data} value={profiles.data.some((profile) => profile.id === field.value) ? field.value : ''}
        onChange={field.onChange} onBlur={field.onBlur} inputRef={field.ref} error={fieldState.error?.message}
        disabled={booking.busy || !profiles.isSuccess || profiles.isFetching} />} /> : null}
      <Controller control={form.control} name="symptoms" render={({ field, fieldState }) => <TextField {...field}
        label="Symptoms (optional)" multiline minRows={3} fullWidth disabled={booking.busy} error={Boolean(fieldState.error)}
        helperText={fieldState.error?.message || 'Up to 2,000 characters.'} slotProps={{ htmlInput: { maxLength: 2000 } }} />} />
      <Typography variant="body2">Availability and profile ownership are checked again before your request is sent.</Typography>
      {booking.busy ? <Typography role="status">Checking and submitting your request. Please wait...</Typography> : null}
    </DialogContent>
    <DialogActions><Button onClick={booking.closeDialog} disabled={booking.busy}>Cancel</Button>
      <Button type="submit" variant="contained" disabled={booking.busy || !canConfirm}>Confirm booking</Button></DialogActions>
  </Box>
}

export function AppointmentBookingDialog() {
  const booking = useBookingController()
  const { state } = booking
  const fullScreen = useMediaQuery(useTheme().breakpoints.down('sm'))
  if (!state.open) return null
  const recovery = ['uncertain', 'reconciling', 'blocked'].includes(state.stage)
  const appointment = state.appointment
  return <Dialog open fullWidth maxWidth="sm" fullScreen={fullScreen} onClose={booking.closeDialog} aria-labelledby="booking-dialog-title">
    <DialogTitle id="booking-dialog-title">{appointment ? 'Verified appointment' : recovery ? 'Booking needs verification' : 'Confirm appointment'}</DialogTitle>
    {appointment ? <>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Alert severity="success" role="status">{state.source === 'created' ? 'Your appointment request was received.' : 'An existing matching appointment was verified.'}</Alert>
        {state.message ? <Alert severity="warning">{state.message}</Alert> : null}
        <Detail label="Patient">{appointment.patientName}</Detail>
        <Detail label="Doctor">{appointment.doctorName}</Detail>
        <Detail label="Department">{appointment.departmentName}</Detail>
        <Detail label="Appointment date">{formatAppointmentDate(appointment.appointmentDate)}</Detail>
        <Detail label="Hospital time (UTC+7)">{formatAppointmentTime(appointment.startTime)} – {formatAppointmentTime(appointment.endTime)}</Detail>
        <Detail label="Status">{appointment.status}</Detail>
        {appointment.symptoms ? <Detail label="Symptoms">{appointment.symptoms}</Detail> : null}
        <Detail label="Appointment reference">{appointment.id}</Detail>
      </DialogContent>
      <DialogActions><Button variant="contained" autoFocus onClick={booking.acknowledge}>Done</Button></DialogActions>
    </> : recovery ? <>
      <DialogContent sx={{ display: 'grid', gap: 2 }} aria-busy={booking.busy}>
        <Alert severity="warning" role="status">{state.message || 'Checking your real appointments. New bookings remain paused.'}</Alert>
        {state.selection ? <>
          <Detail label="Doctor">{state.selection.doctor.fullName} ({state.selection.doctor.id})</Detail>
          <Detail label="Appointment date">{formatAppointmentDate(state.selection.date)}</Detail>
          <Detail label="Hospital time (UTC+7)">{formatAppointmentTime(state.selection.slot.startTime)} – {formatAppointmentTime(state.selection.slot.endTime)}</Detail>
        </> : null}
        {state.attempt ? <>
          <Detail label="Patient profile reference">{state.attempt.request.patientProfileId}</Detail>
          <Detail label="Attempt recorded at">{state.attempt.startedAt}</Detail>
          {state.attempt.knownAppointmentId ? <Detail label="Appointment reference">{state.attempt.knownAppointmentId}</Detail> : null}
        </> : null}
        <Typography>Contact the hospital with these details to verify the request before making another booking. An absent appointment in an immediate check does not prove failure. Keep using this browser tab and Patient account to check again.</Typography>
      </DialogContent>
      <DialogActions><Button onClick={booking.closeDialog} disabled={booking.busy}>Close</Button>
        <Button variant="contained" onClick={() => { void booking.reconcile() }} disabled={booking.busy || state.stage !== 'uncertain'}>Check booking status</Button></DialogActions>
    </> : state.selection ? <BookingForm selection={state.selection} /> : null}
  </Dialog>
}
