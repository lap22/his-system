import { Box, Typography } from '@mui/material'
import { SectionCard } from '../components/SectionCard'
import { useAuth } from '../hooks/useAuth'
export function StaffDashboard() {
  const { user } = useAuth()
  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Typography variant="h4" component="h1">Staff Dashboard</Typography>
    <SectionCard title="Your account">
      <Typography sx={{ overflowWrap: 'anywhere' }}>{user?.email}</Typography>
      <Typography color="text.secondary">{user?.role}</Typography>
    </SectionCard>
  </Box>
}
