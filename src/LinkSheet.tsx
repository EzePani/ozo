import { useEffect, useState } from 'react'
import { copyText, parseLink } from './lib'
import { Icon, Sheet, toast } from './ui'

/** Video embebido como pop-up sobre la pantalla actual: se cierra y se sigue donde se estaba. */
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
  const playable = !!info && (!!info.embed || !!info.file)
  const failed = !playable || !online || (slow && !loaded && !info?.file)
  const tall = info?.provider === 'instagram' || info?.provider === 'tiktok' || info?.provider === 'facebook'
  const reason = !info ? 'El link no es una dirección válida.'
    : !online ? 'Sin conexión: el video necesita internet.'
    : !playable ? (info.hint ?? 'Este link no se puede mostrar adentro de la app.')
    : 'El video está tardando en cargar.'
  return (
    <Sheet title={title} onClose={onClose} tall={tall}>
      {info?.file && online && <video className="vidfile" src={info.file} controls playsInline preload="metadata" onLoadedMetadata={() => setLoaded(true)} />}
      {info?.embed && online && (
        <div className={'embed ' + info.provider}>
          <iframe src={info.embed} title={`Video de ${info.label}: ${title}`} onLoad={() => setLoaded(true)}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
            allowFullScreen referrerPolicy="strict-origin-when-cross-origin" />
        </div>
      )}
      {failed && (
        <div className="vidfail" role="status">
          <span className="vidfail-ico" aria-hidden="true"><Icon name="play" size={22} /></span>
          <div>
            <strong>{info ? `Video de ${info.label}` : 'Video'}</strong>
            <p className="muted small">{reason}</p>
          </div>
        </div>
      )}
      {info && (
        <div className="row">
          <a className={'btn grow' + (failed ? ' primary' : '')} href={url} target="_blank" rel="noopener noreferrer"><Icon name="move" size={20} />Abrir el video</a>
          <button className="btn" onClick={async () => { toast((await copyText(url)) ? 'Link copiado' : 'No se pudo copiar'); }}><Icon name="copy" size={20} />Copiar link</button>
        </div>
      )}
    </Sheet>
  )
}
