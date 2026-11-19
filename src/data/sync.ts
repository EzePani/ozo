/** Estado de la sincronización en la nube (lo que ve la UI). El trabajo pesado vive en syncCore.ts, que solo se carga si Firebase está configurado. */
import { useSyncExternalStore } from 'react'
import { SYNC_CONFIGURED } from './firebaseConfig'

export type SyncPhase = 'off' | 'signed-out' | 'connecting' | 'idle' | 'syncing' | 'error'
export interface SyncState { phase: SyncPhase; email?: string; lastSync?: number; error?: string }

let state: SyncState = { phase: SYNC_CONFIGURED ? 'connecting' : 'off' }
const subs = new Set<() => void>()
export const setSyncState = (patch: Partial<SyncState>) => { state = { ...state, ...patch }; subs.forEach((f) => f()) }
export const useSyncState = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f) } }, () => state)

type Core = typeof import('./syncCore')
let core: Promise<Core> | null = null
const load = () => (core ??= import('./syncCore'))

export async function startSync() { if (SYNC_CONFIGURED) await (await load()).start() }
export async function signIn() { await (await load()).signIn() }
export async function signOutSync() { await (await load()).signOutNow() }
export async function syncNow() { await (await load()).flushAll(true) }
