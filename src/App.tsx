import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from './db'
import { ConfirmHost, Icon, ToastHost } from './ui'
import { StopwatchFab, StopwatchProvider } from './Stopwatch'
import Home from './pages/Home'
import DayPage from './pages/DayPage'
import SessionMode from './pages/SessionMode'
import Schedule from './pages/Schedule'
import History from './pages/History'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'

function useTheme() {
  const theme = useLiveQuery(() => db.settings.get(1))?.theme ?? 'system'
  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      if (theme === 'system') delete root.dataset.theme
      else root.dataset.theme = theme
      const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    }
    apply()
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [theme])
}

function Shell() {
  const { pathname } = useLocation()
  const inSession = pathname.endsWith('/sesion')
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/dia/:id" element={<DayPage />} />
        <Route path="/dia/:id/sesion" element={<SessionMode />} />
        <Route path="/programar" element={<Schedule />} />
        <Route path="/historial" element={<History />} />
        <Route path="/importar" element={<ImportPage />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="*" element={<Home />} />
      </Routes>
      {!inSession && (
        <>
          <StopwatchFab />
          <nav className="tabbar" aria-label="Principal">
            <NavLink to="/" end><Icon name="home" /><span>Inicio</span></NavLink>
            <NavLink to="/historial"><Icon name="chart" /><span>Historial</span></NavLink>
            <NavLink to="/ajustes"><Icon name="sliders" /><span>Ajustes</span></NavLink>
          </nav>
        </>
      )}
      <ConfirmHost />
      <ToastHost />
    </>
  )
}

export default function App() {
  useTheme()
  return (
    <HashRouter>
      <StopwatchProvider>
        <Shell />
      </StopwatchProvider>
    </HashRouter>
  )
}
