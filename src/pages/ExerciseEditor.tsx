import { useState } from 'react'
import {
  BASE_KINDS, BASE_ROUTINE_TYPES, MUSCLE_GROUPS, addCustomKind, addFromLibrary, addRoutineType, getLibrary, getSettings, norm, saveLibExercise, saveRoutineExercise, useLive,
  type Block, type Exercise, type Field, type LibExercise, type RoutineTree, type Target, type TimeUnit,
} from '../data'
import { FIELD_LABEL, cap, fieldsFor, fmtNum, isFreeKind, parseLink } from '../lib'
import { Chip, Icon, Seg, Sheet, Stepper, toast } from '../ui'

/** Tipo de rutina: Lower, Upper… más los que haya creado el usuario. */
export function TypePicker({ value, onChange }: { value: string | null; onChange: (t: string) => void }) {
  const custom = useLive(() => getSettings())?.routineTypes ?? []
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const types = [...BASE_ROUTINE_TYPES, ...custom]
  if (value && !types.some((t) => norm(t) === norm(value))) types.push(value)
  const add = async () => {
    const t = await addRoutineType(name)
    if (!t) return
    onChange(t); setName(''); setAdding(false)
  }
  return (
    <div>
      <div className="chips" role="group" aria-label="Tipo de rutina">
        {types.map((t) => <button key={t} type="button" className="chipbtn" aria-pressed={!!value && norm(value) === norm(t)} onClick={() => onChange(t)}>{t}</button>)}
        <button type="button" className="chipbtn dashed" onClick={() => setAdding(!adding)}>+ Otro</button>
      </div>
      {adding && (
        <div className="row gap-top">
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del tipo" maxLength={20} aria-label="Nombre del tipo de rutina" autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void add() } }} />
          <button type="button" className="btn" onClick={add} disabled={!name.trim()}>Agregar</button>
        </div>
      )}
    </div>
  )
}

export function KindPicker({ value, onChange }: { value: string | null; onChange: (k: string) => void }) {
  const custom = useLive(() => getSettings())?.customKinds ?? []
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

/**
 * Editor de ejercicio. Con `routineId` edita la definición (biblioteca) y su uso en la rutina (rondas, objetivo, descanso, nota).
 * Sin `routineId` edita solo la definición, desde la Biblioteca.
 */
export function ExerciseEditor({ routineId, exercise, lib, block, onClose }: { routineId?: number; exercise?: Exercise; lib?: LibExercise; block?: Block; onClose: () => void }) {
  const base = exercise ?? lib
  const library = useLive(() => getLibrary())
  const [name, setName] = useState(base?.name ?? '')
  const [kind, setKind] = useState(base?.kind ?? 'fuerza')
  const [muscleGroup, setMuscleGroup] = useState(base?.muscleGroup ?? '')
  const [timeUnit, setTimeUnit] = useState<TimeUnit>(base?.timeUnit ?? 's')
  const [rounds, setRounds] = useState(exercise?.rounds ?? 3)
  const [target, setTarget] = useState<Target>(exercise?.target ?? { type: 'range', min: 8, max: 12 })
  const [fields, setFields] = useState<Field[]>(base?.fields ?? ['weight', 'reps'])
  const [rest, setRest] = useState(block?.restLabel ?? '')
  const [note, setNote] = useState(exercise?.note ?? '')
  const [link, setLink] = useState(base?.linkUrl ?? '')
  const [error, setError] = useState('')
  const inRoutine = routineId != null
  const free = isFreeKind(kind)
  const linkInfo = link.trim() ? parseLink(link) : null
  const linkBad = !!link.trim() && !linkInfo
  const used = fieldsFor({ kind, target, fields })
  const known = !base && library?.find((l) => l.norm === norm(name))
  const groups = muscleGroup && !MUSCLE_GROUPS.includes(muscleGroup) ? [...MUSCLE_GROUPS, muscleGroup] : MUSCLE_GROUPS

  const save = async () => {
    if (!name.trim() || linkBad) return
    const libDraft = { name: name.trim(), kind, muscleGroup, timeUnit, linkUrl: link.trim(), fields: free ? fields : undefined }
    const r = inRoutine
      ? await saveRoutineExercise(routineId, libDraft, { rounds, target: cleanTarget(target), note: note.trim() }, rest.trim(), exercise)
      : await saveLibExercise(libDraft, lib?.id)
    if (r === 'dup') return setError('Ya hay otro ejercicio con ese nombre en la biblioteca.')
    if (r === 'in-routine') return setError('Ese ejercicio ya está en esta rutina.')
    onClose()
  }
  return (
    <Sheet title={base ? 'Editar ejercicio' : 'Nuevo ejercicio'} onClose={onClose} tall>
      <form className="form" onSubmit={(e) => { e.preventDefault(); void save() }}>
        <label className="lbl">Nombre
          <input className="input" value={name} onChange={(e) => { setName(e.target.value); setError('') }} maxLength={60} autoFocus={!base} />
          {known && inRoutine && <span className="muted small" role="status">Ya está en tu biblioteca: se vincula y comparte su historial.</span>}
        </label>
        {error && <p role="alert"><strong>Error:</strong> {error}</p>}
        <div className="lbl">Tipo<KindPicker value={kind} onChange={setKind} /></div>
        <label className="lbl">Grupo muscular
          <select className="input" value={muscleGroup} onChange={(e) => setMuscleGroup(e.target.value)}>
            <option value="">Sin grupo</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </label>
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
        {inRoutine && <p className="muted small">Se carga: {used.map((f) => FIELD_LABEL[f].toLowerCase()).join(' × ')}</p>}
        <div className="row">
          {inRoutine && <div className="lbl">Rondas<Stepper label="Rondas" value={rounds} onChange={setRounds} /></div>}
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
        {inRoutine && (
          <>
            <div className="lbl">Objetivo<TargetEditor target={target} timeUnit={timeUnit} onChange={setTarget} /></div>
            <label className="lbl">{block?.kind === 'superset' ? 'Descanso de la superserie (texto)' : 'Descanso (texto)'}
              <input className="input" value={rest} onChange={(e) => setRest(e.target.value)} placeholder="3'–5', 4', Continue" maxLength={20} />
            </label>
            <label className="lbl">Nota del ejercicio (vale para todas las semanas)
              <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} />
            </label>
          </>
        )}
        <label className="lbl">Link del video
          <input className="input" type="url" inputMode="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="YouTube, Instagram o TikTok" aria-invalid={linkBad} />
          {link.trim() && <span className="muted small" role="status">{linkBad ? 'Error: no es una dirección válida' : linkInfo?.embed ? `Video de ${linkInfo.label}: se ve adentro de la app` : 'Se abre en otra app (no se puede embeber)'}</span>}
        </label>
        <button className="btn primary block" disabled={!name.trim() || linkBad}>Guardar</button>
      </form>
    </Sheet>
  )
}

/** "+ Ejercicio": elegir uno de la biblioteca o crear uno nuevo. */
export function AddExerciseSheet({ tree, onClose }: { tree: RoutineTree; onClose: () => void }) {
  const library = useLive(() => getLibrary())
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  if (creating) return <ExerciseEditor routineId={tree.routine.id} onClose={onClose} />
  const here = new Set(tree.flat.map((f) => f.ex.id))
  const list = (library ?? []).filter((l) => !here.has(l.id) && l.norm.includes(norm(q)))
  return (
    <Sheet title="Agregar ejercicio" onClose={onClose} tall>
      <button className="btn primary block" onClick={() => setCreating(true)}><Icon name="plus" />Crear ejercicio nuevo</button>
      <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en la biblioteca" aria-label="Buscar en la biblioteca" />
      <ul className="plain">
        {list.map((l) => (
          <li key={l.id} className="line">
            <button className="linkrow grow" onClick={async () => { await addFromLibrary(tree.routine.id, l.id); toast(`${l.name} agregado`); onClose() }}>
              <strong>{l.name}</strong> <Chip>{cap(l.kind)}</Chip>{l.muscleGroup && <span className="muted small"> · {l.muscleGroup}</span>}
            </button>
          </li>
        ))}
        {library && !list.length && <li className="muted">{q ? 'Nada con ese nombre en la biblioteca.' : 'Todos los ejercicios de tu biblioteca ya están en esta rutina.'}</li>}
      </ul>
    </Sheet>
  )
}
