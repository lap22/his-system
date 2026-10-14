import HomeIcon from '@mui/icons-material/Home'
import { Box, Button, Typography } from '@mui/material'
import { Link as RouterLink } from 'react-router-dom'

export function NotFound() {
  return (
    <Box
      sx={{
        alignItems: 'flex-start',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <Typography component="h1" variant="h1">
        Page not found
      </Typography>
      <Typography color="text.secondary">
        The patient portal page you requested is not available.
      </Typography>
      <Button component={RouterLink} startIcon={<HomeIcon />} to="/" variant="contained">
        Back to dashboard
      </Button>
    </Box>
  )
}
