import { useEffect } from 'react'
import { Alert, Box, Button, Container, Typography } from '@mui/material'
import { useAuth, useLogout } from '../hooks/useAuth'
import { portal } from '../services/portal'
import { authErrorMessage } from '../services/apiClient'

export function PortalMismatch() {
  const { user } = useAuth()
  const logout = useLogout()
  useEffect(() => {
    // Each portal signs in independently; never put tokens in a redirect URL.
    window.location.replace(portal.otherUrl)
  }, [])
  return <Container maxWidth="sm" sx={{ py: 8 }}>
    <Typography variant="h4" gutterBottom>Open your portal</Typography>
    <Alert severity="info">{user?.role === 'Patient' ? 'Your account belongs to the Patient Portal.' : 'Your account belongs to the Staff Portal.'}</Alert>
    <Box sx={{ display: 'flex', gap: 2, mt: 3, flexWrap: 'wrap' }}>
      <Button variant="contained" href={portal.otherUrl}>Open {user?.role === 'Patient' ? 'Patient' : 'Staff'} Portal</Button>
      <Button onClick={() => logout.mutate()} disabled={logout.isPending}>Sign out</Button>
    </Box>
    {logout.isError && <Alert severity="warning">{authErrorMessage(logout.error)}</Alert>}
  </Container>
}
