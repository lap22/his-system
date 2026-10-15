import type { AppointmentSlot } from '../types/appointmentAvailability'

export function hospitalToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function slotKey(slot: AppointmentSlot): string {
  return `${slot.startTime}/${slot.endTime}`
}

export function availableSelection(slots: AppointmentSlot[] | undefined, key: string | null): AppointmentSlot | null {
  return slots?.find((slot) => slot.isAvailable && slotKey(slot) === key) ?? null
}
