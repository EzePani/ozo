import type { Session } from './data'

/** Eventos de calendario sin cuentas ni backend: link de Google Calendar y archivo .ics (sirve para cualquier calendario). */
export interface CalOpts { title: string; time: string; minutes: number; details?: string }

const stamp = (date: string, time: string, addMin = 0) => {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const t = new Date(y, m - 1, d, hh, mm + addMin)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${t.getFullYear()}${p(t.getMonth() + 1)}${p(t.getDate())}T${p(t.getHours())}${p(t.getMinutes())}00`
}

/** Abre Google Calendar con el evento listo para guardar (hora local del dispositivo). */
export function googleCalendarUrl(s: Pick<Session, 'date'>, o: CalOpts) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: o.title, dates: `${stamp(s.date, o.time)}/${stamp(s.date, o.time, o.minutes)}`, details: o.details ?? '' })
  return `https://calendar.google.com/calendar/render?${q}`
}

const esc = (t: string) => t.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

export function icsFile(sessions: Pick<Session, 'id' | 'date'>[], o: CalOpts) {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')
  const events = sessions.map((s) => [
    'BEGIN:VEVENT', `UID:ozo-${s.id}-${s.date}@ozo`, `DTSTAMP:${now}`,
    `DTSTART:${stamp(s.date, o.time)}`, `DTEND:${stamp(s.date, o.time, o.minutes)}`,
    `SUMMARY:${esc(o.title)}`, ...(o.details ? [`DESCRIPTION:${esc(o.details)}`] : []), 'END:VEVENT',
  ].join('\r\n'))
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ozo//ES', 'CALSCALE:GREGORIAN', ...events, 'END:VCALENDAR'].join('\r\n')
}

export function downloadIcs(name: string, content: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/calendar' }))
  a.download = `${name}.ics`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
