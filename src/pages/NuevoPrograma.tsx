import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { countNewExercises, createRoutine, getGoals, getRoutines, getSessions, importRoutine, norm, programDates, saveGoal, saveProgram, updateRoutine, useLive } from '../data'
import { CLAUDE_PROMPT, WD_ORDER, WEEKDAYS, copyText, fmtDay, listDates, thisMonth, validateRoutine, wdShort } from '../lib'
import { Icon, MonthNav, PageHead, Seg, Stepper, toast } from '../ui'
import { TypePicker } from './ExerciseEditor'

type Source = 'json' | 'existing' | 'empty'

export default function NuevoPrograma() {
  const nav = useNavigate()
  const [params] = useSearchParams()
  const preset = Number(params.get('rutina')) || null
  const routines = useLive(() => getRoutines())
  const sessions = useLive(() => getSessions())
  const goals = useLive(() => getGoals())
  const file = useRef<HTMLInputElement>(null)

  const [source, setSource] = useState<Source>(preset ? 'existing' : 'json')
  const [text, setText] = useState('')
  const [reuse, setReuse] = useState(true)
  const [routineId, setRoutineId] = useState<number | null>(preset)
  const [name, setName] = useState('')
  const [type, setType] = useState<string | null>(null)
  const [weekday, setWeekday] = useState<number | null>(null)
  const [month, setMonth] = useState(params.get('m') ?? thisMonth())
  const [weeks, setWeeks] = useState(4)
  const [custom, setCustom] = useState(false)
  const [goal, setGoal] = useState('')
  const [busy, setBusy] = useState(false)

  const result = useMemo(() => (source === 'json' && text.trim() ? validateRoutine(text) : null), [source, text])
  const parsed = result?.routine
  const names = parsed?.blocks.flatMap((b) => b.exercises.map((e) => e.name)) ?? []
  const fresh = useLive(() => countNewExercises(names), [names.join('|')])
  const same = parsed && routines?.find((r) => norm(r.name) === norm(parsed.name))
  const existing = source === 'existing' ? routines?.find((r) => r.id === routineId) : source === 'json' && same && reuse ? same : undefined

  // el JSON o la rutina elegida proponen tipo y objetivo; se pueden cambiar abajo
  useEffect(() => { if (parsed?.type) setType(parsed.type); if (parsed?.goal) setGoal(parsed.goal) }, [parsed?.type, parsed?.goal])
  useEffect(() => {
    if (!existing) return
    setType(existing.type)
    const g = goals?.find((x) => x.scope === 'routine' && x.ref === String(existing.id))
    if (g) setGoal(g.text)
  }, [existing?.id, goals?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const dates = weekday != null ? programDates(month, weekday, weeks) : []
  const taken = existing ? dates.filter((d) => sessions?.some((s) => s.routineId === existing.id && s.date === d)) : []
  const fresh_dates = dates.filter((d) => !taken.includes(d))
  const sourceOk = source === 'json' ? !!parsed : source === 'existing' ? !!existing : !!name.trim()
  const ok = sourceOk && !!type && weekday != null && fresh_dates.length > 0 && !busy

  const create = async () => {
    if (!ok || !type || weekday == null) return
    setBusy(true)
    try {
      let id: number
      if (existing) { id = existing.id; if (existing.type !== type) await updateRoutine(id, { type }) }
      else if (source === 'json' && parsed) id = await importRoutine({ ...parsed, name: same ? `${parsed.name} (2)` : parsed.name, goal: '' }, type)
      else id = await createRoutine(name, type)
      const g = goal.trim()
      const old = goals?.find((x) => x.scope === 'routine' && x.ref === String(id))
      if (g && g !== old?.text) await saveGoal({ ...(old ?? {}), scope: 'routine', ref: String(id), text: g })
      const r = await saveProgram({ routineId: id, month, weekday, weeks })
      toast(`Programa creado: ${r.created} ${r.created === 1 ? 'semana' : 'semanas'}`)
      nav(`/programa/${r.programId}`, { replace: true })
    } finally { setBusy(false) }
  }

  return (
    <main className="page">
      <PageHead title="Nuevo programa" back={`/programa?m=${month}`} />

      <h2 className="sect">1 · Rutina</h2>
      <div className="card form">
        <Seg<Source> label="Origen de la rutina" value={source} onChange={setSource}
          options={[{ value: 'json', label: 'Pegar JSON' }, { value: 'existing', label: 'Una que ya tengo' }, { value: 'empty', label: 'Vacía' }]} />
        {source === 'json' && (
          <>
            <p className="muted small">Pedile a Claude que convierta tu rutina al formato de Ozo y pegá acá el resultado.</p>
            <textarea className="input mono" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label="JSON de la rutina"
              placeholder='{ "version": 1, "routine": { … }, "blocks": [ … ] }' spellCheck={false} autoCapitalize="off" autoCorrect="off" />
            <div className="row wrap">
              <button className="btn grow" onClick={() => file.current?.click()}><Icon name="upload" size={20} />Subir archivo</button>
              <button className="btn grow" onClick={async () => toast((await copyText(CLAUDE_PROMPT)) ? 'Prompt copiado' : 'No se pudo copiar')}><Icon name="copy" size={20} />Copiar prompt para Claude</button>
            </div>
            <input ref={file} type="file" accept="application/json,.json,.txt" hidden
              onChange={async (e) => { const f = e.target.files?.[0]; if (f) setText(await f.text()); e.target.value = '' }} />
            {result && result.errors.length > 0 && (
              <ul className="plain errors" role="alert">
                {result.errors.map((e, i) => <li key={i} className="errline"><span className="errmark" aria-hidden="true">✕</span><span><strong>Error</strong> en <code>{e.slice(0, e.indexOf(':'))}</code>{e.slice(e.indexOf(':'))}</span></li>)}
              </ul>
            )}
            {parsed && (
              <p role="status"><strong>✓ Leí:</strong> {parsed.name} · {names.length} {names.length === 1 ? 'ejercicio' : 'ejercicios'} · {parsed.blocks.reduce((n, b) => n + b.exercises.reduce((m, e) => m + e.rounds, 0), 0)} series · {fresh ?? 0} {fresh === 1 ? 'ejercicio nuevo' : 'ejercicios nuevos'} para tu biblioteca</p>
            )}
            {parsed && same && (
              <div className="lbl">Ya tenés una rutina "{same.name}"
                <Seg label="Rutina repetida" value={reuse ? 'si' : 'no'} onChange={(v) => setReuse(v === 'si')}
                  options={[{ value: 'si', label: 'Usar la que ya tengo' }, { value: 'no', label: 'Crear otra' }]} />
              </div>
            )}
          </>
        )}
        {source === 'existing' && (
          <div className="chips" role="group" aria-label="Rutina">
            {routines?.map((r) => <button key={r.id} className="chipbtn" aria-pressed={routineId === r.id} onClick={() => setRoutineId(r.id)}>{r.name}</button>)}
            {routines?.length === 0 && <p className="muted">Todavía no hay rutinas.</p>}
          </div>
        )}
        {source === 'empty' && (
          <label className="lbl">Nombre de la rutina
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Lower A, Upper B…" maxLength={30} />
            <span className="muted small">Los ejercicios se agregan después, desde la grilla.</span>
          </label>
        )}
      </div>

      <h2 className="sect">2 · Tipo de rutina</h2>
      <div className="card"><TypePicker value={type} onChange={setType} /></div>

      <h2 className="sect">3 · Día y mes</h2>
      <div className="card form">
        <div className="chips" role="group" aria-label="Día de la semana">
          {WD_ORDER.map((n) => <button key={n} className="chipbtn" aria-pressed={weekday === n} aria-label={WEEKDAYS[n]} onClick={() => setWeekday(n)}>{wdShort(n)}</button>)}
        </div>
        <MonthNav month={month} onChange={setMonth} />
      </div>

      <h2 className="sect">4 · Semanas</h2>
      <div className="card form">
        <div className="chips" role="group" aria-label="Cantidad de semanas">
          {[2, 4, 6].map((n) => <button key={n} className="chipbtn" aria-pressed={!custom && weeks === n} onClick={() => { setCustom(false); setWeeks(n) }}>{n}</button>)}
          <button className="chipbtn" aria-pressed={custom} onClick={() => setCustom(true)}>Otro</button>
          {custom && <Stepper label="Semanas" value={weeks} onChange={setWeeks} min={1} max={12} />}
        </div>
        <p role="status">
          {weekday == null ? <span className="muted">Elegí el día de la semana para ver las fechas.</span>
            : fresh_dates.length ? <><strong>Armamos {fresh_dates.length} {fresh_dates.length === 1 ? 'semana' : 'semanas'}:</strong> {listDates(fresh_dates)}.</>
            : <strong>Esas fechas ya están todas programadas para esta rutina.</strong>}
          {taken.length > 0 && <span className="muted"> Ya existen y no se duplican: {taken.map(fmtDay).join(', ')}.</span>}
        </p>
      </div>

      <h2 className="sect">5 · Objetivo de la rutina (opcional)</h2>
      <div className="card">
        <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Búlgara 24 kg × 8" maxLength={80} aria-label="Objetivo de la rutina" />
        <p className="muted small gap-top">En Progreso podés sumarle una meta numérica para ver la barra de avance.</p>
      </div>

      <div className="actionbar">
        <button className="btn primary grow" disabled={!ok} onClick={create}>Crear programa</button>
      </div>
    </main>
  )
}
