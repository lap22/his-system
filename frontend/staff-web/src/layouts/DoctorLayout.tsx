import { useState } from 'react'
import Dashboard from '@mui/icons-material/Dashboard'
import Event from '@mui/icons-material/Event'
import CalendarMonth from '@mui/icons-material/CalendarMonth'
import Groups from '@mui/icons-material/Groups'
import Menu from '@mui/icons-material/Menu'
import Logout from '@mui/icons-material/Logout'
import { Alert, AppBar, Box, Button, CircularProgress, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography, useMediaQuery, useTheme } from '@mui/material'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth, useLogout } from '../hooks/useAuth'
import { useCurrentDoctor } from '../hooks/useCurrentDoctor'
import { doctorIdentityMessage } from '../services/doctorsApi'
import { authErrorMessage } from '../services/apiClient'

const width = 248
const navigation = [
  { to: '/doctor/dashboard', label: 'Dashboard', icon: Dashboard },
  { to: '/doctor/appointments', label: 'Appointments', icon: Event },
  { to: '/doctor/schedule', label: 'My Schedule', icon: CalendarMonth },
  { to: '/doctor/queue', label: 'Queue', icon: Groups },
]

export function DoctorLayout() {
  const [open, setOpen] = useState(false)
  const desktop = useMediaQuery(useTheme().breakpoints.up('md'))
  const { pathname } = useLocation()
  const { user } = useAuth()
  const doctor = useCurrentDoctor()
  const logout = useLogout()
  const menu = <Box sx={{ width, p: 2 }}>
    <Typography variant="h6" sx={{ px: 2, py: 2 }}>Doctor Portal</Typography>
    <List component="nav" aria-label="Doctor navigation">
      {navigation.map(({ to, label, icon: Icon }) => <ListItemButton key={to} component={NavLink} to={to}
        selected={pathname === to || pathname.startsWith(to + '/')}
        onClick={() => setOpen(false)} sx={{ borderRadius: 1, mb: 1 }}>
        <ListItemIcon><Icon /></ListItemIcon><ListItemText primary={label} />
      </ListItemButton>)}
    </List>
  </Box>

  return <Box sx={{ display: 'flex', minHeight: '100vh', bgcolor: 'background.default' }}>
    <Box component="a" href="#doctor-main" sx={{ position: 'fixed', left: 8, top: -100, zIndex: 1500,
      bgcolor: 'background.paper', p: 1, '&:focus': { top: 8 } }}>Skip to content</Box>
    <AppBar position="fixed" color="inherit" elevation={0} sx={{ width: { md: `calc(100% - ${width}px)` },
      ml: { md: `${width}px` }, borderBottom: 1, borderColor: 'divider' }}>
      <Toolbar sx={{ gap: 1, flexWrap: 'wrap', py: 1 }}>
        <IconButton aria-label="Open Doctor navigation" aria-expanded={open} aria-controls={open ? 'doctor-mobile-navigation' : undefined}
          onClick={() => setOpen(true)} sx={{ display: { md: 'none' } }}><Menu /></IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontWeight: 700 }}>HIS Doctor Portal</Typography>
          <Typography variant="body2" noWrap title={doctor.isSuccess ? doctor.data.fullName : user?.email}>{doctor.isSuccess ? doctor.data.fullName : user?.email}</Typography>
        </Box>
        <Button startIcon={<Logout />} disabled={logout.isPending} onClick={() => logout.mutate()}>Sign out</Button>
      </Toolbar>
    </AppBar>
    <Drawer variant="permanent" sx={{ display: { xs: 'none', md: 'block' }, width, flexShrink: 0,
      '& .MuiDrawer-paper': { width, boxSizing: 'border-box' } }}>{menu}</Drawer>
    <Drawer variant="temporary" open={open && !desktop} onClose={() => setOpen(false)}
      sx={{ display: { xs: 'block', md: 'none' } }} slotProps={{ paper: { id: 'doctor-mobile-navigation' } }}>{menu}</Drawer>
    <Box component="main" id="doctor-main" tabIndex={-1} sx={{ flex: 1, minWidth: 0, p: { xs: 2, sm: 3, md: 4 } }}>
      {/* AppBar may wrap on small screens; reserve enough space for account text. */}
      <Box sx={{ height: { xs: 112, sm: 88 } }} />
      {logout.isError && <Alert severity="warning" sx={{ mb: 2 }}>{authErrorMessage(logout.error)}</Alert>}
      {doctor.isPending ? <Box role="status" sx={{ py: 4, display: 'flex', alignItems: 'center', gap: 2 }}>
        <CircularProgress size={24} aria-label="Loading Doctor profile" />Loading Doctor profile…
      </Box> : doctor.isError ? <Box sx={{ display: 'grid', gap: 2 }}>
        <Alert severity="error">{doctorIdentityMessage(doctor.error)}</Alert>
        <Button variant="outlined" disabled={doctor.isFetching} onClick={() => { void doctor.refetch() }}>Retry Doctor profile</Button>
      </Box> : <Outlet />}
    </Box>
  </Box>
}
