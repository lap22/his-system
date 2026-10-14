import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { queueFilterSchema, type QueueFilterForm } from '../services/validation'

export function useQueueFilterForm() {
  return useForm<QueueFilterForm>({
    resolver: zodResolver(queueFilterSchema),
    defaultValues: {
      departmentId: 'all',
      status: 'all',
    },
  })
}
