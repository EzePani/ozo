import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { deleteLibExercise, getHistory, getLibExercise, getLibrary, getUsage, norm, useLive, type Field, type HistEntry, type LibExercise } from '../data'
import { FIELD_LABEL, bestEntry, cap, entryFields, entryMetric, fmtDate, fmtDay, fmtEntry, fmtMetric, metricOf } from '../lib'
import { Chip, Icon, PageHead, confirmDialog, toast, toastUndo } from '../ui'
import { LinkSheet } from '../LinkSheet'
import { ExerciseEditor } from './ExerciseEditor'

interface Point { id: number; date: string; best: number; entries: HistEntry[] }

function Chart({ points, metric }: { points: Point[]; metric: Field }) {
  const W = 320, H = 150, L = 8, R = 8, T = 22, B = 24
  const vals = points.map((p) => p.best)
  const min = Math.min(...vals), max = Math.max(...vals)
  const span = max - min || 1
  const x = (i: number) => (points.length === 1 ? W / 2 : L + (i * (W - L - R)) / (points.length - 1))
  const y = (v: number) => (max === min ? (T + H - B) / 2 : T + (1 - (v - min) / span) * (H - T - B))
  const first = points[0], last = points[points.length - 1]
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img"
      aria-label={`Mejor serie por entreno: de ${fmtMetric(first.best, metric)} el ${fmtDate(first.date)} a ${fmtMetric(last.best, metric)} el ${fmtDate(last.date)}. Mínimo ${fmtMetric(min, metric)}, máximo ${fmtMetric(max, metric)}.`}>
      <line x1={L} x2={W - R} y1={H - B} y2={H - B} className="axis" />
      {points.length > 1 && <polyline className="line-path" points={points.map((p, i) => `${x(i)},${y(p.best)}`).join(' ')} />}
      {points.map((p, i) => <circle key={p.id} cx={x(i)} cy={y(p.best)} r={i === points.length - 1 ? 5 : 3.5} className={i === points.length - 1 ? 'pt last' : 'pt'} />)}
      <text x={Math.min(Math.max(x(points.length - 1), 40), W - 4)} y={Math.max(y(last.best) - 9, 12)} textAnchor="end" className="lbl-strong">{fmtMetric(last.best, metric)}</text>
      <text x={L} y={H - 6} className="lbl-muted">{fmtDate(first.date)}</text>
      {points.length > 1 && <text x={W - R} y={H - 6} textAnchor="end" className="lbl-muted">{fmtDate(last.date)}</text>}
    </svg>
  )
}

const loadTypes = (fields: Field[]) => fields.map((f) => FIELD_LABEL[f].toLowerCase()).join(' × ')

export default function Biblioteca() {
  const data = useLive(async () => ({ library: await getLibrary(), usage: await getUsage(), history: await getHistory() }))
  const [q, setQ] = useState('')
  const [kind, setKind] = useState<string | null>(null)
  const [group, setGroup] = useState('')
  const [creating, setCreating] = useState(false)
  const [link, setLink] = useState<LibExercise | null>(null)
  if (!data) return <main className="page" aria-busy="true" />
  const kinds = [...new Set(data.library.map((l) => l.kind))]
  const groups = [...new Set(data.library.map((l) => l.muscleGroup).filter(Boolean))].sort()
  const list = data.library.filter((l) => l.norm.includes(norm(q)) && (!kind || l.kind === kind) && (!group || l.muscleGroup === group))

  return (
    <main className="page">
      <PageHead title="Biblioteca">
        <button className="btn compact primary" onClick={() => setCreating(true)}><Icon name="plus" size={20} />Nuevo</button>
      </PageHead>
      <div className="stack">
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ejercicio" aria-label="Buscar ejercicio" />
        <div className="chips" role="group" aria-label="Filtrar por tipo">
          <button className="chipbtn" aria-pressed={!kind} onClick={() => setKind(null)}>Todos</button>
          {kinds.map((k) => <button key={k} className="chipbtn" aria-pressed={kind === k} onClick={() => setKind(k)}>{cap(k)}</button>)}
        </div>
        {groups.length > 0 && (
          <select className="input" value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Filtrar por grupo muscular">
            <option value="">Todos los grupos musculares</option>
            {groups.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        )}
      </div>
      <p className="muted small hint">{list.length} {list.length === 1 ? 'ejercicio' : 'ejercicios'}. Cada uno existe una sola vez y comparte su historial entre rutinas.</p>
      <ul className="list cols">
        {list.map((l) => {
          const es = data.history.filter((e) => e.exerciseId === l.id)
          const fields = entryFields(es)
          const best = bestEntry(es, fields)
          const used = data.usage.get(l.id) ?? []
          return (
            <li key={l.id} className="card libcard">
              <Link className="linkrow grow" to={`/biblioteca/${l.id}`}>
                <strong>{l.name}</strong>
                <span><Chip>{cap(l.kind)}</Chip>{l.muscleGroup && <> <Chip>{l.muscleGroup}</Chip></>}</span>
                <span className="muted small num">Mejor: {best ? fmtEntry(best, fields, true) : '—'}</span>
                <span className="muted small">Usado en: {used.length ? used.map((r) => r.name).join(', ') : 'ninguna rutina'}</span>
              </Link>
              {l.linkUrl && <button className="iconbtn" aria-label={`Ver video de ${l.name}`} onClick={() => setLink(l)}><Icon name="play" /></button>}
            </li>
          )
        })}
      </ul>
      {data.library.length === 0 && <div className="card empty"><p className="muted">Todavía no hay ejercicios. Se suman solos al importar una rutina.</p></div>}
      {creating && <ExerciseEditor onClose={() => setCreating(false)} />}
      {link && <LinkSheet url={link.linkUrl} title={link.name} onClose={() => setLink(null)} />}
    </main>
  )
}

export function Ficha() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const data = useLive(async () => {
    const lib = await getLibExercise(id)
    return lib && { lib, used: (await getUsage()).get(id) ?? [], history: await getHistory([id]) }
  }, [id])
  const [editing, setEditing] = useState(false)
  const [link, setLink] = useState(false)
  if (data === undefined) return <main className="page" aria-busy="true" />
  if (data === null) return <main className="page"><PageHead title="Biblioteca" back="/biblioteca" /><p>Ese ejercicio ya no existe.</p></main>

  const { lib, used, history } = data
  const fields = entryFields(history)
  const metric = metricOf(fields)
  const best = bestEntry(history, fields)
  const points: Point[] = [...new Set(history.map((e) => e.sessionId))].map((sid) => {
    const entries = history.filter((e) => e.sessionId === sid).sort((a, b) => a.round - b.round)
    return { id: sid, date: entries[0].date, entries, best: Math.max(...entries.map((e) => entryMetric(e, metric) ?? 0)) }
  }).sort((a, b) => a.date.localeCompare(b.date))
  const last = points[points.length - 1], before = points[points.length - 2]
  const diff = last && before ? last.best - before.best : 0
  const remove = async () => {
    if (history.length && !(await confirmDialog({ title: `Borrar "${lib.name}"`, body: 'También se borra su historial de series.', ok: 'Borrar' }))) return
    const r = await deleteLibExercise(id)
    if (r === 'used') return toast('Primero quitalo de las rutinas que lo usan')
    nav('/biblioteca', { replace: true })
    toastUndo(`${lib.name} borrado`, r)
  }

  return (
    <main className="page">
      <PageHead title={lib.name} back="/biblioteca">
        <button className="iconbtn" aria-label="Editar ejercicio" onClick={() => setEditing(true)}><Icon name="edit" /></button>
      </PageHead>
      <p><Chip>{cap(lib.kind)}</Chip>{lib.muscleGroup && <> <Chip>{lib.muscleGroup}</Chip></>} <span className="muted small">{history.length ? `se carga ${loadTypes(fields)}` : ''}</span></p>
      <div className="cols gap-top">
        <div className="stack">
          {lib.linkUrl
            ? <button className="btn block" onClick={() => setLink(true)}><Icon name="play" />Ver video</button>
            : <button className="btn block" onClick={() => setEditing(true)}><Icon name="plus" />Agregar link de video</button>}
          <div className="card">
            <p className="eyebrow">🏆 Mejor marca</p>
            <p className="big num">{best ? fmtEntry(best, fields, true) : '—'}</p>
            {best && <p className="muted small">{fmtDay(best.date)}</p>}
          </div>
          <div className="card">
            <p className="eyebrow">Usado en</p>
            {used.length ? <ul className="plain">{used.map((r) => <li key={r.id} className="line"><Link className="linkrow grow" to={`/programa/rutina/${r.id}`}><strong>{r.name}</strong> <Chip>{r.type}</Chip></Link></li>)}</ul>
              : <p className="muted">Ninguna rutina todavía.</p>}
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <p className="eyebrow">Mejor serie por entreno ({FIELD_LABEL[metric].toLowerCase()})</p>
            {points.length ? <Chart points={points} metric={metric} /> : <p className="muted">Sin registros todavía. Aparecen al marcar series como hechas.</p>}
            {last && before && (
              <p role="status">
                <strong>{diff > 0 ? '▲ subió' : diff < 0 ? '▼ bajó' : '= igual'}{diff !== 0 && ` ${fmtMetric(Math.abs(diff), metric)}`}</strong>
                <span className="muted"> respecto al entreno anterior ({fmtDay(before.date)}: {fmtMetric(before.best, metric)})</span>
              </p>
            )}
          </div>
          {points.length > 0 && (
            <ul className="card plain">
              {[...points].reverse().map((p) => (
                <li key={p.id} className="line top">
                  <span><strong className="num">{fmtDay(p.date)}</strong><br /><span className="muted small">mejor: {fmtMetric(p.best, metric)}</span></span>
                  <span className="num series">{p.entries.map((e) => fmtEntry(e, fields)).join('  ·  ')}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {used.length === 0 && <button className="btn block danger gap-top" onClick={remove}><Icon name="trash" />Borrar de la biblioteca</button>}
      {editing && <ExerciseEditor lib={lib} onClose={() => setEditing(false)} />}
      {link && <LinkSheet url={lib.linkUrl} title={lib.name} onClose={() => setLink(false)} />}
    </main>
  )
}
