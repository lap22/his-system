import ArrowForward from '@mui/icons-material/ArrowForward'
import { Box, Button, Card, CardActions, CardContent, Typography } from '@mui/material'
import type { Doctor } from '../../types/doctorDirectory'
import { DoctorAvatar } from './DoctorAvatar'

export function DoctorCard({ doctor, onView }: { doctor: Doctor; onView: (id: string) => void }) {
  return (
    <Card component="article" sx={{ display: 'flex', flexDirection: 'column', minWidth: 0, boxShadow: 'none' }}>
      <CardContent sx={{ flex: 1, display: 'grid', gap: 2 }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
          <DoctorAvatar doctor={doctor} />
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" variant="h3" sx={{ overflowWrap: 'anywhere' }}>{doctor.fullName}</Typography>
            <Typography color="primary.main" sx={{ mt: 0.5, fontWeight: 600, overflowWrap: 'anywhere' }}>{doctor.specialization}</Typography>
          </Box>
        </Box>
        <Box>
          <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{doctor.departmentName}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            {doctor.yearsOfExperience} {doctor.yearsOfExperience === 1 ? 'year' : 'years'} of experience
          </Typography>
        </Box>
      </CardContent>
      <CardActions sx={{ px: 2, pb: 2, borderTop: '1px solid', borderColor: 'divider', pt: 1.5 }}>
        <Button endIcon={<ArrowForward />} onClick={() => onView(doctor.id)} aria-label={`View details for ${doctor.fullName}`}>
          View details
        </Button>
      </CardActions>
    </Card>
  )
}
