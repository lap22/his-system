import { Alert, Box, Button, Chip, Skeleton, Stack, Typography } from '@mui/material'
import { useWatch } from 'react-hook-form'
import { useQueueFilterForm } from '../hooks/useQueueFilterForm'
import { queueFilterSchema } from '../services/validation'
import { useDoctorQueue } from '../hooks/useDoctorQueue'
import { useQueueRealtime } from '../hooks/useQueueRealtime'
import { queueError } from '../services/doctorQueueApi'
import { QueueFilter } from '../components/QueueFilter'
import { DoctorQueueCard } from '../components/DoctorQueueCard'
import { hospitalClock } from '../utils/doctorAppointments'

export function DoctorQueuePage() {
  const form = useQueueFilterForm()
  const filter = queueFilterSchema.safeParse(useWatch({ control: form.control }))
  const query = useDoctorQueue(filter.success ? filter.data.date : '')
  const realtime = useQueueRealtime()
  const rows = query.isSuccess && filter.success ? query.data.filter(row => filter.data.status === 'all' || row.status === filter.data.status) : []
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Typography component="h1" variant="h4">Doctor Queue</Typography>
    <Typography>Manage your assigned queue. Dates and timestamps use Asia/Ho_Chi_Minh.</Typography>
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <Chip label={`Realtime: ${realtime.status}`} color={realtime.status === 'connected' ? 'success' : 'default'} />
      <Typography role="status">{realtime.message}</Typography>
      {realtime.status === 'unavailable' && <Button onClick={realtime.reconnect}>Reconnect realtime</Button>}
    </Box>
    <QueueFilter form={form} />
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <Button disabled={query.isFetching || !filter.success} onClick={() => { void query.refetch() }}>Refresh queue</Button>
      <Button onClick={() => form.reset({ date: hospitalClock().date, status: 'all' })}>Today / all statuses</Button>
    </Box>
    <Typography variant="body2" color="text.secondary">The queue also refreshes every 30 seconds while this page is active. Queue completion is not clinical-record finalization.</Typography>
    {!filter.success ? <Alert severity="error">Choose a valid queue date and status.</Alert> : <>
      {query.isPending && <Box role="status" aria-label="Loading queue"><Skeleton height={120} /><Skeleton height={120} />Loading queue…</Box>}
      {query.isError && <Alert severity="error" action={<Button disabled={query.isFetching} onClick={() => { void query.refetch() }}>Retry</Button>}>{queueError(query.error).message}</Alert>}
      {query.isSuccess && <>
        <Typography>{rows.length} queue entries in this view · {query.data.length} for this date</Typography>
        {!rows.length ? <Alert severity="info">No queue entries match this date and status.</Alert> :
          <Stack component="ul" spacing={2} sx={{ listStyle: 'none', m: 0, p: 0 }}>
            {rows.map(entry => <DoctorQueueCard key={entry.id} entry={entry} allowActions={!query.isFetching} />)}
          </Stack>}
      </>}
    </>}
  </Box>
}
