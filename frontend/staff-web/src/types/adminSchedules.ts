import { z } from 'zod'

export const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const
export const weekdaySchema = z.enum(weekdays)
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,7})?)?$/, 'Use a valid hospital-local time.')
export const adminScheduleSchema = z.object({ id: z.uuid(), doctorId: z.uuid(), doctorName: z.string().trim().min(1),
  dayOfWeek: weekdaySchema, startTime: timeSchema, endTime: timeSchema, slotDurationMinutes: z.number().int().min(1).max(480),
  maxPatients: z.number().int().min(1).max(100), isActive: z.boolean() })
export const adminScheduleListSchema = z.array(adminScheduleSchema)
export type AdminSchedule = z.infer<typeof adminScheduleSchema>

export const scheduleFormSchema = z.object({ dayOfWeek: weekdaySchema, startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), slotDurationMinutes: z.number().int().min(1).max(480), maxPatients: z.number().int().min(1).max(100) })
  .refine(value => value.startTime < value.endTime, { path: ['endTime'], message: 'End time must be later than start time.' })
  .refine(value => value.slotDurationMinutes <= timeMinutes(value.endTime) - timeMinutes(value.startTime), { path: ['slotDurationMinutes'], message: 'Slot duration cannot exceed the schedule duration.' })
export type ScheduleForm = z.infer<typeof scheduleFormSchema>
export const apiTime = (value: string) => value.length === 5 ? `${value}:00` : value
export const inputTime = (value: string) => value.slice(0, 5)
const timeMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5))
export function groupSchedules(rows: readonly AdminSchedule[]) {
  return weekdays.map(day => ({ day, rows: rows.filter(row => row.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime)) }))
}
