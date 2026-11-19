import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, isoOf, todayISO, type Entry, type Exercise, type Field, type Session } from '../db'
import { cap, entryMetric, fieldsFor, fmtDate, fmtEntry, fmtMetric, metricOf } from '../lib'
import { Icon } from '../ui'
import { MONTHS } from './Schedule'

interface Point { session: Session; best: number; entries: Entry[] }

function Chart({ points, metric }: { points: Point[]; metric: Field }) {
  const W = 320, H = 150, L = 8, R = 8, T = 22, B = 24
  const vals = points.map((p) => p.best)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => (points.length === 1 ? W / 2 : L + (i * (W - L - R)) / (points.length - 1))
  const y = (v: number) => (max === min ? (T + H - B) / 2 : T + (1 - (v - min) / span) * (H - T - B))
  const first = points[0], last = points[points.length - 1]
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Mejor serie por sesión: de ${fmtMetric(first.best, metric)} el ${fmtDate(first.session.date)} a ${fmtMetric(last.best, metric)} el ${fmtDate(last.session.date)}. Mínimo ${fmtMetric(min, metric)}, máximo ${fmtMetric(max, metric)}.`}>
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="axis" />
      {points.length > 1 && <polyline className="line-path" points={points.map((p, i) => `${x(i)},${y(p.best)}`).join(' ')} />}
      {points.map((p, i) => <circle key={p.session.id} cx={x(i)} cy={y(p.best)} r={i === points.length - 1 ? 5 : 3.5} className={i === points.length - 1 ? 'pt last' : 'pt'} />)}
      <text x={Math.min(Math.max(x(points.length - 1), 40), W - 4)} y={Math.max(y(last.best) - 9, 12)} textAnchor="end" className="lbl-strong">{fmtMetric(last.best, metric)}</text>
      <text x={L} y={H - 6} className="lbl-muted">{fmtDate(first.session.date)}</text>
      {points.length > 1 && <text x={W - R} y={H - 6} textAnchor="end" className="lbl-muted">{fmtDate(last.session.date)}</text>}
    </svg>
  )
}

function Calendar() {
  const now = new Date()
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const prefix = `${ym.y}-${String(ym.m + 1).padStart(2, '0')}`
  const sessions = useLiveQuery(() => db.sessions.where('date').between(`${prefix}-01`, `${prefix}-31`, true, true).toArray(), [prefix])
  const days = useLiveQuery(() => db.days.toArray())
  const today = todayISO()
  const lead = (new Date(ym.y, ym.m, 1).getDay() + 6) % 7
  const count = new Date(ym.y, ym.m + 1, 0).getDate()
  const move = (d: number) => { const n = new Date(ym.y, ym.m + d, 1); setYm({ y: n.getFullYear(), m: n.getMonth() }) }
  return (
    <div className="card">
      <div className="calhead">
        <button className="iconbtn" aria-label="Mes anterior" onClick={() => move(-1)}><Icon name="back" /></button>
        <strong aria-live="polite">{MONTHS[ym.m]} {ym.y}</strong>
        <button className="iconbtn" aria-label="Mes siguiente" onClick={() => move(1)}><Icon name="next" /></button>
      </div>
      <div className="cal" role="list">
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d} className="cal-wd muted small" aria-hidden="true">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: count }, (_, i) => {
          const iso = isoOf(new Date(ym.y, ym.m, i + 1))
          const here = sessions?.filter((s) => s.date === iso) ?? []
          const state = here.some((s) => s.status === 'done') ? 'done' : here.length ? 'planned' : 'none'
          const names = here.map((s) => days?.find((d) => d.id === s.dayId)?.name).filter(Boolean).join(', ')
          return (
            <span key={iso} role="listitem" className={`cal-day ${state}` + (iso === today ? ' today' : '')}
              aria-label={`${i + 1}${iso === today ? ', hoy' : ''}: ${state === 'done' ? `entrenado (${names})` : state === 'planned' ? `planificado (${names})` : 'sin sesión'}`}>
              <span className="cal-num num">{i + 1}</span>
              {iso === today && <span className="cal-today">Hoy</span>}
            </span>
          )
        })}
      </div>
      <div className="legend muted small">
        <span><span className="dot full" aria-hidden="true" /> entrenado</span>
        <span><span className="dot" aria-hidden="true" /> planificado</span>
      </div>
    </div>
  )
}

export default function History() {
  const data = useLiveQuery(async () => {
    const [days, blocks, exercises] = await Promise.all([db.days.orderBy('order').toArray(), db.blocks.toArray(), db.exercises.toArray()])
    const list: { ex: Exercise; dayName: string }[] = []
    for (const d of days) for (const b of blocks.filter((x) => x.dayId === d.id).sort((a, c) => a.order - c.order))
      for (const ex of exercises.filter((x) => x.blockId === b.id).sort((a, c) => a.order - c.order)) list.push({ ex, dayName: d.name })
    return list
  })
  const [kind, setKind] = useState<string | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const kinds = [...new Set(data?.map((d) => d.ex.kind))]
  const options = data?.filter((d) => !kind || d.ex.kind === kind) ?? []
  const current = options.find((o) => o.ex.id === picked) ?? options[0]
  const exId = current?.ex.id

  const points = useLiveQuery(async () => {
    if (exId == null || !current) return []
    const metric = metricOf(fieldsFor(current.ex))
    const entries = (await db.entries.where('exerciseId').equals(exId).toArray()).filter((e) => e.done)
    const sessions = await db.sessions.bulkGet([...new Set(entries.map((e) => e.sessionId))])
    const out: Point[] = []
    for (const s of sessions) {
      if (!s) continue
      const mine = entries.filter((e) => e.sessionId === s.id).sort((a, b) => a.round - b.round)
      const vals = mine.map((e) => entryMetric(e, metric)).filter((v): v is number => v != null)
      if (vals.length) out.push({ session: s, best: Math.max(...vals), entries: mine })
    }
    return out.sort((a, b) => a.session.date.localeCompare(b.session.date))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exId, current?.ex.kind, current?.ex.target.type])

  const fields = current ? fieldsFor(current.ex) : []
  const metric = metricOf(fields)
  const last = points?.[points.length - 1], before = points?.[points.length - 2]
  const diff = last && before ? last.best - before.best : 0

  return (
    <main className="page">
      <header className="pagehead"><h1>Historial</h1></header>
      {data && data.length === 0 ? <div className="card empty"><p className="muted">Todavía no hay ejercicios.</p></div> : (
        <>
          <div className="chips" role="group" aria-label="Filtrar por tipo">
            <button className="chipbtn" aria-pressed={!kind} onClick={() => setKind(null)}>Todos</button>
            {kinds.map((k) => <button key={k} className="chipbtn" aria-pressed={kind === k} onClick={() => setKind(k)}>{cap(k)}</button>)}
          </div>
          <label className="lbl gap-top">Ejercicio
            <select className="input" value={exId ?? ''} onChange={(e) => setPicked(Number(e.target.value))}>
              {options.map((o) => <option key={o.ex.id} value={o.ex.id}>{o.ex.name} · {o.dayName}</option>)}
            </select>
          </label>
          {current && points && (
            <>
              <div className="card gap-top">
                <p className="muted small">Mejor serie por sesión ({metric === 'weight' ? 'peso' : metric === 'reps' ? 'reps' : metric === 'duration' ? 'tiempo' : 'distancia'})</p>
                {points.length ? <Chart points={points} metric={metric} /> : <p className="muted">Sin registros todavía. Los datos aparecen al marcar series como hechas.</p>}
                {last && before && (
                  <p className="compare" role="status">
                    <strong>{diff > 0 ? '▲ subió' : diff < 0 ? '▼ bajó' : '= igual'}{diff !== 0 && ` ${fmtMetric(Math.abs(diff), metric)}`}</strong>
                    <span className="muted"> respecto a la sesión anterior ({fmtDate(before.session.date)}: {fmtMetric(before.best, metric)})</span>
                  </p>
                )}
                {last && !before && <p className="muted small">Hace falta una sesión más para comparar.</p>}
              </div>
              {points.length > 0 && (
                <>
                  <h2 className="sect">Sesiones</h2>
                  <ul className="card plain">
                    {[...points].reverse().map((p) => (
                      <li key={p.session.id} className="line top">
                        <span><strong className="num">{fmtDate(p.session.date)}</strong><br /><span className="muted small">mejor: {fmtMetric(p.best, metric)}</span></span>
                        <span className="num series">{p.entries.map((e) => fmtEntry(e, fields)).join('  ·  ')}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </>
      )}
      <h2 className="sect">Calendario</h2>
      <Calendar />
    </main>
  )
}
