import { appointmentFiltersSchema } from '../types/doctorAppointments'
import type { DoctorAppointment } from '../types/doctorAppointments'

export const hospitalTimeZone = 'Asia/Ho_Chi_Minh'
export const appointmentStatusLabels = { Pending: 'Pending', Confirmed: 'Confirmed', CheckedIn: 'Checked in', InProgress: 'In progress', Completed: 'Completed', Cancelled: 'Cancelled', NoShow: 'No show' }
export function hospitalClock(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: hospitalTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(now)
  const value = (key: string) => parts.find(part => part.type === key)!.value
  return { date: `${value('year')}-${value('month')}-${value('day')}`, time: `${value('hour')}:${value('minute')}:${value('second')}` }
}
export function formatDate(date: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: hospitalTimeZone, year: 'numeric', month: 'short', day: '2-digit' })
    .format(new Date(`${date}T00:00:00+07:00`))
}
export const formatTime = (time: string) => time.slice(0, 5)
export function formatTimestamp(value: string) {
  const instant = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : value + 'Z'
  return new Intl.DateTimeFormat('en-GB', { timeZone: hospitalTimeZone, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instant))
}
export function parseAppointmentFilters(search: URLSearchParams) {
  if (search.getAll('date').length > 1 || search.getAll('status').length > 1) return null
  const result = appointmentFiltersSchema.safeParse({ date: search.get('date') || undefined, status: search.get('status') || undefined })
  return result.success ? result.data : null
}
export function dashboardSummary(rows: DoctorAppointment[], now = new Date()) {
  const clock = hospitalClock(now)
  const today = rows.filter(row => row.appointmentDate === clock.date)
  const active = new Set(['Pending', 'Confirmed', 'CheckedIn', 'InProgress'])
  const upcoming = rows.filter(row => active.has(row.status) && (row.appointmentDate > clock.date ||
    (row.appointmentDate === clock.date && row.startTime.slice(0, 8) >= clock.time)))
  return { today, upcoming, total: today.length, pending: today.filter(row => row.status === 'Pending').length,
    confirmed: today.filter(row => row.status === 'Confirmed').length, completed: today.filter(row => row.status === 'Completed').length }
}
