import Close from '@mui/icons-material/Close'
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Tooltip, Typography } from '@mui/material'
import { useDoctor } from '../../hooks/useDoctorDirectory'
import { DirectoryFeedback } from './DirectoryFeedback'
import { DoctorAvatar } from './DoctorAvatar'
import { AvailableAppointments } from './AvailableAppointments'

export function DoctorDetails({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useDoctor(id)
  const doctor = query.data
  return (
    <Dialog open={Boolean(id)} onClose={onClose} fullWidth maxWidth="md" aria-labelledby="doctor-details-title"
      sx={{ '& .MuiDialog-paper': { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: undefined } } }}>
      <DialogTitle id="doctor-details-title" sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
        Doctor details
        <Tooltip title="Close details"><IconButton aria-label="Close doctor details" onClick={onClose}><Close /></IconButton></Tooltip>
      </DialogTitle>
      <DialogContent sx={{ display: 'grid', gap: 3 }}>
        {query.isPending ? <CircularProgress aria-label="Loading doctor details" /> : null}
        {query.isError ? <DirectoryFeedback error={query.error} resource="doctor details" onRetry={() => { void query.refetch() }} /> : null}
        {query.isSuccess && doctor && !doctor.isActive ? <Alert severity="info">This doctor is no longer listed.</Alert> : null}
        {query.isSuccess && doctor?.isActive ? <>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start', flexDirection: { xs: 'column', sm: 'row' } }}>
            <DoctorAvatar doctor={doctor} size={96} />
            <Box sx={{ minWidth: 0 }}>
              <Typography component="h2" variant="h2" sx={{ overflowWrap: 'anywhere' }}>{doctor.fullName}</Typography>
              <Typography color="primary.main" sx={{ mt: 0.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{doctor.specialization}</Typography>
              <Typography color="text.secondary" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{doctor.departmentName}</Typography>
              <Typography color="text.secondary">{doctor.yearsOfExperience} {doctor.yearsOfExperience === 1 ? 'year' : 'years'} of experience</Typography>
            </Box>
          </Box>
          <Divider />
          <Box component="section" aria-labelledby="doctor-biography">
            <Typography id="doctor-biography" component="h3" variant="h3" sx={{ mb: 1 }}>Biography</Typography>
            <Typography color="text.secondary" sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
              {doctor.biography?.trim() || 'No biography published.'}
            </Typography>
          </Box>
          <Divider />
          <AvailableAppointments doctorId={doctor.id} />
        </> : null}
      </DialogContent>
      <DialogActions><Button onClick={onClose}>Close</Button></DialogActions>
    </Dialog>
  )
}
