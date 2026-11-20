import { useState } from 'react'
import { updateSession, type Session } from './data'
import { clockToMs, fmtClock, fmtSpan, sessionMs } from './lib'
import { Sheet } from './ui'

/** Corrige a mano la hora de inicio y de fin de un entreno (por si te olvidaste de apretar algo). */
export function DurationSheet({ session, onClose }: { session: Session; onClose: () => void }) {
  const [from, setFrom] = useState(session.startedAt ? fmtClock(session.startedAt) : '')
  const [to, setTo] = useState(session.endedAt ? fmtClock(session.endedAt) : '')
  const startedAt = from ? clockToMs(session.date, from) : undefined
  let endedAt = to ? clockToMs(session.date, to) : undefined
  if (startedAt && endedAt && endedAt <= startedAt) endedAt += 24 * 3600_000 // terminó pasada la medianoche
  const ms = sessionMs({ startedAt, endedAt })
  return (
    <Sheet title="Duración del entreno" onClose={onClose}>
      <div className="row">
        <label className="grow stack"><span className="muted small">Empecé</span><input className="input" type="time" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="grow stack"><span className="muted small">Terminé</span><input className="input" type="time" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      <p className="small" role="status">{ms ? <>Duró <strong>{fmtSpan(ms)}</strong></> : <span className="muted">Completá las dos horas para ver cuánto duró.</span>}</p>
      <div className="row">
        {(session.startedAt || session.endedAt) && <button className="btn" onClick={async () => { await updateSession(session.id, { startedAt: undefined, endedAt: undefined }); onClose() }}>Borrar</button>}
        <button className="btn primary grow" onClick={async () => { await updateSession(session.id, { startedAt, endedAt }); onClose() }}>Guardar</button>
      </div>
    </Sheet>
  )
}
