import { Box, MenuItem, TextField } from '@mui/material'
import { Controller } from 'react-hook-form'
import type { UseFormReturn } from 'react-hook-form'
import type { QueueFilterForm } from '../services/validation'
import { queueStatusLabels, queueStatusSchema } from '../types/doctorQueue'

export function QueueFilter({ form }: { form: UseFormReturn<QueueFilterForm> }) {
  return <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
    <Controller control={form.control} name="date" render={({ field, fieldState }) =>
      <TextField {...field} type="date" label="Queue date" error={Boolean(fieldState.error)} helperText={fieldState.error ? 'Choose a valid date.' : 'Hospital time: Asia/Ho_Chi_Minh'} slotProps={{ inputLabel: { shrink: true } }} />} />
    <Controller control={form.control} name="status" render={({ field }) => <TextField {...field} select label="Queue status" sx={{ minWidth: 180 }}>
      <MenuItem value="all">All statuses</MenuItem>
      {queueStatusSchema.options.map(status => <MenuItem value={status} key={status}>{queueStatusLabels[status]}</MenuItem>)}
    </TextField>} />
  </Box>
}
