import { FormControl, InputLabel, MenuItem, Select } from '@mui/material'
import type { Department } from '../../types/doctorDirectory'

export function DepartmentFilter({ departments, value, disabled, onChange }: {
  departments: Department[]
  value: string
  disabled: boolean
  onChange: (value: string) => void
}) {
  return (
    <FormControl fullWidth disabled={disabled}>
      <InputLabel id="doctor-department-label">Department</InputLabel>
      <Select labelId="doctor-department-label" label="Department" value={value} onChange={(event) => onChange(event.target.value)}>
        <MenuItem value="">All Departments</MenuItem>
        {departments.map((department) => <MenuItem key={department.id} value={department.id} sx={{ whiteSpace: 'normal' }}>{department.name}</MenuItem>)}
      </Select>
    </FormControl>
  )
}
