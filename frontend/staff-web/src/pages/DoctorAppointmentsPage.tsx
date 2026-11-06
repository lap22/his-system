import { Box, Button, MenuItem, TextField, Typography } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import { useDoctorAppointments } from '../hooks/useDoctorAppointments'
import { appointmentStatusSchema } from '../types/doctorAppointments'
import { appointmentStatusLabels, parseAppointmentFilters } from '../utils/doctorAppointments'
import { AppointmentReadState, DoctorAppointmentList } from '../components/DoctorAppointments'

export function DoctorAppointmentsPage() {
  const [search, setSearch] = useSearchParams()
  const filters = parseAppointmentFilters(search)
  const query = useDoctorAppointments(filters)
  const change = (key: string, value: string) => { const next = new URLSearchParams(search); if (value) next.set(key, value); else next.delete(key); setSearch(next) }
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Typography component="h1" variant="h4">Appointments</Typography>
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <TextField type="date" label="Appointment date" value={filters?.date ?? ''} onChange={event => change('date', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} helperText="Leave empty for all dates" />
      <TextField select label="Status" sx={{ minWidth: 170 }} value={filters?.status ?? ''} onChange={event => change('status', event.target.value)}>
        <MenuItem value="">All statuses</MenuItem>{appointmentStatusSchema.options.map(status => <MenuItem key={status} value={status}>{appointmentStatusLabels[status]}</MenuItem>)}
      </TextField>
      <Button onClick={() => setSearch({})}>Clear filters</Button>
      <Button disabled={query.isFetching || filters === null} onClick={() => { void query.refetch() }}>Refresh</Button>
    </Box>
    {filters === null ? <Typography role="alert">Invalid date or status filter. Clear the filters to continue.</Typography> : <>
      <AppointmentReadState pending={query.isPending} error={query.isError ? query.error : null} fetching={query.isFetching} retry={() => { void query.refetch() }} />
      {query.isSuccess && <><Typography>{query.data.length} appointments</Typography><DoctorAppointmentList rows={query.data} /></>}
    </>}
  </Box>
}
