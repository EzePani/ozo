import { Fragment, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  deleteRoutine, duplicateItems, duplicateRoutine, groupExercises, linkAdjacent, loadRoutine, moveExercise, removeItems, setRest, splitBetween, ungroupExercises, updateItems, updateRoutine, useLive,
  type FlatRow, type RoutineTree, type Target,
} from '../data'
import { cap, fmtTarget } from '../lib'
import { Chip, Icon, NoteSheet, PageHead, Sheet, Stepper, confirmDialog, toast, toastUndo } from '../ui'
import { AddExerciseSheet, ExerciseEditor, TargetEditor, TypePicker, cleanTarget } from './ExerciseEditor'
import { LinkSheet } from '../LinkSheet'

function Row({ row, selecting, selected, onTap, onLongPress, onLink, onRest }: {
  row: FlatRow; selecting: boolean; selected: boolean; onTap: () => void; onLongPress: () => void; onLink: () => void; onRest: () => void
}) {
  const { ex, block, pos } = row
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex.itemId, disabled: selecting })
  const lp = useRef({ timer: 0, x: 0, y: 0, fired: false })
  const cancel = () => clearTimeout(lp.current.timer)
  useEffect(() => cancel, [])
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`exrow pos-${pos}` + (isDragging ? ' dragging' : '') + (selected ? ' selected' : '')}>
      {block.heading && (pos === 'single' || pos === 'first') && <div className="rowheading">{block.heading}</div>}
      {pos === 'first' && (
        <div className="blocktag"><span><Icon name="link" size={14} /> Superserie · alternan por ronda</span>
          <button className="pill rest" onClick={onRest} aria-label="Editar descanso de la superserie">{block.noRest ? '+ Descanso' : `Rest ${block.restLabel || '—'}`}</button></div>
      )}
      <div className="exrow-in">
        {selecting
          ? <span className="selmark" aria-hidden="true">{selected ? <Icon name="check" /> : null}</span>
          : <button className="iconbtn grip" aria-label={`Reordenar ${ex.name}`} {...attributes} {...listeners}><Icon name="grip" /></button>}
        <button className="exrow-main" aria-pressed={selecting ? selected : undefined}
          aria-label={selecting ? `${selected ? 'Quitar de' : 'Agregar a'} la selección: ${ex.name}` : undefined}
          onPointerDown={(e) => {
            lp.current = { x: e.clientX, y: e.clientY, fired: false, timer: window.setTimeout(() => { lp.current.fired = true; navigator.vibrate?.(15); onLongPress() }, 500) }
          }}
          onPointerMove={(e) => { if (Math.hypot(e.clientX - lp.current.x, e.clientY - lp.current.y) > 10) cancel() }}
          onPointerUp={cancel} onPointerCancel={cancel} onPointerLeave={cancel}
          onContextMenu={(e) => e.preventDefault()}
          onClick={() => { if (lp.current.fired) lp.current.fired = false; else onTap() }}>
          <span className="exrow-name">{ex.name} <Chip>{cap(ex.kind)}</Chip></span>
          <span className="muted">{ex.rounds} × {fmtTarget(ex.target)}</span>
          {ex.note && <span className="muted small">📝 {ex.note}</span>}
        </button>
        {!selecting && pos === 'single' && <span role="button" tabIndex={0} className="pill rest" onClick={onRest} onKeyDown={(e) => e.key === 'Enter' && onRest()} aria-label="Editar descanso">{block.noRest ? '+ Descanso' : `Rest ${block.restLabel || '—'}`}</span>}
        {!selecting && ex.linkUrl && <button className="iconbtn" aria-label={`Ver video de ${ex.name}`} onClick={onLink}><Icon name="play" /></button>}
      </div>
    </li>
  )
}

function BulkEdit({ ids, tree, onClose }: { ids: number[]; tree: RoutineTree; onClose: () => void }) {
  const [rounds, setRounds] = useState(3)
  const [target, setTarget] = useState<Target>({ type: 'range', min: 8, max: 12 })
  const [rest, setRestText] = useState('')
  const n = ids.length
  const done = () => toast(`Cambiado en ${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`)
  return (
    <Sheet title={`Cambiar ${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`} onClose={onClose} tall>
      <div className="form">
        <section className="lbl">Rondas
          <div className="row"><Stepper label="Rondas" value={rounds} onChange={setRounds} /><button className="btn grow" onClick={async () => { await updateItems(ids, { rounds }); done() }}>Aplicar rondas</button></div>
        </section>
        <section className="lbl">Objetivo
          <TargetEditor target={target} timeUnit="s" onChange={setTarget} />
          <button className="btn block" onClick={async () => { await updateItems(ids, { target: cleanTarget(target) }); done() }}>Aplicar objetivo</button>
        </section>
        <section className="lbl">Descanso (texto)
          <div className="row"><input className="input grow" value={rest} onChange={(e) => setRestText(e.target.value)} placeholder="3'–5', 4', Continue" maxLength={20} aria-label="Descanso" />
            <button className="btn" onClick={async () => { await setRest([...new Set(tree.flat.filter((f) => ids.includes(f.ex.itemId)).map((f) => f.block.id))], rest.trim()); done() }}>Aplicar</button></div>
        </section>
      </div>
    </Sheet>
  )
}

export default function RoutineEditor() {
  const routineId = Number(useParams().id)
  const nav = useNavigate()
  const tree = useLive(() => loadRoutine(routineId), [routineId])
  const [sel, setSel] = useState<Set<number> | null>(null)
  const [editing, setEditing] = useState<FlatRow | null>(null)
  const [adding, setAdding] = useState(false)
  const [bulk, setBulk] = useState(false)
  const [meta, setMeta] = useState(false)
  const [restOf, setRestOf] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [link, setLink] = useState<FlatRow | null>(null)
  const [optimistic, setOptimistic] = useState<number[] | null>(null)
  useEffect(() => setOptimistic(null), [tree])
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  if (tree === undefined) return <main className="page" aria-busy="true" />
  if (tree === null) return <main className="page"><PageHead title="Rutina" back="/programa" /><p>Esa rutina ya no existe.</p></main>

  const rows = optimistic ? optimistic.map((id) => tree.flat.find((f) => f.ex.itemId === id)!).filter(Boolean) : tree.flat
  const ids = sel ? [...sel] : []
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const canUngroup = tree.flat.some((f) => sel?.has(f.ex.itemId) && f.block.kind === 'superset')
  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const from = tree.flat.findIndex((f) => f.ex.itemId === active.id)
    const to = tree.flat.findIndex((f) => f.ex.itemId === over.id)
    setOptimistic(arrayMove(tree.flat.map((f) => f.ex.itemId), from, to))
    await moveExercise(routineId, active.id as number, to)
  }
  const act = async (fn: () => Promise<unknown>, msg?: string) => { if (!(await confirmDialog({ title: `${msg ?? 'Aplicar'} (${ids.length} ${ids.length === 1 ? 'ejercicio' : 'ejercicios'})`, ok: 'Confirmar' }))) return; await fn(); setSel(null); if (msg) toast(msg) }
  const remove = async () => {
    if (!(await confirmDialog({ title: `Quitar ${ids.length} ${ids.length === 1 ? 'ejercicio' : 'ejercicios'} de la rutina`, body: 'Siguen en la biblioteca y sus registros no se pierden.', ok: 'Quitar' }))) return
    const undo = await removeItems(routineId, ids)
    setSel(null)
    toastUndo(`${ids.length} ${ids.length === 1 ? 'ejercicio quitado' : 'ejercicios quitados'} de la rutina`, undo)
  }
  const removeRoutine = async () => {
    if (!(await confirmDialog({ title: `Borrar la rutina "${tree.routine.name}"`, body: 'Se quitan también sus programas y las semanas cargadas. Los ejercicios siguen en la biblioteca.', ok: 'Borrar rutina' }))) return
    const undo = await deleteRoutine(routineId)
    nav('/programa', { replace: true })
    toastUndo('Rutina borrada', undo)
  }

  return (
    <main className="page">
      <PageHead title={<>{tree.routine.name} <Chip>{tree.routine.type}</Chip></>} back="/programa">
        <button className="iconbtn" aria-label="Nombre, tipo y más acciones de la rutina" onClick={() => { setName(tree.routine.name); setMeta(true) }}><Icon name="more" /></button>
      </PageHead>
      {tree.flat.length === 0 && <div className="card empty"><p><strong>Esta rutina está vacía.</strong></p><p className="muted">Agregá el primer ejercicio.</p></div>}
      {tree.flat.length > 0 && !sel && <p className="muted small hint">Tocá un ejercicio para editarlo · <Icon name="link" size={14} /> entre dos ejercicios los une en superserie · arrastrá los puntos para reordenar. Vale para todas las semanas.</p>}
      {sel && <p className="hint" role="status"><strong>{ids.length} {ids.length === 1 ? 'seleccionado' : 'seleccionados'}</strong></p>}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.ex.itemId)} strategy={verticalListSortingStrategy}>
          <ul className="list tight">
            {rows.map((r, i) => {
              const next = rows[i + 1]
              const joined = !!next && next.block.id === r.block.id && r.block.kind === 'superset'
              return (
                <Fragment key={r.ex.itemId}>
                  <Row row={r} selecting={!!sel} selected={!!sel?.has(r.ex.itemId)}
                    onTap={() => (sel ? toggle(r.ex.itemId) : setEditing(r))}
                    onLongPress={() => setSel((s) => new Set(s ?? []).add(r.ex.itemId))}
                    onLink={() => setLink(r)} onRest={() => setRestOf(r.block.id)} />
                  {next && !sel && !optimistic && (
                    <li className={'seam' + (next.pos === 'single' || next.pos === 'first' ? ' gap' : '')}>
                      <button className={'seambtn' + (joined ? ' on' : '')} title={joined ? 'Separar' : 'Unir en superserie'}
                        aria-label={joined ? `Separar ${r.ex.name} de ${next.ex.name}` : `Unir ${r.ex.name} con ${next.ex.name} en superserie`}
                        onClick={async () => { if (!(await confirmDialog({ title: joined ? `Separar ${r.ex.name} de ${next.ex.name}` : `Unir ${r.ex.name} con ${next.ex.name} en superserie`, ok: joined ? 'Separar' : 'Unir' }))) return; if (joined) await splitBetween(routineId, r.ex.itemId, next.ex.itemId); else await linkAdjacent(routineId, r.ex.itemId, next.ex.itemId) }}>
                        <Icon name={joined ? 'unlink' : 'link'} size={16} />
                      </button>
                    </li>
                  )}
                </Fragment>
              )
            })}
          </ul>
        </SortableContext>
      </DndContext>

      {sel ? (
        <div className="actionbar selbar" role="toolbar" aria-label="Acciones de la selección">
          <button className="tool" disabled={ids.length < 2} onClick={() => act(() => groupExercises(routineId, ids), 'Agrupados en superserie')}><Icon name="group" />Agrupar</button>
          <button className="tool" disabled={!canUngroup} onClick={() => act(() => ungroupExercises(routineId, ids), 'Desagrupados')}><Icon name="ungroup" />Desagrupar</button>
          <button className="tool" disabled={!ids.length} onClick={() => setBulk(true)}><Icon name="edit" />Cambiar</button>
          <button className="tool" disabled={!ids.length} onClick={() => act(() => duplicateItems(routineId, ids), 'Duplicados')}><Icon name="copy" />Duplicar</button>
          <button className="tool" disabled={!ids.length} onClick={remove}><Icon name="trash" />Quitar</button>
          <button className="tool strong" onClick={() => setSel(null)}><Icon name="close" />Listo</button>
        </div>
      ) : (
        <div className="actionbar">
          <button className="btn primary grow" onClick={() => setAdding(true)}><Icon name="plus" />Ejercicio</button>
        </div>
      )}

      {meta && (
        <Sheet title="Rutina" onClose={() => setMeta(false)} tall>
          <form className="form" onSubmit={async (e) => { e.preventDefault(); if (name.trim()) { await updateRoutine(routineId, { name: name.trim() }); setMeta(false); toast('Nombre guardado') } }}>
            <label className="lbl">Nombre
              <div className="row"><input className="input grow" value={name} onChange={(e) => setName(e.target.value)} maxLength={30} /><button className="btn primary" disabled={!name.trim() || name.trim() === tree.routine.name}>Guardar</button></div>
            </label>
            <div className="lbl">Tipo<TypePicker value={tree.routine.type} onChange={async (type) => { if (type !== tree.routine.type && (await confirmDialog({ title: `Cambiar el tipo a "${type}"`, ok: 'Cambiar' }))) await updateRoutine(routineId, { type }) }} /></div>
          </form>
          <div className="mrows">
            {tree.flat.length > 0 && <button type="button" className="mrow" onClick={() => { setMeta(false); setSel(new Set()) }}><Icon name="select" size={20} />Seleccionar ejercicios</button>}
            <Link className="mrow" to={`/programa/nuevo?rutina=${routineId}`}><Icon name="calendar" size={20} />Programar en un mes</Link>
            <button type="button" className="mrow" onClick={async () => { if (!(await confirmDialog({ title: `Duplicar la rutina "${tree.routine.name}"`, ok: 'Duplicar' }))) return; const id = await duplicateRoutine(routineId); setMeta(false); if (id) { toast('Rutina duplicada'); nav(`/programa/rutina/${id}`) } }}><Icon name="copy" size={20} />Duplicar rutina</button>
            <button type="button" className="mrow danger" onClick={() => { setMeta(false); void removeRoutine() }}><Icon name="trash" size={20} />Borrar rutina</button>
          </div>
        </Sheet>
      )}
      {restOf != null && <NoteSheet title="Descanso" hint={'Texto libre: 3\'–5\', 4\', 60", Continue…'} value={tree.blocks.find((b) => b.id === restOf)?.restLabel ?? ''} onSave={(t) => setRest([restOf], t.trim())} onClose={() => setRestOf(null)} />}
      {editing && <ExerciseEditor routineId={routineId} exercise={editing.ex} block={editing.block} onClose={() => setEditing(null)} />}
      {adding && <AddExerciseSheet tree={tree} onClose={() => setAdding(false)} />}
      {bulk && <BulkEdit ids={ids} tree={tree} onClose={() => setBulk(false)} />}
      {link && <LinkSheet url={link.ex.linkUrl} title={link.ex.name} onClose={() => setLink(null)} />}
    </main>
  )
}
