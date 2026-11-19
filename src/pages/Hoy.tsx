import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { addDays, ensureTodaySession, todayISO } from '../data'
import { fmtDayLong, monthName, mondayOf, streakWeeks } from '../lib'
import { Bar, Chip, PageHead, Sheet } from '../ui'
import { GoalSheet, RoutineGoals, doneIn, monthGoal, useOverview } from '../goals'

export default function Hoy() {
  const o = useOverview()
  const nav = useNavigate()
  const [pick, setPick] = useState(false)
  const [editGoal, setEditGoal] = useState(false)
  if (!o) return <main className="page" aria-busy="true" />

  const today = todayISO(), month = today.slice(0, 7)
  const week = Array.from({ length: 7 }, (_, i) => addDays(mondayOf(today), i))
  const card = (routineId: number) => o.cards.find((c) => c.routine.id === routineId)
  const todays = o.sessions.filter((s) => s.date === today && card(s.routineId))
  const next = o.sessions.filter((s) => s.date > today && s.status === 'planned' && card(s.routineId)).sort((a, b) => a.date.localeCompare(b.date))[0]
  const done = doneIn(o.sessions, month).length
  const goal = monthGoal(o, month)
  const streak = streakWeeks(o.sessions.filter((s) => s.status === 'done').map((s) => s.date))
  const start = async (routineId: number) => nav(`/sesion/${await ensureTodaySession(routineId)}`)

  return (
    <main className="page">
      <PageHead title={fmtDayLong(today)} />
      <ol className="weekstrip" aria-label="Esta semana">
        {week.map((iso, i) => {
          const here = o.sessions.filter((s) => s.date === iso)
          const state = here.some((s) => s.status === 'done') ? 'done' : here.length ? 'planned' : 'none'
          return (
            <li key={iso} className={`wk ${state}` + (iso === today ? ' today' : '')}
              aria-label={`${fmtDayLong(iso)}${iso === today ? ', hoy' : ''}: ${state === 'done' ? 'entrenaste' : state === 'planned' ? 'programado' : 'sin entreno'}`}>
              <span className="wk-l" aria-hidden="true">{'LMXJVSD'[i]}</span>
              <span className="wk-dot" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
              <span className="wk-t" aria-hidden="true">{iso === today ? 'Hoy' : iso.slice(8).replace(/^0/, '')}</span>
            </li>
          )
        })}
      </ol>

      <div className="cols">
        <div className="stack">
          {todays.map((s) => {
            const c = card(s.routineId)!
            return (
              <section key={s.id} className="card stack">
                <p className="eyebrow">{s.status === 'done' ? 'Hoy entrenaste' : 'Hoy toca'}</p>
                <h2 className="big">{c.routine.name} <Chip>{c.routine.type}</Chip></h2>
                <p className="muted">{c.exercises} {c.exercises === 1 ? 'ejercicio' : 'ejercicios'}{s.status === 'done' ? ' · ✓ día tachado' : ''}</p>
                <div className="row wrap">
                  <Link className={'btn grow big' + (s.status === 'done' ? '' : ' primary')} to={`/sesion/${s.id}`}>{s.status === 'done' ? 'Seguir cargando' : 'Empezar'}</Link>
                  <Link className="btn" to={`/programa/${s.programId}`}>Ver grilla</Link>
                </div>
              </section>
            )
          })}
          {!todays.length && (
            <section className="card stack">
              <p className="eyebrow">Hoy</p>
              <h2 className="big">Sin entreno programado</h2>
              {next && <p className="muted">Próximo: {card(next.routineId)!.routine.name} · {fmtDayLong(next.date).toLowerCase()}</p>}
              {o.cards.length > 0
                ? <button className="btn block" onClick={() => setPick(true)}>Entrenar hoy igual</button>
                : <Link className="btn primary block" to="/programa/nuevo">Crear el primer programa</Link>}
            </section>
          )}
        </div>

        <div className="stack">
          <section className="card stack">
            <p className="eyebrow">🎯 Objetivo de {monthName(month).toLowerCase()}</p>
            <p>{goal?.text || <span className="muted">Todavía sin objetivo para este mes.</span>}</p>
            {goal?.target ? <Bar value={done} max={goal.target} label="Entrenos del mes" /> : null}
            <p className="num"><strong>{done}{goal?.target ? ` / ${goal.target}` : ''}</strong> {done === 1 && !goal?.target ? 'entreno' : 'entrenos'} · racha {streak} {streak === 1 ? 'semana' : 'semanas'}</p>
            <button className="btn compact" onClick={() => setEditGoal(true)}>{goal ? 'Editar objetivo' : 'Definir objetivo'}</button>
          </section>
          <section className="card stack">
            <p className="eyebrow">Objetivos por rutina</p>
            <RoutineGoals o={o} />
            <Link className="btn compact" to="/progreso">Ver progreso</Link>
          </section>
        </div>
      </div>

      {pick && (
        <Sheet title="Entrenar hoy" onClose={() => setPick(false)}>
          <p className="muted small">Se suma una columna con la fecha de hoy al programa de esa rutina.</p>
          <div className="menu">
            {o.cards.map((c) => <button key={c.routine.id} className="btn block" onClick={() => start(c.routine.id)}>{c.routine.name}</button>)}
          </div>
        </Sheet>
      )}
      {editGoal && <GoalSheet scope="month" month={month} goal={goal} o={o} onClose={() => setEditGoal(false)} />}
    </main>
  )
}
