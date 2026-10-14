import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import {
  appointmentRequestSchema,
  type AppointmentRequestForm,
} from '../services/validation'

export function useAppointmentRequestForm() {
  return useForm<AppointmentRequestForm>({
    resolver: zodResolver(appointmentRequestSchema),
    defaultValues: {
      departmentId: '',
      preferredDate: '',
      reason: '',
    },
  })
}
