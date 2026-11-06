import axios from 'axios'
import { z } from 'zod'
import { apiClient } from './apiClient'
import { queueActionSchema, queueEntrySchema, queueTransitions } from '../types/doctorQueue'
import type { QueueAction, QueueEntry } from '../types/doctorQueue'

export const doctorQueueApi = {
  async list(doctorId: string, date: string, signal?: AbortSignal) {
    z.uuid().parse(doctorId); z.iso.date().parse(date)
    const rows = z.array(queueEntrySchema).parse((await apiClient.get('/Queue/doctor', { params: { date }, signal })).data)
    if (rows.some(row => row.doctorId !== doctorId || row.appointmentDate !== date) || new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('Queue scope could not be verified.')
    return rows
  },
  async act(entry: QueueEntry, action: QueueAction) {
    queueEntrySchema.parse(entry); queueActionSchema.parse(action)
    if (entry.status !== queueTransitions[action].from) throw new Error('Invalid queue transition.')
    const response = await apiClient.put(`/Queue/${entry.id}/${action}`, undefined, { skipAuthRetry: true })
    const row = queueEntrySchema.parse(response.data)
    if (response.status !== 200 || row.id !== entry.id || row.doctorId !== entry.doctorId || row.appointmentId !== entry.appointmentId
      || row.patientProfileId !== entry.patientProfileId || row.appointmentDate !== entry.appointmentDate || row.queueNumber !== entry.queueNumber
      || row.status !== queueTransitions[action].to) throw new Error('Queue transition response could not be verified.')
    return row
  },
}
export function queueError(error: unknown) {
  const status = axios.isAxiosError(error) ? error.response?.status : undefined
  const messages: Record<number, string> = { 400: 'The hospital rejected this queue transition. Refresh the current status.',
    401: 'Your session has expired. Sign in again.', 403: 'This account is not authorized for this queue action.',
    404: 'This queue entry was not found or is not assigned to your active Doctor profile.',
    409: 'The queue changed concurrently. Refresh before taking further action.' }
  return { definitive: status !== undefined && Object.hasOwn(messages, status), message: status && messages[status]
    ? messages[status] : 'The hospital service could not verify this operation. Refresh the queue; do not repeat an uncertain action.' }
}
