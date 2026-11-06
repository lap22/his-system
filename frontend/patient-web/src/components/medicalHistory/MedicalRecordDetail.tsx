import { Box, Card, CardContent, Divider, Typography } from '@mui/material'
import type { PatientMedicalRecord } from '../../types/medicalHistory'
import { formatAppointmentTimestamp } from '../../utils/appointmentFormatting'

function DetailValue({ label, value }: { label: string; value: string | null }) {
  return <Box><Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
    <Typography component="dd" sx={{ m: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value?.trim() || 'Not available'}</Typography></Box>
}

export function MedicalRecordDetail({ record, patientName }: {
  record: PatientMedicalRecord
  patientName: string
}) {
  return <Card aria-labelledby={`medical-record-${record.id}`}><CardContent sx={{ display: 'grid', gap: 2 }}>
    <Typography id={`medical-record-${record.id}`} component="h2" variant="h5">Finalized medical record</Typography>
    <Box component="dl" sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' }, gap: 2, m: 0 }}>
      <DetailValue label="Patient" value={patientName} />
      <DetailValue label="Finalized" value={formatAppointmentTimestamp(record.finalizedAt)} />
      <DetailValue label="Appointment reference" value={record.appointmentId} />
      <DetailValue label="Doctor reference" value={record.doctorId} />
    </Box>
    <Typography variant="body2" color="text.secondary">Visit date, Doctor name and department are not available in the current proposed response contract.</Typography>
    <Divider />
    <Box component="dl" sx={{ display: 'grid', gap: 2, m: 0 }}>
      <DetailValue label="Chief complaint" value={record.chiefComplaint} />
      <DetailValue label="Symptoms" value={record.symptoms} />
      <DetailValue label="Diagnosis" value={record.diagnosis} />
      <DetailValue label="Treatment" value={record.treatment} />
    </Box>
    <Typography variant="body2" color="text.secondary">Doctor notes and prescriptions are not displayed until an explicit patient-visibility contract is approved.</Typography>
  </CardContent></Card>
}
