import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { BASE_KINDS, addCustomKind, createDay, db, exportAll, restoreAll, todayISO } from '../db'
import { CLAUDE_PROMPT, cap, fmtDate, fmtTarget, validateBackup, validateRoutine, type Routine } from '../lib'
import { Chip, Icon, confirmDialog, toast } from '../ui'

async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true } catch { /* sigue con el método viejo */ }
  const ta = document.createElement('textarea')
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'
  document.body.appendChild(ta); ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  return ok
}

async function importRoutine(r: Routine, dest: number | null) {
  const dayId = dest ?? (await createDay(r.day.name, r.day.tag))
  await db.transaction('rw', db.blocks, db.exercises, async () => {
    let order = await db.blocks.where('dayId').equals(dayId).count()
    for (const b of r.blocks) {
      const parts = b.kind === 'superset' ? [b.exercises] : b.exercises.map((e) => [e])
      for (const exs of parts) {
        const blockId = await db.blocks.add({ dayId, order: order++, kind: exs.length > 1 ? 'superset' : 'single', restLabel: b.rest })
        await db.exercises.bulkAdd(exs.map((e, i) => ({ blockId, order: i, name: e.name, kind: e.kind, timeUnit: e.timeUnit, rounds: e.rounds, target: e.target, note: e.note, linkUrl: e.link })))
      }
    }
  })
  for (const k of new Set(r.blocks.flatMap((b) => b.exercises.map((e) => e.kind)))) if (!BASE_KINDS.includes(k)) await addCustomKind(k)
  return dayId
}

export async function downloadBackup() {
  const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ozo-backup-${fmtDate(todayISO())}.json`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  toast('Backup exportado')
}

export function BackupButtons() {
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const onFile = async (f?: File) => {
    if (!f) return
    setError('')
    const { backup, error } = validateBackup(await f.text())
    if (file.current) file.current.value = ''
    if (!backup) return setError(error ?? 'Archivo inválido')
    const ok = await confirmDialog({
      title: 'Reemplazar todos los datos',
      body: `El backup tiene ${backup.days.length} días, ${backup.exercises.length} ejercicios y ${backup.sessions.length} sesiones. Lo que hay ahora en la app se borra.`,
      ok: 'Reemplazar',
    })
    if (!ok) return
    try { await restoreAll(backup); toast('Backup importado') } catch { setError('El backup tiene datos inconsistentes y no se importó. Tus datos no cambiaron.') }
  }
  return (
    <div className="stack">
      <button className="btn block" onClick={downloadBackup}><Icon name="download" />Exportar todo a un archivo</button>
      <button className="btn block" onClick={() => file.current?.click()}><Icon name="upload" />Importar backup completo</button>
      <input ref={file} type="file" accept="application/json,.json" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      {error && <p role="alert"><strong>Error:</strong> {error}</p>}
    </div>
  )
}

export default function ImportPage() {
  const nav = useNavigate()
  const days = useLiveQuery(() => db.days.orderBy('order').toArray())
  const [text, setText] = useState('')
  const [dest, setDest] = useState<number | null>(null)
  const result = useMemo(() => (text.trim() ? validateRoutine(text) : null), [text])
  const routine = result?.routine
  const count = routine?.blocks.reduce((n, b) => n + b.exercises.length, 0) ?? 0

  const run = async () => {
    if (!routine) return
    const target = days?.find((d) => d.id === dest)
    if (target && !(await confirmDialog({ title: `Agregar a "${target.name}"`, body: `Se suman ${count} ejercicios al final del día. No se borra ni se pisa nada de lo que ya tiene.`, ok: 'Agregar' }))) return
    const id = await importRoutine(routine, target ? target.id : null)
    toast(`Rutina importada: ${count} ejercicios`)
    nav(`/dia/${id}`)
  }

  return (
    <main className="page">
      <header className="pagehead">
        <Link to="/" className="iconbtn" aria-label="Volver al inicio"><Icon name="back" /></Link>
        <h1>Importar rutina</h1>
      </header>
      <div className="card form">
        <p className="muted">Pedile a Claude que convierta tu rutina al formato de Ozo y pegá acá el resultado.</p>
        <button className="btn block" onClick={async () => toast((await copyText(CLAUDE_PROMPT)) ? 'Prompt copiado' : 'No se pudo copiar')}><Icon name="copy" />Copiar prompt para Claude</button>
        <label className="lbl">JSON de la rutina
          <textarea className="input mono" rows={7} value={text} onChange={(e) => setText(e.target.value)} placeholder='{ "version": 1, "day": { … }, "blocks": [ … ] }' spellCheck={false} autoCapitalize="off" autoCorrect="off" />
        </label>
        <div className="row">
          <button className="btn grow" onClick={async () => { try { setText(await navigator.clipboard.readText()) } catch { toast('Pegalo a mano en el cuadro') } }}>Pegar del portapapeles</button>
          <button className="btn" disabled={!text} onClick={() => setText('')}>Vaciar</button>
        </div>
      </div>

      {result && result.errors.length > 0 && (
        <>
          <h2 className="sect">Errores ({result.errors.length})</h2>
          <ul className="card plain errors" role="alert">
            {result.errors.map((e, i) => <li key={i} className="errline"><span className="errmark" aria-hidden="true">✕</span><span><strong>Error</strong> en <code>{e.slice(0, e.indexOf(':'))}</code>{e.slice(e.indexOf(':'))}</span></li>)}
          </ul>
          <p className="muted small">No se importó nada. Corregí el JSON y volvé a pegarlo.</p>
        </>
      )}

      {routine && (
        <>
          <h2 className="sect">Vista previa</h2>
          <div className="card">
            <p><strong>{routine.day.name}</strong> <Chip>{routine.day.tag === 'upper' ? 'Upper' : 'Lower'}</Chip> <span className="muted">{count} ejercicios</span></p>
            <ul className="list tight gap-top">
              {routine.blocks.map((b, bi) => b.exercises.map((e, ei) => (
                <li key={`${bi}-${ei}`} className={`exrow static pos-${b.kind !== 'superset' ? 'single' : ei === 0 ? 'first' : ei === b.exercises.length - 1 ? 'last' : 'mid'}`}>
                  {b.kind === 'superset' && ei === 0 && <div className="blocktag">BLOQUE · alterna</div>}
                  <div className="exrow-main static">
                    <span className="exrow-name">{e.name} <Chip>{cap(e.kind)}</Chip></span>
                    <span className="muted">{e.rounds} {e.rounds === 1 ? 'ronda' : 'rondas'} · {fmtTarget(e.target)}{b.rest ? ` · desc. ${b.rest}` : ''}</span>
                    {(e.note || e.link) && <span className="muted small">{e.note && `Nota: ${e.note}`}{e.note && e.link ? ' · ' : ''}{e.link && 'con link de técnica'}</span>}
                  </div>
                </li>
              )))}
            </ul>
          </div>
          <h2 className="sect">Destino</h2>
          <div className="chips" role="group" aria-label="Día destino">
            <button className="chipbtn" aria-pressed={dest === null} onClick={() => setDest(null)}>Crear día "{routine.day.name}"</button>
            {days?.map((d) => <button key={d.id} className="chipbtn" aria-pressed={dest === d.id} onClick={() => setDest(d.id)}>Agregar a {d.name}</button>)}
          </div>
        </>
      )}

      <h2 className="sect">Backup</h2>
      <div className="card"><BackupButtons /></div>

      <div className="actionbar">
        <button className="btn primary grow" disabled={!routine} onClick={run}>{routine ? `Importar ${count} ejercicios` : 'Importar'}</button>
      </div>
    </main>
  )
}
