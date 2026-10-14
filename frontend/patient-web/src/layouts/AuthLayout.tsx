import LocalHospital from '@mui/icons-material/LocalHospital'
import { Box, Container, Link, Typography } from '@mui/material'
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom'
import { portal } from '../services/portal'
export function AuthLayout() {
  const registering = useLocation().pathname === '/register'
  return <Container component="main" maxWidth="xs" sx={{ py: { xs: 5, sm: 10 } }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 5 }}>
      <LocalHospital color="primary" sx={{ fontSize: 36 }} /><Typography variant="h6">{portal.name}</Typography>
    </Box>
    <Typography variant="h4" component="h1" gutterBottom>{registering ? 'Create patient account' : 'Sign in'}</Typography>
    <Outlet />
    <Typography sx={{ mt: 3 }}><Link component={RouterLink} to={registering ? '/login' : '/register'}>{registering ? 'Already registered? Sign in' : 'Create a patient account'}</Link></Typography>
  </Container>
}
