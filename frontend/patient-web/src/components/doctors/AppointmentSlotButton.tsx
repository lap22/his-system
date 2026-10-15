import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined'
import { Box, Button, Typography } from '@mui/material'
import type { AppointmentSlot } from '../../types/appointmentAvailability'

export function AppointmentSlotButton({ slot, selected, refreshing, onSelect }: {
  slot: AppointmentSlot
  selected: boolean
  refreshing: boolean
  onSelect: () => void
}) {
  const disabled = !slot.isAvailable || refreshing
  const time = `${slot.startTime.slice(0, 5)} - ${slot.endTime.slice(0, 5)}`
  return (
    <Button
      type="button"
      disabled={disabled}
      aria-pressed={selected && slot.isAvailable}
      aria-label={`${time}, ${slot.reason}${selected && slot.isAvailable ? ', selected' : ''}`}
      variant={selected && slot.isAvailable ? 'contained' : 'outlined'}
      onClick={() => { if (!disabled) onSelect() }}
      sx={{
        minHeight: 76, minWidth: 0, px: 1.5, py: 1, display: 'flex', flexDirection: 'column', gap: 0.5,
        '&.Mui-disabled, &.Mui-disabled:hover': {
          bgcolor: '#eceff1', color: '#626b73', border: '1px solid #d0d5da',
          boxShadow: 'none', cursor: 'default', pointerEvents: 'none',
        },
      }}
    >
      <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>{time}</Typography>
      <Box component="span" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, minHeight: 20 }}>
        {selected && slot.isAvailable ? <CheckCircleOutlined sx={{ fontSize: 16 }} /> : null}
        <Typography component="span" variant="caption">{selected && slot.isAvailable ? 'Selected' : slot.reason}</Typography>
      </Box>
    </Button>
  )
}
