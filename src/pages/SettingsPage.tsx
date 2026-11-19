import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { addCustomKind, clearAll, getSettings, patchSettings, type Theme } from '../db'
import { cap } from '../lib'
import { Icon, Seg, confirmDialog, toast } from '../ui'
import { BackupButtons } from './ImportPage'

export default function SettingsPage() {
  const settings = useLiveQuery(() => getSettings())
  const [name, setName] = useState('')
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted).catch(() => {}) }, [])
  const kinds = settings?.customKinds ?? []

  const add = async () => { await addCustomKind(name); setName('') }
  const wipe = async () => {
    if (!(await confirmDialog({ title: 'Borrar todo', body: 'Se borran todos los días, ejercicios, sesiones y registros de este dispositivo. No se puede deshacer. Si querés conservarlos, exportá un backup antes.', ok: 'Borrar todo' }))) return
    await clearAll()
    toast('Datos borrados')
  }

  return (
    <main className="page">
      <header className="pagehead"><h1>Ajustes</h1></header>

      <h2 className="sect">Tema</h2>
      <div className="card">
        <Seg<Theme> label="Tema" value={settings?.theme ?? 'system'} onChange={(theme) => patchSettings({ theme })}
          options={[{ value: 'system', label: 'Sistema' }, { value: 'light', label: 'Claro' }, { value: 'dark', label: 'Oscuro' }]} />
      </div>

      <h2 className="sect">Rutinas</h2>
      <div className="card stack">
        <Link className="btn block" to="/importar"><Icon name="upload" />Importar rutina desde Claude</Link>
        <Link className="btn block" to="/programar"><Icon name="calendar" />Programar mes</Link>
      </div>

      <h2 className="sect">Backup</h2>
      <div className="card"><BackupButtons /></div>

      <h2 className="sect">Tipos propios</h2>
      <div className="card stack">
        {kinds.length === 0 && <p className="muted">No creaste tipos propios.</p>}
        {kinds.length > 0 && (
          <ul className="plain">
            {kinds.map((k) => (
              <li key={k} className="line">
                <span>{cap(k)}</span>
                <button className="iconbtn" aria-label={`Quitar el tipo ${k}`} onClick={() => patchSettings({ customKinds: kinds.filter((x) => x !== k) })}><Icon name="trash" /></button>
              </li>
            ))}
          </ul>
        )}
        <form className="row" onSubmit={(e) => { e.preventDefault(); void add() }}>
          <input className="input grow" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del tipo" maxLength={20} aria-label="Nombre del tipo nuevo" />
          <button className="btn" disabled={!name.trim()}>Agregar</button>
        </form>
      </div>

      <h2 className="sect">Datos</h2>
      <div className="card stack">
        <p className="muted small">Todo se guarda solo en este dispositivo. {persisted === true ? 'El almacenamiento está protegido contra el borrado automático.' : persisted === false ? 'El navegador todavía no garantiza el almacenamiento permanente: instalá la app y exportá backups cada tanto.' : ''}</p>
        <button className="btn block" onClick={wipe}><Icon name="trash" />Borrar todo</button>
      </div>
    </main>
  )
}
