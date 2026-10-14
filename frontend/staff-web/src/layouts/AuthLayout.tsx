import LocalHospital from '@mui/icons-material/LocalHospital'
import { Box, Container, Link, Typography } from '@mui/material'
import { Outlet } from 'react-router-dom'
import { portal } from '../services/portal'
export function AuthLayout() {
  return <Container component="main" maxWidth="xs" sx={{ py: { xs: 5, sm: 10 } }}>
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 5 }}>
      <LocalHospital color="primary" sx={{ fontSize: 36 }} /><Typography variant="h6">{portal.name}</Typography>
    </Box>
    <Typography variant="h4" component="h1" gutterBottom>Staff sign in</Typography>
    <Typography color="text.secondary" sx={{ mb: 3 }}>For Doctor and Admin accounts.</Typography>
    <Outlet />
  </Container>
}
