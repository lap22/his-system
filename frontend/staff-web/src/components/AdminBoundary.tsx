import { Alert } from '@mui/material'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export function AdminBoundary() {
  const { user } = useAuth()
  return user?.role === 'Admin'
    ? <Outlet />
    : <Alert severity="error">Administrator access is required for this page.</Alert>
}
