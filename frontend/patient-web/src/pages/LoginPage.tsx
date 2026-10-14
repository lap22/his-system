import { AuthForm } from '../components/AuthForm'
import { Alert, Box } from '@mui/material'
import { useAuth } from '../hooks/useAuth'
export function LoginPage() {
  const { notice } = useAuth()
  return <Box sx={{ display: 'grid', gap: 2 }}>
    {notice && <Alert severity="warning">{notice}</Alert>}
    <AuthForm />
  </Box>
}
