import type { Appointment, AppointmentStatus } from '../types/appointment'
import { normalizeAppointmentTime } from './appointmentFormatting'

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  Pending: 'Pending', Confirmed: 'Confirmed', CheckedIn: 'Checked in', InProgress: 'In progress',
  Completed: 'Completed', Cancelled: 'Cancelled', NoShow: 'No show',
}
export type AppointmentPeriod = 'upcoming' | 'history'

export function canCancelAppointment(status: AppointmentStatus): boolean {
  return status === 'Pending' || status === 'Confirmed'
}

export function appointmentPeriod(appointment: Pick<Appointment, 'status' | 'appointmentDate' | 'endTime'>, now: number): AppointmentPeriod {
  if (['Completed', 'Cancelled', 'NoShow'].includes(appointment.status)) return 'history'
  const end = new Date(`${appointment.appointmentDate}T${appointment.endTime}+07:00`).getTime()
  return end > now ? 'upcoming' : 'history'
}

export function selectAppointments(appointments: Appointment[], period: AppointmentPeriod, status: AppointmentStatus | 'All', now: number): Appointment[] {
  return appointments.filter((appointment) => appointmentPeriod(appointment, now) === period && (status === 'All' || appointment.status === status))
    .sort((a, b) => {
      const order = a.appointmentDate.localeCompare(b.appointmentDate)
        || normalizeAppointmentTime(a.startTime).localeCompare(normalizeAppointmentTime(b.startTime))
        || a.id.localeCompare(b.id)
      return period === 'upcoming' ? order : -order
    })
}
