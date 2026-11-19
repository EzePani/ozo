import Dexie, { type EntityTable, type Table } from 'dexie'

// ---------- modelo ----------
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
/** Plantilla reutilizable (ej. "Lower A"). */
export interface Routine { id: number; name: string; type: string; order: number }
export interface Block { id: number; routineId: number; order: number; kind: 'single' | 'superset'; restLabel: string }
/** Definición única de un ejercicio: su historial se comparte entre rutinas. */
export interface LibExercise {
  id: number; name: string; norm: string; kind: string; muscleGroup: string; linkUrl: string; timeUnit: TimeUnit
  fields?: Field[] // solo para "otro" y tipos propios: qué campos se cargan
}
/** Uso de un ejercicio de la biblioteca dentro de una rutina. */
export interface RoutineItem { id: number; blockId: number; order: number; exerciseId: number; rounds: number; target: Target; note: string }
/** Una rutina puesta en un mes: crea una columna (sesión) por semana. */
export interface Program { id: number; routineId: number; month: string; weekday: number; weeks: number }
export interface Session { id: number; routineId: number; programId: number; date: string; status: 'planned' | 'done'; order: number; note?: string }
export interface Entry {
  sessionId: number; exerciseId: number; round: number
  weight?: number; reps?: number; durationSec?: number; distance?: number; done: boolean; note?: string
}
export interface Goal {
  id: number; scope: 'month' | 'routine'; ref: string // "YYYY-MM" o id de rutina
  text: string; exerciseId?: number; metric?: Field; target?: number; month?: string
}
export interface Settings { id: 1; theme: Theme; customKinds: string[]; routineTypes: string[] }

export interface Data {
  routines: Routine[]; blocks: Block[]; library: LibExercise[]; routineItems: RoutineItem[]; programs: Program[]
  sessions: Session[]; entries: Entry[]; goals: Goal[]; settings: Settings[]
}
export const TABLES = ['routines', 'blocks', 'library', 'routineItems', 'programs', 'sessions', 'entries', 'goals', 'settings'] as const

export const BASE_KINDS = ['fuerza', 'core', 'cardio', 'funcional', 'movilidad', 'calentamiento', 'otro']
export const BASE_ROUTINE_TYPES = ['Lower', 'Upper', 'Full body', 'HIT', 'Push', 'Pull', 'Cardio']
export const MUSCLE_GROUPS = ['Piernas', 'Glúteos', 'Espalda', 'Pecho', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Cuerpo completo']

// ---------- utilidades ----------
/** Nombre comparable: sin tildes, sin mayúsculas, espacios simples. */
export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()
export function isoOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export const todayISO = () => isoOf(new Date())
export function dateOf(iso: string) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d) }
export function addDays(iso: string, n: number) { const d = dateOf(iso); d.setDate(d.getDate() + n); return isoOf(d) }

// ---------- migración v1 → v2 (pura: la usan Dexie y la importación de backups viejos) ----------
export interface V1Data {
  days: { id: number; name: string; tag?: string; order: number }[]
  blocks: { id: number; dayId: number; order: number; kind: 'single' | 'superset'; restLabel: string }[]
  exercises: { id: number; blockId: number; order: number; name: string; kind: string; timeUnit?: TimeUnit; rounds: number; target: Target; note?: string; linkUrl?: string; fields?: Field[] }[]
  sessions: { id: number; dayId: number; date: string; status: 'planned' | 'done'; order: number }[]
  entries: Entry[]
  settings: { id: 1; theme: Theme; customKinds?: string[] }[]
}

export function migrateV1(v: V1Data): Data {
  const routines: Routine[] = v.days.map((d) => ({ id: d.id, name: d.name, type: d.tag === 'upper' ? 'Upper' : 'Lower', order: d.order }))
  const blocks: Block[] = v.blocks.map(({ dayId, ...b }) => ({ ...b, routineId: dayId }))
  const routineOfBlock = new Map(blocks.map((b) => [b.id, b.routineId]))

  // ejercicios con el mismo nombre en rutinas distintas pasan a ser uno solo en la biblioteca
  const library: LibExercise[] = []
  const byNorm = new Map<string, LibExercise>()
  const usedIn = new Map<number, Set<number>>()
  const remap = new Map<number, number>()
  const routineItems: RoutineItem[] = []
  for (const e of [...v.exercises].sort((a, b) => a.id - b.id)) {
    const routineId = routineOfBlock.get(e.blockId) ?? -1
    let lib = byNorm.get(norm(e.name))
    if (!lib || usedIn.get(lib.id)!.has(routineId)) {
      let name = e.name
      if (lib) { let n = 2; while (byNorm.has(norm(`${e.name} (${n})`))) n++; name = `${e.name} (${n})` }
      lib = { id: e.id, name, norm: norm(name), kind: e.kind, muscleGroup: '', linkUrl: e.linkUrl ?? '', timeUnit: e.timeUnit ?? 's' }
      if (e.fields?.length) lib.fields = e.fields
      library.push(lib); byNorm.set(lib.norm, lib); usedIn.set(lib.id, new Set())
    } else if (!lib.linkUrl && e.linkUrl) lib.linkUrl = e.linkUrl
    usedIn.get(lib.id)!.add(routineId)
    remap.set(e.id, lib.id)
    routineItems.push({ id: e.id, blockId: e.blockId, order: e.order, exerciseId: lib.id, rounds: e.rounds, target: e.target, note: e.note ?? '' })
  }
  const entries = new Map<string, Entry>()
  for (const e of v.entries) {
    const exerciseId = remap.get(e.exerciseId) ?? e.exerciseId
    entries.set(`${e.sessionId}-${exerciseId}-${e.round}`, { ...e, exerciseId })
  }

  // cada rutina + mes con sesiones pasa a ser un programa
  const programs: Program[] = []
  const progOf = new Map<string, Program>()
  const sessions: Session[] = [...v.sessions].sort((a, b) => a.date.localeCompare(b.date)).map(({ dayId, ...s }) => {
    const key = `${dayId}|${s.date.slice(0, 7)}`
    let p = progOf.get(key)
    if (!p) { p = { id: programs.length + 1, routineId: dayId, month: s.date.slice(0, 7), weekday: dateOf(s.date).getDay(), weeks: 0 }; programs.push(p); progOf.set(key, p) }
    p.weeks++
    return { ...s, routineId: dayId, programId: p.id }
  })
  const s0 = v.settings[0]
  return {
    routines, blocks, library, routineItems, programs, sessions, entries: [...entries.values()], goals: [],
    settings: [{ id: 1, theme: s0?.theme ?? 'system', customKinds: s0?.customKinds ?? [], routineTypes: [] }],
  }
}

// ---------- datos de ejemplo (solo al crear la base) ----------
function seed(): Data {
  const today = todayISO()
  const ex = (id: number, blockId: number, order: number, name: string, kind: string, rounds: number, target: Target, note = '') =>
    ({ id, blockId, order, name, kind, timeUnit: 's' as const, rounds, target, note, linkUrl: '' })
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
  const d = migrateV1({
    days: [{ id: 1, name: 'Lower', tag: 'lower', order: 0 }],
    blocks: [
      { id: 1, dayId: 1, order: 0, kind: 'single', restLabel: "3'–5'" },
      { id: 2, dayId: 1, order: 1, kind: 'single', restLabel: "4'" },
      { id: 3, dayId: 1, order: 2, kind: 'single', restLabel: "4'" },
      { id: 4, dayId: 1, order: 3, kind: 'single', restLabel: "3'–5'" },
      { id: 5, dayId: 1, order: 4, kind: 'single', restLabel: 'Continue' },
      { id: 6, dayId: 1, order: 5, kind: 'superset', restLabel: 'Continue' },
    ],
    exercises: [
      ex(1, 1, 0, 'Búlgara mancuernas', 'fuerza', 3, { type: 'range', min: 6, max: 10 }),
      ex(2, 2, 0, 'Peso muerto rumano', 'fuerza', 3, { type: 'range', min: 8, max: 12 }),
      ex(3, 3, 0, 'Step-down excéntrico', 'fuerza', 3, { type: 'range', min: 6, max: 8 }),
      ex(4, 4, 0, 'Gemelos una pierna', 'fuerza', 3, { type: 'range', min: 12, max: 15, perSide: true }),
      ex(5, 5, 0, 'Suitcase carry', 'funcional', 3, { type: 'time', min: 30, max: 40, perSide: true }),
      ex(6, 6, 0, 'Crunch', 'core', 4, { type: 'max' }, '50 – 10kg'),
      ex(7, 6, 1, 'Wheel', 'core', 4, { type: 'max' }, '15'),
    ],
    sessions: [
      { id: 1, dayId: 1, date: addDays(today, -14), status: 'done', order: 0 },
      { id: 2, dayId: 1, date: addDays(today, -7), status: 'done', order: 1 },
      { id: 3, dayId: 1, date: today, status: 'planned', order: 2 },
      { id: 4, dayId: 1, date: addDays(today, 7), status: 'planned', order: 3 },
    ],
    entries,
    settings: [{ id: 1, theme: 'system', customKinds: [] }],
  })
  // el ejemplo es un solo programa de 4 semanas, aunque cruce de mes
  d.programs = [{ id: 1, routineId: 1, month: today.slice(0, 7), weekday: dateOf(today).getDay(), weeks: 4 }]
  d.sessions.forEach((s) => { s.programId = 1 })
  const groups: Record<number, string> = { 1: 'Piernas', 2: 'Piernas', 3: 'Piernas', 4: 'Piernas', 5: 'Core', 6: 'Core', 7: 'Core' }
  d.library.forEach((l) => { l.muscleGroup = groups[l.id] ?? '' })
  return d
}

// ---------- base ----------
class OzoDB extends Dexie {
  routines!: EntityTable<Routine, 'id'>
  blocks!: EntityTable<Block, 'id'>
  library!: EntityTable<LibExercise, 'id'>
  routineItems!: EntityTable<RoutineItem, 'id'>
  programs!: EntityTable<Program, 'id'>
  sessions!: EntityTable<Session, 'id'>
  entries!: Table<Entry, [number, number, number]>
  goals!: EntityTable<Goal, 'id'>
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
    this.version(2).stores({
      days: null,
      exercises: null,
      routines: '++id, order',
      blocks: '++id, routineId',
      library: '++id, norm',
      routineItems: '++id, blockId, exerciseId',
      programs: '++id, routineId, month',
      sessions: '++id, routineId, programId, date, [routineId+date]',
      goals: '++id, scope',
    }).upgrade(async (tx) => {
      const [days, blocks, exercises, sessions, entries, settings] = await Promise.all(
        ['days', 'blocks', 'exercises', 'sessions', 'entries', 'settings'].map((t) => tx.table(t).toArray()))
      const d = migrateV1({ days, blocks, exercises, sessions, entries, settings })
      for (const t of TABLES) { await tx.table(t).clear(); await tx.table(t).bulkAdd(d[t]) }
    })
    this.on('populate', (tx) => {
      const d = seed()
      for (const t of TABLES) tx.table(t).bulkAdd(d[t])
    })
  }
}
export const db = new OzoDB()
