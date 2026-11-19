import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut, type User } from 'firebase/auth'
import { doc, getDoc, initializeFirestore, onSnapshot, persistentLocalCache, persistentMultipleTabManager, setDoc, type Firestore, type Unsubscribe } from 'firebase/firestore'
import { confirmDialog, toast } from '../ui'
import { TABLES, db } from './schema'
import { FIREBASE_CONFIG } from './firebaseConfig'
import { setSyncState } from './sync'

/**
 * Sincronización por tabla: cada tabla de Dexie se guarda entera en un documento `users/{uid}/data/{tabla}`.
 * - Un cambio local marca la tabla como pendiente y, a los ~1,5 s, la sube.
 * - Un cambio de otro dispositivo reemplaza la tabla local.
 * - Si hay cambios locales sin subir cuando llega algo de afuera, gana lo local (después se sube).
 * Los ids de Dexie son locales, por eso se sincroniza la tabla completa y no fila por fila.
 */
type Table = (typeof TABLES)[number]
const LS_SEEN = 'ozo-sync-seen', LS_DIRTY = 'ozo-sync-dirty', LS_DEVICE = 'ozo-device'
const read = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? '') as T } catch { return d } }
const write = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sin storage */ } }

const DEVICE = (() => { let d = read<string>(LS_DEVICE, ''); if (!d) { d = Math.random().toString(36).slice(2) + Date.now().toString(36); write(LS_DEVICE, d) } return d })()
let seen = read<Partial<Record<Table, number>>>(LS_SEEN, {})
const dirty = new Set<Table>(read<Table[]>(LS_DIRTY, []))
let applying = false
let timer = 0
let user: User | null = null
let fs: Firestore
let unsubs: Unsubscribe[] = []
let hooked = false

const ref = (t: Table) => doc(fs, 'users', user!.uid, 'data', t)
const table = (t: Table) => db.table(t)
const saveDirty = () => write(LS_DIRTY, [...dirty])

function touch(t: Table) {
  if (applying || !user) return
  dirty.add(t); saveDirty()
  clearTimeout(timer)
  timer = window.setTimeout(() => void flushAll(false), 1500)
}
function installHooks() {
  if (hooked) return
  hooked = true
  for (const t of TABLES) {
    const tb = table(t)
    tb.hook('creating', () => { touch(t) })
    tb.hook('updating', () => { touch(t) })
    tb.hook('deleting', () => { touch(t) })
  }
}

export async function flushAll(manual: boolean) {
  if (!user) return
  const todo = manual ? [...TABLES] : [...dirty]
  if (!todo.length) return
  setSyncState({ phase: 'syncing', error: undefined })
  try {
    for (const t of todo) {
      const rows = await table(t).toArray()
      const updatedAt = Date.now()
      await setDoc(ref(t), { json: JSON.stringify(rows), updatedAt, device: DEVICE, n: rows.length })
      seen[t] = updatedAt; dirty.delete(t)
    }
    write(LS_SEEN, seen); saveDirty()
    setSyncState({ phase: 'idle', lastSync: Date.now() })
    if (manual) toast('Sincronizado con la nube')
  } catch (e) {
    setSyncState({ phase: 'error', error: (e as Error).message })
  }
}

async function applyRemote(t: Table, json: string, updatedAt: number) {
  applying = true
  try {
    const rows = JSON.parse(json) as unknown[]
    await db.transaction('rw', table(t), async () => { await table(t).clear(); await table(t).bulkPut(rows) })
    seen[t] = updatedAt; write(LS_SEEN, seen)
    setSyncState({ lastSync: Date.now() })
  } finally { applying = false }
}

async function localHasData() {
  const counts = await Promise.all((['routines', 'library', 'sessions', 'entries'] as Table[]).map((t) => table(t).count()))
  return counts.some((n) => n > 0)
}

/** Primera vez en este dispositivo: decide qué lado manda. */
async function firstConnect() {
  const snaps = await Promise.all(TABLES.map((t) => getDoc(ref(t))))
  const remote = TABLES.map((t, i) => ({ t, d: snaps[i].exists() ? snaps[i].data() : null }))
  const remoteHas = remote.some((r) => r.d && r.d.n > 0 && r.t !== 'settings')
  const localHas = await localHasData()
  let useCloud = remoteHas && !localHas
  if (remoteHas && localHas) {
    useCloud = await confirmDialog({ title: 'La nube ya tiene tus datos', body: 'Este dispositivo también tiene datos. Si usás los de la nube, los de acá se reemplazan.', ok: 'Usar los de la nube' })
    if (!useCloud && !(await confirmDialog({ title: 'Subir los datos de este dispositivo', body: 'Se reemplazan los datos que hay en la nube por los de acá.', ok: 'Subir los míos' }))) throw new Error('Sincronización cancelada')
  }
  if (useCloud) for (const r of remote) { if (r.d) await applyRemote(r.t, r.d.json, r.d.updatedAt) }
  else for (const t of TABLES) dirty.add(t)
  saveDirty()
}

function listen() {
  unsubs.forEach((u) => u()); unsubs = []
  for (const t of TABLES) {
    unsubs.push(onSnapshot(ref(t), (snap) => {
      const d = snap.exists() ? snap.data() : null
      if (!d || snap.metadata.hasPendingWrites) return
      if (d.device === DEVICE || d.updatedAt <= (seen[t] ?? 0) || dirty.has(t)) return
      void applyRemote(t, d.json, d.updatedAt)
    }, (e) => setSyncState({ phase: 'error', error: e.message })))
  }
}

async function connect(u: User) {
  user = u
  setSyncState({ phase: 'connecting', email: u.email ?? undefined, error: undefined })
  try {
    if (!Object.keys(seen).length) await firstConnect()
    installHooks()
    listen()
    await flushAll(false)
    setSyncState({ phase: 'idle', lastSync: Date.now() })
    window.addEventListener('online', () => void flushAll(false))
  } catch (e) {
    setSyncState({ phase: 'error', error: (e as Error).message })
  }
}

export async function start() {
  const app = initializeApp(FIREBASE_CONFIG)
  fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
  const auth = getAuth(app)
  getRedirectResult(auth).catch((e) => setSyncState({ phase: 'error', error: (e as Error).message }))
  onAuthStateChanged(auth, (u) => {
    if (u) void connect(u)
    else { user = null; unsubs.forEach((x) => x()); unsubs = []; setSyncState({ phase: 'signed-out', email: undefined }) }
  })
}

export async function signIn() {
  const auth = getAuth()
  const provider = new GoogleAuthProvider()
  try { await signInWithPopup(auth, provider) } catch (e) {
    const code = (e as { code?: string }).code
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') await signInWithRedirect(auth, provider)
    else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') setSyncState({ phase: 'error', error: (e as Error).message })
  }
}

export async function signOutNow() {
  await signOut(getAuth())
  seen = {}; write(LS_SEEN, seen); dirty.clear(); saveDirty()
}
