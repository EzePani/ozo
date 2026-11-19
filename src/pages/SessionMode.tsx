import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, ensureTodaySession, loadDay, previousEntries, saveEntry, type Block, type Exercise } from '../db'
import { cap, draftToValues, fieldsFor, fmtDate, fmtEntry, fmtTarget, valuesToDraft, type Draft } from '../lib'
import { Chip, EntryEditor, Icon, Sheet, toast } from '../ui'
import { useStopwatch } from '../Stopwatch'
import { LinkSheet } from '../LinkSheet'

interface Step { ex: Exercise; block: Block; round: number }
interface Local { skipped: number[]; later: number[] } // cambios solo por hoy: no tocan la plantilla
type Cur = { exId: number; round: number } | 'end' | null

const loadLocal = (id: number): Local => {
  try { return { skipped: [], later: [], ...JSON.parse(sessionStorage.getItem(`ozo-sesion-${id}`) ?? '{}') } } catch { return { skipped: [], later: [] } }
}

export default function SessionMode() {
  const dayId = Number(useParams().id)
  const sw = useStopwatch()
  const tree = useLiveQuery(() => loadDay(dayId), [dayId])
  const [sessionId, setSessionId] = useState<number | null>(null)
  useEffect(() => {
    let on = true
    ensureTodaySession(dayId).then((id) => { if (on) setSessionId(id) })
    return () => { on = false }
  }, [dayId])
  const session = useLiveQuery(() => (sessionId ? db.sessions.get(sessionId) : undefined), [sessionId])
  const entries = useLiveQuery(async () => (sessionId ? await db.entries.where('sessionId').equals(sessionId).toArray() : undefined), [sessionId])

  const [local, setLocal] = useState<Local>({ skipped: [], later: [] })
  useEffect(() => { if (sessionId) setLocal(loadLocal(sessionId)) }, [sessionId])
  const saveLocal = (l: Local) => { setLocal(l); if (sessionId) sessionStorage.setItem(`ozo-sesion-${sessionId}`, JSON.stringify(l)) }

  const steps = useMemo<Step[]>(() => {
    if (!tree) return []
    const blocks = [...tree.blocks.filter((b) => !local.later.includes(b.id)), ...local.later.map((id) => tree.blocks.find((b) => b.id === id)).filter((b): b is Block => !!b)]
    const out: Step[] = []
    for (const block of blocks) {
      const exs = tree.flat.filter((f) => f.block.id === block.id && !local.skipped.includes(f.ex.id)).map((f) => f.ex)
      if (block.kind === 'superset') {
        const max = Math.max(0, ...exs.map((e) => e.rounds))
        for (let r = 1; r <= max; r++) for (const ex of exs) if (r <= ex.rounds) out.push({ ex, block, round: r })
      } else for (const ex of exs) for (let r = 1; r <= ex.rounds; r++) out.push({ ex, block, round: r })
    }
    return out
  }, [tree, local])

  const isDone = (s: Step) => !!entries?.find((e) => e.exerciseId === s.ex.id && e.round === s.round)?.done
  const [cur, setCur] = useState<Cur>(null)
  const idx = cur && cur !== 'end' ? steps.findIndex((s) => s.ex.id === cur.exId && s.round === cur.round) : -1
  const step = idx >= 0 ? steps[idx] : undefined
  const pending = (from: number) => {
    const order = [...steps.slice(from), ...steps.slice(0, from)]
    const s = order.find((x) => !isDone(x))
    return s ? { exId: s.ex.id, round: s.round } : ('end' as const)
  }
  // posición inicial, y reubicación si el paso actual desaparece (ejercicio salteado)
  useEffect(() => {
    if (!tree || !entries || !steps.length) return
    if (cur === null || (cur !== 'end' && idx < 0)) setCur(pending(0))
  }, [tree, entries, steps, cur, idx]) // eslint-disable-line react-hooks/exhaustive-deps

  const [draft, setDraft] = useState<Draft>({})
  const curKey = step ? `${step.ex.id}-${step.round}` : ''
  const ready = !!entries
  useEffect(() => {
    if (!step || !entries) return
    setDraft(valuesToDraft(entries.find((e) => e.exerciseId === step.ex.id && e.round === step.round), step.ex.timeUnit))
  }, [curKey, ready]) // eslint-disable-line react-hooks/exhaustive-deps

  const prev = useLiveQuery(async () => (step && session ? previousEntries(step.ex.id, session.date, session.id) : null), [step?.ex.id, session?.date, session?.id])
  const [menu, setMenu] = useState(false)
  const [link, setLink] = useState(false)

  if (tree === null) return <main className="page"><p>Ese día no existe.</p><Link className="btn" to="/">Volver al inicio</Link></main>
  if (!tree || !session || !entries) return <main className="page" aria-busy="true" />

  const head = (
    <header className="pagehead">
      <Link to={`/dia/${dayId}`} className="iconbtn" aria-label="Salir de la sesión"><Icon name="close" /></Link>
      <h1 className="small-title">{tree.day.name} · <span className="num">{fmtDate(session.date)}</span></h1>
      {step ? <button className="iconbtn" aria-label="Cambios solo por hoy" onClick={() => setMenu(true)}><Icon name="more" /></button> : <span className="iconbtn" />}
    </header>
  )

  if (!steps.length || cur === 'end' || !step) {
    const doneCount = entries.filter((e) => e.done).length
    return (
      <main className="page session">
        {head}
        <div className="card empty grow-center">
          {!tree.flat.length ? <><p><strong>Este día no tiene ejercicios.</strong></p><p className="muted">Agregalos desde la vista Resumen.</p></>
            : !steps.length ? <><p><strong>Salteaste todos los ejercicios.</strong></p><button className="btn" onClick={() => saveLocal({ skipped: [], later: [] })}>Restaurar ejercicios</button></>
            : cur === 'end' ? <><p className="bigmark" aria-hidden="true"><Icon name="check" size={40} /></p><p><strong>Sesión terminada</strong></p><p className="muted">{doneCount} {doneCount === 1 ? 'serie registrada' : 'series registradas'}</p></>
            : <p className="muted">Cargando…</p>}
        </div>
        <div className="stack">
          {cur === 'end' && steps.length > 0 && <button className="btn block" onClick={() => setCur({ exId: steps[0].ex.id, round: steps[0].round })}>Revisar series</button>}
          <Link className="btn primary block" to={`/dia/${dayId}?v=planilla`}>Ver planilla</Link>
        </div>
      </main>
    )
  }

  const { ex, block, round } = step
  const fields = fieldsFor(ex)
  const exOrder = [...new Set(steps.map((s) => s.ex.id))]
  const nextStep = steps[idx + 1]
  const partners = block.kind === 'superset' ? tree.flat.filter((f) => f.block.id === block.id && f.ex.id !== ex.id && !local.skipped.includes(f.ex.id)).map((f) => f.ex.name) : []
  const prevEntry = prev?.entries.find((e) => e.round === round) ?? prev?.entries[prev.entries.length - 1]
  const done = isDone(step)

  const markDone = async () => {
    await saveEntry(session.id, ex.id, round, draftToValues(draft, ex.timeUnit), true)
    const rest = [...steps.slice(idx + 1), ...steps.slice(0, idx)].find((s) => !isDone(s))
    setCur(rest ? { exId: rest.ex.id, round: rest.round } : 'end')
  }
  const copyPrev = async () => {
    if (!prev) return
    for (const p of prev.entries) {
      if (p.round > ex.rounds) continue
      const mine = entries.find((e) => e.exerciseId === ex.id && e.round === p.round)
      if (mine?.done) continue
      const { weight, reps, durationSec, distance } = p
      await saveEntry(session.id, ex.id, p.round, { weight, reps, durationSec, distance }, false)
    }
    if (!done && prevEntry) setDraft(valuesToDraft(prev.entries.find((e) => e.round === round) ?? prevEntry, ex.timeUnit))
    toast('Rondas rellenadas con lo anterior')
  }
  const go = (d: number) => { const s = steps[idx + d]; if (s) setCur({ exId: s.ex.id, round: s.round }) }

  return (
    <main className="page session">
      {head}
      <section className="session-info" aria-live="polite">
        <h2>{ex.name}</h2>
        <p><Chip>{cap(ex.kind)}</Chip> <span className="muted">Objetivo: {fmtTarget(ex.target)}{block.restLabel ? ` · Descanso: ${block.restLabel}` : ''}</span></p>
        {partners.length > 0 && <p className="blocktag inline">BLOQUE · alterna con {partners.join(', ')}</p>}
        {ex.note && <p className="muted small">Nota: {ex.note}</p>}
      </section>
      <div className="roundrow">
        <button className="iconbtn" aria-label="Serie anterior" disabled={idx === 0} onClick={() => go(-1)}><Icon name="back" /></button>
        <p className="round"><span className="num">Ronda {round}</span> <span className="muted">de {ex.rounds}</span>{done && <span className="donemark"><Icon name="check" size={18} />hecha</span>}</p>
        <button className="iconbtn" aria-label="Serie siguiente" disabled={!nextStep} onClick={() => go(1)}><Icon name="next" /></button>
      </div>
      <div className="prevrow">
        <span className="muted">{prev && prevEntry ? <>Anterior: <strong className="num">{fmtEntry(prevEntry, fields, true)}</strong></> : 'Anterior: —'}</span>
        <button className="btn compact" disabled={!prev} onClick={copyPrev}><Icon name="copy" size={20} />Copiar anterior</button>
      </div>
      <EntryEditor fields={fields} timeUnit={ex.timeUnit} draft={draft} onChange={setDraft} resetKey={curKey} />
      <button className="btn primary block big" onClick={markDone}><Icon name="check" />Hecha</button>
      <footer className="sessionbar">
        <button className="iconbtn" aria-label="Ver técnica" disabled={!ex.linkUrl} onClick={() => setLink(true)}><Icon name="play" /></button>
        <p className="sessionbar-mid">
          <span className="muted small">{nextStep ? 'Sigue' : 'Última serie'}</span>
          <span className="ellipsis">{nextStep ? `${nextStep.ex.name} · R${nextStep.round}` : 'Fin de la sesión'}</span>
        </p>
        <span className="progress num" aria-label={`Ejercicio ${exOrder.indexOf(ex.id) + 1} de ${exOrder.length}`}>{exOrder.indexOf(ex.id) + 1}/{exOrder.length}</span>
        <button className="iconbtn" aria-label={sw.badge ? `Cronómetro, ${sw.badge}` : 'Abrir cronómetro'} onClick={sw.open}>
          {sw.badge ? <span className="num small">{sw.badge}</span> : <Icon name="timer" />}
        </button>
      </footer>

      {menu && (
        <Sheet title="Cambios solo por hoy" onClose={() => setMenu(false)}>
          <p className="muted small">No modifican la rutina del día.</p>
          <div className="menu">
            <button className="btn block" onClick={() => { setMenu(false); saveLocal({ ...local, skipped: [...local.skipped, ex.id] }) }}><Icon name="skip" />Saltear {ex.name}</button>
            <button className="btn block" disabled={steps.every((s) => s.block.id === block.id)} onClick={() => {
              setMenu(false)
              saveLocal({ ...local, later: [...local.later.filter((id) => id !== block.id), block.id] })
              const s = steps.find((x) => x.block.id !== block.id && !isDone(x) && !local.later.includes(x.block.id)) ?? steps.find((x) => x.block.id !== block.id && !isDone(x))
              if (s) setCur({ exId: s.ex.id, round: s.round })
            }}><Icon name="later" />Dejar para después</button>
            {(local.skipped.length > 0 || local.later.length > 0) && <button className="btn block" onClick={() => { setMenu(false); saveLocal({ skipped: [], later: [] }) }}>Restaurar el orden y los salteados</button>}
          </div>
        </Sheet>
      )}
      {link && <LinkSheet url={ex.linkUrl} title={ex.name} onClose={() => setLink(false)} />}
    </main>
  )
}
