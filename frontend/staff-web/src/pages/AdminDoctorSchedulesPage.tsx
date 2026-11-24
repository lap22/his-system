import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, MenuItem, Skeleton, TextField, Typography,
} from '@mui/material'
import { useForm, useWatch } from 'react-hook-form'
import { Link, useParams } from 'react-router-dom'
import { useState } from 'react'
import { z } from 'zod'
import { useAdminDoctor } from '../hooks/useAdminDoctors'
import { useAdminSchedule, useAdminScheduleMutations, useAdminSchedules } from '../hooks/useAdminSchedules'
import { doctorRequestMessage } from '../services/adminDoctorsApi'
import { scheduleRequestMessage } from '../services/adminSchedulesApi'
import { groupSchedules, inputTime, scheduleFormSchema, weekdays, type AdminSchedule, type ScheduleForm } from '../types/adminSchedules'

const defaults: ScheduleForm = { dayOfWeek: 'Monday', startTime: '08:00', endTime: '12:00', slotDurationMinutes: 30, maxPatients: 8 }

export function AdminDoctorSchedulesPage() {
  const { doctorId = '' } = useParams()
  if (!z.uuid().safeParse(doctorId).success) return <Alert severity="error">Invalid Doctor identifier.</Alert>
  return <ScheduleWorkspace doctorId={doctorId} />
}

function ScheduleWorkspace({ doctorId }: { doctorId: string }) {
  const doctor = useAdminDoctor(doctorId)
  const schedules = useAdminSchedules(doctorId)
  const mutations = useAdminScheduleMutations(doctorId)
  const [editor, setEditor] = useState<'create' | string | null>(null)
  const [statusTarget, setStatusTarget] = useState<AdminSchedule | null>(null)
  const [success, setSuccess] = useState('')
  const mutationError = mutations.create.error ?? mutations.update.error ?? mutations.status.error
  const changeStatus = async () => {
    if (!statusTarget) return
    try { const result = await mutations.status.mutateAsync({ id: statusTarget.id, isActive: !statusTarget.isActive }); setSuccess(`${result.dayOfWeek} schedule is now ${result.isActive ? 'active' : 'inactive'}.`); setStatusTarget(null) }
    catch { /* The mutation alert displays the authoritative error. */ }
  }

  if (doctor.isPending) return <Box role="status"><Skeleton height={180} />Loading Doctor…</Box>
  if (doctor.isError) return <Alert severity="error" action={<Button onClick={() => { void doctor.refetch() }}>Retry</Button>}>{doctorRequestMessage(doctor.error)}</Alert>
  const selectedDoctor = doctor.data
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 2, flexWrap: 'wrap' }}>
      <Box><Button component={Link} to="/admin/doctors">Back to Doctors</Button><Typography component="h1" variant="h4">{selectedDoctor.fullName} · Schedules</Typography>
        <Typography color="text.secondary">{selectedDoctor.departmentName} · Recurring hospital-local working hours</Typography></Box>
      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}><Chip label={selectedDoctor.isActive ? 'Doctor active' : 'Doctor inactive'} color={selectedDoctor.isActive ? 'success' : 'default'} />
        <Button variant="contained" disabled={!selectedDoctor.isActive || mutations.isPending} onClick={() => { setSuccess(''); setEditor('create') }}>Add schedule</Button></Box>
    </Box>
    {!selectedDoctor.isActive ? <Alert severity="warning">This Doctor is inactive. New schedules, edits, and schedule activation are unavailable. Existing schedules can still be deactivated.</Alert> : null}
    <Alert severity="info">Existing appointments are preserved. The backend rejects edits or deactivation that would leave a future appointment without an equivalent active slot.</Alert>
    {success ? <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert> : null}
    {mutationError ? <Alert severity="error" onClose={() => { mutations.create.reset(); mutations.update.reset(); mutations.status.reset() }}>{scheduleRequestMessage(mutationError)}</Alert> : null}
    {schedules.isPending ? <Box role="status"><Skeleton height={120} /><Skeleton height={120} />Loading weekly schedules…</Box> : null}
    {schedules.isError ? <Alert severity="error" action={<Button disabled={schedules.isFetching} onClick={() => { void schedules.refetch() }}>Retry</Button>}>{scheduleRequestMessage(schedules.error)}</Alert> : null}
    {schedules.isSuccess && schedules.data.length === 0 ? <Alert severity="info">No recurring schedules are configured for this Doctor.</Alert> : null}
    {schedules.isSuccess ? <Box sx={{ display: 'grid', gap: 2 }}>{groupSchedules(schedules.data).filter(group => group.rows.length).map(group => <Box component="section" key={group.day} aria-labelledby={`schedule-${group.day}`}>
      <Typography id={`schedule-${group.day}`} component="h2" variant="h5" sx={{ mb: 1 }}>{group.day}</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>{group.rows.map(row => <Card key={row.id} variant="outlined"><CardContent sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}><Typography variant="h6">{inputTime(row.startTime)}–{inputTime(row.endTime)}</Typography><Chip size="small" label={row.isActive ? 'Active' : 'Inactive'} color={row.isActive ? 'success' : 'default'} /></Box>
        <Typography>Slot duration: {row.slotDurationMinutes} minutes</Typography><Typography>Maximum patients: {row.maxPatients}</Typography>
      </CardContent><CardActions sx={{ flexWrap: 'wrap' }}>
        <Button disabled={!selectedDoctor.isActive || mutations.isPending} onClick={() => { setSuccess(''); setEditor(row.id) }}>Edit</Button>
        <Button color={row.isActive ? 'warning' : 'success'} disabled={mutations.isPending || (!row.isActive && !selectedDoctor.isActive)} onClick={() => setStatusTarget(row)}>{row.isActive ? 'Deactivate' : 'Activate'}</Button>
      </CardActions></Card>)}</Box>
    </Box>)}</Box> : null}
    <ScheduleEditor open={editor !== null} mode={editor === 'create' ? 'create' : 'edit'} id={editor && editor !== 'create' ? editor : ''} doctorId={doctorId} pending={mutations.isPending}
      close={() => { if (!mutations.isPending) setEditor(null) }} submit={async values => { try { const result = editor === 'create' ? await mutations.create.mutateAsync(values) : await mutations.update.mutateAsync({ id: editor!, values }); setSuccess(`${result.dayOfWeek} schedule was ${editor === 'create' ? 'created' : 'updated'}.`); setEditor(null) } catch { /* rendered above */ } }} error={mutations.create.error ?? mutations.update.error} />
    <Dialog open={statusTarget !== null} onClose={() => { if (!mutations.isPending) setStatusTarget(null) }} aria-labelledby="schedule-status-title"><DialogTitle id="schedule-status-title">{statusTarget?.isActive ? 'Deactivate schedule?' : 'Activate schedule?'}</DialogTitle>
      <DialogContent><DialogContentText>{statusTarget?.isActive ? 'Existing appointments are not deleted. Deactivation is rejected if any future appointment is not covered by another equivalent active schedule.' : 'The backend will recheck Doctor availability and overlapping active schedules before activation.'}</DialogContentText></DialogContent>
      <DialogActions><Button disabled={mutations.isPending} onClick={() => setStatusTarget(null)}>Cancel</Button><Button variant="contained" color={statusTarget?.isActive ? 'warning' : 'success'} disabled={mutations.isPending} onClick={() => { void changeStatus() }}>{mutations.isPending ? 'Updating…' : statusTarget?.isActive ? 'Deactivate' : 'Activate'}</Button></DialogActions>
    </Dialog>
  </Box>
}

function ScheduleEditor({ open, mode, id, doctorId, close, submit, pending, error }: { open: boolean; mode: 'create' | 'edit'; id: string; doctorId: string; close: () => void; submit: (values: ScheduleForm) => Promise<void>; pending: boolean; error: unknown }) {
  const detail = useAdminSchedule(doctorId, id)
  if (mode === 'edit' && open) return <Dialog open onClose={close} fullWidth maxWidth="sm" aria-labelledby="schedule-editor-title"><DialogTitle id="schedule-editor-title">Edit schedule</DialogTitle>
    {detail.isPending ? <DialogContent><Skeleton height={240} />Loading authoritative schedule…</DialogContent> : null}
    {detail.isError ? <DialogContent><Alert severity="error" action={<Button onClick={() => { void detail.refetch() }}>Retry</Button>}>{scheduleRequestMessage(detail.error)}</Alert></DialogContent> : null}
    {detail.isSuccess ? <ScheduleFormContent initial={{ dayOfWeek: detail.data.dayOfWeek, startTime: inputTime(detail.data.startTime), endTime: inputTime(detail.data.endTime), slotDurationMinutes: detail.data.slotDurationMinutes, maxPatients: detail.data.maxPatients }} close={close} submit={submit} pending={pending} error={error} /> : null}
  </Dialog>
  return <Dialog open={open} onClose={close} fullWidth maxWidth="sm" aria-labelledby="schedule-editor-title"><DialogTitle id="schedule-editor-title">Add schedule</DialogTitle><ScheduleFormContent initial={defaults} close={close} submit={submit} pending={pending} error={error} /></Dialog>
}

function ScheduleFormContent({ initial, close, submit, pending, error }: { initial: ScheduleForm; close: () => void; submit: (values: ScheduleForm) => Promise<void>; pending: boolean; error: unknown }) {
  const form = useForm<ScheduleForm>({ resolver: zodResolver(scheduleFormSchema), defaultValues: initial })
  const values = useWatch({ control: form.control })
  return <Box component="form" noValidate onSubmit={form.handleSubmit(submit)}><DialogContent sx={{ display: 'grid', gap: 2 }}>
    {error ? <Alert severity="error">{scheduleRequestMessage(error)}</Alert> : null}
    <TextField select label="Weekday" defaultValue={initial.dayOfWeek} {...form.register('dayOfWeek')}>{weekdays.map(day => <MenuItem key={day} value={day}>{day}</MenuItem>)}</TextField>
    <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}><TextField label="Start time" type="time" slotProps={{ inputLabel: { shrink: true } }} {...form.register('startTime')} error={!!form.formState.errors.startTime} helperText={form.formState.errors.startTime?.message} />
      <TextField label="End time" type="time" slotProps={{ inputLabel: { shrink: true } }} {...form.register('endTime')} error={!!form.formState.errors.endTime} helperText={form.formState.errors.endTime?.message} /></Box>
    <TextField label="Slot duration (minutes)" type="number" slotProps={{ htmlInput: { min: 1, max: 480 } }} {...form.register('slotDurationMinutes', { valueAsNumber: true })} error={!!form.formState.errors.slotDurationMinutes} helperText={form.formState.errors.slotDurationMinutes?.message} />
    <TextField label="Maximum patients" type="number" slotProps={{ htmlInput: { min: 1, max: 100 } }} {...form.register('maxPatients', { valueAsNumber: true })} error={!!form.formState.errors.maxPatients} helperText={form.formState.errors.maxPatients?.message} />
    <Alert severity="info">Preview: {values.dayOfWeek}, {values.startTime}–{values.endTime}; {values.slotDurationMinutes} minute slots; maximum {values.maxPatients} patients. The backend is authoritative for overlap validation.</Alert>
  </DialogContent><DialogActions><Button disabled={pending} onClick={close}>Cancel</Button><Button type="submit" variant="contained" disabled={pending}>{pending ? 'Saving…' : 'Save schedule'}</Button></DialogActions></Box>
}
