import { Avatar } from '@mui/material'
import type { Doctor } from '../../types/doctorDirectory'

export function DoctorAvatar({ doctor, size = 72 }: { doctor: Doctor; size?: number }) {
  const initials = doctor.fullName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('')
  return (
    <Avatar
      alt={doctor.fullName}
      src={doctor.avatarUrl || undefined}
      slotProps={{ img: { loading: 'lazy', referrerPolicy: 'no-referrer' } }}
      sx={{ width: size, height: size, flexShrink: 0, bgcolor: 'primary.main', fontSize: size > 72 ? '1.75rem' : '1.25rem' }}
    >
      {initials}
    </Avatar>
  )
}
