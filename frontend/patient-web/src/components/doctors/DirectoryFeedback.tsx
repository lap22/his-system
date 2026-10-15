import Refresh from '@mui/icons-material/Refresh'
import { Alert, Button } from '@mui/material'
import { directoryErrorMessage } from '../../services/doctorDirectoryApi'

export function DirectoryFeedback({ error, resource, onRetry }: {
  error: unknown
  resource: string
  onRetry: () => void
}) {
  return (
    <Alert severity="error" action={
      <Button color="inherit" startIcon={<Refresh />} onClick={onRetry} aria-label={`Retry loading ${resource}`}>Retry</Button>
    }>
      {directoryErrorMessage(error, resource)}
    </Alert>
  )
}
