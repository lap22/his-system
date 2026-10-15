import Close from '@mui/icons-material/Close'
import Search from '@mui/icons-material/Search'
import { IconButton, InputAdornment, TextField, Tooltip } from '@mui/material'

export function DoctorSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <TextField
      fullWidth
      label="Name or specialization"
      type="search"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      slotProps={{ input: {
        startAdornment: <InputAdornment position="start"><Search color="action" /></InputAdornment>,
        endAdornment: value ? <InputAdornment position="end">
          <Tooltip title="Clear search"><IconButton aria-label="Clear search" onClick={() => onChange('')} edge="end"><Close /></IconButton></Tooltip>
        </InputAdornment> : null,
      } }}
    />
  )
}
