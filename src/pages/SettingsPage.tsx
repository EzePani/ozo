import { useEffect, useRef, useState } from 'react'
import { addCustomKind, addRoutineType, clearAll, exportAll, getSettings, patchSettings, renameType, restoreAll, todayISO, typeUsage, useLive, type Theme } from '../data'
import { cap, fmtDate, validateBackup } from '../lib'
import { Icon, PageHead, Seg, confirmDialog, toast } from '../ui'

async function downloadBackup() {
  const blob = new Blob([JSON.stringify(await exportAll(), null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `ozo-backup-${fmtDate(todayISO())}.json`
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  toast('Backup exportado')
}

function BackupButtons() {
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const onFile = async (f?: File) => {
    if (!f) return
    setError('')
    const { data, error } = validateBackup(await f.text())
    if (file.current) file.current.value = ''
    if (!data) return setError(error ?? 'Archivo inválido')
    const ok = await confirmDialog({
      title: 'Reemplazar todos los datos',
      body: `El backup tiene ${data.routines.length} rutinas, ${data.library.length} ejercicios, ${data.programs.length} programas y ${data.sessions.length} semanas cargadas. Lo que hay ahora en la app se borra.`,
      ok: 'Reemplazar',
    })
    if (!ok) return
    try { await restoreAll(data); toast('Backup importado') } catch { setError('El backup tiene datos inconsistentes y no se importó. Tus datos no cambiaron.') }
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

function TagList({ scope, items, empty, label, onRemove, onAdd }: { scope: 'routine' | 'kind'; items: string[]; empty: string; label: string; onRemove: (k: string) => void; onAdd: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const rename = (k: string) => { setRenaming(k); setNewName(k) }
  const remove = async (k: string) => {
    const n = await typeUsage(scope, k)
    if (n && !(await confirmDialog({ title: `Quitar "${k}"`, body: `${n} ${scope === 'routine' ? (n === 1 ? 'rutina lo usa' : 'rutinas lo usan') : (n === 1 ? 'ejercicio lo usa' : 'ejercicios lo usan')}. Siguen con ese nombre, pero ya no aparece en la lista para elegir. Para cambiarlo en todos, usá Renombrar.`, ok: 'Quitar' }))) return
    if (!n && !(await confirmDialog({ title: `Quitar "${k}"`, ok: 'Quitar' }))) return
    onRemove(k)
  }
  return (
    <div className="card stack">
      {renaming && (
        <form className="row" onSubmit={async (e) => { e.preventDefault(); const r = await renameType(scope, renaming, newName); if (r === 'exists') return toast('Ya existe un tipo con ese nombre'); setRenaming(null); toast('Tipo renombrado en todo lo que lo usa') }}>
          <input className="input grow" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={20} aria-label={`Nuevo nombre para ${renaming}`} />
          <button className="btn primary" disabled={!newName.trim()}>Guardar</button>
          <button type="button" className="btn" onClick={() => setRenaming(null)}>Cancelar</button>
        </form>
      )}
      {items.length === 0 && <p className="muted">{empty}</p>}
      {items.length > 0 && (
        <ul className="plain">
          {items.map((k) => (
            <li key={k} className="line"><span className="grow">{cap(k)}</span>
              <button className="iconbtn" aria-label={`Renombrar ${k}`} onClick={() => rename(k)}><Icon name="edit" /></button>
              <button className="iconbtn" aria-label={`Quitar ${k}`} onClick={() => remove(k)}><Icon name="trash" /></button></li>
          ))}
        </ul>
      )}
      <form className="row" onSubmit={async (e) => { e.preventDefault(); await onAdd(name); setName('') }}>
        <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del tipo" maxLength={20} aria-label={label} />
        <button className="btn" disabled={!name.trim()}>Agregar</button>
      </form>
    </div>
  )
}

export default function SettingsPage() {
  const settings = useLive(() => getSettings())
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => {}) }, [])
  const kinds = settings?.customKinds ?? []
  const types = settings?.routineTypes ?? []
  const wipe = async () => {
    if (!(await confirmDialog({ title: 'Borrar todo', body: 'Se borran todas las rutinas, la biblioteca, los programas, los objetivos y los registros de este dispositivo. No se puede deshacer. Si querés conservarlos, exportá un backup antes.', ok: 'Borrar todo' }))) return
    await clearAll()
    toast('Datos borrados')
  }

  return (
    <main className="page">
      <PageHead title="Ajustes" back="/" />

      <h2 className="sect">Tema</h2>
      <div className="card">
        <Seg<Theme> label="Tema" value={settings?.theme ?? 'system'} onChange={(theme) => patchSettings({ theme })}
          options={[{ value: 'system', label: 'Sistema' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />
      </div>

      <h2 className="sect">Calendario</h2>
      <div className="card form">
        <p className="muted small">Hora y duración de los eventos que se crean desde la grilla (Google Calendar o archivo .ics).</p>
        <div className="row">
          <label className="lbl grow">Hora de inicio
            <input className="input" type="time" value={settings?.calTime ?? '07:00'} onChange={(e) => e.target.value && patchSettings({ calTime: e.target.value })} />
          </label>
          <label className="lbl grow">Duración (min)
            <input className="input num" inputMode="numeric" value={settings?.calMinutes ?? 60} onChange={(e) => { const n = parseInt(e.target.value, 10); if (n > 0 && n < 600) void patchSettings({ calMinutes: n }) }} />
          </label>
        </div>
      </div>

      <h2 className="sect">Backup</h2>
      <div className="card stack">
        <p className="muted small">Un archivo JSON con todo: rutinas, biblioteca, programas, semanas, registros, objetivos, notas y ajustes.</p>
        <BackupButtons />
      </div>

      <h2 className="sect">Tipos de rutina propios</h2>
      <TagList scope="routine" items={types} empty="No creaste tipos de rutina propios." label="Nombre del tipo de rutina nuevo"
        onRemove={(k) => patchSettings({ routineTypes: types.filter((x) => x !== k) })} onAdd={addRoutineType} />

      <h2 className="sect">Tipos de ejercicio propios</h2>
      <TagList scope="kind" items={kinds} empty="No creaste tipos de ejercicio propios." label="Nombre del tipo de ejercicio nuevo"
        onRemove={(k) => patchSettings({ customKinds: kinds.filter((x) => x !== k) })} onAdd={addCustomKind} />

      <h2 className="sect">Datos</h2>
      <div className="card stack">
        <p className="muted small">Todo se guarda solo en este dispositivo. {persisted === true ? 'El almacenamiento está protegido contra el borrado automático.' : persisted === false ? 'El navegador todavía no garantiza el almacenamiento permanente: instalá la app y exportá backups cada tanto.' : ''}</p>
        <button className="btn block" onClick={wipe}><Icon name="trash" />Borrar todo</button>
      </div>
    </main>
  )
}
