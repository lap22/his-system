import Dashboard from '@mui/icons-material/Dashboard'
import LocalHospital from '@mui/icons-material/LocalHospital'
import Logout from '@mui/icons-material/Logout'
import People from '@mui/icons-material/People'
import MedicalServices from '@mui/icons-material/MedicalServices'
import { Alert, AppBar, Box, Button, Container, Toolbar, Typography } from '@mui/material'
import { Link as RouterLink, Outlet } from 'react-router-dom'
import { useAuth, useLogout } from '../hooks/useAuth'
import { BookingProvider } from '../components/appointments/BookingProvider'
import { BookingNotice } from '../components/appointments/BookingNotice'
import { AppointmentBookingDialog } from '../components/appointments/AppointmentBookingDialog'
import { authErrorMessage } from '../services/apiClient'
import { portal } from '../services/portal'
export function AppLayout() {
  const logout = useLogout()
  const { user } = useAuth()
  if (!user) return null
  return <BookingProvider key={user.userId} userId={user.userId}><Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
    <AppBar color="inherit" elevation={0} position="sticky" sx={{ borderBottom: '1px solid', borderColor: 'divider' }}>
      <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: 1 }}>
        <LocalHospital color="primary" />
        <Typography sx={{ fontWeight: 800, flex: 1 }}>{portal.name}</Typography>
        <Button component={RouterLink} to="/" startIcon={<Dashboard />}>Dashboard</Button>
        <Button component={RouterLink} to="/profiles" startIcon={<People />}>Profiles</Button>
        <Button component={RouterLink} to="/doctors" startIcon={<MedicalServices />}>Find a Doctor</Button>
        <Button startIcon={<Logout />} onClick={() => logout.mutate()} disabled={logout.isPending}>Sign out</Button>
      </Toolbar>
    </AppBar>
    <Container component="main" maxWidth="lg" sx={{ py: { xs: 3, md: 5 } }}>
      {logout.isError && <Alert severity="warning">{authErrorMessage(logout.error)}</Alert>}
      <BookingNotice />
      <Outlet />
    </Container>
  </Box><AppointmentBookingDialog /></BookingProvider>
}
