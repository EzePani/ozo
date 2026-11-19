import Dexie, { type EntityTable, type Table } from 'dexie'

export type Tag = 'upper' | 'lower'
export type TimeUnit = 's' | 'min'
export type Field = 'weight' | 'reps' | 'duration' | 'distance'
export type Theme = 'system' | 'light' | 'dark'

export interface Target {
  type: 'range' | 'fixed' | 'time' | 'max'
  min?: number // en reps, metros o segundos (si type = time)
  max?: number
  unit?: 'rep' | 'm'
  perSide?: boolean
}
export interface Day { id: number; name: string; tag: Tag; order: number }
export interface Block { id: number; dayId: number; order: number; kind: 'single' | 'superset'; restLabel: string }
export interface Exercise {
  id: number; blockId: number; order: number; name: string; kind: string; timeUnit: TimeUnit
  rounds: number; target: Target; note: string; linkUrl: string
  fields?: Field[] // solo para "otro" y tipos propios: qué campos se cargan
}
export interface Session { id: number; dayId: number; date: string; status: 'planned' | 'done'; order: number }
export interface Entry {
  sessionId: number; exerciseId: number; round: number
  weight?: number; reps?: number; durationSec?: number; distance?: number; done: boolean
}
export interface Settings { id: 1; theme: Theme; customKinds: string[] }

export const BASE_KINDS = ['fuerza', 'core', 'cardio', 'funcional', 'movilidad', 'calentamiento', 'otro']

class OzoDB extends Dexie {
  days!: EntityTable<Day, 'id'>
  blocks!: EntityTable<Block, 'id'>
  exercises!: EntityTable<Exercise, 'id'>
  sessions!: EntityTable<Session, 'id'>
  entries!: Table<Entry, [number, number, number]>
  settings!: Table<Settings, number>
  constructor() {
    super('ozo')
    this.version(1).stores({
      days: '++id, order',
      blocks: '++id, dayId',
      exercises: '++id, blockId',
      sessions: '++id, dayId, date, [dayId+date]',
      entries: '[sessionId+exerciseId+round], sessionId, exerciseId',
      settings: 'id',
    })
  }
}
export const db = new OzoDB()

// ---------- fechas ----------
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayISO = () => isoOf(new Date())
function isoOffset(days: number) { const d = new Date(); d.setDate(d.getDate() + days); return isoOf(d) }

// ---------- datos de ejemplo (solo al crear la base) ----------
db.on('populate', (tx) => {
  const ex = (id: number, blockId: number, order: number, name: string, kind: string, rounds: number, target: Target, note = ''): Exercise =>
    ({ id, blockId, order, name, kind, timeUnit: 's', rounds, target, note, linkUrl: '' })
  tx.table('settings').add({ id: 1, theme: 'system', customKinds: [] })
  tx.table('days').add({ id: 1, name: 'Lower', tag: 'lower', order: 0 })
  tx.table('blocks').bulkAdd([
    { id: 1, dayId: 1, order: 0, kind: 'single', restLabel: "3'–5'" },
    { id: 2, dayId: 1, order: 1, kind: 'single', restLabel: "4'" },
    { id: 3, dayId: 1, order: 2, kind: 'single', restLabel: "4'" },
    { id: 4, dayId: 1, order: 3, kind: 'single', restLabel: "3'–5'" },
    { id: 5, dayId: 1, order: 4, kind: 'single', restLabel: 'Continue' },
    { id: 6, dayId: 1, order: 5, kind: 'superset', restLabel: 'Continue' },
  ])
  tx.table('exercises').bulkAdd([
    ex(1, 1, 0, 'Búlgara mancuernas', 'fuerza', 3, { type: 'range', min: 6, max: 10 }),
    ex(2, 2, 0, 'Peso muerto rumano', 'fuerza', 3, { type: 'range', min: 8, max: 12 }),
    ex(3, 3, 0, 'Step-down excéntrico', 'fuerza', 3, { type: 'range', min: 6, max: 8 }),
    ex(4, 4, 0, 'Gemelos una pierna', 'fuerza', 3, { type: 'range', min: 12, max: 15, perSide: true }),
    ex(5, 5, 0, 'Suitcase carry', 'funcional', 3, { type: 'time', min: 30, max: 40, perSide: true }),
    ex(6, 6, 0, 'Crunch', 'core', 4, { type: 'max' }, '50 – 10kg'),
    ex(7, 6, 1, 'Wheel', 'core', 4, { type: 'max' }, '15'),
  ])
  tx.table('sessions').bulkAdd([
    { id: 1, dayId: 1, date: isoOffset(-14), status: 'done', order: 0 },
    { id: 2, dayId: 1, date: isoOffset(-7), status: 'done', order: 1 },
    { id: 3, dayId: 1, date: isoOffset(7), status: 'planned', order: 2 },
  ])
  const entries: Entry[] = []
  const wr = (s: number, e: number, rows: [number, number][]) =>
    rows.forEach(([weight, reps], i) => entries.push({ sessionId: s, exerciseId: e, round: i + 1, weight, reps, done: true }))
  wr(1, 1, [[18, 8], [18, 7], [18, 6]]); wr(2, 1, [[20, 8], [20, 7], [20, 7]])
  wr(1, 2, [[50, 12], [50, 10], [50, 10]]); wr(2, 2, [[55, 10], [55, 10], [55, 9]])
  wr(1, 3, [[8, 8], [8, 7], [8, 6]]); wr(2, 3, [[10, 8], [10, 7], [10, 6]])
  wr(1, 4, [[12, 15], [12, 14], [12, 12]]); wr(2, 4, [[14, 15], [14, 13], [14, 12]])
  ;[[1, 20, 30], [2, 22, 35]].forEach(([s, weight, sec]) => {
    for (let r = 1; r <= 3; r++) entries.push({ sessionId: s, exerciseId: 5, round: r, weight, durationSec: sec, done: true })
  })
  ;[[1, 40, 10], [2, 45, 12]].forEach(([s, crunch, wheel]) => {
    for (let r = 1; r <= 4; r++) {
      entries.push({ sessionId: s, exerciseId: 6, round: r, reps: crunch - (r - 1) * 2, done: true })
      entries.push({ sessionId: s, exerciseId: 7, round: r, reps: wheel - (r - 1), done: true })
    }
  })
  tx.table('entries').bulkAdd(entries)
})

// ---------- lectura de un día ----------
export interface FlatRow { ex: Exercise; block: Block; pos: 'single' | 'first' | 'mid' | 'last' }
export interface DayTree { day: Day; blocks: Block[]; exercises: Exercise[]; flat: FlatRow[] }

export async function loadDay(dayId: number): Promise<DayTree | null> {
  const day = await db.days.get(dayId)
  if (!day) return null
  const blocks = (await db.blocks.where('dayId').equals(dayId).toArray()).sort((a, b) => a.order - b.order)
  const exercises = await db.exercises.where('blockId').anyOf(blocks.map((b) => b.id)).toArray()
  const flat: FlatRow[] = []
  for (const block of blocks) {
    const list = exercises.filter((e) => e.blockId === block.id).sort((a, b) => a.order - b.order)
    list.forEach((ex, i) => flat.push({
      ex, block,
      pos: block.kind === 'single' || list.length === 1 ? 'single' : i === 0 ? 'first' : i === list.length - 1 ? 'last' : 'mid',
    }))
  }
  return { day, blocks, exercises: flat.map((f) => f.ex), flat }
}

// ---------- estructura de bloques ----------
export interface Group { blockId?: number; kind: 'single' | 'superset'; restLabel: string; exIds: number[] }

export function groupsOf(flat: FlatRow[]): Group[] {
  const out: Group[] = []
  for (const { ex, block } of flat) {
    const last = out[out.length - 1]
    if (last && last.blockId === block.id) last.exIds.push(ex.id)
    else out.push({ blockId: block.id, kind: block.kind, restLabel: block.restLabel, exIds: [ex.id] })
  }
  return out
}

/** Reescribe los bloques del día según `groups`. Reutiliza ids de bloque y borra los que quedan vacíos. */
export async function applyGroups(dayId: number, groups: Group[]) {
  await db.transaction('rw', db.blocks, db.exercises, async () => {
    const used = new Set<number>()
    let order = 0
    for (const g of groups) {
      if (!g.exIds.length) continue
      const kind = g.exIds.length > 1 && g.kind === 'superset' ? 'superset' : 'single'
      // un bloque "single" con varios ejercicios se parte en uno por ejercicio
      const parts = kind === 'superset' ? [g.exIds] : g.exIds.map((id) => [id])
      for (const ids of parts) {
        let blockId = g.blockId
        if (blockId == null || used.has(blockId)) blockId = await db.blocks.add({ dayId, order, kind, restLabel: g.restLabel })
        else await db.blocks.update(blockId, { dayId, order, kind, restLabel: g.restLabel })
        used.add(blockId)
        order++
        for (let i = 0; i < ids.length; i++) await db.exercises.update(ids[i], { blockId, order: i })
      }
    }
    const stale = (await db.blocks.where('dayId').equals(dayId).primaryKeys()).filter((id) => !used.has(id))
    await db.blocks.bulkDelete(stale)
  })
}

async function currentGroups(dayId: number) { return groupsOf((await loadDay(dayId))?.flat ?? []) }

export async function groupExercises(dayId: number, ids: number[]) {
  const groups = await currentGroups(dayId)
  const order = groups.flatMap((g) => g.exIds).filter((id) => ids.includes(id))
  if (order.length < 2) return
  const at = groups.findIndex((g) => g.exIds.includes(order[0]))
  const restLabel = groups[at].restLabel
  const next: Group[] = []
  groups.forEach((g, i) => {
    if (i === at) next.push({ kind: 'superset', restLabel, exIds: order })
    const rest = g.exIds.filter((id) => !ids.includes(id))
    if (rest.length) next.push({ ...g, exIds: rest })
  })
  await applyGroups(dayId, next)
}

export async function ungroupExercises(dayId: number, ids: number[]) {
  const groups = await currentGroups(dayId)
  const next: Group[] = []
  for (const g of groups) {
    const out = g.exIds.filter((id) => ids.includes(id))
    if (g.kind !== 'superset' || !out.length) { next.push(g); continue }
    const keep = g.exIds.filter((id) => !ids.includes(id))
    if (keep.length) next.push({ ...g, exIds: keep })
    out.forEach((id) => next.push({ kind: 'single', restLabel: g.restLabel, exIds: [id] }))
  }
  await applyGroups(dayId, next)
}

/** Mueve un ejercicio a la posición `toIndex` de la lista plana. Si cae entre dos ejercicios de un mismo bloque, entra al bloque. */
export async function moveExercise(dayId: number, exId: number, toIndex: number) {
  const tree = await loadDay(dayId)
  if (!tree) return
  const rows = tree.flat.map((f) => ({ id: f.ex.id, block: f.block }))
  const from = rows.findIndex((r) => r.id === exId)
  if (from < 0) return
  const [moved] = rows.splice(from, 1)
  rows.splice(toIndex, 0, moved)
  const prev = rows[toIndex - 1], next = rows[toIndex + 1]
  const own = moved.block
  // entra a un bloque si cae entre dos de sus ejercicios; sigue en el suyo si queda pegado a él
  const joins = prev && next && prev.block.id === next.block.id && prev.block.kind === 'superset' ? prev.block
    : own.kind === 'superset' && (prev?.block.id === own.id || next?.block.id === own.id) ? own : null
  const groups: Group[] = []
  rows.forEach((r, i) => {
    const last = groups[groups.length - 1]
    if (i === toIndex) {
      if (joins && last && last.blockId === joins.id) last.exIds.push(r.id)
      else if (joins) groups.push({ blockId: joins.id, kind: 'superset', restLabel: joins.restLabel, exIds: [r.id] })
      else groups.push({ blockId: own.kind === 'single' ? own.id : undefined, kind: 'single', restLabel: own.restLabel, exIds: [r.id] })
    } else if (last && last.blockId === r.block.id && last.kind === r.block.kind && r.block.kind === 'superset') last.exIds.push(r.id)
    else groups.push({ blockId: r.block.id, kind: r.block.kind, restLabel: r.block.restLabel, exIds: [r.id] })
  })
  await applyGroups(dayId, groups)
}

export type ExerciseDraft = Omit<Exercise, 'id' | 'blockId' | 'order'>

export async function addExercise(dayId: number, draft: ExerciseDraft, restLabel: string) {
  return db.transaction('rw', db.blocks, db.exercises, async () => {
    const order = await db.blocks.where('dayId').equals(dayId).count()
    const blockId = await db.blocks.add({ dayId, order, kind: 'single', restLabel })
    return db.exercises.add({ ...draft, blockId, order: 0 })
  })
}

export async function moveExercisesToDay(fromDay: number, ids: number[], toDay: number) {
  const from = await currentGroups(fromDay)
  const to = await currentGroups(toDay)
  const moved: Group[] = []
  const rest: Group[] = []
  for (const g of from) {
    const out = g.exIds.filter((id) => ids.includes(id))
    const keep = g.exIds.filter((id) => !ids.includes(id))
    if (keep.length) rest.push({ ...g, exIds: keep })
    if (out.length) moved.push({ kind: keep.length ? 'single' : g.kind, restLabel: g.restLabel, exIds: out, blockId: keep.length ? undefined : g.blockId })
  }
  await applyGroups(toDay, [...to, ...moved])
  await applyGroups(fromDay, rest)
}

export async function duplicateExercises(dayId: number, ids: number[]) {
  const tree = await loadDay(dayId)
  if (!tree) return
  for (const { ex, block } of tree.flat) {
    if (!ids.includes(ex.id)) continue
    const { id: _id, blockId: _b, order: _o, ...draft } = ex
    await addExercise(dayId, { ...draft, name: `${ex.name} (copia)` }, block.restLabel)
  }
}

export async function deleteExercises(dayId: number, ids: number[]) {
  await db.transaction('rw', db.blocks, db.exercises, db.entries, async () => {
    await db.entries.where('exerciseId').anyOf(ids).delete()
    await db.exercises.bulkDelete(ids)
  })
  await applyGroups(dayId, await currentGroups(dayId))
}

// ---------- días ----------
export async function createDay(name: string, tag: Tag) {
  return db.days.add({ name, tag, order: await db.days.count() })
}

export async function duplicateDay(dayId: number) {
  const tree = await loadDay(dayId)
  if (!tree) return
  const newId = await createDay(`${tree.day.name} (copia)`, tree.day.tag)
  for (const b of tree.blocks) {
    const blockId = await db.blocks.add({ dayId: newId, order: b.order, kind: b.kind, restLabel: b.restLabel })
    for (const e of tree.exercises.filter((x) => x.blockId === b.id)) {
      const { id: _id, ...rest } = e
      await db.exercises.add({ ...rest, blockId })
    }
  }
  return newId
}

export async function deleteDay(dayId: number) {
  await db.transaction('rw', [db.days, db.blocks, db.exercises, db.sessions, db.entries], async () => {
    const blockIds = await db.blocks.where('dayId').equals(dayId).primaryKeys()
    const exIds = await db.exercises.where('blockId').anyOf(blockIds).primaryKeys()
    const sessIds = await db.sessions.where('dayId').equals(dayId).primaryKeys()
    await db.entries.where('exerciseId').anyOf(exIds).delete()
    await db.entries.where('sessionId').anyOf(sessIds).delete()
    await db.exercises.bulkDelete(exIds)
    await db.blocks.bulkDelete(blockIds)
    await db.sessions.bulkDelete(sessIds)
    await db.days.delete(dayId)
  })
}

// ---------- sesiones ----------
export async function addSession(dayId: number, date: string, status: Session['status'] = 'planned') {
  // en transacción: dos llamadas simultáneas no crean la misma columna dos veces
  return db.transaction('rw', db.sessions, async () => {
    const existing = await db.sessions.where('[dayId+date]').equals([dayId, date]).first()
    if (existing) return existing.id
    return db.sessions.add({ dayId, date, status, order: await db.sessions.where('dayId').equals(dayId).count() })
  })
}
export const ensureTodaySession = (dayId: number) => addSession(dayId, todayISO())

export async function deleteSession(id: number) {
  await db.transaction('rw', db.sessions, db.entries, async () => {
    await db.entries.where('sessionId').equals(id).delete()
    await db.sessions.delete(id)
  })
}

export type EntryValues = Pick<Entry, 'weight' | 'reps' | 'durationSec' | 'distance'>

export async function saveEntry(sessionId: number, exerciseId: number, round: number, values: EntryValues, done: boolean) {
  const empty = values.weight == null && values.reps == null && values.durationSec == null && values.distance == null
  if (empty && !done) await db.entries.delete([sessionId, exerciseId, round])
  else await db.entries.put({ sessionId, exerciseId, round, ...values, done })
  if (done) await db.sessions.update(sessionId, { status: 'done' })
}

/** Registros de la sesión anterior (misma rutina, fecha previa) que tenga datos de ese ejercicio. */
export async function previousEntries(exerciseId: number, beforeDate: string, excludeSessionId?: number) {
  const all = await db.entries.where('exerciseId').equals(exerciseId).toArray()
  const sessions = await db.sessions.bulkGet([...new Set(all.map((e) => e.sessionId))])
  const prev = sessions
    .filter((s): s is Session => !!s && s.id !== excludeSessionId && s.date < beforeDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .find((s) => all.some((e) => e.sessionId === s.id && e.done))
  if (!prev) return null
  return { session: prev, entries: all.filter((e) => e.sessionId === prev.id).sort((a, b) => a.round - b.round) }
}

// ---------- ajustes ----------
export async function getSettings(): Promise<Settings> {
  return (await db.settings.get(1)) ?? { id: 1, theme: 'system', customKinds: [] }
}
export async function patchSettings(patch: Partial<Settings>) {
  await db.settings.put({ ...(await getSettings()), ...patch, id: 1 })
}
export async function addCustomKind(name: string) {
  const k = name.trim().toLowerCase()
  if (!k || BASE_KINDS.includes(k)) return
  const s = await getSettings()
  if (!s.customKinds.includes(k)) await patchSettings({ customKinds: [...s.customKinds, k] })
}

// ---------- backup ----------
const TABLES = ['days', 'blocks', 'exercises', 'sessions', 'entries', 'settings'] as const
export interface Backup { app: 'ozo'; version: 1; exportedAt: string; days: Day[]; blocks: Block[]; exercises: Exercise[]; sessions: Session[]; entries: Entry[]; settings: Settings[] }

export async function exportAll(): Promise<Backup> {
  const [days, blocks, exercises, sessions, entries, settings] = await Promise.all(TABLES.map((t) => db.table(t).toArray()))
  return { app: 'ozo', version: 1, exportedAt: new Date().toISOString(), days, blocks, exercises, sessions, entries, settings }
}
export async function restoreAll(b: Backup) {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) { await db.table(t).clear(); await db.table(t).bulkAdd(b[t] as never[]) }
  })
}
export async function clearAll() {
  const { theme } = await getSettings()
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear()
    await db.settings.put({ id: 1, theme, customKinds: [] })
  })
}
