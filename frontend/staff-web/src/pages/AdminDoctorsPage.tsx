import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, Dialog, DialogActions, DialogContent,
  DialogContentText, DialogTitle, MenuItem, Skeleton, TextField, Typography,
} from '@mui/material'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAdminDepartments } from '../hooks/useAdminDepartments'
import { useAdminDoctor, useAdminDoctorMutations, useAdminDoctors } from '../hooks/useAdminDoctors'
import { doctorRequestMessage } from '../services/adminDoctorsApi'
import {
  createDoctorSchema, filterAdminDoctors, updateDoctorSchema, type AdminDoctor,
  type CreateDoctorForm, type UpdateDoctorForm,
} from '../types/adminDoctors'

const profileDefaults = { departmentId: '', fullName: '', phone: '', specialization: '', licenseNumber: '',
  yearsOfExperience: 0, biography: '', avatarUrl: '' }

export function AdminDoctorsPage() {
  const doctors = useAdminDoctors()
  const departments = useAdminDepartments()
  const mutations = useAdminDoctorMutations()
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [status, setStatus] = useState('all')
  const [createOpen, setCreateOpen] = useState(false)
  const [editId, setEditId] = useState('')
  const [statusTarget, setStatusTarget] = useState<AdminDoctor | null>(null)
  const [success, setSuccess] = useState('')
  const rows = doctors.isSuccess ? filterAdminDoctors(doctors.data, search, departmentId, status) : []
  const mutationError = mutations.create.error ?? mutations.update.error ?? mutations.status.error
  const activeDepartments = departments.data?.filter(row => row.isActive) ?? []
  const changeStatus = async () => {
    if (!statusTarget) return
    try {
      const result = await mutations.status.mutateAsync({ id: statusTarget.id, isActive: !statusTarget.isActive })
      setSuccess(`Doctor “${result.fullName}” is now ${result.isActive ? 'active' : 'inactive'}.`)
      setStatusTarget(null)
    } catch { /* React Query exposes the sanitized error in the page alert. */ }
  }

  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <Box><Typography component="h1" variant="h4">Doctors</Typography><Typography color="text.secondary">Manage Doctor accounts and professional profiles.</Typography></Box>
      <Button variant="contained" disabled={!activeDepartments.length} onClick={() => { setSuccess(''); setCreateOpen(true) }}>Add Doctor</Button>
    </Box>
    {!departments.isPending && !activeDepartments.length ? <Alert severity="warning">Create or activate a Department before adding a Doctor.</Alert> : null}
    {success ? <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert> : null}
    {mutationError ? <Alert severity="error" onClose={() => { mutations.create.reset(); mutations.update.reset(); mutations.status.reset() }}>{doctorRequestMessage(mutationError)}</Alert> : null}

    <Box component="section" aria-label="Doctor filters" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '2fr 1fr 1fr' }, gap: 2 }}>
      <TextField label="Search by Doctor name" value={search} onChange={event => setSearch(event.target.value)} />
      <TextField select label="Department" value={departmentId} onChange={event => setDepartmentId(event.target.value)}>
        <MenuItem value="">All Departments</MenuItem>{departments.data?.map(row => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}
      </TextField>
      <TextField select label="Status" value={status} onChange={event => setStatus(event.target.value)}>
        <MenuItem value="all">All statuses</MenuItem><MenuItem value="active">Active</MenuItem><MenuItem value="inactive">Inactive</MenuItem>
      </TextField>
    </Box>

    {doctors.isPending ? <Box role="status" aria-label="Loading Doctors"><Skeleton height={140} /><Skeleton height={140} />Loading Doctors…</Box> : null}
    {doctors.isError ? <Alert severity="error" action={<Button disabled={doctors.isFetching} onClick={() => { void doctors.refetch() }}>Retry</Button>}>{doctorRequestMessage(doctors.error)}</Alert> : null}
    {doctors.isSuccess && rows.length === 0 ? <Alert severity="info">No Doctors match the selected filters.</Alert> : null}
    {rows.length ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      {rows.map(doctor => <Card key={doctor.id} variant="outlined"><CardContent sx={{ display: 'grid', gap: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'start' }}>
          <Typography component="h2" variant="h6" sx={{ overflowWrap: 'anywhere' }}>{doctor.fullName}</Typography>
          <Chip size="small" label={doctor.isActive ? 'Active' : 'Inactive'} color={doctor.isActive ? 'success' : 'default'} />
        </Box>
        <Typography>{doctor.specialization} · {doctor.departmentName}</Typography>
        <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{doctor.email}</Typography>
        <Typography color="text.secondary">{doctor.phone || 'No phone provided'} · License {doctor.licenseNumber}</Typography>
      </CardContent><CardActions sx={{ flexWrap: 'wrap' }}>
        <Button disabled={mutations.isPending} onClick={() => { setSuccess(''); setEditId(doctor.id) }}>Edit profile</Button>
        <Button component={Link} to={`/admin/doctors/${doctor.id}/schedules`}>Schedules</Button>
        <Button disabled={mutations.isPending} color={doctor.isActive ? 'warning' : 'success'} onClick={() => setStatusTarget(doctor)}>{doctor.isActive ? 'Deactivate' : 'Activate'}</Button>
      </CardActions></Card>)}
    </Box> : null}

    <CreateDoctorDialog open={createOpen} departments={activeDepartments} pending={mutations.isPending} error={mutations.create.error}
      close={() => { if (!mutations.isPending) setCreateOpen(false) }} submit={async values => {
        try { const result = await mutations.create.mutateAsync(values); setSuccess(`Doctor “${result.fullName}” and their Doctor account were created.`); setCreateOpen(false) } catch { /* rendered by mutation alert */ }
      }} />
    <EditDoctorDialog id={editId} departments={activeDepartments} pending={mutations.isPending} error={mutations.update.error}
      close={() => { if (!mutations.isPending) setEditId('') }} submit={async values => {
        try { const result = await mutations.update.mutateAsync({ id: editId, values }); setSuccess(`Doctor “${result.fullName}” was updated.`); setEditId('') } catch { /* rendered by mutation alert */ }
      }} />
    <Dialog open={statusTarget !== null} onClose={() => { if (!mutations.isPending) setStatusTarget(null) }} aria-labelledby="doctor-status-title">
      <DialogTitle id="doctor-status-title">{statusTarget?.isActive ? 'Deactivate Doctor?' : 'Activate Doctor?'}</DialogTitle>
      <DialogContent><DialogContentText>{statusTarget?.isActive
        ? `Deactivate “${statusTarget.fullName}”? Their Doctor profile and User account will both become inactive. Existing JWTs may remain valid until expiry.`
        : `Activate “${statusTarget?.fullName}” and their linked User account?`}</DialogContentText></DialogContent>
      <DialogActions><Button disabled={mutations.isPending} onClick={() => setStatusTarget(null)}>Cancel</Button>
        <Button variant="contained" color={statusTarget?.isActive ? 'warning' : 'success'} disabled={mutations.isPending} onClick={() => { void changeStatus() }}>
          {mutations.isPending ? 'Updating…' : statusTarget?.isActive ? 'Deactivate' : 'Activate'}
        </Button></DialogActions>
    </Dialog>
  </Box>
}

type DepartmentOption = { id: string; name: string }
function ProfileFields({ register, errors, departments }: { register: ReturnType<typeof useForm<UpdateDoctorForm>>['register']; errors: ReturnType<typeof useForm<UpdateDoctorForm>>['formState']['errors']; departments: DepartmentOption[] }) {
  return <>
    <TextField select label="Department" required defaultValue="" {...register('departmentId')} error={!!errors.departmentId} helperText={errors.departmentId?.message}>
      {departments.map(row => <MenuItem key={row.id} value={row.id}>{row.name}</MenuItem>)}</TextField>
    <TextField label="Full name" required slotProps={{ htmlInput: { maxLength: 150 } }} {...register('fullName')} error={!!errors.fullName} helperText={errors.fullName?.message} />
    <TextField label="Specialization" required slotProps={{ htmlInput: { maxLength: 150 } }} {...register('specialization')} error={!!errors.specialization} helperText={errors.specialization?.message} />
    <TextField label="License number" required slotProps={{ htmlInput: { maxLength: 100 } }} {...register('licenseNumber')} error={!!errors.licenseNumber} helperText={errors.licenseNumber?.message} />
    <TextField label="Phone" slotProps={{ htmlInput: { maxLength: 20 } }} {...register('phone')} error={!!errors.phone} helperText={errors.phone?.message} />
    <TextField label="Years of experience" type="number" slotProps={{ htmlInput: { min: 0, max: 80 } }} {...register('yearsOfExperience', { valueAsNumber: true })} error={!!errors.yearsOfExperience} helperText={errors.yearsOfExperience?.message} />
    <TextField label="Biography" multiline minRows={3} slotProps={{ htmlInput: { maxLength: 2000 } }} {...register('biography')} error={!!errors.biography} helperText={errors.biography?.message} />
    <TextField label="Avatar URL" slotProps={{ htmlInput: { maxLength: 1000 } }} {...register('avatarUrl')} error={!!errors.avatarUrl} helperText={errors.avatarUrl?.message} />
  </>
}

function CreateDoctorDialog({ open, close, submit, departments, pending, error }: { open: boolean; close: () => void; submit: (values: CreateDoctorForm) => Promise<void>; departments: DepartmentOption[]; pending: boolean; error: unknown }) {
  const form = useForm<CreateDoctorForm>({ resolver: zodResolver(createDoctorSchema), defaultValues: { email: '', password: '', ...profileDefaults } })
  return <Dialog open={open} onClose={close} fullWidth maxWidth="md" aria-labelledby="create-doctor-title"><Box component="form" noValidate onSubmit={form.handleSubmit(submit)}>
    <DialogTitle id="create-doctor-title">Add Doctor</DialogTitle><DialogContent sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2, pt: '8px !important' }}>
      {error ? <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{doctorRequestMessage(error)}</Alert> : null}
      <TextField autoFocus label="Account email" required type="email" autoComplete="off" {...form.register('email')} error={!!form.formState.errors.email} helperText={form.formState.errors.email?.message} />
      <TextField label="Temporary password" required type="password" autoComplete="new-password" {...form.register('password')} error={!!form.formState.errors.password} helperText={form.formState.errors.password?.message ?? '8–100 characters. Never stored in the browser.'} />
      <ProfileFields register={form.register} errors={form.formState.errors} departments={departments} />
    </DialogContent><DialogActions><Button disabled={pending} onClick={close}>Cancel</Button><Button type="submit" variant="contained" disabled={pending}>{pending ? 'Creating…' : 'Create Doctor'}</Button></DialogActions>
  </Box></Dialog>
}

function EditDoctorDialog({ id, close, submit, departments, pending, error }: { id: string; close: () => void; submit: (values: UpdateDoctorForm) => Promise<void>; departments: DepartmentOption[]; pending: boolean; error: unknown }) {
  const query = useAdminDoctor(id)
  return <Dialog open={!!id} onClose={close} fullWidth maxWidth="md" aria-labelledby="edit-doctor-title"><DialogTitle id="edit-doctor-title">Edit Doctor</DialogTitle>
    {query.isPending ? <DialogContent><Skeleton height={240} />Loading authoritative Doctor profile…</DialogContent> : null}
    {query.isError ? <DialogContent><Alert severity="error" action={<Button onClick={() => { void query.refetch() }}>Retry</Button>}>{doctorRequestMessage(query.error)}</Alert></DialogContent> : null}
    {query.isSuccess ? <EditDoctorForm doctor={query.data} close={close} submit={submit} departments={departments} pending={pending} error={error} /> : null}
  </Dialog>
}

function EditDoctorForm({ doctor, close, submit, departments, pending, error }: { doctor: AdminDoctor; close: () => void; submit: (values: UpdateDoctorForm) => Promise<void>; departments: DepartmentOption[]; pending: boolean; error: unknown }) {
  const form = useForm<UpdateDoctorForm>({ resolver: zodResolver(updateDoctorSchema), defaultValues: { departmentId: doctor.departmentId, fullName: doctor.fullName, phone: doctor.phone ?? '', specialization: doctor.specialization, licenseNumber: doctor.licenseNumber, yearsOfExperience: doctor.yearsOfExperience, biography: doctor.biography ?? '', avatarUrl: doctor.avatarUrl ?? '' } })
  return <Box component="form" noValidate onSubmit={form.handleSubmit(submit)}><DialogContent sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 2 }}>
    <Alert severity="info" sx={{ gridColumn: '1 / -1' }}>Account email {doctor.email} is immutable in this workflow.</Alert>
    {error ? <Alert severity="error" sx={{ gridColumn: '1 / -1' }}>{doctorRequestMessage(error)}</Alert> : null}
    <ProfileFields register={form.register} errors={form.formState.errors} departments={departments} />
  </DialogContent><DialogActions><Button disabled={pending} onClick={close}>Cancel</Button><Button type="submit" variant="contained" disabled={pending}>{pending ? 'Saving…' : 'Save changes'}</Button></DialogActions></Box>
}
