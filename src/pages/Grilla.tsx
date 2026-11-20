import { Fragment, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  addWeek, bulkEditEntries, changeProgramStart, clearEntries, clearWeekData, changeProgramWeekday, copyPrevWeek, deleteProgram, getGoals, getHistory, getProgramCards, getSettings, duplicateRound, groupExercises, insertRound, loadProgram, loadRoutine, moveExercise, programHasData, removeItems, removeRound, setHeading, setRestRow,
  removeSession, roundHasData, saveEntry, sessionHasData, setRest, todayISO, ungroupExercises, updateItems, updateRoutine, updateSession, useLive,
  type Block, type BulkOp, type CellRef, type Entry, type Exercise, type Field, type FlatRow, type Session, type Target,
} from '../data'
import { FIELD_LABEL, bestEntry, cmpEntries, fieldsFor, fmtDay, fmtEntry, fmtTargetShort, hasValues, wdShort, WD_ORDER, WEEKDAYS } from '../lib'
import { Icon, NoteSheet, PageHead, Seg, Sheet, confirmDialog, toast, toastUndo, useIsDesktop } from '../ui'
import { CellEditor } from '../CellEditor'
import { LinkSheet } from '../LinkSheet'
import { downloadIcs, googleCalendarUrl, icsFile } from '../calendar'
import { AddExerciseSheet, ExerciseEditor, TargetEditor, cleanTarget } from './ExerciseEditor'

function Cell({ entry, before, fields, label, empty = '—', onOpen, onPick, picking, selected }: { entry?: Entry; before?: Entry; fields: Field[]; label: string; empty?: string; onOpen: () => void; onPick: () => void; picking: boolean; selected: boolean }) {
  const txt = fmtEntry(entry, fields)
  const c = entry?.done && hasValues(entry) && hasValues(before) ? cmpEntries(entry, before!, fields) : null
  const state = c == null ? '' : c > 0 ? 'mejoró' : c === 0 ? 'igual' : 'menos'
  return (
    <button className={'cell num' + (c == null ? '' : c > 0 ? ' up' : ' down') + (entry && !entry.done ? ' pending' : '') + (selected ? ' picked' : '')} aria-pressed={picking ? selected : undefined}
      onClick={(e) => (picking || e.shiftKey || e.metaKey || e.ctrlKey ? onPick() : onOpen())}
      aria-label={`${label}: ${txt === '—' ? 'sin dato' : txt}${state ? `, ${state} que la semana anterior` : ''}${entry && !entry.done && hasValues(entry) ? ', pendiente' : ''}${entry?.note ? ', con nota' : ''}. ${picking ? (selected ? 'Quitar de la selección' : 'Agregar a la selección') : 'Editar'}`}>
      {c != null && <span className="mark" aria-hidden="true">{c > 0 ? '▲' : c === 0 ? '=' : '▼'}</span>}
      {txt === '—' ? <span className="muted">{empty}</span> : txt}{entry?.note ? ' 📝' : ''}
    </button>
  )
}

/** Cambia a la vez el mismo valor (o suma una diferencia) en todas las celdas elegidas. */
function BulkCells({ fields, count, onApply, onClose }: { fields: Field[]; count: number; onApply: (op: BulkOp) => Promise<unknown>; onClose: () => void }) {
  const [mode, setMode] = useState<'set' | 'add'>('set')
  const [vals, setVals] = useState<Partial<Record<Field, string>>>({})
  const num = (v?: string) => { const n = parseFloat((v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : undefined }
  const op: BulkOp = { mode, weight: num(vals.weight), reps: num(vals.reps), durationSec: num(vals.duration), distance: num(vals.distance) }
  const any = [op.weight, op.reps, op.durationSec, op.distance].some((v) => v != null)
  const unit: Record<Field, string> = { weight: 'kg', reps: 'reps', duration: 'seg', distance: 'm' }
  return (
    <Sheet title={`Editar ${count} ${count === 1 ? 'celda' : 'celdas'}`} onClose={onClose}>
      <Seg<'set' | 'add'> label="Qué hacer con el valor" value={mode} onChange={setMode} options={[{ value: 'set', label: 'Poner este valor' }, { value: 'add', label: 'Sumar o restar' }]} />
      <p className="muted small">{mode === 'set' ? 'Lo que dejes vacío no se toca.' : 'Usá un número negativo para restar. Las celdas sin ese dato se saltean.'}</p>
      <div className="form">
        {fields.map((f) => (
          <label key={f} className="lbl">{FIELD_LABEL[f]} ({unit[f]})
            <input className="input num" inputMode="decimal" value={vals[f] ?? ''} onChange={(e) => setVals({ ...vals, [f]: e.target.value })} placeholder={mode === 'set' ? '—' : '+0'} />
          </label>
        ))}
      </div>
      <button className="btn primary block" disabled={!any} onClick={async () => { await onApply(op); onClose() }}>Aplicar a {count} {count === 1 ? 'celda' : 'celdas'}</button>
    </Sheet>
  )
}

function TargetSheet({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const [t, setT] = useState<Target>(ex.target)
  return (
    <Sheet title={`Objetivo · ${ex.name}`} onClose={onClose}>
      <p className="muted small">Vale para todas las rondas y semanas de este ejercicio.</p>
      <TargetEditor target={t} timeUnit={ex.timeUnit} onChange={setT} />
      <button className="btn primary block" onClick={async () => { await updateItems([ex.itemId], { target: cleanTarget(t) }); toast('Objetivo guardado'); onClose() }}>Guardar</button>
    </Sheet>
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
  const siblings = useLive(async () => {
    const all = await getProgramCards()
    const me = all.find((c) => c.program.id === programId)
    return me ? all.filter((c) => c.program.month === me.program.month) : []
  }, [programId])
  const [sel, setSel] = useState<number | null>(null)
  const [picked, setPicked] = useState<Set<string> | null>(null)
  const [bulkCells, setBulkCells] = useState(false)
  useEffect(() => { setSel(null); setPicked(null) }, [programId])
  const [cell, setCell] = useState<{ sessionId: number; ex: Exercise; round: number } | null>(null)
  const [exMenu, setExMenu] = useState<number | null>(null) // itemId
  const [roundMenu, setRoundMenu] = useState<{ itemId: number; round: number } | null>(null)
  const [weekMenu, setWeekMenu] = useState<number | null>(null)
  const [progMenu, setProgMenu] = useState(false)
  const [editing, setEditing] = useState<FlatRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [grouping, setGrouping] = useState<FlatRow | null>(null)
  const [targetEdit, setTargetEdit] = useState<Exercise | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [delOpen, setDelOpen] = useState(false)
  const [headEdit, setHeadEdit] = useState<Block | null>(null)
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
  const sure = (title: string, ok: string, body?: string) => confirmDialog({ title, body, ok })
  const removeRnd = async (row: FlatRow, round: number) => {
    if (row.ex.rounds <= 1) return toast('Tiene que quedar al menos una ronda')
    const data = await roundHasData(routineId, row.ex.id, round)
    if (!(await sure(`Quitar la ronda ${round} de ${row.ex.name}`, 'Quitar ronda', data ? 'Tiene datos cargados en alguna semana. Se quitan y las rondas siguientes se corren un lugar.' : 'Las rondas siguientes se corren un lugar.'))) return
    const undo = await removeRound(routineId, row.ex, round)
    if (undo) toastUndo(`Ronda ${round} quitada`, undo)
  }
  const removeEx = async (row: FlatRow) => {
    const data = await roundHasData(routineId, row.ex.id)
    if (!(await sure(`Quitar "${row.ex.name}" de la rutina`, 'Quitar', data ? 'Tiene datos cargados. Los registros no se pierden: quedan en el historial de la biblioteca.' : 'Se quita con todas sus rondas. El ejercicio sigue en la biblioteca.'))) return
    toastUndo(`${row.ex.name} quitado`, await removeItems(routineId, [row.ex.itemId]))
  }
  const dropHeading = async (block: Block) => (await sure('Quitar el separador', 'Quitar', 'Los ejercicios quedan en su lugar.')) && toastUndo('Separador quitado', await setHeading(block, ''))
  const dropRest = async (block: Block) => (await sure('Quitar el descanso', 'Quitar', 'El ejercicio queda con todas sus rondas.')) && toastUndo('Descanso quitado', await setRestRow(block, false))
  const move = async (row: FlatRow, d: number) => { if (await sure(`${d < 0 ? 'Subir' : 'Bajar'} ${row.ex.name}`, d < 0 ? 'Subir' : 'Bajar')) await moveExercise(routineId, row.ex.itemId, tree.flat.indexOf(row) + d) }
  const addWk = async () => { if (!(await sure(`Agregar la semana ${n + 1}`, 'Agregar'))) return; const id = await addWeek(programId); if (id) { setSel(id); toast(`Semana ${n + 1} agregada`) } }
  const removeWk = async (s: Session) => {
    if (!(await sure(`Quitar la semana ${wk(s)} (${fmtDay(s.date)})`, 'Quitar semana', (await sessionHasData(s.id)) ? 'Tiene datos cargados que se quitan con ella.' : undefined))) return
    const label = `Semana ${wk(s)} quitada`
    setSel(null)
    toastUndo(label, await removeSession(s.id))
  }
  const clearWk = async (s: Session) => {
    if (!(await sure(`Borrar los datos de la semana ${wk(s)}`, 'Borrar datos', `Se vacían los valores y notas cargados. La fecha (${fmtDay(s.date)}) y la columna se conservan.`))) return
    const { cleared, undo } = await clearWeekData(s.id)
    toastUndo(cleared ? `Datos de la semana ${wk(s)} borrados` : 'Esa semana no tenía datos cargados', undo)
  }
  const removeProgram = async () => {
    if (!(await sure('Borrar este programa', 'Borrar programa', `Se quitan sus ${n} semanas${(await programHasData(programId)) ? ' con los datos cargados' : ''}. La rutina "${tree.routine.name}" y la biblioteca no se tocan.`))) return
    const undo = await deleteProgram(programId)
    nav(`/programa?m=${program.month}`, { replace: true })
    toastUndo('Programa borrado', undo)
  }
  const moveStart = async (iso: string) => {
    if (!(await sure(`Empezar el programa el ${fmtDay(iso)}`, 'Mover', 'La primera semana pasa a esa fecha y las demás la siguen cada 7 días.'))) return
    const r = await changeProgramStart(programId, iso); setProgMenu(false)
    if (r === 'taken') return toast('Esta rutina ya tiene semanas en esas fechas')
    toast(`Ahora empieza el ${fmtDay(iso)}`)
  }
  const copyPrev = async (s: Session) => { if (!(await sure(`Copiar los valores de la semana ${wk(s) - 1} a la ${wk(s)}`, 'Copiar', 'No pisa lo que ya cargaste.'))) return; const c = await copyPrevWeek(s.id); toast(c ? `${c} ${c === 1 ? 'valor copiado' : 'valores copiados'}: quedan pendientes hasta que los confirmes` : 'No había nada para copiar') }
  // ---------- selección de varias celdas ----------
  const ckey = (sid: number, exId: number, r: number) => `${sid}-${exId}-${r}`
  const toggleCell = (sid: number, exId: number, r: number) => setPicked((p) => { const n = new Set(p ?? []); const k = ckey(sid, exId, r); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const allRefs = (): CellRef[] => sessions.flatMap((s) => tree.flat.flatMap((f) => Array.from({ length: f.ex.rounds }, (_, i) => ({ sessionId: s.id, exerciseId: f.ex.id, round: i + 1 }))))
  const addRefs = (refs: CellRef[]) => setPicked((p) => {
    const n = new Set(p ?? []); const ks = refs.map((c) => ckey(c.sessionId, c.exerciseId, c.round))
    if (ks.every((k) => n.has(k))) ks.forEach((k) => n.delete(k)); else ks.forEach((k) => n.add(k))
    return n
  })
  const rowRefs = (ex: Exercise, r: number): CellRef[] => sessions.map((s) => ({ sessionId: s.id, exerciseId: ex.id, round: r }))
  const colRefs = (s: Session): CellRef[] => allRefs().filter((c) => c.sessionId === s.id)
  const pickedRefs = (): CellRef[] => allRefs().filter((c) => picked?.has(ckey(c.sessionId, c.exerciseId, c.round)))
  const pickedFields = (): Field[] => {
    const ids = new Set(pickedRefs().map((c) => c.exerciseId))
    return [...new Set(tree.flat.filter((f) => ids.has(f.ex.id)).flatMap((f) => fieldsFor(f.ex)))]
  }
  const pk = (s: Session | undefined, ex: Exercise, r: number) => ({
    picking: picked != null, selected: !!s && !!picked?.has(ckey(s.id, ex.id, r)),
    onPick: () => s && toggleCell(s.id, ex.id, r),
    onOpen: () => s && setCell({ sessionId: s.id, ex, round: r }),
  })
  const applyBulk = async (op: BulkOp) => {
    const refs = pickedRefs()
    if (!(await sure(`${op.mode === 'add' ? 'Sumar o restar' : 'Poner'} el valor en ${refs.length} ${refs.length === 1 ? 'celda' : 'celdas'}`, 'Aplicar'))) return
    const { changed, undo } = await bulkEditEntries(refs, op, today)
    toastUndo(changed ? `${changed} ${changed === 1 ? 'celda cambiada' : 'celdas cambiadas'}` : 'No había celdas a las que aplicarlo', undo)
  }
  const clearBulk = async () => {
    const refs = pickedRefs()
    if (!(await sure(`Vaciar ${refs.length} ${refs.length === 1 ? 'celda' : 'celdas'}`, 'Vaciar', 'Se borran sus valores y notas.'))) return
    const { cleared, undo } = await clearEntries(refs)
    toastUndo(`${cleared} ${cleared === 1 ? 'celda vaciada' : 'celdas vaciadas'}`, undo)
    setPicked(null)
  }
  const colState = (s: Session) => (s.date === today ? 'Hoy' : s.status === 'done' ? 'hecha' : 'plan')
  const colCls = (s: Session) => (s.status === 'planned' ? 'planned' : 'done') + (s.date === today ? ' today' : '')

  const menuRow = rowOf(exMenu)
  const rndRow = rowOf(roundMenu?.itemId)
  const menuSession = sessions.find((s) => s.id === weekMenu)
  const cellSession = sessions.find((s) => s.id === cell?.sessionId)
  const cellRow = cell && tree.flat.find((f) => f.ex.id === cell.ex.id)

  const dupRound = async (row: FlatRow, round: number) => { if (!(await sure(`Duplicar la ronda ${round} de ${row.ex.name}`, 'Duplicar', 'Se copia con sus valores en todas las semanas.'))) return; if (await duplicateRound(routineId, row.ex, round)) toast(`Ronda ${round} duplicada`); else toast('Máximo 20 rondas') }
  const insertAt = async (row: FlatRow, at: number) => { if (!(await sure(`Insertar una ronda en ${row.ex.name}`, 'Insertar'))) return; if (!(await insertRound(routineId, row.ex, at))) toast('Máximo 20 rondas') }

  return (
    <main className={'page' + (desktop ? ' wide' : '')}>
      <PageHead title={<button className="titlebtn" title="Cambiar el nombre de la rutina" aria-label={`${wdShort(program.weekday)} · ${tree.routine.name}. Cambiar el nombre`} onClick={() => setRenaming(true)}>{wdShort(program.weekday)} · {tree.routine.name}<Icon name="edit" size={16} /></button>} back={`/programa?m=${program.month}`}>
        <div className="hactions">
          {desktop && cur && <Link className="hbtn primary" to={`/sesion/${cur.id}`}><Icon name="play" size={18} />Cargar semana {curIdx + 1}</Link>}
          {desktop && <Link className="hbtn" to={`/programa/rutina/${routineId}`}><Icon name="edit" size={18} />Editar rutina</Link>}
          {desktop && n > 0 && tree.flat.length > 0 && (
            <button className={'hbtn' + (picked ? ' primary' : '')} aria-pressed={picked != null} title="Seleccionar celdas para editarlas juntas" onClick={() => setPicked(picked ? null : new Set())}>
              <Icon name={picked ? 'check' : 'select'} size={18} /><span className="hlabel">{picked ? 'Listo' : 'Seleccionar'}</span>
            </button>
          )}
          <button className="hbtn icon" aria-label="Más acciones del programa" title="Más acciones" onClick={() => setProgMenu(true)}><Icon name="more" size={20} /></button>
        </div>
      </PageHead>
      {siblings && siblings.length > 1 && (
        <nav className="progtabs" aria-label="Programas de este mes">
          {siblings.map((c) => (
            <button key={c.program.id} className="progtab" aria-current={c.program.id === programId ? 'page' : undefined}
              onClick={() => c.program.id !== programId && nav(`/programa/${c.program.id}`, { replace: true })}>
              <strong>{wdShort(c.program.weekday)}</strong> {c.routine.name}
            </button>
          ))}
          <Link className="progtab add" to={`/programa/nuevo?m=${program.month}`} aria-label="Nuevo programa"><Icon name="plus" size={16} /></Link>
        </nav>
      )}
      {goal && <p className="hint">🎯 {goal.text}</p>}

      {n === 0 && <div className="card empty"><p><strong>Este programa no tiene semanas.</strong></p><button className="btn primary" onClick={addWk}>Agregar semana</button></div>}
      {tree.flat.length === 0 && <div className="card empty"><p><strong>La rutina está vacía.</strong></p><p className="muted">Agregá el primer ejercicio, de la biblioteca o nuevo.</p></div>}

      {!desktop && cur && (
        <>
          <div className="monthnav">
            <button className="iconbtn" aria-label="Semana anterior" disabled={curIdx === 0} onClick={() => setSel(sessions[curIdx - 1].id)}><Icon name="back" /></button>
            <button className="weeklabel weekbtn" aria-live="polite" aria-label={`Semana ${curIdx + 1} de ${n}, ${fmtDay(cur.date)}, ${colState(cur)}. Abrir acciones de la semana`} onClick={() => setWeekMenu(cur.id)}>
              <strong>Semana {curIdx + 1} de {n} ▾</strong>
              <span className="num small muted">{fmtDay(cur.date)}</span>
              <span className={'badge ' + (cur.date === today ? 'now' : cur.status === 'done' ? 'ok' : 'plan')}>{cur.date === today ? 'Hoy' : cur.status === 'done' ? 'Hecha' : 'Plan'}{cur.note ? ' · nota' : ''}</span>
            </button>
            {curIdx === n - 1
              ? <button className="addweekbtn" aria-label={`Agregar la semana ${n + 1}`} onClick={addWk}><Icon name="plus" size={16} />Semana</button>
              : <button className="iconbtn" aria-label="Semana siguiente" onClick={() => setSel(sessions[curIdx + 1].id)}><Icon name="next" /></button>}
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
                      {(pos === 'single' || pos === 'first') && block.heading && <tr className="headrow"><td colSpan={4}><button onClick={() => setHeadEdit(block)}>{block.heading}</button></td></tr>}
                      <tr className="exbar">
                        <td colSpan={4}>
                          <div className="exbar-in">
                            <button className="exbar-main" onClick={() => setExMenu(ex.itemId)} aria-label={`${ex.name}. Abrir acciones del ejercicio`}>
                              {pos !== 'single' && <span className="pl-block">SUPERSERIE · alterna</span>}
                              <span className="exbar-name">{ex.name}</span>
                            </button>
                            <div className="xacts">
                              {ex.linkUrl && <button className="iconbtn" aria-label={`Ver video de ${ex.name}`} onClick={() => setLink(ex)}><Icon name="play" /></button>}
                              {ex.note && <button className="iconbtn" aria-label={`Nota de ${ex.name}: ${ex.note}`} title={ex.note} onClick={() => setNote({ row })}><Icon name="note" /></button>}
                              <button className="iconbtn" aria-label={`Acciones de ${ex.name}`} onClick={() => setExMenu(ex.itemId)}><Icon name="more" /></button>
                            </div>
                            {(pos === 'single' || pos === 'first') && !block.noRest && (
                              <button className="pill rest exrest" onClick={() => setRestEdit(block)} aria-label={`Descanso: ${block.restLabel || 'sin definir'}. Editar`}>{block.restLabel ? `Rest ${block.restLabel}` : '+ Rest'}</button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {Array.from({ length: ex.rounds }, (_, i) => i + 1).map((r) => (
                        <tr key={r}>
                          <th scope="row"><button className="cell" aria-label={`Ronda ${r} de ${ex.name}. Editar o quitar`} onClick={() => (picked ? addRefs(rowRefs(ex, r)) : setRoundMenu({ itemId: ex.itemId, round: r }))}>R{r}</button></th>
                          <td className="obj num"><button className="cell objbtn" aria-label={`Objetivo de ${ex.name}: ${fmtTargetShort(ex.target)}. Editar`} title="Editar objetivo (vale para todas las rondas)" onClick={() => setTargetEdit(ex)}>{fmtTargetShort(ex.target)}</button></td>
                          <td>{prev ? <Cell entry={at(prev, ex, r)} before={at(sessions[curIdx - 2], ex, r)} fields={fields} label={`${ex.name}, ronda ${r}, semana ${curIdx}`} {...pk(prev, ex, r)} /> : <span className="muted">—</span>}</td>
                          <td className="curcol"><Cell entry={at(cur, ex, r)} before={at(prev, ex, r)} fields={fields} empty="cargar" label={`${ex.name}, ronda ${r}, semana ${curIdx + 1}`} {...pk(cur, ex, r)} /></td>
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
          {!picked && <div className="actionbar">
            <Link className="btn primary grow" to={`/sesion/${cur.id}`}>{cur.status === 'done' ? 'Seguir cargando' : cur.date === today ? 'Empezar' : `Cargar semana ${curIdx + 1}`}</Link>
          </div>}
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
                        <button className="colhead" onClick={() => (picked ? addRefs(colRefs(s)) : setWeekMenu(s.id))} aria-label={`Semana ${i + 1}, ${fmtDay(s.date)}, ${colState(s)}. ${picked ? 'Seleccionar toda la semana' : 'Abrir acciones'}`}>
                          <span className="colkicker">Semana {i + 1}</span>
                          <span className="colday num">{fmtDay(s.date)}</span>
                          <span className={'badge ' + (s.date === today ? 'now' : s.status === 'done' ? 'ok' : 'plan')}>{s.date === today ? 'Hoy' : s.status === 'done' ? <><Icon name="check" size={12} />Hecha</> : 'Plan'}{s.note ? <Icon name="note" size={12} /> : null}</span>
                        </button>
                        <button className="ghost danger hov colx" aria-label={`Quitar semana ${i + 1}`} title="Quitar semana" onClick={() => removeWk(s)}><Icon name="close" size={14} /></button>
                      </div>
                    </th>
                  ))}
                  <th scope="col" className="addcol"><button className="addwk" onClick={addWk} aria-label={`Agregar semana ${n + 1}`}><Icon name="plus" size={18} />Semana</button></th>
                </tr>
              </thead>
              {tree.flat.map((row) => {
                  const { ex, block, pos } = row
                  const fields = fieldsFor(ex)
                  const best = bestEntry(history.filter((e) => e.exerciseId === ex.id), fields)
                  return (
                    <tbody key={ex.itemId} className="gx">
                      {(pos === 'single' || pos === 'first') && block.heading && (
                        <tr className="headrow"><td colSpan={4 + n}><div className="restin"><button onClick={() => setHeadEdit(block)} title="Editar título del separador">{block.heading}</button>
                          <button className="ghost danger rowx hov" aria-label="Quitar el separador" title="Quitar el separador (los ejercicios quedan)" onClick={() => dropHeading(block)}><Icon name="close" size={16} /></button></div></td></tr>
                      )}
                      {(pos === 'single' || pos === 'first') && !block.noRest && (
                        <tr className="restrow"><td colSpan={4 + n}><div className="restin"><button onClick={() => setRestEdit(block)} title="Editar descanso">{block.kind === 'superset' ? 'Superserie · alternan · ' : ''}Rest {block.restLabel || '—'}</button>
                          <button className="ghost danger rowx hov" aria-label="Quitar solo la fila de descanso" title="Quitar el descanso (el ejercicio queda)" onClick={() => dropRest(block)}><Icon name="close" size={16} /></button></div></td></tr>
                      )}
                      {Array.from({ length: ex.rounds }, (_, i) => i + 1).map((r) => (
                        <tr key={r}>
                          {r === 1 && (
                            <th scope="rowgroup" rowSpan={ex.rounds} className="sticky gname" onContextMenu={(e) => { e.preventDefault(); setExMenu(ex.itemId) }}>
                              <div className="gname-in">
                                <div className="gname-txt">
                                  <span className="pl-name">{ex.name}</span>
                                  {best && <span className="muted small num">Mejor: {fmtEntry(best, fields, true)}</span>}
                                </div>
                                <div className="xacts">
                                  {ex.linkUrl && <button className="ghost" aria-label={`Ver video de ${ex.name}`} title="Ver video" onClick={() => setLink(ex)}><Icon name="play" size={18} /></button>}
                                  {ex.note && <button className="ghost" aria-label={`Nota de ${ex.name}: ${ex.note}`} title={ex.note} onClick={() => setNote({ row })}><Icon name="note" size={18} /></button>}
                                  <button className="ghost" aria-label={`Acciones de ${ex.name}`} title="Más acciones" onClick={() => setExMenu(ex.itemId)}><Icon name="more" size={20} /></button>
                                </div>
                              </div>
                            </th>
                          )}
                          <td className={'rnd' + (picked ? ' pickable' : '')} onClick={() => picked && addRefs(rowRefs(ex, r))} onContextMenu={(e) => { e.preventDefault(); setRoundMenu({ itemId: ex.itemId, round: r }) }}>
                            <div className="rwrap"><span className="rn">R{r}</span>
                            <span className="rctl hov">
                              <button className="ghost" aria-label={`Insertar ronda debajo de R${r} en ${ex.name}`} title="Insertar ronda debajo" onClick={() => insertAt(row, r + 1)}><Icon name="plus" size={16} /></button>
                              <button className="ghost" aria-label={`Duplicar ronda ${r} de ${ex.name}`} title="Duplicar ronda con sus valores" onClick={() => dupRound(row, r)}><Icon name="copy" size={16} /></button>
                              <button className="ghost danger" aria-label={`Quitar ronda ${r} de ${ex.name}`} title="Quitar ronda" disabled={ex.rounds <= 1} onClick={() => removeRnd(row, r)}><Icon name="close" size={16} /></button>
                            </span></div>
                          </td>
                          <td className="obj num"><button className="cell objbtn" aria-label={`Objetivo de ${ex.name}: ${fmtTargetShort(ex.target)}. Editar`} title="Editar objetivo (vale para todas las rondas)" onClick={() => setTargetEdit(ex)}>{fmtTargetShort(ex.target)}</button></td>
                          {sessions.map((s, i) => (
                            <td key={s.id} className={colCls(s)}><Cell entry={at(s, ex, r)} before={at(sessions[i - 1], ex, r)} fields={fields} empty="·" label={`${ex.name}, ronda ${r}, semana ${i + 1}`} {...pk(s, ex, r)} /></td>
                          ))}
                          <td />
                        </tr>
                      ))}
                    </tbody>
                  )
              })}
              <tbody>
                <tr><td colSpan={4 + n} className="addrow"><button className="addex" onClick={() => setAdding(true)}><Icon name="plus" size={18} />Agregar ejercicio</button></td></tr>
              </tbody>
            </table>
          </div>
          <p className="legend muted small"><span>▲ mejoró</span><span>= igual</span><span>▼ menos que la semana anterior</span><span>cursiva = pendiente</span><span>Pasá el mouse por una fila para insertar o quitar rondas. Clic derecho en un ejercicio o una ronda abre más opciones.</span></p>
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
          <div className="mrows">
            <button className="mrow" onClick={() => { setEditing(menuRow); setExMenu(null) }}><Icon name="edit" size={20} />Editar ejercicio</button>
            <button className="mrow" onClick={() => { setNote({ row: menuRow }); setExMenu(null) }}><Icon name="note" size={20} />Nota del ejercicio</button>
            <button className="mrow" onClick={() => { void insertAt(menuRow, menuRow.ex.rounds + 1); setExMenu(null) }}><Icon name="plus" size={20} />Agregar ronda (R{menuRow.ex.rounds + 1})</button>
            {(menuRow.pos === 'single' || menuRow.pos === 'first') && (
              <button className="mrow" onClick={() => { setHeadEdit(menuRow.block); setExMenu(null) }}><Icon name="plus" size={20} />{menuRow.block.heading ? 'Editar separador de arriba' : 'Agregar separador arriba'}</button>
            )}
            {menuRow.block.noRest
              ? <button className="mrow" onClick={() => { setRestEdit({ ...menuRow.block, restLabel: '' }); setExMenu(null) }}><Icon name="timer" size={20} />Agregar descanso</button>
              : <button className="mrow" onClick={() => { void dropRest(menuRow.block); setExMenu(null) }}><Icon name="close" size={20} />Quitar descanso</button>}
            <button className="mrow" disabled={tree.flat.indexOf(menuRow) === 0} onClick={() => move(menuRow, -1)}><Icon name="up" size={20} />Subir</button>
            <button className="mrow" disabled={tree.flat.indexOf(menuRow) === tree.flat.length - 1} onClick={() => move(menuRow, 1)}><Icon name="down" size={20} />Bajar</button>
            {menuRow.block.kind === 'superset'
              ? <button className="mrow" onClick={async () => { setExMenu(null); if (await sure(`Sacar ${menuRow.ex.name} de la superserie`, 'Sacar')) await ungroupExercises(routineId, [menuRow.ex.itemId]) }}><Icon name="ungroup" size={20} />Sacar de la superserie</button>
              : <button className="mrow" disabled={tree.flat.length < 2} onClick={() => { setGrouping(menuRow); setExMenu(null) }}><Icon name="group" size={20} />Agrupar en superserie</button>}
            <button className="mrow danger" onClick={() => { setExMenu(null); void removeEx(menuRow) }}><Icon name="trash" size={20} />Quitar ejercicio</button>
          </div>
        </Sheet>
      )}
      {rndRow && roundMenu && (
        <Sheet title={`${rndRow.ex.name} · ronda ${roundMenu.round}`} onClose={() => setRoundMenu(null)}>
          <div className="mrows">
            <button className="mrow" onClick={() => { setEditing(rndRow); setRoundMenu(null) }}><Icon name="edit" size={20} />Editar objetivo y descanso</button>
            <button className="mrow" onClick={() => { const r = roundMenu.round; setRoundMenu(null); void dupRound(rndRow, r) }}><Icon name="copy" size={20} />Duplicar ronda {roundMenu.round} (con valores)</button>
            <button className="mrow" onClick={() => { const r = roundMenu.round; setRoundMenu(null); void insertAt(rndRow, r) }}><Icon name="up" size={20} />Insertar ronda arriba</button>
            <button className="mrow" onClick={() => { const r = roundMenu.round; setRoundMenu(null); void insertAt(rndRow, r + 1) }}><Icon name="down" size={20} />Insertar ronda abajo</button>
            <button className="mrow danger" disabled={rndRow.ex.rounds <= 1} onClick={() => { const r = roundMenu.round; setRoundMenu(null); void removeRnd(rndRow, r) }}><Icon name="trash" size={20} />Quitar ronda {roundMenu.round}</button>
          </div>
        </Sheet>
      )}
      {menuSession && (
        <Sheet title={`Semana ${wk(menuSession)} · ${fmtDay(menuSession.date)}`} onClose={() => { setWeekMenu(null); setDelOpen(false) }}>
          <div className="mrows first">
            <label className="mrow switchrow">
              <Icon name="check" size={20} />
              <span>Entrenada</span>
              <input type="checkbox" role="switch" className="switch" checked={menuSession.status === 'done'}
                onChange={async (e) => { const v = e.target.checked ? 'done' : 'planned'; if (await sure(v === 'done' ? `Marcar la semana ${wk(menuSession)} como entrenada` : `Marcar la semana ${wk(menuSession)} como no entrenada`, 'Confirmar')) await updateSession(menuSession.id, { status: v }) }} />
            </label>
            <label className="mrow daterow">
              <Icon name="calendar" size={20} />
              <span>Fecha</span>
              <span className="mval">{fmtDay(menuSession.date)} ›</span>
              <input type="date" className="dateover" aria-label={`Fecha de la semana: ${fmtDay(menuSession.date)}`} value={menuSession.date}
                onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* sin soporte */ } }}
                onChange={async (e) => { const d = e.target.value; if (!d) return; if (!(await sure(`Mover la semana ${wk(menuSession)} al ${fmtDay(d)}`, 'Mover'))) return; if ((await updateSession(menuSession.id, { date: d })) === 'taken') toast(`Esta rutina ya tiene una semana el ${fmtDay(d)}`) }} />
            </label>
            <button className="mrow" onClick={() => { setNote({ session: menuSession }); setWeekMenu(null) }}><Icon name="note" size={20} /><span>Nota del entreno</span><span className="mval">{menuSession.note ? 'Editar ›' : '›'}</span></button>
            <button className="mrow" disabled={wk(menuSession) === 1} onClick={() => { setWeekMenu(null); void copyPrev(menuSession) }}><Icon name="copy" size={20} /><span>Copiar de la semana anterior</span></button>
            <a className="mrow" href={googleCalendarUrl(menuSession, cal)} target="_blank" rel="noopener noreferrer"><Icon name="calendar" size={20} /><span>Agregar al calendario</span><span className="mval">{cal.time}</span></a>
            <button className="mrow danger" aria-expanded={delOpen} onClick={() => setDelOpen(!delOpen)}><Icon name="trash" size={20} /><span>Borrar…</span><span className="mval">{delOpen ? '▴' : '▾'}</span></button>
            {delOpen && (
              <>
                <button className="mrow warn sub" onClick={() => { setWeekMenu(null); setDelOpen(false); void clearWk(menuSession) }}><Icon name="close" size={20} /><span>Borrar datos cargados<small>Queda la columna y la fecha</small></span></button>
                <button className="mrow danger sub" onClick={() => { setWeekMenu(null); setDelOpen(false); void removeWk(menuSession) }}><Icon name="trash" size={20} /><span>Quitar la semana {wk(menuSession)}<small>Borra la columna entera</small></span></button>
              </>
            )}
          </div>
        </Sheet>
      )}
      {progMenu && (
        <Sheet title={`${wdShort(program.weekday)} · ${tree.routine.name}`} onClose={() => setProgMenu(false)}>
          <div className="setrow">
            <span className="setlabel">Día</span>
            <div className="wdstrip" role="group" aria-label="Día de la semana">
              {WD_ORDER.map((d) => <button key={d} aria-pressed={program.weekday === d} aria-label={WEEKDAYS[d]} onClick={async () => {
                if (d === program.weekday) return
                if (!(await sure(`Cambiar el día a ${WEEKDAYS[d].toLowerCase()}`, 'Cambiar', 'Se mueven todas las semanas del programa.'))) return
                const r = await changeProgramWeekday(programId, d); setProgMenu(false)
                toast(r === 'taken' ? 'Esta rutina ya tiene una semana en alguna de esas fechas' : `Ahora es ${WEEKDAYS[d].toLowerCase()}: se movieron las ${n} semanas`)
              }}>{wdShort(d)}</button>)}
            </div>
          </div>
          <div className="mrows first">
            <label className="mrow daterow">
              <Icon name="calendar" size={20} />
              <span>Empieza el</span>
              <span className="mval">{fmtDay(sessions[0]?.date ?? today)} ›</span>
              <input type="date" className="dateover" aria-label={`Fecha de inicio del programa: ${fmtDay(sessions[0]?.date ?? today)}`} value={sessions[0]?.date ?? today}
                onClick={(e) => { try { e.currentTarget.showPicker() } catch { /* sin soporte */ } }}
                onChange={(e) => e.target.value && void moveStart(e.target.value)} />
            </label>
            {n > 0 && tree.flat.length > 0 && <button className="mrow" onClick={() => { setProgMenu(false); setPicked(new Set()) }}><Icon name="select" size={20} />Seleccionar celdas</button>}
            <Link className="mrow" to={`/programa/rutina/${routineId}`}><Icon name="edit" size={20} />Editar rutina</Link>
            <button className="mrow" onClick={() => { downloadIcs(`ozo-${tree.routine.name}-${program.month}`, icsFile(sessions, cal)); setProgMenu(false); toast(`Archivo con ${n} ${n === 1 ? 'evento' : 'eventos'}: abrilo para sumarlos al calendario`) }}><Icon name="download" size={20} />Calendario de todas las semanas (.ics)</button>
            <button className="mrow danger" onClick={() => { setProgMenu(false); void removeProgram() }}><Icon name="trash" size={20} />Borrar programa</button>
          </div>
        </Sheet>
      )}
      {grouping && (
        <Sheet title={`Agrupar ${grouping.ex.name} con…`} onClose={() => setGrouping(null)}>
          <p className="muted small">En una superserie se alternan por ronda (R1 de uno, R1 del otro, R2…). Queda así en todas las semanas.</p>
          <div className="menu">
            {tree.flat.filter((f) => f !== grouping).map((f) => (
              <button key={f.ex.itemId} className="btn block" onClick={async () => { const g = grouping; setGrouping(null); if (!(await sure(`Unir ${g.ex.name} con ${f.ex.name} en superserie`, 'Unir'))) return; await groupExercises(routineId, [g.ex.itemId, f.ex.itemId]); toast('Agrupados en superserie') }}>{f.ex.name}</button>
            ))}
          </div>
        </Sheet>
      )}
      {picked && (
        <div className="actionbar pickbar" role="toolbar" aria-label="Acciones de las celdas seleccionadas">
          <span className="pickcount" role="status">{picked.size} {picked.size === 1 ? 'celda' : 'celdas'}</span>
          <button className="tool" onClick={() => setPicked(new Set(allRefs().map((c) => ckey(c.sessionId, c.exerciseId, c.round))))}><Icon name="select" />Todas</button>
          <button className="tool" disabled={!picked.size} onClick={() => setBulkCells(true)}><Icon name="edit" />Editar</button>
          <button className="tool" disabled={!picked.size} onClick={clearBulk}><Icon name="trash" />Vaciar</button>
          <button className="tool strong" onClick={() => setPicked(null)}><Icon name="close" />Listo</button>
        </div>
      )}
      {bulkCells && picked && <BulkCells fields={pickedFields()} count={picked.size} onApply={applyBulk} onClose={() => setBulkCells(false)} />}
      {targetEdit && <TargetSheet ex={targetEdit} onClose={() => setTargetEdit(null)} />}
      {renaming && <NoteSheet title="Nombre de la rutina" hint="Cambia el nombre en todos los programas de esta rutina." value={tree.routine.name} onSave={async (t) => { if (t.trim()) { await updateRoutine(routineId, { name: t.trim() }); toast('Nombre guardado') } }} onClose={() => setRenaming(false)} />}
      {headEdit && <NoteSheet title="Separador" hint="Un título que divide la rutina, por ejemplo: Bloque A, Calentamiento, Superseries. Vacío lo quita." value={headEdit.heading ?? ''} onSave={(t) => setHeading(headEdit, t)} onClose={() => setHeadEdit(null)} />}
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
