import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Icon, Seg, Sheet } from './ui'

interface Ctx { open: () => void; badge: string | null; /** abre la cuenta regresiva con ese tiempo cargado, sin iniciarla */ countdown: (ms: number) => void }
const StopwatchCtx = createContext<Ctx>({ open: () => {}, badge: null, countdown: () => {} })
export const useStopwatch = () => useContext(StopwatchCtx)

const mmss = (ms: number, ceil = false) => {
  const s = ceil ? Math.ceil(ms / 1000) : Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** Cronómetro y cuenta regresiva libres. Todo se calcula con timestamps: no se desfasa con la pantalla apagada. */
export function StopwatchProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false)
  const [mode, setMode] = useState<'sw' | 'cd'>('sw')
  const [sw, setSw] = useState<{ start: number | null; acc: number }>({ start: null, acc: 0 })
  const [cd, setCd] = useState<{ end: number | null; left: number; total: number; done: boolean }>({ end: null, left: 60000, total: 60000, done: false })
  const [now, setNow] = useState(Date.now())
  const audio = useRef<AudioContext | null>(null)
  const running = sw.start != null || cd.end != null

  useEffect(() => {
    if (!running) return
    const tick = () => setNow(Date.now())
    tick()
    const id = setInterval(tick, 200)
    document.addEventListener('visibilitychange', tick)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick) }
  }, [running])

  // pantalla encendida mientras corre
  useEffect(() => {
    if (!running || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    let off = false
    const get = () => {
      if (document.visibilityState !== 'visible') return
      navigator.wakeLock.request('screen').then((l) => { if (off) l.release(); else lock = l }).catch(() => {})
    }
    get()
    document.addEventListener('visibilitychange', get)
    return () => { off = true; document.removeEventListener('visibilitychange', get); lock?.release().catch(() => {}) }
  }, [running])

  const prime = () => {
    try {
      audio.current ??= new AudioContext()
      if (audio.current.state === 'suspended') void audio.current.resume()
    } catch { /* sin audio */ }
  }
  const alarm = useCallback(() => {
    try { navigator.vibrate?.([300, 150, 300]) } catch { /* sin vibración */ }
    const ctx = audio.current
    if (!ctx) return
    for (const at of [0, 0.3]) {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.frequency.value = 880
      g.gain.setValueAtTime(0.25, ctx.currentTime + at)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.22)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.24)
    }
  }, [])

  useEffect(() => {
    if (cd.end != null && now >= cd.end) {
      setCd((c) => ({ ...c, end: null, left: 0, done: true }))
      alarm()
    }
  }, [now, cd.end, alarm])

  const swMs = sw.acc + (sw.start != null ? Math.max(0, now - sw.start) : 0)
  const cdMs = cd.end != null ? Math.max(0, cd.end - now) : cd.left

  const toggleSw = () => { prime(); setSw((s) => (s.start != null ? { start: null, acc: s.acc + Date.now() - s.start } : { start: Date.now(), acc: s.acc })) }
  const toggleCd = () => {
    prime()
    setCd((c) => {
      if (c.end != null) return { ...c, end: null, left: Math.max(0, c.end - Date.now()) }
      const left = c.left > 0 ? c.left : c.total
      return { ...c, end: Date.now() + left, left, done: false }
    })
  }
  const setTotal = (ms: number) => setCd({ end: null, left: ms, total: ms, done: false })
  const bump = (d: number) => setCd((c) => {
    if (c.end != null) return { ...c, end: Math.max(Date.now(), c.end + d) }
    const left = Math.max(0, Math.min(99 * 60000, c.left + d))
    return { ...c, left, total: left || c.total, done: false }
  })

  const badge = cd.end != null ? mmss(cdMs, true) : sw.start != null ? mmss(swMs) : null
  const ctx = useMemo(() => ({
    open: () => setShown(true), badge,
    countdown: (ms: number) => { setMode('cd'); setCd((c) => (c.end != null ? c : { end: null, left: ms, total: ms, done: false })); setShown(true) },
  }), [badge])

  return (
    <StopwatchCtx.Provider value={ctx}>
      {children}
      {shown && (
        <Sheet title="Cronómetro" onClose={() => setShown(false)}>
          <Seg label="Modo" value={mode} onChange={setMode} options={[{ value: 'sw', label: 'Cronómetro' }, { value: 'cd', label: 'Cuenta regresiva' }]} />
          {mode === 'sw' ? (
            <>
              <div className="clock num" role="timer" aria-live="off">{mmss(swMs)}<small>,{Math.floor((swMs % 1000) / 100)}</small></div>
              <div className="row">
                <button className="btn" disabled={sw.start == null && sw.acc === 0} onClick={() => setSw({ start: null, acc: 0 })}>Reiniciar</button>
                <button className="btn primary" onClick={toggleSw}>{sw.start != null ? 'Pausar' : swMs > 0 ? 'Seguir' : 'Iniciar'}</button>
              </div>
            </>
          ) : (
            <>
              <div className="clock num" role="timer" aria-live="off">{mmss(cdMs, true)}</div>
              <p className="center muted" role="status">{cd.done ? 'Tiempo cumplido' : cd.end != null ? 'Corriendo' : ' '}</p>
              <div className="row wrap">
                <button className="btn" onClick={() => bump(-30000)} aria-label="Restar 30 segundos">−30"</button>
                <button className="btn" onClick={() => bump(30000)} aria-label="Sumar 30 segundos">+30"</button>
                {[1, 2, 3, 5].map((m) => (
                  <button key={m} className="btn" onClick={() => setTotal(m * 60000)} aria-label={`${m} minutos`}>{m}'</button>
                ))}
              </div>
              <div className="row">
                <button className="btn" onClick={() => setTotal(cd.total)}>Reiniciar</button>
                <button className="btn primary" disabled={cd.end == null && cdMs === 0 && cd.total === 0} onClick={toggleCd}>{cd.end != null ? 'Pausar' : 'Iniciar'}</button>
              </div>
            </>
          )}
        </Sheet>
      )}
    </StopwatchCtx.Provider>
  )
}

export function StopwatchFab() {
  const { open, badge } = useStopwatch()
  return (
    <button className="fab" onClick={open} aria-label={badge ? `Cronómetro, ${badge}` : 'Abrir cronómetro'}>
      {badge ? <span className="num">{badge}</span> : <Icon name="timer" />}
    </button>
  )
}
