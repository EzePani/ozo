import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import App from './App'
import './styles.css'
import { startSync } from './data/sync'

registerSW({ immediate: true })
// pedir almacenamiento persistente para que el navegador no borre los datos
navigator.storage?.persist?.().catch(() => {})

void startSync().catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
