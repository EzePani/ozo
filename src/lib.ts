import { BASE_KINDS, type Backup, type Entry, type EntryValues, type Exercise, type Field, type Target, type TimeUnit } from './db'

// ---------- formato ----------
/** ISO yyyy-mm-dd → DD-MM-AA */
export function fmtDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y.slice(2)}`
}
export const fmtNum = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',')

/** Segundos → 45" · 20' · 1:30 */
export function fmtDur(sec: number) {
  const s = Math.round(sec)
  if (s < 60) return `${s}"`
  if (s % 60 === 0) return `${s / 60}'`
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function fmtTarget(t: Target) {
  const side = t.perSide ? ' por lado' : ''
  const unit = t.unit === 'm' ? ' m' : ' reps'
  switch (t.type) {
    case 'max': return 'máx' + (t.unit === 'm' ? ' m' : ' reps') + side
    case 'fixed': return `${t.min ?? 0}${unit}${side}`
    case 'range': return `${t.min ?? 0}–${t.max ?? 0}${unit}${side}`
    case 'time': return (t.max && t.max !== t.min ? `${fmtDur(t.min ?? 0)}–${fmtDur(t.max)}` : fmtDur(t.min ?? 0)) + side
  }
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- campos según tipo ----------
export function fieldsFor(ex: Pick<Exercise, 'kind' | 'target' | 'fields'>): Field[] {
  const timed = ex.target.type === 'time'
  switch (ex.kind) {
    case 'fuerza': return ['weight', 'reps']
    case 'core': case 'movilidad': case 'calentamiento': return [timed ? 'duration' : 'reps']
    case 'cardio': return ['duration', 'distance']
    case 'funcional': return ['weight', ex.target.unit === 'm' ? 'distance' : 'duration']
    default: return ex.fields?.length ? ex.fields : ['weight', 'reps']
  }
}
export const isFreeKind = (kind: string) => !BASE_KINDS.includes(kind) || kind === 'otro'

export const FIELD_LABEL: Record<Field, string> = { weight: 'Peso', reps: 'Reps', duration: 'Tiempo', distance: 'Distancia' }
export function fieldUnit(f: Field, timeUnit: TimeUnit) {
  return f === 'weight' ? 'kg' : f === 'reps' ? 'reps' : f === 'distance' ? 'm' : timeUnit === 'min' ? 'min' : 'seg'
}

export function fmtEntry(e: EntryValues | undefined, fields: Field[], long = false) {
  if (!e) return '—'
  const parts: string[] = []
  for (const f of fields) {
    if (f === 'weight' && e.weight != null) parts.push(fmtNum(e.weight) + (long ? ' kg' : ''))
    if (f === 'reps' && e.reps != null) parts.push(fmtNum(e.reps))
    if (f === 'duration' && e.durationSec != null) parts.push(fmtDur(e.durationSec))
    if (f === 'distance' && e.distance != null) parts.push(fmtNum(e.distance) + ' m')
  }
  return parts.length ? parts.join(' × ') : '—'
}

/** Texto del teclado → valores de la entrada (tiempo siempre en segundos). */
export type Draft = Partial<Record<Field, string>>
const parse = (s?: string) => { const n = parseFloat((s ?? '').replace(',', '.')); return Number.isFinite(n) ? n : undefined }
export function draftToValues(d: Draft, timeUnit: TimeUnit): EntryValues {
  const dur = parse(d.duration)
  return {
    weight: parse(d.weight), reps: parse(d.reps), distance: parse(d.distance),
    durationSec: dur == null ? undefined : Math.round(timeUnit === 'min' ? dur * 60 : dur),
  }
}
export function valuesToDraft(e: EntryValues | undefined, timeUnit: TimeUnit): Draft {
  if (!e) return {}
  const s = (n?: number) => (n == null ? undefined : fmtNum(n))
  return {
    weight: s(e.weight), reps: s(e.reps), distance: s(e.distance),
    duration: e.durationSec == null ? undefined : fmtNum(timeUnit === 'min' ? e.durationSec / 60 : e.durationSec),
  }
}

/** Valor comparable de una serie: peso, si no reps, si no tiempo, si no distancia. */
export function metricOf(fields: Field[]): Field { return fields.includes('weight') ? 'weight' : fields[0] }
export function entryMetric(e: Entry, f: Field) {
  return f === 'weight' ? e.weight : f === 'reps' ? e.reps : f === 'duration' ? e.durationSec : e.distance
}
export function fmtMetric(v: number, f: Field) {
  return f === 'weight' ? `${fmtNum(v)} kg` : f === 'reps' ? `${fmtNum(v)} reps` : f === 'duration' ? fmtDur(v) : `${fmtNum(v)} m`
}

// ---------- links embebidos ----------
export interface LinkInfo { provider: 'youtube' | 'instagram' | 'tiktok' | 'otro'; embed?: string; label: string }
export function parseLink(raw: string): LinkInfo | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (!/^https?:$/.test(u.protocol)) return null
  const host = u.hostname.replace(/^(www|m)\./, '')
  const seg = u.pathname.split('/').filter(Boolean)
  const id = (s?: string) => (s && /^[\w-]{5,}$/.test(s) ? s : undefined)
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const vid = host === 'youtu.be' ? id(seg[0])
      : seg[0] === 'watch' ? id(u.searchParams.get('v') ?? undefined)
      : ['shorts', 'embed', 'live', 'v'].includes(seg[0]) ? id(seg[1]) : undefined
    return { provider: 'youtube', label: 'YouTube', embed: vid && `https://www.youtube-nocookie.com/embed/${vid}?playsinline=1&rel=0` }
  }
  if (host === 'instagram.com') {
    const i = seg.findIndex((s) => ['p', 'reel', 'reels', 'tv'].includes(s))
    const code = i >= 0 ? id(seg[i + 1]) : undefined
    return { provider: 'instagram', label: 'Instagram', embed: code && `https://www.instagram.com/${seg[i] === 'p' ? 'p' : 'reel'}/${code}/embed` }
  }
  if (host.endsWith('tiktok.com')) {
    const i = seg.indexOf('video')
    const vid = i >= 0 && /^\d+$/.test(seg[i + 1] ?? '') ? seg[i + 1] : undefined
    return { provider: 'tiktok', label: 'TikTok', embed: vid && `https://www.tiktok.com/embed/v2/${vid}` }
  }
  return { provider: 'otro', label: host }
}

// ---------- importación de rutina (JSON de Claude) ----------
export interface RoutineExercise { name: string; kind: string; timeUnit: TimeUnit; rounds: number; target: Target; link: string; note: string }
export interface Routine { day: { name: string; tag: 'upper' | 'lower' }; blocks: { kind: 'single' | 'superset'; rest: string; exercises: RoutineExercise[] }[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function validateRoutine(text: string): { errors: string[]; routine?: Routine } {
  let json: unknown
  try { json = JSON.parse(text) } catch (e) { return { errors: [`El texto no es JSON válido: ${(e as Error).message}`] } }
  const errors: string[] = []
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`)
  if (!isObj(json)) return { errors: ['raíz: tiene que ser un objeto'] }
  if (json.version !== 1) err('version', 'tiene que ser 1')
  const day = json.day
  const outDay = { name: '', tag: 'lower' as 'upper' | 'lower' }
  if (!isObj(day)) err('day', 'falta el objeto con nombre y etiqueta')
  else {
    if (typeof day.name !== 'string' || !day.name.trim()) err('day.name', 'falta el nombre del día')
    else outDay.name = day.name.trim()
    if (day.tag !== 'upper' && day.tag !== 'lower') err('day.tag', 'tiene que ser "upper" o "lower"')
    else outDay.tag = day.tag
  }
  const blocks: Routine['blocks'] = []
  if (!Array.isArray(json.blocks) || !json.blocks.length) err('blocks', 'tiene que ser una lista con al menos un bloque')
  else json.blocks.forEach((b: unknown, bi: number) => {
    const bp = `blocks[${bi}]`
    if (!isObj(b)) return err(bp, 'tiene que ser un objeto')
    if (b.kind !== 'single' && b.kind !== 'superset') err(`${bp}.kind`, 'tiene que ser "single" o "superset"')
    if (b.rest != null && typeof b.rest !== 'string') err(`${bp}.rest`, 'tiene que ser texto')
    const exs: RoutineExercise[] = []
    if (!Array.isArray(b.exercises) || !b.exercises.length) err(`${bp}.exercises`, 'tiene que tener al menos un ejercicio')
    else {
      if (b.kind === 'superset' && b.exercises.length < 2) err(`${bp}.exercises`, 'un superset necesita al menos 2 ejercicios')
      b.exercises.forEach((x: unknown, xi: number) => {
        const xp = `${bp}.exercises[${xi}]`
        if (!isObj(x)) return err(xp, 'tiene que ser un objeto')
        if (typeof x.name !== 'string' || !x.name.trim()) err(`${xp}.name`, 'falta el nombre')
        if (typeof x.kind !== 'string' || !x.kind.trim()) err(`${xp}.kind`, 'falta el tipo (fuerza, core, cardio, funcional, movilidad, calentamiento, otro)')
        if (x.timeUnit != null && x.timeUnit !== 's' && x.timeUnit !== 'min') err(`${xp}.timeUnit`, 'tiene que ser "s" o "min"')
        if (!Number.isInteger(x.rounds) || (x.rounds as number) < 1 || (x.rounds as number) > 20) err(`${xp}.rounds`, 'tiene que ser un entero entre 1 y 20')
        if (x.link != null && x.link !== '' && (typeof x.link !== 'string' || !/^https?:\/\//.test(x.link))) err(`${xp}.link`, 'tiene que ser una URL que empiece con http')
        if (x.note != null && typeof x.note !== 'string') err(`${xp}.note`, 'tiene que ser texto')
        const t = x.target
        const target: Target = { type: 'max' }
        if (!isObj(t)) err(`${xp}.target`, 'falta el objetivo')
        else {
          const pos = (v: unknown) => typeof v === 'number' && v > 0 && v < 100000
          if (!['range', 'fixed', 'time', 'max'].includes(t.type as string)) err(`${xp}.target.type`, 'tiene que ser "range", "fixed", "time" o "max"')
          else {
            target.type = t.type as Target['type']
            if (target.type !== 'max') {
              if (!pos(t.min)) err(`${xp}.target.min`, 'tiene que ser un número mayor a 0')
              else target.min = t.min as number
            }
            if (target.type === 'range' || (target.type === 'time' && t.max != null)) {
              if (!pos(t.max)) err(`${xp}.target.max`, 'tiene que ser un número mayor a 0')
              else if (pos(t.min) && (t.max as number) < (t.min as number)) err(`${xp}.target.max`, 'no puede ser menor que min')
              else target.max = t.max as number
            }
          }
          if (t.unit != null && t.unit !== 'rep' && t.unit !== 'm') err(`${xp}.target.unit`, 'tiene que ser "rep" o "m"')
          else if (t.unit) target.unit = t.unit as 'rep' | 'm'
          if (t.perSide != null && typeof t.perSide !== 'boolean') err(`${xp}.target.perSide`, 'tiene que ser true o false')
          else if (t.perSide) target.perSide = true
        }
        exs.push({
          name: String(x.name ?? '').trim(), kind: String(x.kind ?? '').trim().toLowerCase(),
          timeUnit: x.timeUnit === 'min' ? 'min' : 's', rounds: Number(x.rounds) || 1, target,
          link: typeof x.link === 'string' ? x.link : '', note: typeof x.note === 'string' ? x.note : '',
        })
      })
    }
    blocks.push({ kind: b.kind === 'superset' ? 'superset' : 'single', rest: typeof b.rest === 'string' ? b.rest : '', exercises: exs })
  })
  return errors.length ? { errors } : { errors, routine: { day: outDay, blocks } }
}

export function validateBackup(text: string): { error?: string; backup?: Backup } {
  let json: unknown
  try { json = JSON.parse(text) } catch { return { error: 'El archivo no es JSON válido' } }
  if (!isObj(json) || json.app !== 'ozo') return { error: 'El archivo no es un backup de Ozo' }
  if (json.version !== 1) return { error: 'Versión de backup no soportada' }
  for (const t of ['days', 'blocks', 'exercises', 'sessions', 'entries', 'settings'])
    if (!Array.isArray(json[t]) || !(json[t] as unknown[]).every(isObj)) return { error: `Backup incompleto: falta "${t}"` }
  return { backup: json as unknown as Backup }
}

export const CLAUDE_PROMPT = `Convertí mi rutina de entrenamiento al siguiente formato JSON para importarla en la app Ozo. Respondé SOLO con el JSON, sin texto alrededor.

Reglas:
- "version" siempre 1. "day.tag" es "upper" o "lower".
- Cada bloque es "single" (un ejercicio) o "superset" (2 o más ejercicios que se alternan por ronda).
- "rest" es texto libre del descanso del bloque, por ejemplo "3'-5'", "4'" o "Continue".
- "kind" del ejercicio: "fuerza", "core", "cardio", "funcional", "movilidad", "calentamiento" u "otro".
- "timeUnit": "s" o "min" (unidad en la que se carga el tiempo). "rounds": entero de 1 a 20.
- "target.type": "range" (min y max), "fixed" (min), "time" (min y max opcional, SIEMPRE en segundos) o "max" (al fallo).
- "target.unit" opcional: "rep" o "m" (metros). "target.perSide": true si es por lado.
- "link" (URL de técnica) y "note" son opcionales.

Ejemplo:
{
  "version": 1,
  "day": { "name": "Lun", "tag": "lower" },
  "blocks": [
    { "kind": "single", "rest": "3'-5'",
      "exercises": [
        { "name": "Búlgara mancuernas", "kind": "fuerza", "timeUnit": "s", "rounds": 3,
          "target": { "type": "range", "min": 6, "max": 10 },
          "link": "https://youtube.com/watch?v=XXXXXXXXXXX", "note": "" } ] },
    { "kind": "superset", "rest": "Continue",
      "exercises": [
        { "name": "Crunch", "kind": "core", "rounds": 2, "target": { "type": "max" }, "note": "50 - 10kg" },
        { "name": "Wheel", "kind": "core", "rounds": 2, "target": { "type": "max" }, "note": "15" } ] }
  ]
}

Mi rutina:
`
