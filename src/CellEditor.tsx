import { useState } from 'react'
import type { Entry, EntryValues, Exercise } from './data'
import { draftToValues, fieldsFor, hasValues, valuesToDraft, type Draft } from './lib'
import { EntryEditor, Sheet } from './ui'

/** Teclado numérico de una celda (semana + ejercicio + ronda), con su nota. Si está vacía arranca con `prefill`. */
export function CellEditor({ title, ex, entry, prefill, hint, okLabel = 'Guardar', onSave, onClose }: {
  title: string; ex: Exercise; entry?: Entry; prefill?: EntryValues; hint?: string; okLabel?: string
  onSave: (values: EntryValues, note: string) => Promise<unknown>; onClose: () => void
}) {
  const [draft, setDraft] = useState<Draft>(() => valuesToDraft(hasValues(entry) ? entry : prefill, ex.timeUnit))
  const [note, setNote] = useState(entry?.note ?? '')
  const [noting, setNoting] = useState(!!entry?.note)
  return (
    <Sheet title={title} onClose={onClose}>
      {hint && <p className="muted small">{hint}</p>}
      <EntryEditor fields={fieldsFor(ex)} timeUnit={ex.timeUnit} draft={draft} onChange={setDraft} />
      {noting
        ? <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={400} placeholder="Nota de esta ronda" aria-label="Nota de esta ronda" />
        : <button className="btn compact" onClick={() => setNoting(true)}>📝 Agregar nota a esta ronda</button>}
      <div className="row">
        <button className="btn" onClick={() => setDraft({})}>Vaciar</button>
        <button className="btn primary grow" onClick={async () => { await onSave(draftToValues(draft, ex.timeUnit), note); onClose() }}>{okLabel}</button>
      </div>
    </Sheet>
  )
}
