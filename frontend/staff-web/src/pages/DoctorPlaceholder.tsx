import { Typography } from '@mui/material'
import { SectionCard } from '../components/SectionCard'

export function DoctorPlaceholder({ title, phase }: { title: string; phase: '7.3' | '7.4' }) {
  return <>
    <Typography component="h1" variant="h4" sx={{ mb: 3 }}>{title}</Typography>
    <SectionCard title="Coming in the next phase">
      <Typography>This page is a placeholder for Phase {phase}. This workflow is not available yet.</Typography>
    </SectionCard>
  </>
}
