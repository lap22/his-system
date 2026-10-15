import RestartAlt from '@mui/icons-material/RestartAlt'
import SearchOff from '@mui/icons-material/SearchOff'
import { Box, Button, Skeleton, Typography } from '@mui/material'
import { useState } from 'react'
import { DepartmentFilter } from '../components/doctors/DepartmentFilter'
import { DirectoryFeedback } from '../components/doctors/DirectoryFeedback'
import { DoctorCard } from '../components/doctors/DoctorCard'
import { DoctorDetails } from '../components/doctors/DoctorDetails'
import { DoctorSearch } from '../components/doctors/DoctorSearch'
import { useDepartments, useDoctors } from '../hooks/useDoctorDirectory'
import { searchDoctors } from '../utils/doctorDirectory'

export function DoctorsPage() {
  const [search, setSearch] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [doctorId, setDoctorId] = useState<string | null>(null)
  const departments = useDepartments()
  const doctors = useDoctors(departmentId)
  const matches = searchDoctors(doctors.data ?? [], search)
  const hasFilters = Boolean(search || departmentId)
  const resetFilters = () => { setSearch(''); setDepartmentId('') }
  return (
    <Box sx={{ display: 'grid', gap: 3 }}>
      <Typography component="h1" variant="h1">Find a Doctor</Typography>
      <Box component="section" aria-label="Doctor filters" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) minmax(240px, 360px)' } }}>
        <DoctorSearch value={search} onChange={setSearch} />
        <DepartmentFilter departments={departments.data ?? []} value={departmentId} disabled={departments.isPending || (departments.isError && !departments.data)} onChange={setDepartmentId} />
      </Box>
      {departments.isError ? <DirectoryFeedback error={departments.error} resource="departments" onRetry={() => { void departments.refetch() }} /> : null}
      {doctors.isError ? <DirectoryFeedback error={doctors.error} resource="doctors" onRetry={() => { void doctors.refetch() }} /> : null}
      {doctors.isPending ? (
        <Box role="status" aria-label="Loading doctors" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
          {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} variant="rounded" height={228} />)}
        </Box>
      ) : null}
      {doctors.isSuccess ? <>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
          <Typography color="text.secondary" role="status" aria-live="polite">{matches.length} {matches.length === 1 ? 'doctor' : 'doctors'}</Typography>
          {hasFilters ? <Button startIcon={<RestartAlt />} onClick={resetFilters}>Reset filters</Button> : null}
        </Box>
        {matches.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 6 }}>
            <SearchOff color="action" sx={{ fontSize: 40, mb: 1 }} />
            <Typography component="h2" variant="h2">{hasFilters ? 'No matching doctors' : 'No doctors listed'}</Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              {hasFilters ? 'No active doctors match the selected name, specialization or department.' : 'There are currently no active doctors in the directory.'}
            </Typography>
          </Box>
        ) : (
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' } }}>
            {matches.map((doctor) => <DoctorCard key={doctor.id} doctor={doctor} onView={setDoctorId} />)}
          </Box>
        )}
      </> : null}
      <DoctorDetails id={doctorId} onClose={() => setDoctorId(null)} />
    </Box>
  )
}
