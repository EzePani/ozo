import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addSession, db, deleteSession, isoOf } from '../db'
import { fmtDate } from '../lib'
import { DateField, Icon, confirmDialog, toast } from '../ui'

export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const WD = [
  { n: 1, short: 'L', name: 'lunes' }, { n: 2, short: 'M', name: 'martes' }, { n: 3, short: 'X', name: 'miércoles' }, { n: 4, short: 'J', name: 'jueves' },
  { n: 5, short: 'V', name: 'viernes' }, { n: 6, short: 'S', name: 'sábado' }, { n: 0, short: 'D', name: 'domingo' },
]
const wdName = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return WD.find((w) => w.n === new Date(y, m - 1, d).getDay())!.name }

export default function Schedule() {
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const [wds, setWds] = useState<number[]>([])
  const [dayId, setDayId] = useState<number | null>(null)
  const days = useLiveQuery(() => db.days.orderBy('order').toArray())
  const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const monthSessions = useLiveQuery(async () =>
    (await db.sessions.where('date').between(`${prefix}-01`, `${prefix}-31`, true, true).toArray()).sort((a, b) => a.date.localeCompare(b.date)), [prefix])

  const dates: string[] = []
  for (const d = new Date(year, month, 1); d.getMonth() === month; d.setDate(d.getDate() + 1)) if (wds.includes(d.getDay())) dates.push(isoOf(d))
  const exists = (iso: string) => !!monthSessions?.some((s) => s.dayId === dayId && s.date === iso)
  const fresh = dates.filter((d) => !exists(d))
  const dayName = (id: number) => days?.find((d) => d.id === id)?.name ?? '—'

  const confirm = async () => {
    if (dayId == null) return
    for (const d of fresh) await addSession(dayId, d, 'planned')
    toast(`${fresh.length} ${fresh.length === 1 ? 'columna creada' : 'columnas creadas'} en "${dayName(dayId)}"`)
    setWds([])
  }
  const changeDate = async (id: number, sDay: number, date: string) => {
    if (await db.sessions.where('[dayId+date]').equals([sDay, date]).first()) return toast(`Ya hay una columna del ${fmtDate(date)}`)
    await db.sessions.update(id, { date })
  }
  const remove = async (id: number, date: string, hasData: boolean) => {
    if (hasData && !(await confirmDialog({ title: `Borrar la sesión del ${fmtDate(date)}`, body: 'Se borran los registros cargados en esa fecha.', ok: 'Borrar' }))) return
    await deleteSession(id)
  }

  return (
    <main className="page">
      <header className="pagehead">
        <Link to="/" className="iconbtn" aria-label="Volver al inicio"><Icon name="back" /></Link>
        <h1>Programar mes</h1>
      </header>
      <div className="card form">
        <div className="row">
          <label className="lbl grow">Mes
            <select className="input" value={month} onChange={(e) => setMonth(Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}</select>
          </label>
          <label className="lbl">Año
            <select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
              {[-1, 0, 1, 2].map((d) => now.getFullYear() + d).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
        </div>
        <div className="lbl">Días de la semana
          <div className="weekdays" role="group" aria-label="Días de la semana">
            {WD.map((w) => (
              <button key={w.n} type="button" aria-pressed={wds.includes(w.n)} aria-label={w.name}
                onClick={() => setWds(wds.includes(w.n) ? wds.filter((x) => x !== w.n) : [...wds, w.n])}>{w.short}</button>
            ))}
          </div>
        </div>
        <div className="lbl">Rutina a asignar
          <div className="chips" role="group" aria-label="Rutina a asignar">
            {days?.map((d) => <button key={d.id} type="button" className="chipbtn" aria-pressed={dayId === d.id} onClick={() => setDayId(d.id)}>{d.name}</button>)}
            {days?.length === 0 && <span className="muted">Primero creá un día.</span>}
          </div>
        </div>
      </div>

      <h2 className="sect">Vista previa</h2>
      <div className="card">
        {!wds.length || dayId == null ? <p className="muted">Elegí al menos un día de la semana y una rutina.</p> : (
          <ul className="plain">
            {dates.map((d) => (
              <li key={d} className="line">
                <span><span className="num">{fmtDate(d)}</span> <span className="muted">{wdName(d)}</span></span>
                <span className={exists(d) ? 'muted' : ''}>{exists(d) ? 'ya existe, se omite' : `${dayName(dayId)} · nueva`}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <h2 className="sect">Programadas en {MONTHS[month].toLowerCase()}</h2>
      <div className="card">
        {!monthSessions?.length ? <p className="muted">Nada programado todavía.</p> : (
          <ul className="plain">
            {monthSessions.map((s) => (
              <li key={s.id} className="line">
                <span className="schedinfo"><span className={'dot ' + (s.status === 'done' ? 'full' : '')} aria-hidden="true" /><strong>{dayName(s.dayId)}</strong> <span className="muted small">{wdName(s.date)} · {s.status === 'done' ? 'hecha' : 'planificada'}</span></span>
                <span className="row tightrow">
                  <DateField className="btn compact" label={`Fecha de ${dayName(s.dayId)}`} value={s.date} onChange={(d) => changeDate(s.id, s.dayId, d)} />
                  <button className="iconbtn" aria-label={`Borrar ${dayName(s.dayId)} del ${fmtDate(s.date)}`} onClick={() => remove(s.id, s.date, s.status === 'done')}><Icon name="trash" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="actionbar">
        <button className="btn primary grow" disabled={dayId == null || !fresh.length} onClick={confirm}>
          {fresh.length ? `Crear ${fresh.length} ${fresh.length === 1 ? 'columna' : 'columnas'}` : 'Crear columnas'}
        </button>
      </div>
    </main>
  )
}
