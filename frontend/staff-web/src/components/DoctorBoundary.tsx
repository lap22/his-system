import { Alert, Button, Stack } from '@mui/material'
import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { canAccessDoctor } from '../services/doctorAccess'

// Nested below AuthBoundary; backend ownership/role policies remain authoritative.
export function DoctorBoundary() {
  const { user } = useAuth()
  if (!canAccessDoctor(user?.role)) return <Stack spacing={2} sx={{ p: 3 }}>
    <Alert severity="error">Doctor access is required for this page.</Alert>
    <Button component={Link} to="/">Return to your dashboard</Button>
  </Stack>
  return <Outlet />
}
