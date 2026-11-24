import HistoryEdu from '@mui/icons-material/HistoryEdu'
import { Alert, Box, Button, Card, CardContent, FormControl, InputLabel, MenuItem, Select, Skeleton, Typography } from '@mui/material'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { usePatientProfiles } from '../hooks/usePatientProfiles'
import { useMedicalHistory } from '../hooks/useMedicalHistory'
import { useAuth } from '../hooks/useAuth'
import { MedicalRecordDetail } from '../components/medicalHistory/MedicalRecordDetail'
import { clinicalApiEnabled } from '../services/clinicalFeature'
import { medicalHistoryError } from '../services/medicalRecordsApi'
import { profileErrorMessage } from '../services/patientProfilesApi'
import { nextOwnedProfileId } from '../utils/medicalHistory'

export function MedicalHistoryPage() {
  const auth = useAuth()
  const profiles = usePatientProfiles()
  const [profileId, setProfileId] = useState('')
  const effectiveProfileId = nextOwnedProfileId(profileId, profiles.data ?? [])
  const selectedProfile = profiles.data?.find((profile) => profile.id === effectiveProfileId)
  const records = useMedicalHistory(effectiveProfileId)

  return <Box sx={{ display: 'grid', gap: 3 }}>
    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <HistoryEdu color="primary" fontSize="large" />
      <Box>
        <Typography component="h1" variant="h1">Medical History</Typography>
        <Typography color="text.secondary">Hồ sơ bệnh án điện tử theo từng hồ sơ bệnh nhân.</Typography>
      </Box>
    </Box>

    {!clinicalApiEnabled ? <Alert severity="info">Electronic medical records are currently disabled. No unavailable endpoint will be called.</Alert> : null}
    <Typography>Only finalized records authorized for the selected Patient Profile appear here.</Typography>

    {profiles.isPending ? <Box role="status" aria-label="Loading patient profiles" sx={{ display: 'grid', gap: 1 }}>
      <Skeleton height={56} /><Skeleton height={160} />
    </Box> : null}
    {profiles.isError ? <Alert severity="error" action={<Button disabled={profiles.isFetching} onClick={() => { void profiles.refetch() }}>Retry profiles</Button>}>
      {profileErrorMessage(profiles.error)}</Alert> : null}

    {!profiles.isPending && profiles.data?.length === 0 ? <Alert severity="warning">
      Add a Patient Profile before viewing profile-specific medical history. <Button component={Link} to="/profiles">Manage Profiles</Button>
    </Alert> : null}

    {profiles.data && profiles.data.length > 0 ? <FormControl sx={{ maxWidth: 520 }}>
      <InputLabel id="medical-history-profile-label">Patient profile</InputLabel>
      <Select labelId="medical-history-profile-label" label="Patient profile" value={effectiveProfileId}
        onChange={(event) => setProfileId(event.target.value)}>
        {profiles.data.map((profile) => <MenuItem key={profile.id} value={profile.id}>
          {profile.fullName} ({profile.relationship}){profile.isDefault ? ' — Default' : ''}
        </MenuItem>)}
      </Select>
    </FormControl> : null}

    <Card><CardContent sx={{ display: 'grid', gap: 2 }}>
      <Typography component="h2" variant="h5">Finalized medical records</Typography>
      <Typography color="text.secondary">{selectedProfile
        ? `Selected profile: ${selectedProfile.fullName}`
        : 'Select an available Patient Profile.'}</Typography>
      <Box key={`${auth.user?.userId ?? 'anonymous'}:${effectiveProfileId}`} aria-label="Medical record list" aria-live="polite" sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: 'minmax(0, 1fr)', lg: 'repeat(2, minmax(0, 1fr))' } }}>
        {records.isPending && clinicalApiEnabled ? <Box role="status" aria-label="Loading medical records"><Skeleton height={180} /><span>Loading medical records…</span></Box> : null}
        {records.isError ? <Alert severity="error" action={<Button disabled={records.isFetching} onClick={() => { void records.refetch() }}>Retry records</Button>}>
          {medicalHistoryError(records.error)}
        </Alert> : null}
        {!clinicalApiEnabled || (!records.isPending && !records.isError && records.data?.length === 0)
          ? <Alert severity="info">No finalized electronic medical records are available for display.</Alert> : null}
        {selectedProfile ? records.data?.map(record => <MedicalRecordDetail key={record.id} record={record} patientName={selectedProfile.fullName} />) : null}
      </Box>
    </CardContent></Card>

    <Alert severity="info">Looking for visits and booking status? <Button component={Link} to="/appointments">Open Appointment History</Button>. Appointment History is separate from finalized clinical records.</Alert>
  </Box>
}
