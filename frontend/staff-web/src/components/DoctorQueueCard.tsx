import { useRef, useState } from 'react'
import { Alert, Box, Button, Card, CardContent, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Typography } from '@mui/material'
import { Link } from 'react-router-dom'
import { useQueueAction } from '../hooks/useQueueAction'
import { availableQueueAction, queueActionLabels, queueStatusLabels } from '../types/doctorQueue'
import type { QueueAction, QueueEntry } from '../types/doctorQueue'
import { formatTime, formatTimestamp } from '../utils/doctorAppointments'

export function DoctorQueueCard({ entry, allowActions }: { entry: QueueEntry; allowActions: boolean }) {
  const operation = useQueueAction(entry)
  const [reviewed, setReviewed] = useState<{ row: QueueEntry; action: QueueAction } | null>(null)
  const trigger = useRef<HTMLButtonElement | null>(null)
  const heading = useRef<HTMLHeadingElement | null>(null)
  const action = availableQueueAction(entry.status)
  const busy = operation.phase === 'pending' || operation.phase === 'checking'
  const blocked = !allowActions || busy || operation.phase === 'unresolved'
  const close = () => { if (!busy) setReviewed(null) }
  const restoreFocus = () => { const target = trigger.current; (target?.isConnected && !target.disabled ? target : heading.current)?.focus() }
  return <Card component="li"><CardContent sx={{ display: 'grid', gap: 2 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
      <Typography component="h2" variant="h6" ref={heading} tabIndex={-1} sx={{ flex: 1, overflowWrap: 'anywhere' }}>#{entry.queueNumber} · {entry.patientName}</Typography>
      <Chip size="small" label={queueStatusLabels[entry.status]} color={entry.status === 'Completed' ? 'success' : entry.status === 'InService' ? 'primary' : 'default'} />
    </Box>
    <Typography>Appointment time: {formatTime(entry.appointmentTime)} (hospital time)</Typography>
    <Typography sx={{ overflowWrap: 'anywhere' }}>Appointment reference: {entry.appointmentId}</Typography>
    <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1, m: 0 }}>
      {([['Checked in', entry.checkedInAt], ['Called', entry.calledAt], ['Started', entry.startedAt], ['Completed', entry.completedAt]] as const).map(([label, timestamp]) => timestamp &&
        <Box key={label}><Typography component="dt" variant="body2" color="text.secondary">{label}</Typography><Typography component="dd" sx={{ m: 0 }}>{formatTimestamp(timestamp)}</Typography></Box>)}
    </Box>
    {operation.message && <Alert role="status" severity={operation.phase === 'success' ? 'success' : operation.phase === 'error' ? 'error' : 'warning'}>
      {operation.message}
      {operation.phase === 'unresolved' && <Button disabled={busy} onClick={() => { void operation.verify() }}>Check queue status</Button>}
    </Alert>}
    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
      <Button component={Link} to={`/doctor/appointments/${entry.appointmentId}`}>View appointment</Button>
      {action && <Button disabled={blocked} variant="contained" onClick={event => { trigger.current = event.currentTarget; setReviewed({ row: entry, action }) }}>{queueActionLabels[action]}</Button>}
    </Box>
    <Dialog open={reviewed !== null} onClose={close} fullWidth maxWidth="sm" aria-labelledby={`queue-action-${entry.id}`}
      disableRestoreFocus slotProps={{ transition: { onExited: restoreFocus } }}>
      <DialogTitle id={`queue-action-${entry.id}`}>{reviewed ? queueActionLabels[reviewed.action] : 'Queue action'}?</DialogTitle>
      <DialogContent>
        <DialogContentText>Queue #{entry.queueNumber} · {entry.patientName}. The hospital validates ownership and the current status again.</DialogContentText>
        {reviewed?.action === 'complete' && <Alert severity="info">This completes the queue entry and appointment. It does not finalize a medical record or prescription.</Alert>}
        {operation.message && <Alert role="status" severity={operation.phase === 'success' ? 'success' : 'info'}>{operation.message}</Alert>}
      </DialogContent>
      <DialogActions><Button autoFocus disabled={busy} onClick={close}>Close</Button>
        <Button variant="contained" disabled={blocked || !reviewed || action !== reviewed.action || (operation.phase === 'success' && operation.action === reviewed.action)}
          onClick={() => { if (reviewed) void operation.submit(reviewed.row, reviewed.action) }}>Confirm action</Button>
      </DialogActions>
    </Dialog>
  </CardContent></Card>
}
