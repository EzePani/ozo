import { Fragment, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { finishSession, loadSession, saveEntry, startSession, updateSession, useLive, type Block, type Entry, type Exercise } from '../data'
import { bestEntry, cap, cmpEntries, fieldsFor, fmtDay, fmtEntry, fmtTarget, fmtClock, fmtSpan, hasValues, parseRest, sessionMs } from '../lib'
import { Bar, Icon, NoteSheet, Sheet, toast } from '../ui'
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
  const [cell, setCell] = useState<Row | null>(null)
  const [link, setLink] = useState<Exercise | null>(null)
  const [menu, setMenu] = useState(false)
  const [noting, setNoting] = useState(false)

  // por si se entra sin apretar "Empezar" (por ejemplo desde Hoy): abrir el entreno también lo arranca
  useEffect(() => { if (Number.isFinite(sessionId)) void startSession(sessionId) }, [sessionId])

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
  if (data === undefined) return <main className="page" aria-busy="true" />
  if (data === null) return <main className="page"><p>Ese entreno ya no existe.</p><Link className="btn gap-top" to="/">Volver a Hoy</Link></main>
  const { session, tree, entries, history } = data
  const back = `/programa/${session.programId}`
  const finish = async () => {
    const t = await finishSession(session.id)
    const ms = sessionMs(t)
    toast(ms ? `Entreno terminado · ${fmtSpan(ms)}` : 'Entreno terminado: día tachado')
    nav('/')
  }

  const head = (
    <header className="pagehead">
      <Link to={back} className="iconbtn" aria-label="Salir de la carga"><Icon name="close" /></Link>
      <h1 className="small-title">{tree.routine.name} · <span className="num">{fmtDay(session.date)}</span></h1>
      <button className="iconbtn" aria-label="Más acciones del entreno" onClick={() => setMenu(true)}><Icon name="more" /></button>
    </header>
  )
  if (!steps.length) return (
    <main className="page session">
      {head}
      <div className="card empty grow-center"><p><strong>Esta rutina no tiene ejercicios.</strong></p><Link className="btn" to={`/programa/rutina/${tree.routine.id}`}>Editar rutina</Link></div>
    </main>
  )

  const total = steps.reduce((n, st) => n + st.rows.length, 0)
  const doneCount = steps.reduce((n, st) => n + st.rows.filter(isDone).length, 0)
  const nextRow = steps.flatMap((st) => st.rows).find((r) => !isDone(r))
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
  const cellEntry = cell ? entryOf(cell) : undefined
  const cellPrefill = (r: Row): Entry | undefined =>
    prevOf(r.ex).find((e) => e.round === r.round) ?? [...entries].filter((e) => e.exerciseId === r.ex.id && e.round < r.round && hasValues(e)).sort((a, b) => b.round - a.round)[0] ?? prevOf(r.ex).pop()

  return (
    <main className="page session">
      {head}
      <div className="sprog">
        <p className="muted small"><strong className="num">{doneCount}</strong> de {total} series{session.startedAt && session.status !== 'done' ? <> · empezaste a las <span className="num">{fmtClock(session.startedAt)}</span></> : null}</p>
        <Bar value={doneCount} max={total} label="Series hechas" />
      </div>

      {steps.map((step, i) => {
        const superset = step.exs.length > 1
        const restMs = parseRest(step.block.restLabel)
        const showRest = !!step.block.restLabel && !step.block.noRest
        return (
          <Fragment key={step.block.id}>
            {step.block.heading && <h2 className="rowheading">{step.block.heading}</h2>}
            <section className="card sblock" aria-label={superset ? 'Superserie' : step.exs[0].name}>
              {superset && <p className="blocktag"><span><Icon name="link" size={14} /> Superserie · alternan por ronda</span></p>}
              {step.exs.map((ex) => {
                const fields = fieldsFor(ex)
                const prev = prevOf(ex)
                const rec = recordOf(ex)
                return (
                  <div key={ex.id} className="sinfo">
                    <div className="sinfo-top">
                      <h2>{ex.name}</h2>
                      <span className="sinfo-tools">
                        {ex.note && <span className="iconbtn static" title={ex.note} aria-label={`Nota: ${ex.note}`}><Icon name="note" size={20} /></span>}
                        {ex.linkUrl && <button className="iconbtn" aria-label={`Ver video de ${ex.name}`} onClick={() => setLink(ex)}><Icon name="play" size={22} /></button>}
                      </span>
                    </div>
                    <p className="muted small">{cap(ex.kind)} · Objetivo {fmtTarget(ex.target)}</p>
                    {ex.note && <p className="small snote">{ex.note}</p>}
                    <div className="prevrow">
                      <span className="muted small">Anterior: <strong className="num">{prev.length ? prev.map((e) => fmtEntry(e, fields)).join(' · ') : '—'}</strong></span>
                      <button className="btn compact" disabled={!prev.length} onClick={() => copyPrev(ex)}><Icon name="copy" size={18} />Copiar</button>
                    </div>
                    {rec && <p className="small" role="status">🏆 R{rec.round}: récord personal ({fmtEntry(rec, fields, true)})</p>}
                  </div>
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
            </section>
            {showRest && i < steps.length - 1 && (
              <button className="restdiv" onClick={() => (restMs ? sw.countdown(restMs) : sw.open())}>
                <Icon name="timer" size={18} />Descanso {step.block.restLabel} · <strong>{sw.badge ? <span className="num">{sw.badge}</span> : 'Iniciar'}</strong>
              </button>
            )}
          </Fragment>
        )
      })}

      <footer className="sessionbar">
        <button className="btn primary grow" onClick={finish}><Icon name="check" size={20} />Terminar entreno</button>
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
          </div>
        </Sheet>
      )}
      {noting && <NoteSheet title="Nota del entreno" value={session.note ?? ''} onSave={(t) => updateSession(session.id, { note: t })} onClose={() => setNoting(false)} />}
      {link && <LinkSheet url={link.linkUrl} title={link.name} onClose={() => setLink(null)} />}
    </main>
  )
}
