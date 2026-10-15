const hospitalTimeZone = 'Asia/Ho_Chi_Minh'

export function formatAppointmentDate(date: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: hospitalTimeZone, day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(`${date}T00:00:00+07:00`))
}

export function formatAppointmentTime(time: string): string {
  return time.slice(0, 5)
}

export function normalizeAppointmentTime(time: string): string {
  const [clock, fraction = ''] = time.split('.')
  const [hours, minutes, seconds = '00'] = clock.split(':')
  return `${hours}:${minutes}:${seconds}.${fraction.padEnd(7, '0')}`
}
