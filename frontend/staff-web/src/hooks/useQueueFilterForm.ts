import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { queueFilterSchema, type QueueFilterForm } from '../services/validation'
import { hospitalClock } from '../utils/doctorAppointments'

export function useQueueFilterForm() {
  return useForm<QueueFilterForm>({
    mode: 'onChange',
    resolver: zodResolver(queueFilterSchema),
    defaultValues: {
      date: hospitalClock().date,
      status: 'all',
    },
  })
}
