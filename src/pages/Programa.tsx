import { Link, useSearchParams } from 'react-router-dom'
import { getGoals, moveRoutine, getProgramCards, getRoutineCards, useLive } from '../data'
import { WEEKDAYS, monthName, thisMonth, wdShort } from '../lib'
import { Bar, Chip, Icon, MonthNav, PageHead, confirmDialog } from '../ui'

export default function Programa() {
  const [params, setParams] = useSearchParams()
  const month = params.get('m') ?? thisMonth()
  const cards = useLive(() => getProgramCards(month), [month])
  const routines = useLive(() => getRoutineCards())
  const goals = useLive(() => getGoals())

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
        {routines?.map(({ routine, exercises }, i) => (
          <li key={routine.id} className="line">
            <Link className="linkrow grow" to={`/programa/rutina/${routine.id}`}>
              <strong>{routine.name}</strong> <Chip>{routine.type}</Chip><br />
              <span className="muted small">{exercises} {exercises === 1 ? 'ejercicio' : 'ejercicios'} · editar rutina</span>
            </Link>
            <button className="minibtn" aria-label={`Subir ${routine.name}`} title="Subir" disabled={i === 0} onClick={async () => { if (await confirmDialog({ title: `Subir ${routine.name} en la lista`, ok: 'Subir' })) await moveRoutine(routine.id, -1) }}><Icon name="up" size={18} /></button>
            <button className="minibtn" aria-label={`Bajar ${routine.name}`} title="Bajar" disabled={i === routines.length - 1} onClick={async () => { if (await confirmDialog({ title: `Bajar ${routine.name} en la lista`, ok: 'Bajar' })) await moveRoutine(routine.id, 1) }}><Icon name="down" size={18} /></button>
            <Link className="btn compact" to={`/programa/nuevo?rutina=${routine.id}&m=${month}`}>Programar</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
