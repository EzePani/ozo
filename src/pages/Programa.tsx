import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { getGoals, moveRoutine, getProgramCards, getRoutineCards, useLive } from '../data'
import { WEEKDAYS, monthName, thisMonth, wdShort } from '../lib'
import { Bar, Chip, Icon, MonthNav, PageHead, Sheet, confirmDialog } from '../ui'

export default function Programa() {
  const [params, setParams] = useSearchParams()
  const month = params.get('m') ?? thisMonth()
  const cards = useLive(() => getProgramCards(month), [month])
  const routines = useLive(() => getRoutineCards())
  const goals = useLive(() => getGoals())
  const [menuId, setMenuId] = useState<number | null>(null)

  return (
    <main className="page">
      <PageHead title="Programa">
        <Link className="btn compact primary" to={`/programa/nuevo?m=${month}`}><Icon name="plus" size={20} />Nuevo</Link>
      </PageHead>
      <MonthNav month={month} onChange={(m) => setParams({ m }, { replace: true })} />

      {cards && cards.length === 0 && (
        <div className="card empty">
          <p><strong>No hay programas en {monthName(month).toLowerCase()}.</strong></p>
          <p className="muted">Un programa pone una rutina en un día de la semana y arma una columna por semana.</p>
          <Link className="btn primary" to={`/programa/nuevo?m=${month}`}>Crear programa</Link>
        </div>
      )}
      <ul className="list cols">
        {cards?.map(({ program, routine, sessions, exercises }) => {
          const done = sessions.filter((s) => s.status === 'done').length
          const goal = goals?.find((g) => g.scope === 'routine' && g.ref === String(routine.id))
          return (
            <li key={program.id}>
              <Link className="card progcard" to={`/programa/${program.id}`} aria-label={`${WEEKDAYS[program.weekday]}, ${routine.name}: ${done} de ${sessions.length} semanas hechas. Abrir grilla`}>
                <span className="progcard-top"><strong>{wdShort(program.weekday)} · {routine.name}</strong><Chip>{routine.type}</Chip></span>
                <span className="muted small">{sessions.length} {sessions.length === 1 ? 'semana' : 'semanas'} · {exercises} {exercises === 1 ? 'ejercicio' : 'ejercicios'}</span>
                <Bar value={done} max={sessions.length} label="Semanas hechas" />
                <span className="small">{sessions.length ? `Semana ${Math.min(done + 1, sessions.length)} de ${sessions.length}` : 'Sin semanas'}{done === sessions.length && done > 0 ? ' · ✓ completo' : ''}{goal ? ` · 🎯 ${goal.text}` : ''}</span>
              </Link>
            </li>
          )
        })}
      </ul>

      <h2 className="sect">Rutinas</h2>
      {routines && routines.length === 0 && <p className="muted hint">Todavía no hay rutinas. Se crean al armar un programa.</p>}
      <ul className="card plain">
        {routines?.map(({ routine, exercises }) => (
          <li key={routine.id} className="line">
            <Link className="linkrow grow" to={`/programa/rutina/${routine.id}`}>
              <strong>{routine.name}</strong> <Chip>{routine.type}</Chip><br />
              <span className="muted small">{exercises} {exercises === 1 ? 'ejercicio' : 'ejercicios'} · editar rutina</span>
            </Link>
            <Link className="btn compact" to={`/programa/nuevo?rutina=${routine.id}&m=${month}`}>Programar</Link>
            <button className="iconbtn" aria-label={`Más acciones de ${routine.name}`} onClick={() => setMenuId(routine.id)}><Icon name="more" /></button>
          </li>
        ))}
      </ul>
      {menuId != null && routines && (() => {
        const i = routines.findIndex((x) => x.routine.id === menuId)
        const r = routines[i]
        if (!r) return null
        const move = async (d: -1 | 1) => { setMenuId(null); if (await confirmDialog({ title: `${d < 0 ? 'Subir' : 'Bajar'} ${r.routine.name} en la lista`, ok: d < 0 ? 'Subir' : 'Bajar' })) await moveRoutine(r.routine.id, d) }
        return (
          <Sheet title={r.routine.name} onClose={() => setMenuId(null)}>
            <div className="mrows">
              <Link className="mrow" to={`/programa/rutina/${r.routine.id}`}><Icon name="edit" size={20} />Editar rutina</Link>
              <Link className="mrow" to={`/programa/nuevo?rutina=${r.routine.id}&m=${month}`}><Icon name="calendar" size={20} />Programar en {monthName(month).toLowerCase()}</Link>
              <button className="mrow" disabled={i === 0} onClick={() => move(-1)}><Icon name="up" size={20} />Subir en la lista</button>
              <button className="mrow" disabled={i === routines.length - 1} onClick={() => move(1)}><Icon name="down" size={20} />Bajar en la lista</button>
            </div>
          </Sheet>
        )
      })()}
    </main>
  )
}
