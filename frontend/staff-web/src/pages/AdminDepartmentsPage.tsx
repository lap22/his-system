import { zodResolver } from '@hookform/resolvers/zod'
import {
  Alert, Box, Button, Card, CardActions, CardContent, Chip, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle, Skeleton, TextField, Typography,
} from '@mui/material'
import { useForm } from 'react-hook-form'
import { useState } from 'react'
import { departmentRequestMessage } from '../services/adminDepartmentsApi'
import { useAdminDepartmentMutations, useAdminDepartments } from '../hooks/useAdminDepartments'
import { departmentFormSchema, type Department, type DepartmentForm } from '../types/adminDepartments'

type Editor = { kind: 'create' } | { kind: 'edit'; department: Department }

export function AdminDepartmentsPage() {
  const query = useAdminDepartments()
  const mutations = useAdminDepartmentMutations()
  const [editor, setEditor] = useState<Editor | null>(null)
  const [statusTarget, setStatusTarget] = useState<Department | null>(null)
  const [success, setSuccess] = useState('')
  const form = useForm<DepartmentForm>({
    resolver: zodResolver(departmentFormSchema),
    defaultValues: { name: '', description: '' },
  })

  const openCreate = () => {
    form.reset({ name: '', description: '' })
    setSuccess('')
    setEditor({ kind: 'create' })
  }
  const openEdit = (department: Department) => {
    form.reset({ name: department.name, description: department.description ?? '' })
    setSuccess('')
    setEditor({ kind: 'edit', department })
  }
  const closeEditor = () => { if (!mutations.isPending) setEditor(null) }
  const submit = form.handleSubmit(async values => {
    if (!editor) return
    const result = editor.kind === 'create'
      ? await mutations.create.mutateAsync(values)
      : await mutations.update.mutateAsync({ id: editor.department.id, values })
    setSuccess(editor.kind === 'create' ? `Department “${result.name}” was created.` : `Department “${result.name}” was updated.`)
    setEditor(null)
  })
  const changeStatus = async () => {
    if (!statusTarget) return
    const result = await mutations.status.mutateAsync({ id: statusTarget.id, isActive: !statusTarget.isActive })
    setSuccess(`Department “${result.name}” is now ${result.isActive ? 'active' : 'inactive'}.`)
    setStatusTarget(null)
  }
  const mutationError = mutations.create.error ?? mutations.update.error ?? mutations.status.error

  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
      <Box><Typography component="h1" variant="h4">Departments</Typography>
        <Typography color="text.secondary">Manage hospital departments and their availability.</Typography></Box>
      <Button variant="contained" onClick={openCreate}>Add department</Button>
    </Box>

    {success ? <Alert severity="success" onClose={() => setSuccess('')}>{success}</Alert> : null}
    {mutationError ? <Alert severity="error" onClose={() => { mutations.create.reset(); mutations.update.reset(); mutations.status.reset() }}>
      {departmentRequestMessage(mutationError)}</Alert> : null}
    {query.isPending ? <Box role="status" aria-label="Loading departments" sx={{ display: 'grid', gap: 2 }}>
      <Skeleton height={120} /><Skeleton height={120} /><span>Loading departments…</span></Box> : null}
    {query.isError ? <Alert severity="error" action={<Button disabled={query.isFetching} onClick={() => { void query.refetch() }}>Retry</Button>}>
      {departmentRequestMessage(query.error)}</Alert> : null}
    {query.isSuccess && query.data.length === 0 ? <Alert severity="info">No departments have been configured.</Alert> : null}
    {query.isSuccess && query.data.length > 0 ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
      {query.data.map(department => <Card key={department.id} variant="outlined">
        <CardContent sx={{ display: 'grid', gap: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, alignItems: 'start' }}>
            <Typography component="h2" variant="h6" sx={{ overflowWrap: 'anywhere' }}>{department.name}</Typography>
            <Chip size="small" label={department.isActive ? 'Active' : 'Inactive'} color={department.isActive ? 'success' : 'default'} />
          </Box>
          <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
            {department.description || 'No description provided.'}
          </Typography>
        </CardContent>
        <CardActions sx={{ flexWrap: 'wrap' }}>
          <Button disabled={mutations.isPending} onClick={() => openEdit(department)}>Edit</Button>
          <Button disabled={mutations.isPending} color={department.isActive ? 'warning' : 'success'} onClick={() => setStatusTarget(department)}>
            {department.isActive ? 'Deactivate' : 'Activate'}
          </Button>
        </CardActions>
      </Card>)}
    </Box> : null}

    <Dialog open={editor !== null} onClose={closeEditor} fullWidth maxWidth="sm" aria-labelledby="department-editor-title">
      <Box component="form" noValidate onSubmit={event => { event.preventDefault(); void submit() }}>
        <DialogTitle id="department-editor-title">{editor?.kind === 'edit' ? 'Edit department' : 'Add department'}</DialogTitle>
        <DialogContent sx={{ display: 'grid', gap: 2, pt: '8px !important' }}>
          <TextField autoFocus label="Department name" required slotProps={{ htmlInput: { maxLength: 150 } }} {...form.register('name')}
            error={!!form.formState.errors.name} helperText={form.formState.errors.name?.message ?? 'Maximum 150 characters.'} />
          <TextField label="Description" multiline minRows={4} slotProps={{ htmlInput: { maxLength: 1000 } }} {...form.register('description')}
            error={!!form.formState.errors.description} helperText={form.formState.errors.description?.message ?? 'Optional; maximum 1,000 characters.'} />
        </DialogContent>
        <DialogActions><Button disabled={mutations.isPending} onClick={closeEditor}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={mutations.isPending}>{mutations.isPending ? 'Saving…' : 'Save'}</Button></DialogActions>
      </Box>
    </Dialog>

    <Dialog open={statusTarget !== null} onClose={() => { if (!mutations.isPending) setStatusTarget(null) }} aria-labelledby="department-status-title">
      <DialogTitle id="department-status-title">{statusTarget?.isActive ? 'Deactivate department?' : 'Activate department?'}</DialogTitle>
      <DialogContent><DialogContentText>
        {statusTarget?.isActive
          ? `Deactivate “${statusTarget.name}”? It will no longer be available for active hospital workflows.`
          : `Activate “${statusTarget?.name}” for hospital workflows?`}
      </DialogContentText></DialogContent>
      <DialogActions><Button disabled={mutations.isPending} onClick={() => setStatusTarget(null)}>Cancel</Button>
        <Button variant="contained" color={statusTarget?.isActive ? 'warning' : 'success'} disabled={mutations.isPending} onClick={() => { void changeStatus() }}>
          {mutations.isPending ? 'Updating…' : statusTarget?.isActive ? 'Deactivate' : 'Activate'}
        </Button></DialogActions>
    </Dialog>
  </Box>
}
