import { useState } from 'react'
import { Link } from 'react-router-dom'
import { isoOf, todayISO, type Goal } from '../data'
import { bestEntry, entryFields, fmtDay, fmtDayLong, fmtEntry, fmtSpan, monthName, sessionMs, streakWeeks, thisMonth } from '../lib'
import { Bar, Icon, MonthNav, PageHead } from '../ui'
import { GoalSheet, RoutineGoals, doneIn, monthGoal, useOverview } from '../goals'

export default function Progreso() {
  const o = useOverview()
  const [month, setMonth] = useState(thisMonth())
  const [day, setDay] = useState<string | null>(null)
  const [edit, setEdit] = useState<{ scope: 'month' | 'routine'; goal?: Goal } | null>(null)
  if (!o) return <main className="page" aria-busy="true" />

  const today = todayISO()
  const [y, m] = month.split('-').map(Number)
  const lead = (new Date(y, m - 1, 1).getDay() + 6) % 7
  const count = new Date(y, m, 0).getDate()
  const done = doneIn(o.sessions, month).length
  const goal = monthGoal(o, month)
  const streak = streakWeeks(o.sessions.filter((s) => s.status === 'done').map((s) => s.date))
  const name = (routineId: number) => o.routines.find((r) => r.id === routineId)?.name ?? 'Rutina borrada'
  const picked = day && day.startsWith(month) ? day : null
  const pickedSessions = o.sessions.filter((s) => s.date === picked)
  const records = o.library.map((l) => {
    const es = o.history.filter((e) => e.exerciseId === l.id)
    const fields = entryFields(es)
    const best = bestEntry(es, fields)
    return best && { lib: l, best, fields }
  }).filter((r) => !!r).sort((a, b) => b.best.date.localeCompare(a.best.date)).slice(0, 8)

  const timed = o.routines.map((r) => {
    const list = o.sessions.filter((s) => s.routineId === r.id && s.status === 'done' && sessionMs(s)).sort((a, b) => a.date.localeCompare(b.date))
    return { r, list }
  }).filter((t) => t.list.length)

  return (
    <main className="page">
      <PageHead title="Progreso" />
      <div className="cols">
        <div className="stack">
          <section className="card">
            <MonthNav month={month} onChange={(v) => { setMonth(v); setDay(null) }} />
            <div className="cal">
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d) => <span key={d} className="cal-wd muted small" aria-hidden="true">{d}</span>)}
              {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
              {Array.from({ length: count }, (_, i) => {
                const iso = isoOf(new Date(y, m - 1, i + 1))
                const here = o.sessions.filter((s) => s.date === iso)
                const state = here.some((s) => s.status === 'done') ? 'done' : here.length ? 'planned' : 'none'
                return (
                  <button key={iso} className={`cal-day ${state}` + (iso === today ? ' today' : '')} aria-pressed={picked === iso} onClick={() => setDay(picked === iso ? null : iso)}
                    aria-label={`${i + 1}${iso === today ? ', hoy' : ''}: ${state === 'done' ? 'entrenaste' : state === 'planned' ? 'programado' : 'sin entreno'}`}>
                    <span className="cal-num num">{i + 1}</span>
                  </button>
                )
              })}
            </div>
            <p className="legend muted small">
              <span><span className="dot full" aria-hidden="true" /> entrenaste</span>
              <span><span className="dot" aria-hidden="true" /> programado</span>
              <span><span className="dot today" aria-hidden="true" /> hoy</span>
            </p>
            <div className="daydetail" role="status">
              {!picked ? <p className="muted small">Tocá un día para ver qué hiciste.</p> : (
                <>
                  <p><strong>{fmtDayLong(picked)}</strong></p>
                  {pickedSessions.length === 0 && <p className="muted">Sin entreno.</p>}
                  {pickedSessions.map((s) => (
                    <p key={s.id}><Link className="linkrow" to={`/programa/${s.programId}`}>{name(s.routineId)} · {s.status === 'done' ? '✓ entrenaste' : 'programado'}{s.note ? ` · 📝 ${s.note}` : ''}</Link></p>
                  ))}
                </>
              )}
            </div>
          </section>
          <section className="card stack">
            <p className="num"><strong className="big">{done}</strong> {done === 1 ? 'entreno' : 'entrenos'} en {monthName(month).toLowerCase()}{goal?.target ? ` · meta ${goal.target}` : ''}</p>
            {goal?.target ? <Bar value={done} max={goal.target} label="Entrenos del mes" /> : null}
            <p className="muted">Racha: {streak} {streak === 1 ? 'semana' : 'semanas'} seguidas</p>
          </section>
        </div>

        <div className="stack">
          <section className="card stack">
            <div className="row tightrow spread"><p className="eyebrow">🎯 Objetivo de {monthName(month).toLowerCase()}</p><button className="btn compact" onClick={() => setEdit({ scope: 'month', goal })}>{goal ? 'Editar' : 'Definir'}</button></div>
            <p>{goal?.text || <span className="muted">Todavía sin objetivo para este mes.</span>}</p>
            {goal?.target ? <p className="muted small num">{done} / {goal.target} entrenos{done >= goal.target ? ' · ✓ cumplido' : ''}</p> : null}
          </section>
          <section className="card stack">
            <div className="row tightrow spread"><p className="eyebrow">Objetivos por rutina</p><button className="btn compact" disabled={!o.routines.length} onClick={() => setEdit({ scope: 'routine' })}><Icon name="plus" size={18} />Agregar</button></div>
            <RoutineGoals o={o} onEdit={(g) => setEdit({ scope: 'routine', goal: g })} />
          </section>
          {timed.length > 0 && (
            <section className="card stack">
              <p className="eyebrow">⏱ Duración de los entrenos</p>
              {timed.map(({ r, list }) => {
                const last = list.slice(-8)
                const max = Math.max(...last.map((s) => sessionMs(s)!))
                const avg = list.reduce((n, s) => n + sessionMs(s)!, 0) / list.length
                return (
                  <div key={r.id} className="durrow">
                    <p className="row tightrow spread"><strong>{r.name}</strong><span className="num">{fmtSpan(avg)} <span className="muted small">promedio</span></span></p>
                    <div className="durbars" role="img" aria-label={`Últimos entrenos de ${r.name}: ${last.map((s) => `${fmtDay(s.date)} ${fmtSpan(sessionMs(s)!)}`).join(', ')}`}>
                      {last.map((s) => <span key={s.id} className="durbar"><i style={{ height: `${Math.max(10, (sessionMs(s)! / max) * 64)}px` }} /><small className="num">{fmtSpan(sessionMs(s)!)}</small><small className="muted">{fmtDay(s.date)}</small></span>)}
                    </div>
                  </div>
                )
              })}
              <p className="muted small">Va desde «Empezar» hasta «Terminar entreno». Se corrige desde el menú de cada semana.</p>
            </section>
          )}
          <section className="card stack">
            <p className="eyebrow">🏆 Récords</p>
            {records.length === 0 && <p className="muted">Aparecen al marcar series como hechas.</p>}
            <ul className="plain">
              {records.map(({ lib, best, fields }) => (
                <li key={lib.id} className="line">
                  <Link className="linkrow grow" to={`/biblioteca/${lib.id}`}><strong>{lib.name}</strong><br /><span className="muted small">{fmtDay(best.date)}{best.date.startsWith(thisMonth()) ? ' · este mes' : ''}</span></Link>
                  <span className="num">{fmtEntry(best, fields, true)}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
      {edit && <GoalSheet scope={edit.scope} goal={edit.goal} month={month} o={o} onClose={() => setEdit(null)} />}
    </main>
  )
}
