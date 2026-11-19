import { useEffect } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { getSettings, useLive } from './data'
import { ConfirmHost, Icon, ToastHost } from './ui'
import { StopwatchFab, StopwatchProvider } from './Stopwatch'
import Hoy from './pages/Hoy'
import Programa from './pages/Programa'
import NuevoPrograma from './pages/NuevoPrograma'
import Grilla from './pages/Grilla'
import RoutineEditor from './pages/RoutineEditor'
import SessionMode from './pages/SessionMode'
import Biblioteca, { Ficha } from './pages/Biblioteca'
import Progreso from './pages/Progreso'
import SettingsPage from './pages/SettingsPage'

function useTheme() {
  const theme = useLive(() => getSettings())?.theme ?? 'system'
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
  const inSession = pathname.startsWith('/sesion/')
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return (
    <div className={inSession ? 'app bare' : 'app'}>
      <Routes>
        <Route path="/" element={<Hoy />} />
        <Route path="/programa" element={<Programa />} />
        <Route path="/programa/nuevo" element={<NuevoPrograma />} />
        <Route path="/programa/:id" element={<Grilla />} />
        <Route path="/programa/rutina/:id" element={<RoutineEditor />} />
        <Route path="/sesion/:id" element={<SessionMode />} />
        <Route path="/biblioteca" element={<Biblioteca />} />
        <Route path="/biblioteca/:id" element={<Ficha />} />
        <Route path="/progreso" element={<Progreso />} />
        <Route path="/ajustes" element={<SettingsPage />} />
        <Route path="*" element={<Hoy />} />
      </Routes>
      {!inSession && (
        <>
          <StopwatchFab />
          <nav className="tabbar" aria-label="Principal">
            <span className="brand" aria-hidden="true">Ozo</span>
            <NavLink to="/" end><Icon name="home" /><span>Hoy</span></NavLink>
            <NavLink to="/programa"><Icon name="calendar" /><span>Programa</span></NavLink>
            <NavLink to="/biblioteca"><Icon name="book" /><span>Biblioteca</span></NavLink>
            <NavLink to="/progreso"><Icon name="chart" /><span>Progreso</span></NavLink>
            <NavLink to="/ajustes" className="onlydesktop"><Icon name="sliders" /><span>Ajustes</span></NavLink>
          </nav>
        </>
      )}
      <ConfirmHost />
      <ToastHost />
    </div>
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
