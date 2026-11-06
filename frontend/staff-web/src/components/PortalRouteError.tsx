import { Alert, Button, Stack } from '@mui/material'
import { Link } from 'react-router-dom'

export function PortalRouteError() {
  return <Stack component="main" spacing={2} sx={{ p: 3 }}>
    <Alert severity="error">This page could not be displayed. Return to your dashboard or reload the page.</Alert>
    <Button component={Link} to="/">Return to dashboard</Button>
  </Stack>
}
