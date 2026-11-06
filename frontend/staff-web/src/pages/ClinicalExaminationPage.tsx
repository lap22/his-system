import { useEffect, useRef, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useBeforeUnload, useBlocker, useParams } from 'react-router-dom'
import { z } from 'zod'
import {
  Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, Divider, Skeleton, Stack, TextField, Typography,
} from '@mui/material'
import { useDoctorAppointmentDetail } from '../hooks/useDoctorAppointments'
import { useAuth } from '../hooks/useAuth'
import { appointmentReadError } from '../services/doctorAppointmentsApi'
import {
  clinicalDraftSchema, clinicalFieldLimits, clinicalFinalizationReviewSchema,
  emptyClinicalDraft,
} from '../types/clinicalDraft'
import type { ClinicalDraft } from '../types/clinicalDraft'
import { formatDate, formatTime } from '../utils/doctorAppointments'

const fields = [
  ['chiefComplaint', 'Chief Complaint', clinicalFieldLimits.chiefComplaint, true],
  ['symptoms', 'Clinical Symptoms', clinicalFieldLimits.symptoms, false],
  ['diagnosis', 'Diagnosis', clinicalFieldLimits.diagnosis, true],
  ['treatment', 'Treatment Plan', clinicalFieldLimits.treatment, false],
  ['doctorNotes', 'Doctor Notes', clinicalFieldLimits.doctorNotes, false],
] as const

function SummaryValue({ label, value }: { label: string; value: string }) {
  return <Box><Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
    <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography></Box>
}

export function ClinicalExaminationPage() {
  const { appointmentId = '' } = useParams()
  if (!z.uuid().safeParse(appointmentId).success) {
    return <Alert severity="error">Invalid appointment identifier. <Link to="/doctor/appointments">Return to appointments</Link></Alert>
  }
  return <ClinicalWorkspace key={appointmentId} appointmentId={appointmentId} />
}

function ClinicalWorkspace({ appointmentId }: { appointmentId: string }) {
  const query = useDoctorAppointmentDetail(appointmentId)
  const { user } = useAuth()
  const [review, setReview] = useState<ClinicalDraft | null>(null)
  const reviewTrigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const form = useForm<ClinicalDraft>({
    resolver: zodResolver(clinicalDraftSchema), defaultValues: emptyClinicalDraft, mode: 'onChange',
  })
  const { reset } = form
  const values = useWatch({ control: form.control })
  const dirty = form.formState.isDirty
  const blocker = useBlocker(dirty)

  // Account changes clear all clinician-entered content. Appointment data is
  // account-scoped separately by the existing TanStack Query keys.
  useEffect(() => { reset(emptyClinicalDraft) }, [user?.userId, reset])
  useBeforeUnload(event => {
    if (dirty) { event.preventDefault(); event.returnValue = '' }
  })

  const openReview = async () => {
    const current = form.getValues()
    const result = clinicalFinalizationReviewSchema.safeParse(current)
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0]
        if (typeof field === 'string' && field in emptyClinicalDraft) {
          form.setError(field as keyof ClinicalDraft, { type: 'review', message: issue.message })
        }
      }
      return
    }
    form.clearErrors()
    setReview(result.data)
  }
  const restoreReviewFocus = () => {
    const target = reviewTrigger.current
    ;(target?.isConnected && !target.disabled ? target : heading.current)?.focus()
  }

  if (query.isPending) return <Box role="status" aria-label="Loading clinical appointment" sx={{ display: 'grid', gap: 2 }}>
    <Skeleton height={64} /><Skeleton height={180} /><Skeleton height={360} />
    <span>Loading appointment information…</span>
  </Box>
  if (query.isError) return <Alert severity="error" action={<Button disabled={query.isFetching} onClick={() => { void query.refetch() }}>Retry</Button>}>
    {appointmentReadError(query.error)}
  </Alert>

  const appointment = query.data
  if (appointment.status !== 'InProgress') return <Box sx={{ display: 'grid', gap: 2 }}>
    <Button component={Link} to={`/doctor/appointments/${appointment.id}`} sx={{ justifySelf: 'start' }}>Back to appointment</Button>
    <Typography component="h1" variant="h4">Clinical Examination</Typography>
    <Alert severity="warning">Clinical entry is available only while the assigned appointment is In Progress. Current status: {appointment.status}.</Alert>
  </Box>

  return <Box sx={{ display: 'grid', gap: 3, maxWidth: 1100, mx: 'auto' }}>
    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <Box>
        <Typography component="h1" variant="h4" ref={heading} tabIndex={-1}>Clinical Examination</Typography>
        <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>Appointment reference: {appointment.id}</Typography>
      </Box>
      <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
        <Chip label="Frontend preview · Not persisted" color="warning" />
        <Button component={Link} to={`/doctor/appointments/${appointment.id}`}>Back to appointment</Button>
      </Stack>
    </Box>

    <Alert severity="warning">Clinical persistence is not available. Content entered here stays only in this page session and will be lost when you leave.</Alert>

    <Card><CardContent sx={{ display: 'grid', gap: 2 }}>
      <Typography component="h2" variant="h5">Patient and appointment summary</Typography>
      <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2, m: 0 }}>
        <SummaryValue label="Patient" value={appointment.patientName} />
        <SummaryValue label="Date and time (Asia/Ho_Chi_Minh)" value={`${formatDate(appointment.appointmentDate)} · ${formatTime(appointment.startTime)}–${formatTime(appointment.endTime)}`} />
        <SummaryValue label="Assigned Doctor" value={appointment.doctorName} />
        <SummaryValue label="Department" value={appointment.departmentName} />
        <SummaryValue label="Appointment status" value={appointment.status} />
      </Box>
      <Divider />
      <Typography component="h3" variant="h6">Booking symptoms</Typography>
      <Typography sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{appointment.symptoms || 'Not provided'}</Typography>
      <Typography variant="body2" color="text.secondary">Reported during appointment booking. Read-only.</Typography>
    </CardContent></Card>

    <Card component="form" noValidate onSubmit={event => event.preventDefault()}><CardContent sx={{ display: 'grid', gap: 2 }}>
      <Typography component="h2" variant="h5">Clinical record editor</Typography>
      <Typography color="text.secondary">Required markers indicate future finalization requirements. Incomplete in-memory drafting remains allowed.</Typography>
      {fields.map(([name, label, maximum, finalizationRequired]) => {
        const value = values[name] ?? ''
        const error = form.formState.errors[name]?.message
        return <TextField key={name} label={`${label}${finalizationRequired ? ' (required to finalize)' : ''}`} multiline minRows={name === 'doctorNotes' ? 4 : 3}
          {...form.register(name)} error={!!error} helperText={error || `${value.length}/${maximum} characters`}
          slotProps={{ htmlInput: { maxLength: maximum, 'aria-describedby': 'clinical-privacy' } }} />
      })}
      <Typography id="clinical-privacy" variant="caption" color="text.secondary">Clinical text is held in memory only. It is not saved or sent to an API.</Typography>
      <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
        <Button ref={reviewTrigger} variant="contained" onClick={() => { void openReview() }}>Review entered information</Button>
        <Button disabled variant="outlined">Save Draft unavailable</Button>
        <Button disabled color="success" variant="contained">Finalize unavailable</Button>
      </Box>
    </CardContent></Card>

    <Dialog open={review !== null} onClose={() => setReview(null)} fullWidth maxWidth="md" aria-labelledby="clinical-review-title"
      disableRestoreFocus slotProps={{ transition: { onExited: restoreReviewFocus } }}>
      <DialogTitle id="clinical-review-title">Review clinical information</DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 2 }}>
        <Alert severity="warning">This content has not been saved. Review does not finalize the record or complete the queue.</Alert>
        <Box component="dl" sx={{ display: 'grid', gap: 2, m: 0 }}>
          {review && fields.map(([name, label]) => <SummaryValue key={name} label={label} value={review[name].trim() || 'Not provided'} />)}
        </Box>
        <DialogContentText>Return to editing to make changes. Persistence will be introduced only after the backend contract is approved.</DialogContentText>
      </DialogContent>
      <DialogActions><Button autoFocus onClick={() => setReview(null)}>Return to editing</Button></DialogActions>
    </Dialog>

    <Dialog open={blocker.state === 'blocked'} aria-labelledby="clinical-unsaved-title">
      <DialogTitle id="clinical-unsaved-title">Discard unsaved clinical content?</DialogTitle>
      <DialogContent><DialogContentText>Nothing entered on this page has been saved. Leaving will permanently discard it.</DialogContentText></DialogContent>
      <DialogActions>
        <Button autoFocus onClick={() => blocker.reset?.()}>Stay and continue editing</Button>
        <Button color="error" onClick={() => blocker.proceed?.()}>Discard and leave</Button>
      </DialogActions>
    </Dialog>
  </Box>
}

