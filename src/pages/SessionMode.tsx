import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { finishSession, loadSession, saveEntry, updateSession, useLive, type Block, type Entry, type Exercise } from '../data'
import { bestEntry, cap, cmpEntries, fieldsFor, fmtDay, fmtEntry, fmtTarget, hasValues, parseRest } from '../lib'
import { Bar, Chip, Icon, NoteSheet, Sheet, toast } from '../ui'
import { useStopwatch } from '../Stopwatch'
import { LinkSheet } from '../LinkSheet'
import { CellEditor } from '../CellEditor'

interface Row { ex: Exercise; round: number }
interface Step { block: Block; exs: Exercise[]; rows: Row[] }

/** Carga del día: un ejercicio (o superserie) por pantalla, con sus rondas. */
export default function SessionMode() {
  const sessionId = Number(useParams().id)
  const nav = useNavigate()
  const sw = useStopwatch()
  const data = useLive(() => loadSession(sessionId), [sessionId])
  const [at, setAt] = useState<number | null>(null)
  const [cell, setCell] = useState<Row | null>(null)
  const [link, setLink] = useState<Exercise | null>(null)
  const [menu, setMenu] = useState(false)
  const [noting, setNoting] = useState(false)

  const steps = useMemo<Step[]>(() => {
    if (!data) return []
    return data.tree.blocks.map((block) => {
      const exs = data.tree.flat.filter((f) => f.block.id === block.id).map((f) => f.ex)
      const rows: Row[] = []
      const max = Math.max(0, ...exs.map((e) => e.rounds))
      // en una superserie las rondas se alternan: R1 de cada uno, R2 de cada uno…
      for (let r = 1; r <= max; r++) for (const ex of exs) if (r <= ex.rounds) rows.push({ ex, round: r })
      return { block, exs, rows }
    }).filter((s) => s.rows.length)
  }, [data])
  const entryOf = (r: Row) => data?.entries.find((e) => e.exerciseId === r.ex.id && e.round === r.round)
  const isDone = (r: Row) => !!entryOf(r)?.done
  // al entrar, va al primer ejercicio con rondas pendientes
  useEffect(() => {
    if (at == null && data && steps.length) setAt(Math.max(0, steps.findIndex((s) => s.rows.some((r) => !isDone(r)))))
  }, [data, steps]) // eslint-disable-line react-hooks/exhaustive-deps

  if (data === undefined) return <main className="page" aria-busy="true" />
  if (data === null) return <main className="page"><p>Ese entreno ya no existe.</p><Link className="btn gap-top" to="/">Volver a Hoy</Link></main>
  const { session, tree, entries, history } = data
  const back = `/programa/${session.programId}`
  const finish = async () => { await finishSession(session.id); toast('Entreno terminado: día tachado'); nav('/') }

  const head = (
    <header className="pagehead">
      <Link to={back} className="iconbtn" aria-label="Salir de la carga"><Icon name="close" /></Link>
      <h1 className="small-title">{tree.routine.name} · <span className="num">{fmtDay(session.date)}</span></h1>
      <button className="iconbtn" aria-label="Más acciones del entreno" onClick={() => setMenu(true)}><Icon name="more" /></button>
    </header>
  )
  const step = steps[at ?? 0]
  if (!step) return (
    <main className="page session">
      {head}
      <div className="card empty grow-center"><p><strong>Esta rutina no tiene ejercicios.</strong></p><Link className="btn" to={`/programa/rutina/${tree.routine.id}`}>Editar rutina</Link></div>
    </main>
  )

  const idx = at ?? 0
  const superset = step.exs.length > 1
  const total = steps.reduce((n, s) => n + s.rows.length, 0)
  const doneCount = steps.reduce((n, s) => n + s.rows.filter(isDone).length, 0)
  const nextRow = step.rows.find((r) => !isDone(r))
  /** Lo de la última vez que se hizo este ejercicio antes de esta fecha (en cualquier rutina). */
  const prevOf = (ex: Exercise) => {
    const before = history.filter((e) => e.exerciseId === ex.id && e.date < session.date)
    const last = before.reduce<string>((d, e) => (e.date > d ? e.date : d), '')
    return before.filter((e) => e.date === last).sort((a, b) => a.round - b.round)
  }
  /** La mejor serie de hoy, si supera todo lo anterior. */
  const recordOf = (ex: Exercise) => {
    const fields = fieldsFor(ex)
    const past = bestEntry(history.filter((e) => e.exerciseId === ex.id), fields)
    const mine = bestEntry(entries.filter((e) => e.exerciseId === ex.id && e.done && hasValues(e)), fields)
    return past && mine && cmpEntries(mine, past, fields) > 0 ? mine : undefined
  }
  const copyPrev = async (ex: Exercise) => {
    let n = 0
    for (const p of prevOf(ex)) {
      const mine = entryOf({ ex, round: p.round })
      if (p.round > ex.rounds || mine?.done || hasValues(mine)) continue
      const { weight, reps, durationSec, distance } = p
      await saveEntry(session.id, ex.id, p.round, { weight, reps, durationSec, distance }, false, mine?.note)
      n++
    }
    toast(n ? 'Rondas rellenadas con lo anterior: tocá cada una para confirmarla' : 'No había nada para copiar')
  }
  const restMs = parseRest(step.block.restLabel)
  const cellEntry = cell ? entryOf(cell) : undefined
  const cellPrefill = (r: Row): Entry | undefined =>
    prevOf(r.ex).find((e) => e.round === r.round) ?? [...entries].filter((e) => e.exerciseId === r.ex.id && e.round < r.round && hasValues(e)).sort((a, b) => b.round - a.round)[0] ?? prevOf(r.ex).pop()

  return (
    <main className="page session">
      {head}
      <div>
        <p className="muted small">{superset ? 'Superserie' : 'Ejercicio'} {idx + 1} de {steps.length} · {doneCount} de {total} series</p>
        <Bar value={doneCount} max={total} label="Series hechas" />
      </div>

      {step.exs.map((ex) => {
        const fields = fieldsFor(ex)
        const prev = prevOf(ex)
        const rec = recordOf(ex)
        return (
          <section key={ex.id} className="session-info" aria-live="polite">
            <h2>{ex.name}</h2>
            <p><Chip>{cap(ex.kind)}</Chip> <span className="muted">Objetivo: {fmtTarget(ex.target)}{step.block.restLabel ? ` · Rest ${step.block.restLabel}` : ''}</span></p>
            {ex.linkUrl && <button className="textbtn" onClick={() => setLink(ex)}><Icon name="play" size={18} />Ver video</button>}
            {ex.note && <p className="small">📝 {ex.note}</p>}
            <div className="prevrow">
              <span className="muted small">Anterior: <strong className="num">{prev.length ? prev.map((e) => fmtEntry(e, fields)).join(' · ') : '—'}</strong></span>
              <button className="btn compact" disabled={!prev.length} onClick={() => copyPrev(ex)}><Icon name="copy" size={20} />Copiar anterior</button>
            </div>
            {rec && <p className="small" role="status">🏆 R{rec.round}: récord personal ({fmtEntry(rec, fields, true)})</p>}
          </section>
        )
      })}

      <ul className="list srows">
        {step.rows.map((r) => {
          const e = entryOf(r)
          const done = !!e?.done
          const txt = fmtEntry(e, fieldsFor(r.ex), true)
          return (
            <li key={`${r.ex.id}-${r.round}`}>
              <button className={'srow' + (done ? ' done' : '') + (r === nextRow ? ' next' : '')} onClick={() => setCell(r)}
                aria-label={`Ronda ${r.round}${superset ? ` de ${r.ex.name}` : ''}: ${txt === '—' ? 'sin cargar' : txt}, ${done ? 'hecha' : 'pendiente'}. Cargar`}>
                <span className="srow-r">R{r.round}{superset && <span className="muted small"> · {r.ex.name}</span>}</span>
                <span className={'srow-v num' + (e && !done ? ' pending' : '')}>{txt === '—' ? <span className="muted">cargar</span> : txt}{e?.note ? ' 📝' : ''}</span>
                <span className="srow-c" aria-hidden="true">{done && <Icon name="check" size={20} />}</span>
              </button>
            </li>
          )
        })}
      </ul>

      {step.block.restLabel && (
        <div className="restbox">
          <span><Icon name="timer" size={20} /> Descanso sugerido: <strong>{step.block.restLabel}</strong></span>
          <button className="btn compact" onClick={() => (restMs ? sw.countdown(restMs) : sw.open())}>{sw.badge ? <span className="num">{sw.badge}</span> : 'Abrir cronómetro'}</button>
        </div>
      )}

      <footer className="sessionbar">
        <button className="btn grow" disabled={idx === 0} onClick={() => setAt(idx - 1)}><Icon name="back" size={20} />Anterior</button>
        {idx < steps.length - 1
          ? <button className={'btn grow' + (nextRow ? '' : ' primary')} onClick={() => setAt(idx + 1)}>Siguiente<Icon name="next" size={20} /></button>
          : <button className="btn primary grow" onClick={finish}><Icon name="check" size={20} />Terminar entreno</button>}
      </footer>

      {cell && (
        <CellEditor title={`${cell.ex.name} · ronda ${cell.round}`} ex={cell.ex} entry={cellEntry} prefill={cellPrefill(cell)} okLabel="Hecha"
          hint={!hasValues(cellEntry) && cellPrefill(cell) ? 'Arranca con el último valor. El primer número que toques lo reemplaza.' : undefined}
          onClose={() => setCell(null)} onSave={(v, text) => saveEntry(session.id, cell.ex.id, cell.round, v, true, text)} />
      )}
      {menu && (
        <Sheet title={`${tree.routine.name} · ${fmtDay(session.date)}`} onClose={() => setMenu(false)}>
          {session.note && <p className="small">📝 {session.note}</p>}
          <div className="menu">
            <button className="btn block" onClick={() => { setMenu(false); setNoting(true) }}><Icon name="note" />Nota del entreno</button>
            <Link className="btn block" to={back}>Ver grilla</Link>
            <button className="btn primary block" onClick={finish}><Icon name="check" />Terminar entreno</button>
          </div>
        </Sheet>
      )}
      {noting && <NoteSheet title="Nota del entreno" value={session.note ?? ''} onSave={(t) => updateSession(session.id, { note: t })} onClose={() => setNoting(false)} />}
      {link && <LinkSheet url={link.linkUrl} title={link.name} onClose={() => setLink(null)} />}
    </main>
  )
}
