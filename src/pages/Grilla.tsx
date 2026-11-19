import { Fragment, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addWeek, copyPrevWeek, deleteProgram, getGoals, getHistory, getSettings, groupExercises, loadProgram, loadRoutine, moveExercise, programHasData, removeItems, removeRound,
  removeSession, roundHasData, saveEntry, sessionHasData, setRest, todayISO, ungroupExercises, updateItems, updateSession, useLive,
  type Block, type Entry, type Exercise, type Field, type FlatRow, type Session,
} from '../data'
import { bestEntry, cmpEntries, fieldsFor, fmtDay, fmtEntry, fmtTargetShort, hasValues, wdShort } from '../lib'
import { DateField, Icon, NoteSheet, PageHead, Sheet, confirmDialog, toast, toastUndo, useIsDesktop } from '../ui'
import { CellEditor } from '../CellEditor'
import { LinkSheet } from '../LinkSheet'
import { downloadIcs, googleCalendarUrl, icsFile } from '../calendar'
import { AddExerciseSheet, ExerciseEditor } from './ExerciseEditor'

function Cell({ entry, before, fields, label, empty = '—', onOpen }: { entry?: Entry; before?: Entry; fields: Field[]; label: string; empty?: string; onOpen: () => void }) {
  const txt = fmtEntry(entry, fields)
  const c = entry?.done && hasValues(entry) && hasValues(before) ? cmpEntries(entry, before!, fields) : null
  const state = c == null ? '' : c > 0 ? 'mejoró' : c === 0 ? 'igual' : 'menos'
  return (
    <button className={'cell num' + (c == null ? '' : c > 0 ? ' up' : ' down') + (entry && !entry.done ? ' pending' : '')} onClick={onOpen}
      aria-label={`${label}: ${txt === '—' ? 'sin dato' : txt}${state ? `, ${state} que la semana anterior` : ''}${entry && !entry.done && hasValues(entry) ? ', pendiente' : ''}${entry?.note ? ', con nota' : ''}. Editar`}>
      {c != null && <span className="mark" aria-hidden="true">{c > 0 ? '▲' : c === 0 ? '=' : '▼'}</span>}
      {txt === '—' ? <span className="muted">{empty}</span> : txt}{entry?.note ? ' 📝' : ''}
    </button>
  )
}

export default function Grilla() {
  const programId = Number(useParams().id)
  const nav = useNavigate()
  const desktop = useIsDesktop()
  const data = useLive(async () => {
    const p = await loadProgram(programId)
    const tree = p && (await loadRoutine(p.program.routineId))
    if (!p || !tree) return null
    const goal = (await getGoals()).find((g) => g.scope === 'routine' && g.ref === String(tree.routine.id))
    return { ...p, tree, goal, history: await getHistory(tree.flat.map((f) => f.ex.id)) }
  }, [programId])

  const settings = useLive(() => getSettings())
  const [sel, setSel] = useState<number | null>(null)
  const [cell, setCell] = useState<{ sessionId: number; ex: Exercise; round: number } | null>(null)
  const [exMenu, setExMenu] = useState<number | null>(null) // itemId
  const [roundMenu, setRoundMenu] = useState<{ itemId: number; round: number } | null>(null)
  const [weekMenu, setWeekMenu] = useState<number | null>(null)
  const [progMenu, setProgMenu] = useState(false)
  const [editing, setEditing] = useState<FlatRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [grouping, setGrouping] = useState<FlatRow | null>(null)
  const [restEdit, setRestEdit] = useState<Block | null>(null)
  const [link, setLink] = useState<Exercise | null>(null)
  const [note, setNote] = useState<{ row: FlatRow } | { session: Session } | null>(null)

  if (data === undefined) return <main className="page" aria-busy="true" />
  if (data === null) return <main className="page"><PageHead title="Programa" back="/programa" /><p>Ese programa ya no existe.</p></main>

  const { program, sessions, entries, tree, goal, history } = data
  const routineId = tree.routine.id
  const today = todayISO()
  const n = sessions.length
  const cal = { title: `Entreno: ${tree.routine.name}`, time: settings?.calTime ?? '07:00', minutes: settings?.calMinutes ?? 60, details: tree.flat.map((f) => `${f.ex.name} ${f.ex.rounds}×${fmtTargetShort(f.ex.target)}`).join('\n') }
  const byKey = new Map(entries.map((e) => [`${e.sessionId}-${e.exerciseId}-${e.round}`, e]))
  const at = (s: Session | undefined, ex: Exercise, round: number) => (s ? byKey.get(`${s.id}-${ex.id}-${round}`) : undefined)
  // semana que se muestra en el celu: la elegida, si no la de hoy, si no la próxima pendiente, si no la última
  const curIdx = Math.max(0, sessions.findIndex((s) => s.id === (sel ?? (sessions.find((x) => x.date === today) ?? sessions.find((x) => x.date >= today && x.status === 'planned') ?? sessions[n - 1])?.id)))
  const cur = sessions[curIdx] as Session | undefined
  const prev = sessions[curIdx - 1] as Session | undefined
  const rowOf = (itemId: number | null | undefined) => tree.flat.find((f) => f.ex.itemId === itemId)
  const wk = (s: Session) => sessions.findIndex((x) => x.id === s.id) + 1

  // ---------- acciones sobre filas y columnas ----------
  const addRound = (row: FlatRow) => (row.ex.rounds < 20 ? updateItems([row.ex.itemId], { rounds: row.ex.rounds + 1 }) : toast('Máximo 20 rondas'))
  const removeRnd = async (row: FlatRow, round: number) => {
    if (row.ex.rounds <= 1) return toast('Tiene que quedar al menos una ronda')
    if ((await roundHasData(routineId, row.ex.id, round)) && !(await confirmDialog({ title: `Quitar la ronda ${round} de ${row.ex.name}`, body: 'Tiene datos cargados en alguna semana. Se quitan y las rondas siguientes se corren un lugar.', ok: 'Quitar ronda' }))) return
    const undo = await removeRound(routineId, row.ex, round)
    if (undo) toastUndo(`Ronda ${round} quitada`, undo)
  }
  const removeEx = async (row: FlatRow) => {
    if ((await roundHasData(routineId, row.ex.id)) && !(await confirmDialog({ title: `Quitar "${row.ex.name}" de la rutina`, body: 'Tiene datos cargados. Los registros no se pierden: quedan en el historial de la biblioteca.', ok: 'Quitar' }))) return
    toastUndo(`${row.ex.name} quitado`, await removeItems(routineId, [row.ex.itemId]))
  }
  const move = (row: FlatRow, d: number) => moveExercise(routineId, row.ex.itemId, tree.flat.indexOf(row) + d)
  const addWk = async () => { const id = await addWeek(programId); if (id) { setSel(id); toast(`Semana ${n + 1} agregada`) } }
  const removeWk = async (s: Session) => {
    if ((await sessionHasData(s.id)) && !(await confirmDialog({ title: `Quitar la semana ${wk(s)} (${fmtDay(s.date)})`, body: 'Tiene datos cargados que se quitan con ella.', ok: 'Quitar semana' }))) return
    const label = `Semana ${wk(s)} quitada`
    setSel(null)
    toastUndo(label, await removeSession(s.id))
  }
  const removeProgram = async () => {
    if ((await programHasData(programId)) && !(await confirmDialog({ title: 'Borrar este programa', body: `Se quitan sus ${n} semanas con los datos cargados. La rutina "${tree.routine.name}" y la biblioteca no se tocan.`, ok: 'Borrar programa' }))) return
    const undo = await deleteProgram(programId)
    nav(`/programa?m=${program.month}`, { replace: true })
    toastUndo('Programa borrado', undo)
  }
  const copyPrev = async (s: Session) => { const c = await copyPrevWeek(s.id); toast(c ? `${c} ${c === 1 ? 'valor copiado' : 'valores copiados'}: quedan pendientes hasta que los confirmes` : 'No había nada para copiar') }
  const colState = (s: Session) => (s.date === today ? 'Hoy' : s.status === 'done' ? 'hecha' : 'plan')
  const colCls = (s: Session) => (s.status === 'planned' ? 'planned' : 'done') + (s.date === today ? ' today' : '')

  const menuRow = rowOf(exMenu)
  const rndRow = rowOf(roundMenu?.itemId)
  const menuSession = sessions.find((s) => s.id === weekMenu)
  const cellSession = sessions.find((s) => s.id === cell?.sessionId)
  const cellRow = cell && tree.flat.find((f) => f.ex.id === cell.ex.id)

  const actions = (row: FlatRow, i: number) => (
    <span className="acts hov" role="group" aria-label={`Acciones de ${row.ex.name}`}>
      <button className="minibtn" aria-label="Editar ejercicio" title="Editar" onClick={() => setEditing(row)}><Icon name="edit" size={18} /></button>
      <button className="minibtn" aria-label="Subir" title="Subir" disabled={i === 0} onClick={() => move(row, -1)}><Icon name="up" size={18} /></button>
      <button className="minibtn" aria-label="Bajar" title="Bajar" disabled={i === tree.flat.length - 1} onClick={() => move(row, 1)}><Icon name="down" size={18} /></button>
      {row.block.kind === 'superset'
        ? <button className="minibtn" aria-label="Desagrupar" title="Desagrupar" onClick={() => ungroupExercises(routineId, [row.ex.itemId])}><Icon name="ungroup" size={18} /></button>
        : <button className="minibtn" aria-label="Agrupar en superserie" title="Agrupar en superserie" disabled={tree.flat.length < 2} onClick={() => setGrouping(row)}><Icon name="group" size={18} /></button>}
      <button className="minibtn" aria-label="Nota del ejercicio" title="Nota" onClick={() => setNote({ row })}><Icon name="note" size={18} /></button>
      <button className="minibtn wide" aria-label="Agregar ronda" title="Agregar ronda" onClick={() => addRound(row)}>＋ ronda</button>
      <button className="minibtn" aria-label="Quitar ejercicio" title="Quitar" onClick={() => removeEx(row)}><Icon name="trash" size={18} /></button>
    </span>
  )

  return (
    <main className={'page' + (desktop ? ' wide' : '')}>
      <PageHead title={`${wdShort(program.weekday)} · ${tree.routine.name}`} back={`/programa?m=${program.month}`}>
        {desktop && cur && <Link className="btn compact primary" to={`/sesion/${cur.id}`}>Cargar semana {curIdx + 1}</Link>}
        {desktop && <Link className="btn compact" to={`/programa/rutina/${routineId}`}>Editar rutina</Link>}
        <button className="iconbtn" aria-label="Más acciones del programa" onClick={() => setProgMenu(true)}><Icon name="more" /></button>
      </PageHead>
      {goal && <p className="hint">🎯 {goal.text}</p>}

      {n === 0 && <div className="card empty"><p><strong>Este programa no tiene semanas.</strong></p><button className="btn primary" onClick={addWk}>Agregar semana</button></div>}
      {tree.flat.length === 0 && <div className="card empty"><p><strong>La rutina está vacía.</strong></p><p className="muted">Agregá el primer ejercicio, de la biblioteca o nuevo.</p></div>}

      {!desktop && cur && (
        <>
          <div className="monthnav">
            <button className="iconbtn" aria-label="Semana anterior" disabled={curIdx === 0} onClick={() => setSel(sessions[curIdx - 1].id)}><Icon name="back" /></button>
            <span className="weeklabel" aria-live="polite"><strong>Semana {curIdx + 1} de {n}</strong> · <span className="num">{fmtDay(cur.date)}</span><br /><span className="colstate"><span className={'dot ' + (cur.status === 'done' ? 'full' : '')} aria-hidden="true" />{colState(cur)}{cur.note ? ' · 📝' : ''}</span></span>
            <button className="iconbtn" aria-label="Semana siguiente" disabled={curIdx === n - 1} onClick={() => setSel(sessions[curIdx + 1].id)}><Icon name="next" /></button>
            <button className="iconbtn" aria-label={`Acciones de la semana ${curIdx + 1}`} onClick={() => setWeekMenu(cur.id)}><Icon name="more" /></button>
          </div>
          {tree.flat.length > 0 && (
            <table className="grid">
              <thead>
                <tr><th scope="col" className="c-r">Ronda</th><th scope="col" className="c-o">Obj</th><th scope="col">{prev ? `Sem ${curIdx}` : '—'}</th><th scope="col">Sem {curIdx + 1}{cur.date === today ? ' (hoy)' : ''}</th></tr>
              </thead>
              <tbody>
                {tree.flat.map((row) => {
                  const { ex, block, pos } = row
                  const fields = fieldsFor(ex)
                  return (
                    <Fragment key={ex.itemId}>
                      <tr className="exbar">
                        <td colSpan={4}>
                          <div className="exbar-in">
                            <button className="exbar-main" onClick={() => setExMenu(ex.itemId)} aria-label={`${ex.name}. Abrir acciones del ejercicio`}>
                              {pos !== 'single' && <span className="pl-block">SUPERSERIE · alterna</span>}
                              <span className="exbar-name">{ex.name}</span>
                              <span className="exbar-sub">{block.restLabel ? `Rest ${block.restLabel} · ` : ''}{ex.note ? '📝 · ' : ''}⋯</span>
                            </button>
                            {ex.linkUrl && <button className="iconbtn" aria-label={`Ver video de ${ex.name}`} onClick={() => setLink(ex)}><Icon name="play" /></button>}
                          </div>
                        </td>
                      </tr>
                      {ex.note && <tr className="noterow"><td colSpan={4}>📝 {ex.note}</td></tr>}
                      {Array.from({ length: ex.rounds }, (_, i) => i + 1).map((r) => (
                        <tr key={r}>
                          <th scope="row"><button className="cell" aria-label={`Ronda ${r} de ${ex.name}. Editar o quitar`} onClick={() => setRoundMenu({ itemId: ex.itemId, round: r })}>R{r}</button></th>
                          <td className="obj num">{fmtTargetShort(ex.target)}</td>
                          <td>{prev ? <Cell entry={at(prev, ex, r)} before={at(sessions[curIdx - 2], ex, r)} fields={fields} label={`${ex.name}, ronda ${r}, semana ${curIdx}`} onOpen={() => setCell({ sessionId: prev.id, ex, round: r })} /> : <span className="muted">—</span>}</td>
                          <td className="curcol"><Cell entry={at(cur, ex, r)} before={at(prev, ex, r)} fields={fields} empty="cargar" label={`${ex.name}, ronda ${r}, semana ${curIdx + 1}`} onOpen={() => setCell({ sessionId: cur.id, ex, round: r })} /></td>
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
              </tbody>
            </table>
          )}
          <p className="legend muted small"><span>▲ mejoró</span><span>= igual</span><span>▼ menos</span><span>cursiva = pendiente</span></p>
          {cur.note && <p className="card notebox">📝 <strong>Nota del entreno:</strong> {cur.note}</p>}
          <div className="row wrap gap-top">
            <button className="btn grow" onClick={() => setAdding(true)}><Icon name="plus" size={20} />Ejercicio</button>
            <button className="btn grow" onClick={() => setNote({ session: cur })}>📝 Nota del entreno</button>
            <Link className="btn grow" to={`/programa/rutina/${routineId}`}>Editar rutina</Link>
          </div>
          <div className="actionbar">
            <Link className="btn primary grow" to={`/sesion/${cur.id}`}>{cur.status === 'done' ? 'Seguir cargando' : cur.date === today ? 'Empezar' : `Cargar semana ${curIdx + 1}`}</Link>
          </div>
        </>
      )}

      {desktop && n > 0 && (
        <>
          <div className="tablewrap" role="region" aria-label="Grilla de semanas" tabIndex={0}>
            <table className="grid desk">
              <thead>
                <tr>
                  <th scope="col" className="sticky">Ejercicio</th><th scope="col">Ronda</th><th scope="col">Objetivo</th>
                  {sessions.map((s, i) => (
                    <th key={s.id} scope="col" className={colCls(s)}>
                      <div className="colwrap">
                        <button className="colhead" onClick={() => setWeekMenu(s.id)} aria-label={`Semana ${i + 1}, ${fmtDay(s.date)}, ${colState(s)}. Abrir acciones`}>
                          <span>Sem {i + 1}</span><span className="num small">{fmtDay(s.date)}</span>
                          <span className="colstate"><span className={'dot ' + (s.status === 'done' ? 'full' : '')} aria-hidden="true" />{colState(s)}{s.note ? ' 📝' : ''}</span>
                        </button>
                        <button className="minibtn hov" aria-label={`Quitar semana ${i + 1}`} title="Quitar semana" onClick={() => removeWk(s)}><Icon name="trash" size={18} /></button>
                      </div>
                    </th>
                  ))}
                  <th scope="col"><button className="btn compact" onClick={addWk}>＋ sem</button></th>
                </tr>
              </thead>
              {tree.flat.map((row, idx) => {
                  const { ex, block, pos } = row
                  const fields = fieldsFor(ex)
                  const best = bestEntry(history.filter((e) => e.exerciseId === ex.id), fields)
                  return (
                    <tbody key={ex.itemId} className="gx">
                      {(pos === 'single' || pos === 'first') && (
                        <tr className="restrow"><td colSpan={4 + n}><button onClick={() => setRestEdit(block)} title="Editar descanso">{block.kind === 'superset' ? 'Superserie · alternan · ' : ''}Rest {block.restLabel || '—'}</button></td></tr>
                      )}
                      {Array.from({ length: ex.rounds }, (_, i) => i + 1).map((r) => (
                        <tr key={r}>
                          {r === 1 && (
                            <th scope="rowgroup" rowSpan={ex.rounds} className="sticky gname">
                              <span className="pl-name">{ex.name} {ex.linkUrl && <button className="minibtn" aria-label={`Ver video de ${ex.name}`} title="Ver video" onClick={() => setLink(ex)}><Icon name="play" size={18} /></button>}</span>
                              {best && <span className="muted small num">Mejor: {fmtEntry(best, fields, true)}</span>}
                              {ex.note && <span className="small gnote">📝 {ex.note}</span>}
                              {actions(row, idx)}
                            </th>
                          )}
                          <td className="rnd">R{r} <button className="minibtn hov" aria-label={`Quitar ronda ${r} de ${ex.name}`} title="Quitar ronda" onClick={() => removeRnd(row, r)}><Icon name="trash" size={16} /></button></td>
                          <td className="obj num">{fmtTargetShort(ex.target)}</td>
                          {sessions.map((s, i) => (
                            <td key={s.id} className={colCls(s)}><Cell entry={at(s, ex, r)} before={at(sessions[i - 1], ex, r)} fields={fields} empty="·" label={`${ex.name}, ronda ${r}, semana ${i + 1}`} onOpen={() => setCell({ sessionId: s.id, ex, round: r })} /></td>
                          ))}
                          <td />
                        </tr>
                      ))}
                    </tbody>
                  )
              })}
              <tbody>
                <tr><td colSpan={4 + n} className="addrow"><button className="btn compact" onClick={() => setAdding(true)}>＋ Agregar ejercicio (biblioteca o nuevo)</button></td></tr>
              </tbody>
            </table>
          </div>
          <p className="legend muted small"><span>▲ mejoró</span><span>= igual</span><span>▼ menos que la semana anterior</span><span>cursiva = pendiente</span><span>Pasá el mouse por un ejercicio, una ronda o una semana para editar.</span></p>
          {sessions.filter((s) => s.note).map((s) => <p key={s.id} className="card notebox">📝 <strong>Nota del entreno · sem {wk(s)}:</strong> {s.note}</p>)}
        </>
      )}

      {cell && cellSession && cellRow && (
        <CellEditor title={`${cell.ex.name} · R${cell.round} · sem ${wk(cellSession)}`} ex={cellRow.ex} entry={at(cellSession, cell.ex, cell.round)}
          prefill={at(sessions[wk(cellSession) - 2], cell.ex, cell.round)} onClose={() => setCell(null)}
          onSave={(v, text) => { const old = at(cellSession, cell.ex, cell.round); return saveEntry(cellSession.id, cell.ex.id, cell.round, v, hasValues(v) && (!!old?.done || cellSession.date <= today), text) }} />
      )}

      {menuRow && (
        <Sheet title={menuRow.ex.name} onClose={() => setExMenu(null)}>
          <div className="menu">
            <button className="btn block" onClick={() => { setEditing(menuRow); setExMenu(null) }}><Icon name="edit" />Editar ejercicio (objetivo, descanso, video)</button>
            <button className="btn block" onClick={() => { void addRound(menuRow); setExMenu(null) }}><Icon name="plus" />Agregar ronda (R{menuRow.ex.rounds + 1})</button>
            <button className="btn block" onClick={() => { setNote({ row: menuRow }); setExMenu(null) }}><Icon name="note" />Nota del ejercicio</button>
            <div className="row">
              <button className="btn grow" disabled={tree.flat.indexOf(menuRow) === 0} onClick={() => move(menuRow, -1)}><Icon name="up" />Subir</button>
              <button className="btn grow" disabled={tree.flat.indexOf(menuRow) === tree.flat.length - 1} onClick={() => move(menuRow, 1)}><Icon name="down" />Bajar</button>
            </div>
            {menuRow.block.kind === 'superset'
              ? <button className="btn block" onClick={() => { void ungroupExercises(routineId, [menuRow.ex.itemId]); setExMenu(null) }}><Icon name="ungroup" />Sacar de la superserie</button>
              : <button className="btn block" disabled={tree.flat.length < 2} onClick={() => { setGrouping(menuRow); setExMenu(null) }}><Icon name="group" />Agrupar en superserie</button>}
            <button className="btn block danger" onClick={() => { setExMenu(null); void removeEx(menuRow) }}><Icon name="trash" />Quitar ejercicio</button>
          </div>
        </Sheet>
      )}
      {rndRow && roundMenu && (
        <Sheet title={`${rndRow.ex.name} · ronda ${roundMenu.round}`} onClose={() => setRoundMenu(null)}>
          <div className="menu">
            <button className="btn block" onClick={() => { setEditing(rndRow); setRoundMenu(null) }}><Icon name="edit" />Editar objetivo y descanso</button>
            <button className="btn block" onClick={() => { void addRound(rndRow); setRoundMenu(null) }}><Icon name="plus" />Agregar ronda (R{rndRow.ex.rounds + 1})</button>
            <button className="btn block danger" disabled={rndRow.ex.rounds <= 1} onClick={() => { const r = roundMenu.round; setRoundMenu(null); void removeRnd(rndRow, r) }}><Icon name="trash" />Quitar ronda {roundMenu.round}</button>
          </div>
        </Sheet>
      )}
      {menuSession && (
        <Sheet title={`Semana ${wk(menuSession)} · ${fmtDay(menuSession.date)}`} onClose={() => setWeekMenu(null)}>
          <div className="menu">
            <button className="btn block" onClick={() => { setWeekMenu(null); void addWk() }}><Icon name="plus" />Agregar semana {n + 1}</button>
            <button className="btn block" disabled={wk(menuSession) === 1} onClick={() => { setWeekMenu(null); void copyPrev(menuSession) }}><Icon name="copy" />Copiar valores de la semana anterior</button>
            <button className="btn block" onClick={() => { setNote({ session: menuSession }); setWeekMenu(null) }}><Icon name="note" />Nota del entreno</button>
            <a className="btn block" href={googleCalendarUrl(menuSession, cal)} target="_blank" rel="noopener noreferrer"><Icon name="calendar" />Crear evento en Google Calendar ({cal.time})</a>
            <div className="lbl">Cambiar fecha
              <DateField className="btn block" label="Fecha de la semana" value={menuSession.date}
                onChange={async (d) => { if ((await updateSession(menuSession.id, { date: d })) === 'taken') toast(`Esta rutina ya tiene una semana el ${fmtDay(d)}`) }} />
            </div>
            <button className="btn block" onClick={() => updateSession(menuSession.id, { status: menuSession.status === 'done' ? 'planned' : 'done' })}>
              {menuSession.status === 'done' ? 'Marcar como no entrenada' : 'Marcar como entrenada'}
            </button>
            <button className="btn block danger" onClick={() => { setWeekMenu(null); void removeWk(menuSession) }}><Icon name="trash" />Quitar semana {wk(menuSession)}</button>
          </div>
        </Sheet>
      )}
      {progMenu && (
        <Sheet title={`${wdShort(program.weekday)} · ${tree.routine.name}`} onClose={() => setProgMenu(false)}>
          <div className="menu">
            <Link className="btn block" to={`/programa/rutina/${routineId}`}><Icon name="edit" />Editar rutina</Link>
            <button className="btn block" onClick={() => { setProgMenu(false); void addWk() }}><Icon name="plus" />Agregar semana {n + 1}</button>
            <button className="btn block" onClick={() => { setProgMenu(false); setAdding(true) }}><Icon name="plus" />Agregar ejercicio</button>
            <button className="btn block" onClick={() => { downloadIcs(`ozo-${tree.routine.name}-${program.month}`, icsFile(sessions, cal)); setProgMenu(false); toast(`Archivo con ${n} ${n === 1 ? 'evento' : 'eventos'}: abrilo para sumarlos al calendario`) }}><Icon name="download" />Descargar eventos de todas las semanas (.ics)</button>
            <button className="btn block danger" onClick={() => { setProgMenu(false); void removeProgram() }}><Icon name="trash" />Borrar programa</button>
          </div>
        </Sheet>
      )}
      {grouping && (
        <Sheet title={`Agrupar ${grouping.ex.name} con…`} onClose={() => setGrouping(null)}>
          <p className="muted small">En una superserie se alternan por ronda (R1 de uno, R1 del otro, R2…). Queda así en todas las semanas.</p>
          <div className="menu">
            {tree.flat.filter((f) => f !== grouping).map((f) => (
              <button key={f.ex.itemId} className="btn block" onClick={async () => { const g = grouping; setGrouping(null); await groupExercises(routineId, [g.ex.itemId, f.ex.itemId]); toast('Agrupados en superserie') }}>{f.ex.name}</button>
            ))}
          </div>
        </Sheet>
      )}
      {restEdit && <NoteSheet title="Descanso" hint={'Texto libre: 3\'–5\', 4\', 60", Continue…'} value={restEdit.restLabel} onSave={(t) => setRest([restEdit.id], t)} onClose={() => setRestEdit(null)} />}
      {note && ('row' in note
        ? <NoteSheet title={`Nota de ${note.row.ex.name}`} hint="Vale para todas las semanas." value={note.row.ex.note} onSave={(t) => updateItems([note.row.ex.itemId], { note: t })} onClose={() => setNote(null)} />
        : <NoteSheet title={`Nota del entreno · sem ${wk(note.session)}`} value={note.session.note ?? ''} onSave={(t) => updateSession(note.session.id, { note: t })} onClose={() => setNote(null)} />)}
      {editing && <ExerciseEditor routineId={routineId} exercise={editing.ex} block={editing.block} onClose={() => setEditing(null)} />}
      {adding && <AddExerciseSheet tree={tree} onClose={() => setAdding(false)} />}
      {link && <LinkSheet url={link.linkUrl} title={link.name} onClose={() => setLink(null)} />}
    </main>
  )
}
