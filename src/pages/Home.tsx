import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { createDay, db, deleteDay, duplicateDay, type Day, type Tag } from '../db'
import { fmtDate } from '../lib'
import { Chip, Icon, Seg, Sheet, confirmDialog, toast } from '../ui'

export function DayForm({ day, onClose, onDeleted }: { day?: Day; onClose: () => void; onDeleted?: () => void }) {
  const nav = useNavigate()
  const [name, setName] = useState(day?.name ?? '')
  const [tag, setTag] = useState<Tag>(day?.tag ?? 'lower')
  const save = async () => {
    const n = name.trim()
    if (!n) return
    if (day) { await db.days.update(day.id, { name: n, tag }); onClose() }
    else { const id = await createDay(n, tag); onClose(); nav(`/dia/${id}`) }
  }
  const remove = async () => {
    if (!day) return
    if (!(await confirmDialog({ title: `Borrar "${day.name}"`, body: 'Se borran sus ejercicios, sesiones y registros. No se puede deshacer.', ok: 'Borrar día' }))) return
    await deleteDay(day.id)
    onClose(); onDeleted?.()
  }
  return (
    <Sheet title={day ? 'Editar día' : 'Nuevo día'} onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); void save() }} className="form">
        <label className="lbl">Nombre
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lun, Lower A…" maxLength={30} autoFocus={!day} />
        </label>
        <div className="lbl">Etiqueta
          <Seg label="Etiqueta" value={tag} onChange={setTag} options={[{ value: 'lower', label: 'Lower' }, { value: 'upper', label: 'Upper' }]} />
        </div>
        <button className="btn primary block" disabled={!name.trim()}>{day ? 'Guardar' : 'Crear día'}</button>
        {day && <button type="button" className="btn block" onClick={remove}><Icon name="trash" />Borrar día</button>}
      </form>
    </Sheet>
  )
}

function DayCard({ day, last, onMenu }: { day: Day; last?: string; onMenu: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: day.id })
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={'card daycard' + (isDragging ? ' dragging' : '')}>
      <div className="daycard-top">
        <button className="iconbtn grip" aria-label={`Reordenar ${day.name}`} {...attributes} {...listeners}><Icon name="grip" /></button>
        <Link to={`/dia/${day.id}`} className="daycard-main">
          <span className="daycard-name">{day.name} <Chip>{day.tag === 'upper' ? 'Upper' : 'Lower'}</Chip></span>
          <span className="muted">{last ? `Último: ${fmtDate(last)}` : 'Sin entrenamientos'}</span>
        </Link>
        <button className="iconbtn" aria-label={`Más acciones de ${day.name}`} onClick={onMenu}><Icon name="more" /></button>
      </div>
      <Link to={`/dia/${day.id}/sesion`} className="btn primary block">Empezar sesión</Link>
    </li>
  )
}

export default function Home() {
  const days = useLiveQuery(() => db.days.orderBy('order').toArray())
  const lastByDay = useLiveQuery(async () => {
    const map = new Map<number, string>()
    for (const s of await db.sessions.toArray())
      if (s.status === 'done' && (map.get(s.dayId) ?? '') < s.date) map.set(s.dayId, s.date)
    return map
  })
  const [creating, setCreating] = useState(false)
  const [menu, setMenu] = useState<Day | null>(null)
  const [editing, setEditing] = useState<Day | null>(null)
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  const onDragEnd = async ({ active, over }: DragEndEvent) => {
    if (!days || !over || active.id === over.id) return
    const next = arrayMove(days, days.findIndex((d) => d.id === active.id), days.findIndex((d) => d.id === over.id))
    await db.transaction('rw', db.days, () => Promise.all(next.map((d, i) => db.days.update(d.id, { order: i }))))
  }

  return (
    <main className="page">
      <header className="pagehead"><h1>Ozo</h1></header>
      {days && days.length === 0 && (
        <div className="card empty">
          <p><strong>Todavía no hay días.</strong></p>
          <p className="muted">Creá uno a mano o importá una rutina armada con Claude.</p>
        </div>
      )}
      {days && days.length > 0 && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={days.map((d) => d.id)} strategy={verticalListSortingStrategy}>
            <ul className="list">
              {days.map((d) => <DayCard key={d.id} day={d} last={lastByDay?.get(d.id)} onMenu={() => setMenu(d)} />)}
            </ul>
          </SortableContext>
        </DndContext>
      )}
      <div className="row wrap gap-top">
        <Link className="btn grow" to="/programar"><Icon name="calendar" />Programar mes</Link>
        <Link className="btn grow" to="/importar"><Icon name="upload" />Importar rutina</Link>
      </div>
      <div className="actionbar">
        <button className="btn primary grow" onClick={() => setCreating(true)}><Icon name="plus" />Nuevo día</button>
      </div>
      {creating && <DayForm onClose={() => setCreating(false)} />}
      {editing && <DayForm day={editing} onClose={() => setEditing(null)} />}
      {menu && (
        <Sheet title={menu.name} onClose={() => setMenu(null)}>
          <div className="menu">
            <button className="btn block" onClick={async () => { const d = menu; setMenu(null); await duplicateDay(d.id); toast(`"${d.name}" duplicado`) }}><Icon name="copy" />Duplicar día</button>
            <button className="btn block" onClick={() => { setEditing(menu); setMenu(null) }}><Icon name="edit" />Editar nombre y etiqueta</button>
          </div>
        </Sheet>
      )}
    </main>
  )
}
