import { BASE_KINDS, addDays, dateOf, isoOf, migrateV1, todayISO, type Data, type EntryValues, type Exercise, type Field, type ImportRoutine, type Target, type TimeUnit, type V1Data } from './data'

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

/** Objetivo corto para la columna de la grilla: 6–10 · 30"–40" · máx */
export function fmtTargetShort(t: Target) {
  const side = t.perSide ? ' c/l' : ''
  const unit = t.unit === 'm' ? ' m' : ''
  switch (t.type) {
    case 'max': return 'máx' + unit + side
    case 'fixed': return `${t.min ?? 0}${unit}${side}`
    case 'range': return `${t.min ?? 0}–${t.max ?? 0}${unit}${side}`
    case 'time': return (t.max && t.max !== t.min ? `${fmtDur(t.min ?? 0)}–${fmtDur(t.max)}` : fmtDur(t.min ?? 0)) + side
  }
}

export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

// ---------- fechas en texto ----------
export const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
/** Índice = getDay() (0 = domingo). */
export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
export const WD_ORDER = [1, 2, 3, 4, 5, 6, 0]
export const wdShort = (n: number) => WEEKDAYS[n].slice(0, 3)
const monShort = (m: number) => MONTHS[m].slice(0, 3).toLowerCase()
/** ISO → "8 dic" */
export function fmtDay(iso: string) { const d = dateOf(iso); return `${d.getDate()} ${monShort(d.getMonth())}` }
/** ISO → "Lunes 8 dic" */
export const fmtDayLong = (iso: string) => `${WEEKDAYS[dateOf(iso).getDay()]} ${fmtDay(iso)}`
/** "2026-12" → "Diciembre 2026" */
export function monthLabel(month: string) { const [y, m] = month.split('-').map(Number); return `${MONTHS[m - 1]} ${y}` }
export const monthName = (month: string) => MONTHS[Number(month.split('-')[1]) - 1]
export function shiftMonth(month: string, d: number) { const [y, m] = month.split('-').map(Number); return isoOf(new Date(y, m - 1 + d, 1)).slice(0, 7) }
export const thisMonth = () => todayISO().slice(0, 7)
/** ["2026-12-01", …] → "1, 8, 15 y 22 dic" */
export function listDates(dates: string[]) {
  const groups: { m: number; days: number[] }[] = []
  for (const iso of dates) {
    const d = dateOf(iso), last = groups[groups.length - 1]
    if (last && last.m === d.getMonth()) last.days.push(d.getDate()); else groups.push({ m: d.getMonth(), days: [d.getDate()] })
  }
  const parts = groups.map((g) => `${g.days.join(', ')} ${monShort(g.m)}`)
  const text = parts.join(', ')
  const i = text.lastIndexOf(', ')
  return i < 0 ? text : `${text.slice(0, i)} y ${text.slice(i + 2)}`
}
/** Lunes de la semana de una fecha. */
export function mondayOf(iso: string) { return addDays(iso, -((dateOf(iso).getDay() + 6) % 7)) }
/** Semanas seguidas con al menos un entreno, contando hacia atrás desde esta (o la pasada si esta todavía no tiene). */
export function streakWeeks(doneDates: string[]) {
  const weeks = new Set(doneDates.map(mondayOf))
  let w = mondayOf(todayISO())
  if (!weeks.has(w)) w = addDays(w, -7)
  let n = 0
  while (weeks.has(w)) { n++; w = addDays(w, -7) }
  return n
}
/** "3'–5'" → 180000 ms · "60\"" → 60000 · "Continue" → null */
export function parseRest(label: string) {
  const m = label.match(/(\d+(?:[.,]\d+)?)\s*(['′’]|min|"|″|''|s\b|seg)?/i)
  if (!m) return null
  const n = parseFloat(m[1].replace(',', '.'))
  const sec = !m[2] || /^['′’]$|min/i.test(m[2]) ? n * 60 : n
  return sec > 0 ? Math.round(sec * 1000) : null
}

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
export function entryMetric(e: EntryValues, f: Field) {
  return f === 'weight' ? e.weight : f === 'reps' ? e.reps : f === 'duration' ? e.durationSec : e.distance
}
const ALL_FIELDS: Field[] = ['weight', 'reps', 'duration', 'distance']
/** Campos que realmente tienen datos en un conjunto de series (sirve cuando no hay rutina a mano). */
export function entryFields(es: EntryValues[]): Field[] {
  const out = ALL_FIELDS.filter((f) => es.some((e) => entryMetric(e, f) != null))
  return out.length ? out : ['reps']
}
/** >0 si `a` es mejor que `b`: primero la métrica principal (peso si hay), después el resto. */
export function cmpEntries(a: EntryValues, b: EntryValues, fields: Field[]) {
  const main = metricOf(fields)
  for (const f of [main, ...fields.filter((x) => x !== main)]) {
    const x = entryMetric(a, f) ?? -1, y = entryMetric(b, f) ?? -1
    if (x !== y) return x > y ? 1 : -1
  }
  return 0
}
export function bestEntry<T extends EntryValues>(es: T[], fields: Field[]): T | undefined {
  return es.reduce<T | undefined>((best, e) => (!best || cmpEntries(e, best, fields) > 0 ? e : best), undefined)
}
export const hasValues = (e?: EntryValues) => !!e && (e.weight != null || e.reps != null || e.durationSec != null || e.distance != null)
export function fmtMetric(v: number, f: Field) {
  return f === 'weight' ? `${fmtNum(v)} kg` : f === 'reps' ? `${fmtNum(v)} reps` : f === 'duration' ? fmtDur(v) : `${fmtNum(v)} m`
}

// ---------- links embebidos ----------
export interface LinkInfo { provider: 'youtube' | 'instagram' | 'tiktok' | 'vimeo' | 'drive' | 'facebook' | 'archivo' | 'otro'; embed?: string; file?: string; label: string; hint?: string }
export function parseLink(raw: string): LinkInfo | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (!/^https?:$/.test(u.protocol)) return null
  const host = u.hostname.replace(/^(www|m|music|web|mobile)\./, '')
  const seg = u.pathname.split('/').filter(Boolean)
  const id = (s?: string) => (s && /^[\w-]{5,}$/.test(s) ? s : undefined)
  if (/\.(mp4|webm|mov|m4v|ogv)$/i.test(u.pathname)) return { provider: 'archivo', label: 'Archivo de video', file: u.href }
  if (host === 'youtu.be' || host.endsWith('youtube.com') || host === 'youtube-nocookie.com') {
    const vid = host === 'youtu.be' ? id(seg[0])
      : seg[0] === 'watch' ? id(u.searchParams.get('v') ?? undefined)
      : ['shorts', 'embed', 'live', 'v'].includes(seg[0]) ? id(seg[1]) : undefined
    return { provider: 'youtube', label: 'YouTube', embed: vid && `https://www.youtube-nocookie.com/embed/${vid}?playsinline=1&rel=0`, hint: vid ? undefined : 'Pegá el link del video (el que dice youtube.com/watch… o youtu.be/…), no el del canal o la lista.' }
  }
  if (host === 'instagram.com' || host === 'instagr.am') {
    const i = seg.findIndex((s) => ['p', 'reel', 'reels', 'tv'].includes(s))
    const code = i >= 0 && seg[i - 1] !== 'share' ? id(seg[i + 1]) : undefined
    return { provider: 'instagram', label: 'Instagram', embed: code && `https://www.instagram.com/${seg[i] === 'p' ? 'p' : 'reel'}/${code}/embed`, hint: code ? undefined : 'Pegá el link del reel o del post (instagram.com/reel/… o /p/…). Los links de "compartir" y de perfil no se pueden mostrar acá.' }
  }
  if (host.endsWith('tiktok.com')) {
    const i = seg.indexOf('video')
    const j = seg.indexOf('v')
    const raw2 = i >= 0 ? seg[i + 1] : j >= 0 ? seg[j + 1]?.replace(/\.html$/, '') : undefined
    const vid = raw2 && /^\d+$/.test(raw2) ? raw2 : undefined
    return { provider: 'tiktok', label: 'TikTok', embed: vid && `https://www.tiktok.com/embed/v2/${vid}`, hint: vid ? undefined : 'Los links cortos de TikTok (vm.tiktok.com o /t/…) no se pueden mostrar. Abrilo, copiá el link largo (tiktok.com/@usuario/video/…) y pegalo.' }
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const vid = seg.find((x) => /^\d{5,}$/.test(x))
    return { provider: 'vimeo', label: 'Vimeo', embed: vid && `https://player.vimeo.com/video/${vid}` }
  }
  if (host === 'drive.google.com') {
    const k = seg.indexOf('d')
    const fid = k >= 0 ? id(seg[k + 1]) : id(u.searchParams.get('id') ?? undefined)
    return { provider: 'drive', label: 'Google Drive', embed: fid && `https://drive.google.com/file/d/${fid}/preview`, hint: fid ? 'El archivo tiene que estar compartido como "cualquier persona con el link".' : undefined }
  }
  if (host === 'facebook.com' || host === 'fb.watch') {
    return { provider: 'facebook', label: 'Facebook', embed: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(u.href)}&show_text=false` }
  }
  return { provider: 'otro', label: host, hint: 'Este sitio no permite mostrarse adentro de otra app.' }
}

// ---------- importación de rutina (JSON de Claude) ----------
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function validateRoutine(text: string): { errors: string[]; routine?: ImportRoutine } {
  let json: unknown
  try { json = JSON.parse(text) } catch (e) { return { errors: [`El texto no es JSON válido: ${(e as Error).message}`] } }
  const errors: string[] = []
  const err = (path: string, msg: string) => errors.push(`${path}: ${msg}`)
  if (!isObj(json)) return { errors: ['raíz: tiene que ser un objeto'] }
  if (json.version !== 1) err('version', 'tiene que ser 1')
  // formato nuevo: "routine": { name, type, goal } · formato anterior: "day": { name, tag }
  const key = isObj(json.routine) ? 'routine' : 'day'
  const meta = json[key]
  const out = { name: '', type: '', goal: '' }
  if (!isObj(meta)) err('routine', 'falta el objeto con el nombre y el tipo de la rutina')
  else {
    if (typeof meta.name !== 'string' || !meta.name.trim()) err(`${key}.name`, 'falta el nombre de la rutina')
    else out.name = meta.name.trim()
    if (meta.type != null && typeof meta.type !== 'string') err(`${key}.type`, 'tiene que ser texto (Lower, Upper, Full body, HIT, Push, Pull, Cardio u otro)')
    else if (typeof meta.type === 'string') out.type = meta.type.trim()
    if (meta.tag != null && meta.tag !== 'upper' && meta.tag !== 'lower') err(`${key}.tag`, 'tiene que ser "upper" o "lower"')
    else if (!out.type && meta.tag) out.type = meta.tag === 'upper' ? 'Upper' : 'Lower'
    const goal = meta.goal ?? json.goal
    if (goal != null && typeof goal !== 'string') err(meta.goal != null ? `${key}.goal` : 'goal', 'tiene que ser texto')
    else if (typeof goal === 'string') out.goal = goal.trim()
  }
  const blocks: ImportRoutine['blocks'] = []
  if (!Array.isArray(json.blocks) || !json.blocks.length) err('blocks', 'tiene que ser una lista con al menos un bloque')
  else json.blocks.forEach((b: unknown, bi: number) => {
    const bp = `blocks[${bi}]`
    if (!isObj(b)) return err(bp, 'tiene que ser un objeto')
    if (b.kind !== 'single' && b.kind !== 'superset') err(`${bp}.kind`, 'tiene que ser "single" o "superset"')
    if (b.rest != null && typeof b.rest !== 'string') err(`${bp}.rest`, 'tiene que ser texto')
    const exs: ImportRoutine['blocks'][number]['exercises'] = []
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
        const lk = x.video != null && x.video !== '' ? 'video' : 'link'
        const link = x[lk]
        if (link != null && link !== '' && (typeof link !== 'string' || !/^https?:\/\//.test(link))) err(`${xp}.${lk}`, 'tiene que ser una URL que empiece con http')
        if (x.note != null && typeof x.note !== 'string') err(`${xp}.note`, 'tiene que ser texto')
        if (x.muscleGroup != null && typeof x.muscleGroup !== 'string') err(`${xp}.muscleGroup`, 'tiene que ser texto')
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
          muscleGroup: typeof x.muscleGroup === 'string' ? cap(x.muscleGroup.trim()) : '',
          timeUnit: x.timeUnit === 'min' ? 'min' : 's', rounds: Number(x.rounds) || 1, target,
          linkUrl: typeof link === 'string' ? link : '', note: typeof x.note === 'string' ? x.note : '',
        })
      })
    }
    blocks.push({ kind: b.kind === 'superset' ? 'superset' : 'single', rest: typeof b.rest === 'string' ? b.rest : '', exercises: exs })
  })
  return errors.length ? { errors } : { errors, routine: { ...out, blocks } }
}

// ---------- backup ----------
const V2_TABLES = ['routines', 'blocks', 'library', 'routineItems', 'programs', 'sessions', 'entries', 'goals', 'settings'] as const
const V1_TABLES = ['days', 'blocks', 'exercises', 'sessions', 'entries', 'settings'] as const

/** Acepta backups actuales (schemaVersion 2) y los de la versión anterior (version 1), que se convierten. */
export function validateBackup(text: string): { error?: string; data?: Data } {
  let json: unknown
  try { json = JSON.parse(text) } catch { return { error: 'El archivo no es JSON válido' } }
  if (!isObj(json) || json.app !== 'ozo') return { error: 'El archivo no es un backup de Ozo' }
  const old = json.schemaVersion == null && json.version === 1
  if (!old && json.schemaVersion !== 2) return { error: 'Versión de backup no soportada' }
  for (const t of old ? V1_TABLES : V2_TABLES)
    if (!Array.isArray(json[t]) || !(json[t] as unknown[]).every(isObj)) return { error: `Backup incompleto: falta "${t}"` }
  if (old) {
    try { return { data: migrateV1(json as unknown as V1Data) } } catch { return { error: 'El backup viejo tiene datos inconsistentes' } }
  }
  const d = json as unknown as Data
  const ids = (rows: { id: number }[]) => new Set(rows.map((r) => r.id))
  const routines = ids(d.routines), lib = ids(d.library), sessions = ids(d.sessions)
  if (d.blocks.some((b) => !routines.has(b.routineId)) || d.routineItems.some((i) => !lib.has(i.exerciseId)) || d.entries.some((e) => !sessions.has(e.sessionId)))
    return { error: 'El backup tiene datos inconsistentes (referencias a filas que no existen)' }
  return { data: Object.fromEntries(V2_TABLES.map((t) => [t, d[t]])) as unknown as Data }
}

export async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* sigue con el método viejo */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  return ok
}

export const CLAUDE_PROMPT = `Convertí mi rutina de entrenamiento al siguiente formato JSON para importarla en la app Ozo. Respondé SOLO con el JSON, sin texto alrededor.

Reglas:
- "version" siempre 1.
- "routine.name" es el nombre de la rutina (ej. "Lower A"). "routine.type" es uno de: "Lower", "Upper", "Full body", "HIT", "Push", "Pull", "Cardio" (u otro texto corto si ninguno aplica).
- "routine.goal" es opcional: el objetivo de la rutina en texto libre (ej. "Búlgara 24 kg x 8").
- Cada bloque es "single" (un ejercicio) o "superset" (2 o más ejercicios que se alternan por ronda). Los ejercicios alternados (ej. Crunch / Wheel "máx rep") van como "superset".
- "rest" es texto libre del descanso del bloque, por ejemplo "3'-5'", "4'" o "Continue".
- "kind" del ejercicio: "fuerza", "core", "cardio", "funcional", "movilidad", "calentamiento" u "otro".
- "muscleGroup" es opcional: "Piernas", "Glúteos", "Espalda", "Pecho", "Hombros", "Brazos", "Core", "Cardio" o "Cuerpo completo".
- "timeUnit": "s" o "min" (unidad en la que se carga el tiempo). "rounds": entero de 1 a 20.
- "target.type": "range" (min y max), "fixed" (min), "time" (min y max opcional, SIEMPRE en segundos) o "max" (al fallo).
- "target.unit" opcional: "rep" o "m" (metros). "target.perSide": true si es por lado.
- "video" (URL de YouTube, Instagram o TikTok con la técnica) y "note" son opcionales.
- Usá siempre el mismo nombre para el mismo ejercicio: la app lo reconoce y no lo duplica en la biblioteca.

Ejemplo:
{
  "version": 1,
  "routine": { "name": "Lower A", "type": "Lower", "goal": "Búlgara 24 kg x 8" },
  "blocks": [
    { "kind": "single", "rest": "3'-5'",
      "exercises": [
        { "name": "Búlgara mancuernas", "kind": "fuerza", "muscleGroup": "Piernas", "timeUnit": "s", "rounds": 3,
          "target": { "type": "range", "min": 6, "max": 10 },
          "video": "https://youtube.com/watch?v=XXXXXXXXXXX", "note": "" } ] },
    { "kind": "superset", "rest": "Continue",
      "exercises": [
        { "name": "Crunch", "kind": "core", "muscleGroup": "Core", "rounds": 2, "target": { "type": "max" }, "note": "50 - 10kg" },
        { "name": "Wheel", "kind": "core", "muscleGroup": "Core", "rounds": 2, "target": { "type": "max" }, "note": "15" } ] }
  ]
}

Mi rutina:
`
