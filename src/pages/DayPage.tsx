import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, pointerWithin, useDroppable, useSensor, useSensors,
  type CollisionDetection, type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  db, deleteExercises, duplicateExercises, groupExercises, loadDay, moveExercise, moveExercisesToDay, ungroupExercises,
  type Day, type DayTree, type FlatRow, type Target, type TimeUnit,
} from '../db'
import { cap, fmtTarget } from '../lib'
import { Chip, Icon, Seg, Sheet, Stepper, confirmDialog, toast } from '../ui'
import { DayForm } from './Home'
import { ExerciseEditor, KindPicker, TargetEditor, cleanTarget } from './ExerciseEditor'
import { LinkSheet } from '../LinkSheet'
import Planilla from './Planilla'

const isDayDrop = (id: unknown) => typeof id === 'string' && id.startsWith('d-')
const collision: CollisionDetection = (args) => {
  const onDay = pointerWithin(args).filter((c) => isDayDrop(c.id))
  if (onDay.length) return onDay
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !isDayDrop(c.id)) })
}

function DayDrop({ day }: { day: Day }) {
  const { setNodeRef, isOver } = useDroppable({ id: `d-${day.id}` })
  return <div ref={setNodeRef} className={'daydrop' + (isOver ? ' over' : '')}>{isOver ? '▸ ' : ''}{day.name}</div>
}

function Row({ row, selecting, selected, onTap, onLongPress, onLink }: {
  row: FlatRow; selecting: boolean; selected: boolean; onTap: () => void; onLongPress: () => void; onLink: () => void
}) {
  const { ex, block, pos } = row
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: ex.id, disabled: selecting })
  const lp = useRef({ timer: 0, x: 0, y: 0, fired: false })
  const cancel = () => clearTimeout(lp.current.timer)
  useEffect(() => cancel, [])
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`exrow pos-${pos}` + (isDragging ? ' dragging' : '') + (selected ? ' selected' : '')}>
      {pos === 'first' && <div className="blocktag">BLOQUE · alterna</div>}
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
          <span className="muted">{ex.rounds} {ex.rounds === 1 ? 'ronda' : 'rondas'} · {fmtTarget(ex.target)}{block.restLabel ? ` · desc. ${block.restLabel}` : ''}</span>
          {ex.note && <span className="muted small">Nota: {ex.note}</span>}
        </button>
        {!selecting && ex.linkUrl && <button className="iconbtn" aria-label={`Ver técnica de ${ex.name}`} onClick={onLink}><Icon name="play" /></button>}
      </div>
    </li>
  )
}

function BulkEdit({ ids, tree, onClose }: { ids: number[]; tree: DayTree; onClose: () => void }) {
  const [rounds, setRounds] = useState(3)
  const [target, setTarget] = useState<Target>({ type: 'range', min: 8, max: 12 })
  const [rest, setRest] = useState('')
  const [unit, setUnit] = useState<TimeUnit | null>(null)
  const [kind, setKind] = useState<string | null>(null)
  const n = ids.length
  const done = () => toast(`Cambiado en ${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`)
  const patch = async (p: Parameters<typeof db.exercises.update>[1]) => { await db.exercises.bulkUpdate(ids.map((key) => ({ key, changes: p as object }))); done() }
  const applyRest = async () => {
    const blockIds = [...new Set(tree.flat.filter((f) => ids.includes(f.ex.id)).map((f) => f.block.id))]
    await db.blocks.bulkUpdate(blockIds.map((key) => ({ key, changes: { restLabel: rest.trim() } })))
    done()
  }
  return (
    <Sheet title={`Cambiar ${n} ${n === 1 ? 'ejercicio' : 'ejercicios'}`} onClose={onClose} tall>
      <div className="form">
        <section className="lbl">Rondas
          <div className="row"><Stepper label="Rondas" value={rounds} onChange={setRounds} /><button className="btn grow" onClick={() => patch({ rounds })}>Aplicar rondas</button></div>
        </section>
        <section className="lbl">Objetivo
          <TargetEditor target={target} timeUnit={unit ?? 's'} onChange={setTarget} />
          <button className="btn block" onClick={() => patch({ target: cleanTarget(target) })}>Aplicar objetivo</button>
        </section>
        <section className="lbl">Descanso (texto)
          <div className="row"><input className="input grow" value={rest} onChange={(e) => setRest(e.target.value)} placeholder="3'–5', 4', Continue" maxLength={20} aria-label="Descanso" />
            <button className="btn" onClick={applyRest}>Aplicar</button></div>
        </section>
        <section className="lbl">Tipo
          <KindPicker value={kind} onChange={(k) => { setKind(k); void patch({ kind: k }) }} />
        </section>
        <section className="lbl">Unidad de tiempo
          <Seg label="Unidad de tiempo" value={unit} onChange={(u) => { setUnit(u); void patch({ timeUnit: u }) }} options={[{ value: 's', label: 'Seg' }, { value: 'min', label: 'Min' }]} />
        </section>
      </div>
    </Sheet>
  )
}

function Resumen({ tree, otherDays }: { tree: DayTree; otherDays: Day[] }) {
  const dayId = tree.day.id
  const [sel, setSel] = useState<Set<number> | null>(null)
  const [editing, setEditing] = useState<FlatRow | 'new' | null>(null)
  const [bulk, setBulk] = useState(false)
  const [moving, setMoving] = useState(false)
  const [link, setLink] = useState<FlatRow | null>(null)
  const [dragging, setDragging] = useState(false)
  const [optimistic, setOptimistic] = useState<number[] | null>(null)
  useEffect(() => setOptimistic(null), [tree])
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const rows = optimistic ? optimistic.map((id) => tree.flat.find((f) => f.ex.id === id)!).filter(Boolean) : tree.flat
  const ids = sel ? [...sel] : []
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const canUngroup = tree.flat.some((f) => sel?.has(f.ex.id) && f.block.kind === 'superset')

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    setDragging(false)
    if (!over) return
    const exId = active.id as number
    if (isDayDrop(over.id)) {
      const dest = Number(String(over.id).slice(2))
      await moveExercisesToDay(dayId, [exId], dest)
      toast(`Movido a "${otherDays.find((d) => d.id === dest)?.name}"`)
      return
    }
    if (active.id === over.id) return
    const from = tree.flat.findIndex((f) => f.ex.id === exId)
    const to = tree.flat.findIndex((f) => f.ex.id === over.id)
    setOptimistic(arrayMove(tree.flat.map((f) => f.ex.id), from, to))
    await moveExercise(dayId, exId, to)
  }
  const act = async (fn: () => Promise<unknown>, msg?: string) => { await fn(); setSel(null); if (msg) toast(msg) }
  const remove = async () => {
    if (!(await confirmDialog({ title: `Borrar ${ids.length} ${ids.length === 1 ? 'ejercicio' : 'ejercicios'}`, body: 'También se borran sus registros de todas las sesiones.', ok: 'Borrar' }))) return
    await act(() => deleteExercises(dayId, ids))
  }

  return (
    <>
      {tree.flat.length === 0 && <div className="card empty"><p><strong>Este día está vacío.</strong></p><p className="muted">Agregá el primer ejercicio.</p></div>}
      {tree.flat.length > 0 && !sel && <p className="muted small hint">Tocá para editar. Mantené presionado para seleccionar varios. Arrastrá desde los puntos para reordenar; soltá entre dos ejercicios de un bloque para sumarlo.</p>}
      {sel && <p className="hint" role="status"><strong>{ids.length} {ids.length === 1 ? 'seleccionado' : 'seleccionados'}</strong></p>}
      <DndContext sensors={sensors} collisionDetection={collision} onDragStart={() => setDragging(true)} onDragCancel={() => setDragging(false)} onDragEnd={onDragEnd}>
        <SortableContext items={rows.map((r) => r.ex.id)} strategy={verticalListSortingStrategy}>
          <ul className="list tight">
            {rows.map((r) => (
              <Row key={r.ex.id} row={r} selecting={!!sel} selected={!!sel?.has(r.ex.id)}
                onTap={() => (sel ? toggle(r.ex.id) : setEditing(r))}
                onLongPress={() => setSel((s) => new Set(s ?? []).add(r.ex.id))}
                onLink={() => setLink(r)} />
            ))}
          </ul>
        </SortableContext>
        {dragging && otherDays.length > 0 && (
          <div className="dropbar"><span className="muted small">Soltar en otro día:</span>{otherDays.map((d) => <DayDrop key={d.id} day={d} />)}</div>
        )}
      </DndContext>

      {sel ? (
        <div className="actionbar selbar" role="toolbar" aria-label="Acciones de la selección">
          <button className="tool" disabled={ids.length < 2} onClick={() => act(() => groupExercises(dayId, ids), 'Agrupados en bloque')}><Icon name="group" />Agrupar</button>
          <button className="tool" disabled={!canUngroup} onClick={() => act(() => ungroupExercises(dayId, ids), 'Desagrupados')}><Icon name="ungroup" />Desagrupar</button>
          <button className="tool" disabled={!ids.length} onClick={() => setBulk(true)}><Icon name="edit" />Cambiar</button>
          <button className="tool" disabled={!ids.length || !otherDays.length} onClick={() => setMoving(true)}><Icon name="move" />Mover</button>
          <button className="tool" disabled={!ids.length} onClick={() => act(() => duplicateExercises(dayId, ids), 'Duplicados')}><Icon name="copy" />Duplicar</button>
          <button className="tool" disabled={!ids.length} onClick={remove}><Icon name="trash" />Borrar</button>
          <button className="tool strong" onClick={() => setSel(null)}><Icon name="close" />Listo</button>
        </div>
      ) : (
        <div className="actionbar">
          <Link className="btn primary grow" to={`/dia/${dayId}/sesion`}>Empezar sesión</Link>
          <button className="btn" onClick={() => setEditing('new')} aria-label="Agregar ejercicio"><Icon name="plus" />Ejercicio</button>
        </div>
      )}

      {editing && (editing === 'new'
        ? <ExerciseEditor dayId={dayId} onClose={() => setEditing(null)} />
        : <ExerciseEditor dayId={dayId} exercise={editing.ex} block={editing.block} onClose={() => setEditing(null)} />)}
      {bulk && <BulkEdit ids={ids} tree={tree} onClose={() => setBulk(false)} />}
      {moving && (
        <Sheet title="Mover a otro día" onClose={() => setMoving(false)}>
          <div className="menu">
            {otherDays.map((d) => (
              <button key={d.id} className="btn block" onClick={async () => { setMoving(false); await act(() => moveExercisesToDay(dayId, ids, d.id), `Movidos a "${d.name}"`) }}>{d.name}</button>
            ))}
          </div>
        </Sheet>
      )}
      {link && <LinkSheet url={link.ex.linkUrl} title={link.ex.name} onClose={() => setLink(null)} />}
    </>
  )
}

export default function DayPage() {
  const dayId = Number(useParams().id)
  const nav = useNavigate()
  const [params, setParams] = useSearchParams()
  const view = params.get('v') === 'planilla' ? 'planilla' : 'resumen'
  const tree = useLiveQuery(() => loadDay(dayId), [dayId])
  const days = useLiveQuery(() => db.days.orderBy('order').toArray())
  const [editDay, setEditDay] = useState(false)

  if (tree === undefined) return <main className="page" aria-busy="true" />
  if (tree === null) return <main className="page"><p>Ese día no existe.</p><Link className="btn" to="/">Volver al inicio</Link></main>
  return (
    <main className="page">
      <header className="pagehead">
        <Link to="/" className="iconbtn" aria-label="Volver al inicio"><Icon name="back" /></Link>
        <h1>{tree.day.name} <Chip>{tree.day.tag === 'upper' ? 'Upper' : 'Lower'}</Chip></h1>
        <button className="iconbtn" aria-label="Editar día" onClick={() => setEditDay(true)}><Icon name="edit" /></button>
      </header>
      <Seg label="Vista" value={view} onChange={(v) => setParams(v === 'planilla' ? { v } : {}, { replace: true })}
        options={[{ value: 'resumen', label: 'Resumen' }, { value: 'planilla', label: 'Planilla' }]} />
      {view === 'resumen'
        ? <Resumen tree={tree} otherDays={(days ?? []).filter((d) => d.id !== dayId)} />
        : <Planilla tree={tree} />}
      {editDay && <DayForm day={tree.day} onClose={() => setEditDay(false)} onDeleted={() => nav('/', { replace: true })} />}
    </main>
  )
}
