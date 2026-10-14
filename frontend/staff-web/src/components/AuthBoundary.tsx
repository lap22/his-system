import { Alert, Box, Button, CircularProgress } from '@mui/material'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { restoreAuth, useAuth, useLogout } from '../hooks/useAuth'
import { portal } from '../services/portal'
import { PortalMismatch } from './PortalMismatch'

export function AuthBoundary({ publicPage = false }: { publicPage?: boolean }) {
  const auth = useAuth()
  const logout = useLogout()
  const location = useLocation()
  if (auth.status === 'restoring') return <Box sx={{ p: 6, textAlign: 'center' }}><CircularProgress aria-label="Restoring session" /></Box>
  if (auth.status === 'unavailable') return <Box sx={{ p: 3 }}><Alert severity="warning">Your session could not be verified. Please retry when the service is available.</Alert><Button onClick={() => { void restoreAuth() }}>Retry</Button><Button onClick={() => logout.mutate()}>Sign out</Button></Box>
  if (!auth.user) return publicPage ? <Outlet /> : <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (!portal.roles.includes(auth.user.role)) return <PortalMismatch />
  if (publicPage) {
    const from: unknown = location.state?.from
    const destination = from === '/dashboard' ? '/dashboard' : '/'
    return <Navigate to={destination} replace />
  }
  return <Outlet />
}
