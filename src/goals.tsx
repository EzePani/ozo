import { useState } from 'react'
import { deleteGoal, getGoals, getHistory, getLibrary, getRoutineCards, getSessions, loadRoutine, saveGoal, useLive, type Goal, type Session } from './data'
import { entryFields, entryMetric, fieldUnit, fieldsFor, fmtMetric, metricOf, monthName } from './lib'
import { Bar, Icon, Sheet } from './ui'

/** Todo lo que necesitan Hoy y Progreso, leído en vivo. */
export function useOverview() {
  return useLive(async () => {
    const [sessions, cards, goals, library, history] = await Promise.all([getSessions(), getRoutineCards(), getGoals(), getLibrary(), getHistory()])
    return { sessions, cards, routines: cards.map((c) => c.routine), goals, library, history }
  })
}
export type Overview = NonNullable<ReturnType<typeof useOverview>>

export const doneIn = (sessions: Session[], month: string) => sessions.filter((s) => s.status === 'done' && s.date.startsWith(month))
export const monthGoal = (o: Overview, month: string) => o.goals.find((g) => g.scope === 'month' && g.ref === month)

/** Avance de un objetivo de rutina: la mejor marca del ejercicio contra la meta. */
function progress(g: Goal, o: Overview) {
  if (g.exerciseId == null || !g.target) return null
  const es = o.history.filter((e) => e.exerciseId === g.exerciseId)
  const metric = g.metric ?? metricOf(entryFields(es))
  return { metric, best: Math.max(0, ...es.map((e) => entryMetric(e, metric) ?? 0)) }
}

export function RoutineGoals({ o, onEdit }: { o: Overview; onEdit?: (g: Goal) => void }) {
  const goals = o.goals.filter((g) => g.scope === 'routine' && o.routines.some((r) => String(r.id) === g.ref))
  if (!goals.length) return <p className="muted">Todavía no hay objetivos por rutina.</p>
  return (
    <ul className="plain">
      {goals.map((g) => {
        const p = progress(g, o)
        const routine = o.routines.find((r) => String(r.id) === g.ref)!
        return (
          <li key={g.id} className="goalrow">
            <div className="grow">
              <p><strong>{routine.name}:</strong> {g.text}</p>
              {p && <Bar value={p.best} max={g.target!} label={`Avance de ${g.text}`} />}
              {p && <p className="muted small num">{p.best >= g.target! ? '✓ cumplido · ' : ''}mejor marca {fmtMetric(p.best, p.metric)} de {fmtMetric(g.target!, p.metric)}</p>}
            </div>
            {onEdit && <button className="iconbtn" aria-label={`Editar objetivo de ${routine.name}`} onClick={() => onEdit(g)}><Icon name="edit" /></button>}
          </li>
        )
      })}
    </ul>
  )
}

const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) && n > 0 ? n : undefined }

/** Editor de objetivo: del mes (texto + meta de entrenos) o de una rutina (texto + ejercicio y meta opcionales). */
export function GoalSheet({ goal, scope, month, o, onClose }: { goal?: Goal; scope: 'month' | 'routine'; month: string; o: Overview; onClose: () => void }) {
  const [text, setText] = useState(goal?.text ?? '')
  const [target, setTarget] = useState(goal?.target != null ? String(goal.target).replace('.', ',') : '')
  const [routineId, setRoutineId] = useState(goal && scope === 'routine' ? Number(goal.ref) : o.routines[0]?.id)
  const [exerciseId, setExerciseId] = useState<number | undefined>(goal?.exerciseId)
  const tree = useLive(() => (scope === 'routine' && routineId != null ? loadRoutine(routineId) : null), [scope, routineId])
  const ex = tree?.flat.find((f) => f.ex.id === exerciseId)?.ex
  const metric = ex ? metricOf(fieldsFor(ex)) : undefined
  const save = async () => {
    const base = { ...(goal ? { id: goal.id } : {}), text: text.trim(), target: num(target) }
    if (scope === 'month') await saveGoal({ ...base, scope, ref: month, month })
    else if (routineId != null) await saveGoal({ ...base, scope, ref: String(routineId), exerciseId: ex?.id, metric, target: ex ? num(target) : undefined })
    onClose()
  }
  const ok = !!text.trim() && (scope === 'month' || routineId != null)
  return (
    <Sheet title={scope === 'month' ? `Objetivo de ${monthName(month).toLowerCase()}` : goal ? 'Editar objetivo de rutina' : 'Nuevo objetivo de rutina'} onClose={onClose}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); if (ok) void save() }}>
        {scope === 'routine' && (
          <label className="lbl">Rutina
            <select className="input" value={routineId ?? ''} onChange={(e) => { setRoutineId(Number(e.target.value)); setExerciseId(undefined) }}>
              {o.routines.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
        )}
        <label className="lbl">Objetivo (texto libre)
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} maxLength={80} autoFocus
            placeholder={scope === 'month' ? 'Hacer 16 entrenos y subir la búlgara a 24 kg' : 'Búlgara 24 kg × 8'} />
        </label>
        {scope === 'month' ? (
          <label className="lbl">Meta de entrenos en el mes
            <input className="input num" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="16" />
          </label>
        ) : (
          <>
            <label className="lbl">Medir con un ejercicio (opcional)
              <select className="input" value={exerciseId ?? ''} onChange={(e) => setExerciseId(e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">Sin barra de avance</option>
                {tree?.flat.map((f) => <option key={f.ex.id} value={f.ex.id}>{f.ex.name}</option>)}
              </select>
            </label>
            {ex && metric && (
              <label className="lbl">Meta ({fieldUnit(metric, 's')})
                <input className="input num" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="24" />
                <span className="muted small">La barra avanza con tu mejor marca de {ex.name}.</span>
              </label>
            )}
          </>
        )}
        <button className="btn primary block" disabled={!ok}>Guardar</button>
        {goal && <button type="button" className="btn block" onClick={async () => { await deleteGoal(goal.id); onClose() }}><Icon name="trash" />Quitar objetivo</button>}
      </form>
    </Sheet>
  )
}
