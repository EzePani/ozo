import { useEffect, useState } from 'react'
import { parseLink } from './lib'
import { Sheet } from './ui'

/** Muestra el link de técnica embebido, sin salir de la app. */
export function LinkSheet({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  const info = parseLink(url)
  const [loaded, setLoaded] = useState(false)
  const [slow, setSlow] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 8000)
    const on = () => setOnline(navigator.onLine)
    window.addEventListener('online', on); window.addEventListener('offline', on)
    return () => { clearTimeout(t); window.removeEventListener('online', on); window.removeEventListener('offline', on) }
  }, [])
  const failed = !info?.embed || !online || (slow && !loaded)
  return (
    <Sheet title={title} onClose={onClose} tall={info?.provider === 'instagram' || info?.provider === 'tiktok'}>
      {info?.embed && online && (
        <div className={'embed ' + info.provider}>
          <iframe src={info.embed} title={`Video de ${info.label}: ${title}`} onLoad={() => setLoaded(true)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      )}
      {failed && (
        <p className="muted" role="status">
          {!info ? 'El link no es una dirección válida.'
            : !online ? 'Sin conexión: el video necesita internet.'
            : !info.embed ? 'Este link no se puede mostrar adentro de la app.'
            : 'El video está tardando en cargar.'}
        </p>
      )}
      {info && <a className="btn block" href={url} target="_blank" rel="noopener noreferrer">Abrir en el sitio</a>}
    </Sheet>
  )
}
