import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addSession, db, deleteSession, saveEntry, todayISO, type DayTree, type Entry, type Exercise, type Session } from '../db'
import { draftToValues, fieldsFor, fmtDate, fmtEntry, valuesToDraft, type Draft } from '../lib'
import { DateField, EntryEditor, Icon, Sheet, confirmDialog, toast } from '../ui'

function CellEditor({ session, ex, round, entry, onClose }: { session: Session; ex: Exercise; round: number; entry?: Entry; onClose: () => void }) {
  const [draft, setDraft] = useState<Draft>(() => valuesToDraft(entry, ex.timeUnit))
  const save = async () => {
    const v = draftToValues(draft, ex.timeUnit)
    const empty = Object.values(v).every((x) => x == null)
    if (empty) await db.entries.delete([session.id, ex.id, round])
    else await saveEntry(session.id, ex.id, round, v, entry?.done || session.date <= todayISO())
    onClose()
  }
  return (
    <Sheet title={`${ex.name} · R${round} · ${fmtDate(session.date)}`} onClose={onClose}>
      <EntryEditor fields={fieldsFor(ex)} timeUnit={ex.timeUnit} draft={draft} onChange={setDraft} />
      <div className="row gap-top">
        <button className="btn" onClick={() => setDraft({})}>Vaciar</button>
        <button className="btn primary grow" onClick={save}>Guardar</button>
      </div>
    </Sheet>
  )
}

export default function Planilla({ tree }: { tree: DayTree }) {
  const dayId = tree.day.id
  const today = todayISO()
  const sessions = useLiveQuery(async () =>
    (await db.sessions.where('dayId').equals(dayId).toArray()).sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order), [dayId])
  const entries = useLiveQuery(async () => {
    const ids = await db.sessions.where('dayId').equals(dayId).primaryKeys()
    return db.entries.where('sessionId').anyOf(ids).toArray()
  }, [dayId])
  const [cell, setCell] = useState<{ session: Session; ex: Exercise; round: number } | null>(null)
  const [menu, setMenu] = useState<number | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const focusRef = useRef<HTMLTableCellElement>(null)
  const scrolled = useRef(false)

  const focusId = sessions && (sessions.find((s) => s.date === today) ?? [...sessions].reverse().find((s) => s.status === 'done') ?? sessions[sessions.length - 1])?.id
  useEffect(() => {
    if (sessions && !scrolled.current && focusRef.current) { focusRef.current.scrollIntoView({ inline: 'end', block: 'nearest' }); scrolled.current = true }
  }, [sessions, entries])

  if (!sessions || !entries) return <div aria-busy="true" />
  const byKey = new Map(entries.map((e) => [`${e.sessionId}-${e.exerciseId}-${e.round}`, e]))
  const colCls = (s: Session) => (s.status === 'planned' ? 'planned' : 'done') + (s.date === today ? ' today' : '')
  const menuSession = sessions.find((s) => s.id === menu)

  const changeDate = async (s: Session, date: string) => {
    if (date === s.date) return
    if (sessions.some((x) => x.date === date)) return toast(`Ya hay una columna del ${fmtDate(date)}`)
    await db.sessions.update(s.id, { date })
  }
  const add = async () => {
    if (!adding) return
    if (sessions.some((x) => x.date === adding)) toast(`Ya hay una columna del ${fmtDate(adding)}`)
    else { await addSession(dayId, adding); scrolled.current = false }
    setAdding(null)
  }
  const removeCol = async (s: Session) => {
    if (!(await confirmDialog({ title: `Borrar la columna del ${fmtDate(s.date)}`, body: 'Se borran los registros cargados en esa fecha.', ok: 'Borrar columna' }))) return
    setMenu(null)
    await deleteSession(s.id)
  }

  return (
    <>
      {tree.flat.length === 0 && <div className="card empty"><p className="muted">Agregá ejercicios en la vista Resumen para ver la planilla.</p></div>}
      <div className="tablewrap" role="region" aria-label="Planilla de sesiones" tabIndex={0}>
        <table className="planilla">
          <thead>
            <tr>
              <th className="sticky corner" scope="col">Ejercicio</th>
              {sessions.map((s) => (
                <th key={s.id} scope="col" className={colCls(s)} ref={s.id === focusId ? focusRef : undefined}>
                  <button className="colhead" onClick={() => setMenu(s.id)} aria-label={`Columna ${fmtDate(s.date)}, ${s.status === 'done' ? 'hecha' : 'planificada'}${s.date === today ? ', hoy' : ''}. Abrir menú`}>
                    <span className="num">{fmtDate(s.date)}</span>
                    <span className="colstate"><span className={'dot ' + (s.status === 'done' ? 'full' : '')} aria-hidden="true" />{s.date === today ? 'Hoy' : s.status === 'done' ? 'hecha' : 'plan'}</span>
                  </button>
                </th>
              ))}
              <th scope="col"><button className="iconbtn" aria-label="Agregar columna" onClick={() => setAdding(today)}><Icon name="plus" /></button></th>
            </tr>
          </thead>
          <tbody>
            {tree.flat.map(({ ex, pos }) => Array.from({ length: ex.rounds }, (_, i) => i + 1).map((round) => (
              <tr key={`${ex.id}-${round}`} className={round === 1 ? 'first' : ''}>
                <th scope="row" className="sticky">
                  {round === 1 && <span className="pl-name">{pos !== 'single' && <span className="pl-block">BLOQUE </span>}{ex.name}</span>}
                  <span className="pl-round">R{round}</span>
                </th>
                {sessions.map((s) => {
                  const e = byKey.get(`${s.id}-${ex.id}-${round}`)
                  const txt = fmtEntry(e, fieldsFor(ex))
                  return (
                    <td key={s.id} className={colCls(s)}>
                      <button className={'cell num' + (e && !e.done ? ' pending' : '')} onClick={() => setCell({ session: s, ex, round })}
                        aria-label={`${ex.name}, ronda ${round}, ${fmtDate(s.date)}: ${txt === '—' ? 'sin dato' : txt}. Editar`}>{txt}</button>
                    </td>
                  )
                })}
                <td />
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div className="legend muted small">
        <span><span className="dot full" aria-hidden="true" /> hecha</span>
        <span><span className="dot" aria-hidden="true" /> planificada</span>
        <span>— sin dato</span>
      </div>
      <div className="actionbar">
        <Link className="btn primary grow" to={`/dia/${dayId}/sesion`}>Empezar sesión</Link>
        <button className="btn" onClick={() => setAdding(today)}><Icon name="plus" />Columna</button>
      </div>

      {cell && <CellEditor {...cell} entry={byKey.get(`${cell.session.id}-${cell.ex.id}-${cell.round}`)} onClose={() => setCell(null)} />}
      {menuSession && (
        <Sheet title={`Columna ${fmtDate(menuSession.date)}`} onClose={() => setMenu(null)}>
          <div className="menu">
            <div className="lbl">Cambiar fecha
              <DateField className="btn block" label="Fecha de la columna" value={menuSession.date} onChange={(d) => changeDate(menuSession, d)} />
            </div>
            <button className="btn block" onClick={() => db.sessions.update(menuSession.id, { status: menuSession.status === 'done' ? 'planned' : 'done' })}>
              {menuSession.status === 'done' ? 'Marcar como planificada' : 'Marcar como hecha'}
            </button>
            <button className="btn block" onClick={() => removeCol(menuSession)}><Icon name="trash" />Borrar columna</button>
          </div>
        </Sheet>
      )}
      {adding && (
        <Sheet title="Agregar columna" onClose={() => setAdding(null)}>
          <div className="menu">
            <div className="lbl">Fecha
              <DateField className="btn block" label="Fecha de la columna nueva" value={adding} onChange={setAdding} />
            </div>
            <button className="btn primary block" onClick={add}>Agregar columna</button>
          </div>
        </Sheet>
      )}
    </>
  )
}
