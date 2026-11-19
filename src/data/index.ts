/**
 * Capa de datos de Ozo. Es el único lugar que conoce a Dexie: las páginas usan estas funciones
 * (y `useLive` para leer en vivo). Migrar a otra base después toca solo esta carpeta.
 */
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BASE_KINDS, BASE_ROUTINE_TYPES, TABLES, addDays, dateOf, db, norm, todayISO,
  type Block, type Data, type Entry, type Goal, type LibExercise, type Program, type Routine, type RoutineItem, type Session, type Settings, type Target,
} from './schema'

export { BASE_KINDS, BASE_ROUTINE_TYPES, MUSCLE_GROUPS, addDays, dateOf, isoOf, migrateV1, norm, todayISO } from './schema'
export type { Block, Data, Entry, Field, Goal, LibExercise, Program, Routine, RoutineItem, Session, Settings, Target, Theme, TimeUnit, V1Data } from './schema'

export const useLive = useLiveQuery
export type Undo = () => Promise<void>
const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order
const present = <T,>(v: T | undefined | null): v is T => v != null

// ---------- rutinas ----------
/** Ejercicio de una rutina: la definición de la biblioteca + su uso (rondas, objetivo, nota). `id` es el de la biblioteca. */
export interface Exercise extends Omit<LibExercise, 'norm'> { itemId: number; blockId: number; order: number; rounds: number; target: Target; note: string }
export interface FlatRow { ex: Exercise; block: Block; pos: 'single' | 'first' | 'mid' | 'last' }
export interface RoutineTree { routine: Routine; blocks: Block[]; flat: FlatRow[] }

export const getRoutines = () => db.routines.orderBy('order').toArray()

export async function loadRoutine(routineId: number): Promise<RoutineTree | null> {
  const routine = await db.routines.get(routineId)
  if (!routine) return null
  const blocks = (await db.blocks.where('routineId').equals(routineId).toArray()).sort(byOrder)
  const items = await db.routineItems.where('blockId').anyOf(blocks.map((b) => b.id)).toArray()
  const libs = new Map((await db.library.bulkGet(items.map((i) => i.exerciseId))).filter(present).map((l) => [l.id, l]))
  const flat: FlatRow[] = []
  for (const block of blocks) {
    const list = items.filter((i) => i.blockId === block.id && libs.has(i.exerciseId)).sort(byOrder)
    list.forEach((it, i) => {
      const { norm: _n, ...lib } = libs.get(it.exerciseId)!
      flat.push({
        ex: { ...lib, itemId: it.id, blockId: it.blockId, order: it.order, rounds: it.rounds, target: it.target, note: it.note },
        block,
        pos: block.kind === 'single' || list.length === 1 ? 'single' : i === 0 ? 'first' : i === list.length - 1 ? 'last' : 'mid',
      })
    })
  }
  return { routine, blocks, flat }
}

export async function getRoutineCards() {
  const [routines, blocks, items] = await Promise.all([getRoutines(), db.blocks.toArray(), db.routineItems.toArray()])
  return routines.map((routine) => {
    const ids = new Set(blocks.filter((b) => b.routineId === routine.id).map((b) => b.id))
    return { routine, exercises: items.filter((i) => ids.has(i.blockId)).length }
  })
}

export async function createRoutine(name: string, type: string) {
  return db.routines.add({ name: name.trim(), type, order: await db.routines.count() })
}
export const updateRoutine = (id: number, patch: Partial<Pick<Routine, 'name' | 'type'>>) => db.routines.update(id, patch)

export async function duplicateRoutine(routineId: number) {
  const tree = await loadRoutine(routineId)
  if (!tree) return
  return db.transaction('rw', db.routines, db.blocks, db.routineItems, async () => {
    const newId = await createRoutine(`${tree.routine.name} (copia)`, tree.routine.type)
    for (const b of tree.blocks) {
      const blockId = await db.blocks.add({ routineId: newId, order: b.order, kind: b.kind, restLabel: b.restLabel })
      for (const { ex } of tree.flat.filter((f) => f.block.id === b.id))
        await db.routineItems.add({ blockId, order: ex.order, exerciseId: ex.id, rounds: ex.rounds, target: ex.target, note: ex.note })
    }
    return newId
  })
}

/** Borra filas guardando una copia: la función que devuelve las restaura. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function removeRows(spec: { table: string; keys: any[] }[]): Promise<Undo> {
  const tables = spec.map((s) => db.table(s.table))
  const saved = await db.transaction('rw', tables, async () => {
    const out: unknown[][] = []
    for (const s of spec) {
      out.push((await db.table(s.table).bulkGet(s.keys)).filter(present))
      await db.table(s.table).bulkDelete(s.keys)
    }
    return out
  })
  return () => db.transaction('rw', tables, async () => { for (let i = 0; i < spec.length; i++) await db.table(spec[i].table).bulkPut(saved[i]) })
}
const entryKeys = (sessionIds: number[]) => db.entries.where('sessionId').anyOf(sessionIds).primaryKeys()

export async function deleteRoutine(routineId: number): Promise<Undo> {
  const blockIds = await db.blocks.where('routineId').equals(routineId).primaryKeys()
  const sessIds = await db.sessions.where('routineId').equals(routineId).primaryKeys()
  return removeRows([
    { table: 'entries', keys: await entryKeys(sessIds) },
    { table: 'sessions', keys: sessIds },
    { table: 'programs', keys: await db.programs.where('routineId').equals(routineId).primaryKeys() },
    { table: 'routineItems', keys: await db.routineItems.where('blockId').anyOf(blockIds).primaryKeys() },
    { table: 'blocks', keys: blockIds },
    { table: 'goals', keys: (await db.goals.toArray()).filter((g) => g.scope === 'routine' && g.ref === String(routineId)).map((g) => g.id) },
    { table: 'routines', keys: [routineId] },
  ])
}

// ---------- estructura de bloques (superseries) ----------
export interface Group { blockId?: number; kind: 'single' | 'superset'; restLabel: string; ids: number[] } // ids de ítem

export function groupsOf(flat: FlatRow[]): Group[] {
  const out: Group[] = []
  for (const { ex, block } of flat) {
    const last = out[out.length - 1]
    if (last && last.blockId === block.id) last.ids.push(ex.itemId)
    else out.push({ blockId: block.id, kind: block.kind, restLabel: block.restLabel, ids: [ex.itemId] })
  }
  return out
}

/** Reescribe los bloques de la rutina según `groups`. Reutiliza ids de bloque y borra los que quedan vacíos. */
export async function applyGroups(routineId: number, groups: Group[]) {
  await db.transaction('rw', db.blocks, db.routineItems, async () => {
    const used = new Set<number>()
    let order = 0
    for (const g of groups) {
      if (!g.ids.length) continue
      const kind = g.ids.length > 1 && g.kind === 'superset' ? 'superset' : 'single'
      const parts = kind === 'superset' ? [g.ids] : g.ids.map((id) => [id])
      for (const ids of parts) {
        let blockId = g.blockId
        if (blockId == null || used.has(blockId)) blockId = await db.blocks.add({ routineId, order, kind, restLabel: g.restLabel })
        else await db.blocks.update(blockId, { routineId, order, kind, restLabel: g.restLabel })
        used.add(blockId)
        order++
        for (let i = 0; i < ids.length; i++) await db.routineItems.update(ids[i], { blockId, order: i })
      }
    }
    const stale = (await db.blocks.where('routineId').equals(routineId).primaryKeys()).filter((id) => !used.has(id))
    await db.blocks.bulkDelete(stale)
  })
}
async function currentGroups(routineId: number) { return groupsOf((await loadRoutine(routineId))?.flat ?? []) }

export async function groupExercises(routineId: number, ids: number[]) {
  const groups = await currentGroups(routineId)
  const order = groups.flatMap((g) => g.ids).filter((id) => ids.includes(id))
  if (order.length < 2) return
  const at = groups.findIndex((g) => g.ids.includes(order[0]))
  const restLabel = groups[at].restLabel
  const next: Group[] = []
  groups.forEach((g, i) => {
    if (i === at) next.push({ kind: 'superset', restLabel, ids: order })
    const rest = g.ids.filter((id) => !ids.includes(id))
    if (rest.length) next.push({ ...g, ids: rest })
  })
  await applyGroups(routineId, next)
}

export async function ungroupExercises(routineId: number, ids: number[]) {
  const groups = await currentGroups(routineId)
  const next: Group[] = []
  for (const g of groups) {
    const out = g.ids.filter((id) => ids.includes(id))
    if (g.kind !== 'superset' || !out.length) { next.push(g); continue }
    const keep = g.ids.filter((id) => !ids.includes(id))
    if (keep.length) next.push({ ...g, ids: keep })
    out.forEach((id) => next.push({ kind: 'single', restLabel: g.restLabel, ids: [id] }))
  }
  await applyGroups(routineId, next)
}

/** Mueve un ejercicio a la posición `toIndex` de la lista plana. Si cae entre dos ejercicios de un mismo bloque, entra al bloque. */
export async function moveExercise(routineId: number, itemId: number, toIndex: number) {
  const tree = await loadRoutine(routineId)
  if (!tree) return
  const rows = tree.flat.map((f) => ({ id: f.ex.itemId, block: f.block }))
  const from = rows.findIndex((r) => r.id === itemId)
  if (from < 0 || toIndex < 0 || toIndex >= rows.length) return
  const [moved] = rows.splice(from, 1)
  rows.splice(toIndex, 0, moved)
  const prev = rows[toIndex - 1], next = rows[toIndex + 1]
  const own = moved.block
  const joins = prev && next && prev.block.id === next.block.id && prev.block.kind === 'superset' ? prev.block
    : own.kind === 'superset' && (prev?.block.id === own.id || next?.block.id === own.id) ? own : null
  const groups: Group[] = []
  rows.forEach((r, i) => {
    const last = groups[groups.length - 1]
    if (i === toIndex) {
      if (joins && last && last.blockId === joins.id) last.ids.push(r.id)
      else if (joins) groups.push({ blockId: joins.id, kind: 'superset', restLabel: joins.restLabel, ids: [r.id] })
      else groups.push({ blockId: own.kind === 'single' ? own.id : undefined, kind: 'single', restLabel: own.restLabel, ids: [r.id] })
    } else if (last && last.blockId === r.block.id && last.kind === r.block.kind && r.block.kind === 'superset') last.ids.push(r.id)
    else groups.push({ blockId: r.block.id, kind: r.block.kind, restLabel: r.block.restLabel, ids: [r.id] })
  })
  await applyGroups(routineId, groups)
}

// ---------- ejercicios dentro de una rutina ----------
export type LibDraft = Pick<LibExercise, 'name' | 'kind' | 'muscleGroup' | 'linkUrl' | 'timeUnit' | 'fields'>
export type ItemDraft = Pick<RoutineItem, 'rounds' | 'target' | 'note'>

async function inRoutine(routineId: number, exerciseId: number) {
  const blockIds = await db.blocks.where('routineId').equals(routineId).primaryKeys()
  return (await db.routineItems.where('exerciseId').equals(exerciseId).toArray()).some((i) => blockIds.includes(i.blockId))
}
async function addItem(routineId: number, exerciseId: number, d: ItemDraft, restLabel: string) {
  const order = await db.blocks.where('routineId').equals(routineId).count()
  const blockId = await db.blocks.add({ routineId, order, kind: 'single', restLabel })
  return db.routineItems.add({ blockId, order: 0, exerciseId, ...d })
}
const libRow = (d: LibDraft) => ({ name: d.name.trim(), norm: norm(d.name), kind: d.kind, muscleGroup: d.muscleGroup, linkUrl: d.linkUrl, timeUnit: d.timeUnit, fields: d.fields })

/** Crea o edita un ejercicio de la biblioteca. 'dup' si el nombre ya lo usa otro. */
export async function saveLibExercise(d: LibDraft, id?: number): Promise<number | 'dup'> {
  return db.transaction('rw', db.library, async () => {
    const same = await db.library.where('norm').equals(norm(d.name)).first()
    if (same && same.id !== id) return 'dup'
    if (id != null) { await db.library.update(id, libRow(d)); return id }
    return db.library.add(libRow(d))
  })
}

/** Guarda un ejercicio en una rutina. Si el nombre ya está en la biblioteca, se vincula en lugar de duplicarse. */
export async function saveRoutineExercise(routineId: number, lib: LibDraft, item: ItemDraft, restLabel: string, row?: Exercise): Promise<'ok' | 'dup' | 'in-routine'> {
  return db.transaction('rw', db.library, db.routineItems, db.blocks, async () => {
    if (row) {
      if ((await saveLibExercise(lib, row.id)) === 'dup') return 'dup'
      await db.routineItems.update(row.itemId, item)
      await db.blocks.update(row.blockId, { restLabel })
      return 'ok'
    }
    const same = await db.library.where('norm').equals(norm(lib.name)).first()
    if (same && (await inRoutine(routineId, same.id))) return 'in-routine'
    if (same) await db.library.update(same.id, libRow(lib))
    await addItem(routineId, same?.id ?? (await db.library.add(libRow(lib))), item, restLabel)
    return 'ok'
  })
}

/** Suma a la rutina un ejercicio de la biblioteca, con las rondas y el objetivo de su último uso. */
export async function addFromLibrary(routineId: number, exerciseId: number): Promise<'ok' | 'in-routine'> {
  return db.transaction('rw', db.routineItems, db.blocks, async () => {
    if (await inRoutine(routineId, exerciseId)) return 'in-routine'
    const last = (await db.routineItems.where('exerciseId').equals(exerciseId).toArray()).pop()
    await addItem(routineId, exerciseId, { rounds: last?.rounds ?? 3, target: last?.target ?? { type: 'range', min: 8, max: 12 }, note: '' }, '')
    return 'ok'
  })
}

export const updateItems = (itemIds: number[], patch: Partial<ItemDraft>) => db.routineItems.bulkUpdate(itemIds.map((key) => ({ key, changes: patch })))
export const setRest = (blockIds: number[], restLabel: string) => db.blocks.bulkUpdate(blockIds.map((key) => ({ key, changes: { restLabel } })))

/** Quita ejercicios de la rutina. Sus registros quedan en el historial de la biblioteca. */
export async function removeItems(routineId: number, itemIds: number[]): Promise<Undo> {
  const blocks = await db.blocks.where('routineId').equals(routineId).toArray()
  const items = await db.routineItems.where('blockId').anyOf(blocks.map((b) => b.id)).toArray()
  await db.routineItems.bulkDelete(itemIds)
  await applyGroups(routineId, await currentGroups(routineId))
  return () => db.transaction('rw', db.blocks, db.routineItems, async () => {
    const now = await db.blocks.where('routineId').equals(routineId).primaryKeys()
    await db.routineItems.where('blockId').anyOf(now).delete()
    await db.blocks.bulkDelete(now)
    await db.blocks.bulkPut(blocks)
    await db.routineItems.bulkPut(items)
  })
}

export async function duplicateItems(routineId: number, itemIds: number[]) {
  const tree = await loadRoutine(routineId)
  if (!tree) return
  await db.transaction('rw', db.library, db.routineItems, db.blocks, async () => {
    for (const { ex, block } of tree.flat) {
      if (!itemIds.includes(ex.itemId)) continue
      let name = `${ex.name} (copia)`
      for (let n = 2; await db.library.where('norm').equals(norm(name)).count(); n++) name = `${ex.name} (copia ${n})`
      const id = await db.library.add(libRow({ ...ex, name }))
      await addItem(routineId, id, { rounds: ex.rounds, target: ex.target, note: ex.note }, block.restLabel)
    }
  })
}

async function routineEntries(routineId: number, exerciseId: number) {
  const sessIds = await db.sessions.where('routineId').equals(routineId).primaryKeys()
  return (await db.entries.where('exerciseId').equals(exerciseId).toArray()).filter((e) => sessIds.includes(e.sessionId))
}
export async function roundHasData(routineId: number, exerciseId: number, round?: number) {
  return (await routineEntries(routineId, exerciseId)).some((e) => round == null || e.round === round)
}
const keyOf = (e: Entry): [number, number, number] => [e.sessionId, e.exerciseId, e.round]

/** Quita una ronda: las siguientes se corren un lugar en todas las semanas de la rutina. */
export async function removeRound(routineId: number, ex: Exercise, round: number): Promise<Undo | null> {
  if (ex.rounds <= 1) return null
  const before = await routineEntries(routineId, ex.id)
  await db.transaction('rw', db.entries, db.routineItems, async () => {
    await db.entries.bulkDelete(before.filter((e) => e.round >= round).map(keyOf))
    await db.entries.bulkPut(before.filter((e) => e.round > round).map((e) => ({ ...e, round: e.round - 1 })))
    await db.routineItems.update(ex.itemId, { rounds: ex.rounds - 1 })
  })
  return () => db.transaction('rw', db.entries, db.routineItems, db.sessions, async () => {
    await db.entries.bulkDelete((await routineEntries(routineId, ex.id)).map(keyOf))
    await db.entries.bulkPut(before)
    await db.routineItems.update(ex.itemId, { rounds: ex.rounds })
  })
}

// ---------- biblioteca ----------
export const getLibrary = async () => (await db.library.toArray()).sort((a, b) => a.name.localeCompare(b.name, 'es'))
export const getLibExercise = async (id: number) => (await db.library.get(id)) ?? null

/** Rutinas que usan cada ejercicio. */
export async function getUsage() {
  const [items, blocks, routines] = await Promise.all([db.routineItems.toArray(), db.blocks.toArray(), db.routines.toArray()])
  const routineOf = new Map(blocks.map((b) => [b.id, routines.find((r) => r.id === b.routineId)]))
  const out = new Map<number, Routine[]>()
  for (const i of items) {
    const r = routineOf.get(i.blockId)
    if (r) out.set(i.exerciseId, [...(out.get(i.exerciseId) ?? []), r])
  }
  return out
}

/** Nombres (de una rutina a importar) que todavía no están en la biblioteca. */
export async function countNewExercises(names: string[]) {
  const have = new Set((await db.library.toArray()).map((l) => l.norm))
  return new Set(names.map(norm).filter((n) => !have.has(n))).size
}

export async function deleteLibExercise(id: number): Promise<Undo | 'used'> {
  if (await db.routineItems.where('exerciseId').equals(id).count()) return 'used'
  return removeRows([{ table: 'entries', keys: await db.entries.where('exerciseId').equals(id).primaryKeys() }, { table: 'library', keys: [id] }])
}

// ---------- importar rutina ----------
export interface ImportExercise extends LibDraft, ItemDraft {}
export interface ImportRoutine { name: string; type: string; goal: string; blocks: { kind: 'single' | 'superset'; rest: string; exercises: ImportExercise[] }[] }

export async function importRoutine(r: ImportRoutine, type: string) {
  const routineId = await db.transaction('rw', [db.routines, db.blocks, db.library, db.routineItems, db.goals], async () => {
    const routineId = await createRoutine(r.name, type)
    const used = new Set<number>()
    let order = 0
    for (const b of r.blocks) {
      const parts = b.kind === 'superset' ? [b.exercises] : b.exercises.map((e) => [e])
      for (const exs of parts) {
        const blockId = await db.blocks.add({ routineId, order: order++, kind: exs.length > 1 ? 'superset' : 'single', restLabel: b.rest })
        for (let i = 0; i < exs.length; i++) {
          const e = exs[i]
          let lib = await db.library.where('norm').equals(norm(e.name)).first()
          let name = e.name
          for (let n = 2; lib && used.has(lib.id); n++) { name = `${e.name} (${n})`; lib = await db.library.where('norm').equals(norm(name)).first() }
          let id = lib?.id
          if (lib) await db.library.update(lib.id, { linkUrl: lib.linkUrl || e.linkUrl, muscleGroup: lib.muscleGroup || e.muscleGroup })
          else id = await db.library.add(libRow({ ...e, name }))
          used.add(id!)
          await db.routineItems.add({ blockId, order: i, exerciseId: id!, rounds: e.rounds, target: e.target, note: e.note })
        }
      }
    }
    if (r.goal) await db.goals.add({ scope: 'routine', ref: String(routineId), text: r.goal })
    return routineId
  })
  for (const k of new Set(r.blocks.flatMap((b) => b.exercises.map((e) => e.kind)))) await addCustomKind(k)
  return routineId
}

// ---------- programas y semanas ----------
/** Fechas de un programa: primer `weekday` del mes y una por semana. */
export function programDates(month: string, weekday: number, weeks: number) {
  let d = `${month}-01`
  while (dateOf(d).getDay() !== weekday) d = addDays(d, 1)
  return Array.from({ length: weeks }, (_, i) => addDays(d, i * 7))
}
const sessionAt = (routineId: number, date: string) => db.sessions.where('[routineId+date]').equals([routineId, date]).first()

/** Crea el programa y una sesión planificada por fecha. No duplica fechas que la rutina ya tenga. */
export async function saveProgram(p: Omit<Program, 'id'>) {
  return db.transaction('rw', db.programs, db.sessions, async () => {
    const same = (await db.programs.where('routineId').equals(p.routineId).toArray()).find((x) => x.month === p.month && x.weekday === p.weekday)
    const programId = same?.id ?? (await db.programs.add(p))
    let created = 0, order = await db.sessions.where('programId').equals(programId).count()
    for (const date of programDates(p.month, p.weekday, p.weeks)) {
      if (await sessionAt(p.routineId, date)) continue
      await db.sessions.add({ routineId: p.routineId, programId, date, status: 'planned', order: order++ })
      created++
    }
    return { programId, created, skipped: p.weeks - created }
  })
}

export const programSessions = async (programId: number) =>
  (await db.sessions.where('programId').equals(programId).toArray()).sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id)

export interface ProgramCard { program: Program; routine: Routine; sessions: Session[]; exercises: number }
export async function getProgramCards(month?: string): Promise<ProgramCard[]> {
  const [programs, cards, sessions] = await Promise.all([db.programs.toArray(), getRoutineCards(), db.sessions.toArray()])
  return programs.filter((p) => !month || p.month === month).map((program) => {
    const c = cards.find((x) => x.routine.id === program.routineId)
    return c && { program, routine: c.routine, exercises: c.exercises, sessions: sessions.filter((s) => s.programId === program.id).sort((a, b) => a.date.localeCompare(b.date)) }
  }).filter(present).sort((a, b) => ((a.program.weekday + 6) % 7) - ((b.program.weekday + 6) % 7) || a.routine.order - b.routine.order)
}

export async function loadProgram(programId: number) {
  const program = await db.programs.get(programId)
  if (!program) return null
  const sessions = await programSessions(programId)
  const entries = await db.entries.where('sessionId').anyOf(sessions.map((s) => s.id)).toArray()
  return { program, sessions, entries }
}

export async function addWeek(programId: number) {
  return db.transaction('rw', db.programs, db.sessions, async () => {
    const program = await db.programs.get(programId)
    if (!program) return
    const sessions = await programSessions(programId)
    let date = sessions.length ? addDays(sessions[sessions.length - 1].date, 7) : programDates(program.month, program.weekday, 1)[0]
    while (await sessionAt(program.routineId, date)) date = addDays(date, 7)
    await db.programs.update(programId, { weeks: sessions.length + 1 })
    return db.sessions.add({ routineId: program.routineId, programId, date, status: 'planned', order: sessions.length })
  })
}

export const sessionHasData = async (sessionId: number) => (await db.entries.where('sessionId').equals(sessionId).count()) > 0
export async function removeSession(sessionId: number): Promise<Undo> {
  return removeRows([{ table: 'entries', keys: await entryKeys([sessionId]) }, { table: 'sessions', keys: [sessionId] }])
}
export async function programHasData(programId: number) {
  return (await entryKeys(await db.sessions.where('programId').equals(programId).primaryKeys())).length > 0
}
export async function deleteProgram(programId: number): Promise<Undo> {
  const sessIds = await db.sessions.where('programId').equals(programId).primaryKeys()
  return removeRows([{ table: 'entries', keys: await entryKeys(sessIds) }, { table: 'sessions', keys: sessIds }, { table: 'programs', keys: [programId] }])
}

/** Rellena una semana con los valores de la anterior, sin pisar lo ya cargado. Quedan como pendientes. */
export async function copyPrevWeek(sessionId: number) {
  const session = await db.sessions.get(sessionId)
  if (!session) return 0
  const all = await programSessions(session.programId)
  const prev = all[all.findIndex((s) => s.id === sessionId) - 1]
  if (!prev) return 0
  const mine = await db.entries.where('sessionId').equals(sessionId).toArray()
  const has = (e: Entry) => e.weight != null || e.reps != null || e.durationSec != null || e.distance != null
  const noteOf = (e: Pick<Entry, 'exerciseId' | 'round'>) => mine.find((m) => m.exerciseId === e.exerciseId && m.round === e.round)?.note
  const fresh = (await db.entries.where('sessionId').equals(prev.id).toArray())
    .filter((e) => has(e) && !mine.some((m) => m.exerciseId === e.exerciseId && m.round === e.round && has(m)))
    .map(({ note: _n, ...e }): Entry => { const note = noteOf(e); return { ...e, sessionId, done: false, ...(note ? { note } : {}) } })
  await db.entries.bulkPut(fresh)
  return fresh.length
}

// ---------- sesiones y registros ----------
export const getSessions = () => db.sessions.toArray()

/** Sesión de hoy de una rutina; si no existe, la suma como columna a su programa del mes (o crea uno). */
export async function ensureTodaySession(routineId: number) {
  const today = todayISO()
  return db.transaction('rw', db.sessions, db.programs, async () => {
    const existing = await sessionAt(routineId, today)
    if (existing) return existing.id
    const month = today.slice(0, 7)
    const prog = (await db.programs.where('routineId').equals(routineId).toArray()).find((p) => p.month === month)
    const programId = prog?.id ?? (await db.programs.add({ routineId, month, weekday: dateOf(today).getDay(), weeks: 1 }))
    return db.sessions.add({ routineId, programId, date: today, status: 'planned', order: await db.sessions.where('programId').equals(programId).count() })
  })
}

/** 'taken' si la rutina ya tiene otra columna en esa fecha. */
export async function updateSession(id: number, patch: Partial<Pick<Session, 'date' | 'status' | 'note'>>): Promise<'ok' | 'taken'> {
  return db.transaction('rw', db.sessions, async () => {
    const s = await db.sessions.get(id)
    if (!s) return 'ok'
    if (patch.date && patch.date !== s.date && (await sessionAt(s.routineId, patch.date))) return 'taken'
    await db.sessions.update(id, patch)
    return 'ok'
  })
}
export const finishSession = (id: number) => db.sessions.update(id, { status: 'done' })

export type EntryValues = Pick<Entry, 'weight' | 'reps' | 'durationSec' | 'distance'>

/** Guarda una celda (semana + ejercicio + ronda). Sin valores, sin nota y sin marcar, la celda se borra. */
export async function saveEntry(sessionId: number, exerciseId: number, round: number, values: EntryValues, done: boolean, note = '') {
  const empty = values.weight == null && values.reps == null && values.durationSec == null && values.distance == null
  const text = note.trim()
  await db.transaction('rw', db.entries, db.sessions, async () => {
    if (empty && !done && !text) await db.entries.delete([sessionId, exerciseId, round])
    else await db.entries.put({ sessionId, exerciseId, round, ...values, done, ...(text ? { note: text } : {}) })
    if (done) await db.sessions.update(sessionId, { status: 'done' })
  })
}

export interface HistEntry extends Entry { date: string }
/** Series hechas con su fecha. El historial es por ejercicio de biblioteca: lo comparten todas las rutinas. */
export async function getHistory(exerciseIds?: number[]): Promise<HistEntry[]> {
  const entries = exerciseIds ? await db.entries.where('exerciseId').anyOf(exerciseIds).toArray() : await db.entries.toArray()
  const dates = new Map((await db.sessions.toArray()).map((s) => [s.id, s.date]))
  return entries.filter((e) => e.done && dates.has(e.sessionId)).map((e) => ({ ...e, date: dates.get(e.sessionId)! }))
}

export async function loadSession(sessionId: number) {
  const session = await db.sessions.get(sessionId)
  const tree = session && (await loadRoutine(session.routineId))
  if (!session || !tree) return null
  const entries = await db.entries.where('sessionId').equals(sessionId).toArray()
  const history = (await getHistory(tree.flat.map((f) => f.ex.id))).filter((e) => e.sessionId !== sessionId)
  return { session, tree, entries, history }
}

// ---------- objetivos ----------
export const getGoals = () => db.goals.toArray()
export async function saveGoal(g: Omit<Goal, 'id'> & { id?: number }) {
  if (g.id != null) await db.goals.put(g as Goal)
  else await db.goals.add(g)
}
export const deleteGoal = (id: number) => db.goals.delete(id)

// ---------- ajustes ----------
const DEFAULTS: Settings = { id: 1, theme: 'system', customKinds: [], routineTypes: [] }
export async function getSettings(): Promise<Settings> { return { ...DEFAULTS, ...(await db.settings.get(1)) } }
export async function patchSettings(patch: Partial<Settings>) { await db.settings.put({ ...(await getSettings()), ...patch, id: 1 }) }
export async function addCustomKind(name: string) {
  const k = name.trim().toLowerCase()
  if (!k || BASE_KINDS.includes(k)) return
  const s = await getSettings()
  if (!s.customKinds.includes(k)) await patchSettings({ customKinds: [...s.customKinds, k] })
}
export async function addRoutineType(name: string) {
  const t = name.trim()
  const s = await getSettings()
  const all = [...BASE_ROUTINE_TYPES, ...s.routineTypes]
  const same = all.find((x) => norm(x) === norm(t))
  if (!t || same) return same ?? ''
  await patchSettings({ routineTypes: [...s.routineTypes, t] })
  return t
}

// ---------- backup ----------
export interface Backup extends Data { app: 'ozo'; schemaVersion: 2; exportedAt: string }

export async function exportAll(): Promise<Backup> {
  const rows = await Promise.all(TABLES.map((t) => db.table(t).toArray()))
  return { app: 'ozo', schemaVersion: 2, exportedAt: new Date().toISOString(), ...(Object.fromEntries(TABLES.map((t, i) => [t, rows[i]])) as unknown as Data) }
}
export async function restoreAll(d: Data) {
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) { await db.table(t).clear(); await db.table(t).bulkAdd(d[t] as never[]) }
  })
}
export async function clearAll() {
  const { theme } = await getSettings()
  await db.transaction('rw', TABLES.map((t) => db.table(t)), async () => {
    for (const t of TABLES) await db.table(t).clear()
    await db.settings.put({ ...DEFAULTS, theme })
  })
}
