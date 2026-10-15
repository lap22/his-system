import { FormControl, FormHelperText, InputLabel, MenuItem, Select } from '@mui/material'
import { useId } from 'react'
import type { PatientProfile } from '../../types/patientProfile'

export function PatientProfileSelector({ profiles, value, onChange, inputRef, onBlur, error, disabled }: {
  profiles: PatientProfile[]
  value: string
  onChange: (id: string) => void
  inputRef: (instance: HTMLInputElement | null) => void
  onBlur: () => void
  error?: string
  disabled: boolean
}) {
  const id = useId()
  return (
    <FormControl fullWidth required disabled={disabled} error={Boolean(error)}>
      <InputLabel id={`${id}-label`}>Patient profile</InputLabel>
      <Select
        labelId={`${id}-label`} label="Patient profile" value={value} onBlur={onBlur} inputRef={inputRef}
        onChange={(event) => onChange(event.target.value)}
        inputProps={{ 'aria-describedby': `${id}-help` }}
        sx={{ '& .MuiSelect-select': { whiteSpace: 'normal' } }}
      >
        <MenuItem value="" disabled>Choose a patient profile</MenuItem>
        {profiles.map((profile) => <MenuItem key={profile.id} value={profile.id} sx={{ whiteSpace: 'normal' }}>
          {profile.fullName} ({profile.relationship}){profile.isDefault ? ' — Default' : ''}
        </MenuItem>)}
      </Select>
      <FormHelperText id={`${id}-help`}>{error || 'Choose who this appointment is for.'}</FormHelperText>
    </FormControl>
  )
}
