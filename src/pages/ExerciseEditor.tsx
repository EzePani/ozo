import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { BASE_KINDS, addCustomKind, addExercise, db, deleteExercises, getSettings, type Block, type Exercise, type Field, type Target, type TimeUnit } from '../db'
import { FIELD_LABEL, cap, fieldsFor, fmtNum, isFreeKind, parseLink } from '../lib'
import { Icon, Seg, Sheet, Stepper, confirmDialog } from '../ui'

export function KindPicker({ value, onChange }: { value: string | null; onChange: (k: string) => void }) {
  const custom = useLiveQuery(() => getSettings())?.customKinds ?? []
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const kinds = [...BASE_KINDS, ...custom]
  if (value && !kinds.includes(value)) kinds.push(value)
  const add = async () => {
    const k = name.trim().toLowerCase()
    if (!k) return
    await addCustomKind(k)
    onChange(k); setName(''); setAdding(false)
  }
  return (
    <div>
      <div className="chips" role="group" aria-label="Tipo de ejercicio">
        {kinds.map((k) => <button key={k} type="button" className="chipbtn" aria-pressed={value === k} onClick={() => onChange(k)}>{cap(k)}</button>)}
        <button type="button" className="chipbtn dashed" onClick={() => setAdding(!adding)}>+ Tipo propio</button>
      </div>
      {adding && (
        <div className="row gap-top">
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del tipo" maxLength={20} aria-label="Nombre del tipo propio"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} />
          <button type="button" className="btn" onClick={add} disabled={!name.trim()}>Agregar</button>
        </div>
      )}
    </div>
  )
}

function NumInput({ value, onChange, label }: { value?: number; onChange: (n?: number) => void; label: string }) {
  return (
    <label className="lbl small">{label}
      <input className="input num" inputMode="decimal" value={value == null ? '' : fmtNum(value)} aria-label={label}
        onChange={(e) => { const n = parseFloat(e.target.value.replace(',', '.')); onChange(Number.isFinite(n) && n >= 0 ? n : undefined) }} />
    </label>
  )
}

export function TargetEditor({ target, timeUnit, onChange }: { target: Target; timeUnit: TimeUnit; onChange: (t: Target) => void }) {
  const k = target.type === 'time' && timeUnit === 'min' ? 60 : 1
  const show = (n?: number) => (n == null ? undefined : n / k)
  const unitLabel = target.type === 'time' ? (timeUnit === 'min' ? 'min' : 'seg') : target.unit === 'm' ? 'm' : 'reps'
  return (
    <div className="stack">
      <Seg label="Tipo de objetivo" value={target.type}
        onChange={(type) => {
          // al pasar a/desde tiempo se conserva el número que se ve en pantalla
          const f = (type === 'time' && timeUnit === 'min' ? 60 : 1) / k
          onChange({ ...target, type, min: target.min == null ? undefined : target.min * f, max: target.max == null ? undefined : target.max * f, unit: type === 'time' ? undefined : target.unit })
        }}
        options={[{ value: 'range', label: 'Rango' }, { value: 'fixed', label: 'Fijo' }, { value: 'time', label: 'Tiempo' }, { value: 'max', label: 'Máx' }]} />
      {target.type !== 'max' && (
        <div className="row">
          <NumInput label={target.type === 'fixed' ? `Cantidad (${unitLabel})` : `Mínimo (${unitLabel})`} value={show(target.min)} onChange={(n) => onChange({ ...target, min: n == null ? undefined : n * k })} />
          {target.type !== 'fixed' && <NumInput label={`Máximo (${unitLabel})`} value={show(target.max)} onChange={(n) => onChange({ ...target, max: n == null ? undefined : n * k })} />}
        </div>
      )}
      {target.type !== 'time' && (
        <Seg label="Unidad del objetivo" value={target.unit ?? 'rep'} onChange={(unit) => onChange({ ...target, unit })} options={[{ value: 'rep', label: 'Repeticiones' }, { value: 'm', label: 'Metros' }]} />
      )}
      <label className="check"><input type="checkbox" checked={!!target.perSide} onChange={(e) => onChange({ ...target, perSide: e.target.checked || undefined })} />Por lado</label>
    </div>
  )
}

export const cleanTarget = (t: Target): Target => {
  const out: Target = { type: t.type }
  if (t.type !== 'max') out.min = t.min ?? 1
  if (t.type === 'range') out.max = Math.max(t.max ?? out.min!, out.min!)
  if (t.type === 'time' && t.max != null && t.max > out.min!) out.max = t.max
  if (t.type !== 'time' && t.unit === 'm') out.unit = 'm'
  if (t.perSide) out.perSide = true
  return out
}

const ALL_FIELDS: Field[] = ['weight', 'reps', 'duration', 'distance']

export function ExerciseEditor({ dayId, exercise, block, onClose }: { dayId: number; exercise?: Exercise; block?: Block; onClose: () => void }) {
  const [name, setName] = useState(exercise?.name ?? '')
  const [kind, setKind] = useState(exercise?.kind ?? 'fuerza')
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(exercise?.timeUnit ?? 's')
  const [rounds, setRounds] = useState(exercise?.rounds ?? 3)
  const [target, setTarget] = useState<Target>(exercise?.target ?? { type: 'range', min: 8, max: 12 })
  const [fields, setFields] = useState<Field[]>(exercise?.fields ?? ['weight', 'reps'])
  const [rest, setRest] = useState(block?.restLabel ?? '')
  const [note, setNote] = useState(exercise?.note ?? '')
  const [link, setLink] = useState(exercise?.linkUrl ?? '')
  const free = isFreeKind(kind)
  const linkInfo = link.trim() ? parseLink(link) : null
  const linkBad = !!link.trim() && !linkInfo
  const used = fieldsFor({ kind, target, fields })

  const save = async () => {
    if (!name.trim() || linkBad) return
    const draft = { name: name.trim(), kind, timeUnit, rounds, target: cleanTarget(target), note: note.trim(), linkUrl: link.trim(), fields: free ? fields : undefined }
    if (exercise) {
      await db.exercises.update(exercise.id, draft)
      if (block && rest.trim() !== block.restLabel) await db.blocks.update(block.id, { restLabel: rest.trim() })
    } else await addExercise(dayId, draft, rest.trim())
    onClose()
  }
  const remove = async () => {
    if (!exercise) return
    if (!(await confirmDialog({ title: `Borrar "${exercise.name}"`, body: 'También se borran sus registros de todas las sesiones.', ok: 'Borrar' }))) return
    await deleteExercises(dayId, [exercise.id])
    onClose()
  }
  return (
    <Sheet title={exercise ? 'Editar ejercicio' : 'Agregar ejercicio'} onClose={onClose} tall>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <label className="lbl">Nombre
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus={!exercise} />
        </label>
        <div className="lbl">Tipo<KindPicker value={kind} onChange={setKind} /></div>
        {free && (
          <div className="lbl">Campos a cargar
            <div className="chips" role="group" aria-label="Campos a cargar">
              {ALL_FIELDS.map((f) => (
                <label key={f} className="check"><input type="checkbox" checked={fields.includes(f)}
                  onChange={(e) => setFields(e.target.checked ? ALL_FIELDS.filter((x) => x === f || fields.includes(x)) : fields.length > 1 ? fields.filter((x) => x !== f) : fields)} />{FIELD_LABEL[f]}</label>
              ))}
            </div>
          </div>
        )}
        <p className="muted small">Se carga: {used.map((f) => FIELD_LABEL[f].toLowerCase()).join(' × ')}</p>
        <div className="row">
          <div className="lbl">Rondas<Stepper label="Rondas" value={rounds} onChange={setRounds} /></div>
          <div className="lbl grow">Unidad de tiempo
            <Seg label="Unidad de tiempo" value={timeUnit}
              onChange={(u) => {
                if (u !== timeUnit && target.type === 'time') {
                  const f = u === 'min' ? 60 : 1 / 60
                  setTarget({ ...target, min: target.min == null ? undefined : target.min * f, max: target.max == null ? undefined : target.max * f })
                }
                setTimeUnit(u)
              }} options={[{ value: 's', label: 'Seg' }, { value: 'min', label: 'Min' }]} />
          </div>
        </div>
        <div className="lbl">Objetivo<TargetEditor target={target} timeUnit={timeUnit} onChange={setTarget} /></div>
        <label className="lbl">{block?.kind === 'superset' ? 'Descanso del bloque (texto)' : 'Descanso (texto)'}
          <input className="input" value={rest} onChange={(e) => setRest(e.target.value)} placeholder="3'–5', 4', Continue" maxLength={20} />
        </label>
        <label className="lbl">Nota
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={80} />
        </label>
        <label className="lbl">Link de técnica
          <input className="input" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="YouTube, Instagram o TikTok" aria-invalid={linkBad} />
          {link.trim() && <span className="muted small" role="status">{linkBad ? 'Error: no es una dirección válida' : linkInfo?.embed ? `Video de ${linkInfo.label}: se ve adentro de la app` : 'Se abre en el sitio (no se puede embeber)'}</span>}
        </label>
        <button className="btn primary block" disabled={!name.trim() || linkBad}>Guardar</button>
        {exercise && <button type="button" className="btn block" onClick={remove}><Icon name="trash" />Borrar ejercicio</button>}
      </form>
    </Sheet>
  )
}
