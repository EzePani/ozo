import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Field, TimeUnit, Undo } from './data'
import { FIELD_LABEL, fieldUnit, fmtDate, monthLabel, shiftMonth, type Draft } from './lib'

// ---------- íconos (trazo simple) ----------
const PATHS: Record<string, string> = {
  home: 'M4 11l8-7 8 7v9h-5v-6H9v6H4z',
  chart: 'M4 20V4M4 20h16M8 16l4-5 3 3 5-7',
  sliders: 'M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  close: 'M6 6l12 12M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  timer: 'M12 8v5l3 2M9 2h6M12 5a8 8 0 100 16 8 8 0 000-16z',
  play: 'M8 5l11 7-11 7z',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v5M14 11v5',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v5M16 3v5',
  skip: 'M5 5l9 7-9 7zM18 5v14',
  backspace: 'M9 5h11v14H9l-6-7zM12 9l5 6M17 9l-5 6',
  group: 'M4 4h16v16H4zM8 9h8M8 15h8',
  ungroup: 'M4 4h16v6H4zM4 14h16v6H4z',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
  move: 'M5 12h14M13 6l6 6-6 6',
  select: 'M4 4h7v7H4zM4 15h7v5H4zM15 6h5M15 17h5',
  later: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  upload: 'M12 16V5M7 10l5-5 5 5M5 20h14',
  book: 'M5 4h13v16H5zM9 4v16M12 9h3',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  note: 'M5 4h14v12l-5 4H5zM14 20v-4h5M8 9h8M8 13h4',
  target: 'M12 3a9 9 0 100 18 9 9 0 000-18zM12 8a4 4 0 100 8 4 4 0 000-8zM12 12h.01',
}
export function Icon({ name, size = 24 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'grip' || name === 'more' ? 3 : 2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} />
    </svg>
  )
}

// ---------- hoja inferior ----------
export function Sheet({ title, onClose, children, tall }: { title: string; onClose: () => void; children: ReactNode; tall?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); prev?.focus?.() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="backdrop" onClick={onClose}>
      <div className={'sheet' + (tall ? ' tall' : '')} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="iconbtn" aria-label="Cerrar" onClick={onClose}><Icon name="close" /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}

// ---------- confirmación ----------
interface ConfirmOpts { title: string; body?: string; ok: string }
let ask: (o: ConfirmOpts) => Promise<boolean> = async () => false
export const confirmDialog = (o: ConfirmOpts) => ask(o)
export function ConfirmHost() {
  const [st, setSt] = useState<(ConfirmOpts & { res: (v: boolean) => void }) | null>(null)
  useEffect(() => { ask = (o) => new Promise((res) => setSt({ ...o, res })) }, [])
  if (!st) return null
  const close = (v: boolean) => { st.res(v); setSt(null) }
  return (
    <div className="backdrop center" onClick={() => close(false)}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={st.title} onClick={(e) => e.stopPropagation()}>
        <h2>{st.title}</h2>
        {st.body && <p className="muted">{st.body}</p>}
        <div className="row">
          <button className="btn" onClick={() => close(false)} autoFocus>Cancelar</button>
          <button className="btn primary" onClick={() => close(true)}>{st.ok}</button>
        </div>
      </div>
    </div>
  )
}

// ---------- aviso breve (con acción opcional, ej. Deshacer) ----------
interface ToastAction { label: string; run: () => void | Promise<void> }
let push: (msg: string, action?: ToastAction) => void = () => {}
export const toast = (msg: string, action?: ToastAction) => push(msg, action)
/** Avisa un borrado y ofrece deshacerlo durante unos segundos. */
export const toastUndo = (msg: string, undo: Undo) => push(msg, { label: 'Deshacer', run: async () => { await undo(); push('Listo, volvió como estaba') } })
export function ToastHost() {
  const [st, setSt] = useState<{ msg: string; action?: ToastAction } | null>(null)
  useEffect(() => {
    let t = 0
    push = (msg, action) => { setSt({ msg, action }); clearTimeout(t); t = window.setTimeout(() => setSt(null), action ? 7000 : 2600) }
    return () => clearTimeout(t)
  }, [])
  return (
    <div className="toast" role="status" aria-live="polite">
      {st && <span>{st.msg}{st.action && <button onClick={() => { const a = st.action!; setSt(null); void a.run() }}>{st.action.label}</button>}</span>}
    </div>
  )
}

/** true en pantallas anchas (compu): cambia la grilla y la navegación. */
export function useIsDesktop() {
  const q = '(min-width: 900px)'
  const [v, set] = useState(() => matchMedia(q).matches)
  useEffect(() => {
    const m = matchMedia(q)
    const f = () => set(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  return v
}

// ---------- piezas de página ----------
export function PageHead({ title, back, children }: { title: ReactNode; back?: string; children?: ReactNode }) {
  return (
    <header className="pagehead">
      {back && <Link to={back} className="iconbtn" aria-label="Volver"><Icon name="back" /></Link>}
      <h1>{title}</h1>
      {children}
      {!back && <Link to="/ajustes" className="iconbtn onlymobile" aria-label="Ajustes"><Icon name="sliders" /></Link>}
    </header>
  )
}

export function MonthNav({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="monthnav">
      <button className="iconbtn" aria-label="Mes anterior" onClick={() => onChange(shiftMonth(month, -1))}><Icon name="back" /></button>
      <strong aria-live="polite">{monthLabel(month)}</strong>
      <button className="iconbtn" aria-label="Mes siguiente" onClick={() => onChange(shiftMonth(month, 1))}><Icon name="next" /></button>
    </div>
  )
}

/** Barra de avance. Siempre va acompañada de su texto ("3 / 16"). */
export function Bar({ value, max, label }: { value: number; max: number; label: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return <div className="bar" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)}><i style={{ width: `${pct}%` }} /></div>
}

export function NoteSheet({ title, value, hint, onSave, onClose }: { title: string; value: string; hint?: string; onSave: (text: string) => void | Promise<unknown>; onClose: () => void }) {
  const [text, setText] = useState(value)
  return (
    <Sheet title={title} onClose={onClose}>
      {hint && <p className="muted small">{hint}</p>}
      <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={400} autoFocus aria-label={title} placeholder="Texto libre" />
      <div className="row">
        {value && <button className="btn" onClick={async () => { await onSave(''); onClose() }}>Borrar nota</button>}
        <button className="btn primary grow" onClick={async () => { await onSave(text.trim()); onClose() }}>Guardar</button>
      </div>
    </Sheet>
  )
}

// ---------- controles ----------
/** Fecha: muestra DD-MM-AA y abre el selector nativo. */
export function DateField({ value, onChange, label, className = '' }: { value: string; onChange: (iso: string) => void; label: string; className?: string }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <span className={'datefield ' + className}>
      <span aria-hidden="true">{fmtDate(value)}</span>
      <input ref={ref} type="date" value={value} aria-label={`${label}: ${fmtDate(value)}`}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        onClick={() => { try { ref.current?.showPicker() } catch { /* sin soporte */ } }} />
    </span>
  )
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T | null; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  )
}

export function Stepper({ value, onChange, min = 1, max = 20, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label: string }) {
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Menos ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)}>−</button>
      <output className="num">{value}</output>
      <button type="button" aria-label={`Más ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)}>+</button>
    </div>
  )
}

export function Chip({ children }: { children: ReactNode }) { return <span className="chip">{children}</span> }

// ---------- teclado numérico propio ----------
export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  return (
    <div className="keypad" role="group" aria-label="Teclado numérico">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9', ',', '0', 'del'].map((k) => (
        <button key={k} type="button" aria-label={k === 'del' ? 'Borrar' : k === ',' ? 'Coma' : k} onClick={() => onKey(k)}>
          {k === 'del' ? <Icon name="backspace" /> : k}
        </button>
      ))}
    </div>
  )
}

/** Campos de una serie + teclado. El primer toque sobre un campo ya cargado lo reemplaza. */
export function EntryEditor({ fields, timeUnit, draft, onChange, resetKey }: {
  fields: Field[]; timeUnit: TimeUnit; draft: Draft; onChange: (d: Draft) => void; resetKey?: unknown
}) {
  const [active, setActive] = useState<Field>(fields[0])
  const fresh = useRef(true)
  useEffect(() => { setActive(fields[0]); fresh.current = true }, [resetKey, fields.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = fields.includes(active) ? active : fields[0]
  const key = (k: string) => {
    let v = fresh.current && k !== 'del' ? '' : draft[cur] ?? ''
    fresh.current = false
    if (k === 'del') v = v.slice(0, -1)
    else if (k === ',') { if (cur === 'reps' || v.includes(',')) return; v = (v || '0') + ',' }
    else if (v.replace(',', '').length < 6) v = v === '0' ? k : v + k
    onChange({ ...draft, [cur]: v || undefined })
  }
  return (
    <>
      <div className="fields">
        {fields.map((f) => (
          <button key={f} type="button" className="field" aria-pressed={cur === f} onClick={() => { setActive(f); fresh.current = true }}>
            <span className="field-label">{FIELD_LABEL[f]}{cur === f ? ' ▾' : ''}</span>
            <span className="field-value num">{draft[f] ?? '—'}</span>
            <span className="field-unit">{fieldUnit(f, timeUnit)}</span>
          </button>
        ))}
      </div>
      <Keypad onKey={key} />
    </>
  )
}
