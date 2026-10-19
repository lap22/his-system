import { Chip } from '@mui/material'
import type { AppointmentStatus } from '../../types/appointment'
import { appointmentStatusLabels } from '../../utils/myAppointments'

export function AppointmentStatusChip({ status }: { status: AppointmentStatus }) {
  const color = status === 'Cancelled' || status === 'NoShow' ? 'default'
    : status === 'Pending' ? 'warning' : status === 'Completed' ? 'success' : 'info'
  return <Chip size="small" label={appointmentStatusLabels[status]} color={color} />
}
