# Ozo

Tracker de entrenamiento personal. PWA instalable, 100% local (IndexedDB), sin cuentas ni backend, funciona sin conexión después de la primera carga.

Stack: Vite + React + TypeScript, `vite-plugin-pwa`, Dexie, `@dnd-kit`, `react-router` (HashRouter). CSS y gráficos SVG propios.

## Correr en desarrollo

```bash
npm install
npm run dev
```

El service worker solo se activa en la versión compilada (`build` + `preview`).

## Compilar y probar la versión final

```bash
npm run build
npm run preview
```

`npm run build` chequea tipos y genera el sitio estático en `dist/`.

## Desplegar

`dist/` es un sitio estático con rutas relativas (`base: './'`) y HashRouter: se puede subir tal cual a cualquier hosting estático (Netlify, Vercel, GitHub Pages, Cloudflare Pages, un bucket) en la raíz o en una subcarpeta, sin configurar redirecciones. Tiene que servirse por **HTTPS** para que Android permita instalarla y funcione offline.

Para instalarla en Android: abrir la URL en Chrome → menú ⋮ → "Instalar app" / "Agregar a pantalla principal".

## Íconos

```bash
npm run icons
```

Regenera `public/icon.svg`, los PNG 192/512, el maskable y el de Apple (script sin dependencias en `scripts/gen-icons.mjs`).

## Datos

- Todo vive en IndexedDB del navegador (base `ozo`). Al iniciar se pide almacenamiento persistente.
- Backup: Ajustes → "Exportar todo a un archivo" / "Importar backup completo".
- La primera vez se siembra un día "Lower" de ejemplo con dos sesiones hechas y una planificada. Se borra desde Ajustes → "Borrar todo".

## Estructura

```
src/db.ts            modelo, Dexie, datos de ejemplo, operaciones (bloques, sesiones, backup)
src/lib.ts           formato (fechas DD-MM-AA, tiempos), campos por tipo, links, validación de JSON
src/ui.tsx           íconos, hoja inferior, confirmación, teclado numérico, controles
src/Stopwatch.tsx    cronómetro y cuenta regresiva (timestamps, wake lock, vibración y sonido)
src/LinkSheet.tsx    videos embebidos (YouTube, Instagram, TikTok)
src/pages/           Inicio, Día (Resumen y Planilla), Modo sesión, Programar mes, Historial, Importar, Ajustes
```

## Decisiones que no estaban en el pedido

- `Exercise.fields` (opcional): guarda qué campos se cargan en ejercicios de tipo "otro" o de tipo propio.
- El objetivo de tipo tiempo (`target.min/max`) se guarda en segundos, igual que los registros.
- Funcional carga kg × tiempo, o kg × distancia si el objetivo está en metros.
- Los datos de ejemplo traen dos sesiones hechas (no una) para que el gráfico y la comparación con la sesión anterior tengan sentido desde el inicio.
- Para arrastrar un ejercicio a otro día, al empezar a arrastrar aparece una franja abajo con los demás días. También está la acción "Mover" de la selección múltiple.
- Una sesión pasa a "hecha" al marcar la primera serie. Entrar a "Empezar sesión" ya crea la columna de hoy.

## Verificación

Probado en navegador a 390×844 sobre la versión compilada (`npm run preview`):

- Compila sin errores de tipos; sin errores en consola en todas las pantallas.
- Datos persisten al recargar. Con el servidor apagado la app vuelve a cargar desde el service worker (offline).
- Crear día, agregar Bíceps + Crunch + un cardio, seleccionar con pulsación larga, agrupar en bloque; tras recargar el bloque sigue y la sesión alterna Bíceps R1 → Crunch R1 → Bíceps R2…
- Cardio en minutos: pide tiempo (min) y distancia, sin kg.
- "Programar mes" con lunes de diciembre 2026 crea 07-12-26, 14-12-26, 21-12-26 y 28-12-26; repetirlo las marca "ya existe, se omite".
- "Empezar sesión" crea o reutiliza la columna de hoy; peso × reps cargados con el teclado propio aparecen en la planilla y en el historial (gráfico, lista y comparación). "Copiar anterior" rellena las rondas.
- Pegar el JSON de ejemplo importa el día con vista previa; un JSON con errores muestra la ruta de cada campo y no importa nada.
- Un link de YouTube se reproduce en la hoja inferior (youtube-nocookie) sin salir de la app.
- Arrastrar: reordenar, meter un ejercicio en un bloque y soltarlo en otro día (probado con mouse).
- Cronómetro y cuenta regresiva (con salto de reloj simulado: llega a cero aunque los intervalos no corran).
- Exportar backup → borrar todo → importar backup restaura todo; un archivo ajeno se rechaza.
- Tema claro/oscuro/sistema. Capturas con `filter: grayscale(1)`: estados distinguibles por forma y texto.
- Todos los controles de todas las pantallas miden ≥ 48×48 px (medido por script).

Sin probar:

- **Lighthouse**: no se corrió (las versiones actuales ya no traen la categoría PWA). Se revisó a mano lo que exige la instalación: manifest con nombre, `start_url`, `display: standalone`, íconos 192/512 + maskable, y service worker controlando la página.
- **Android real**: instalación, arrastre con el dedo, wake lock, vibración y sonido al llegar a cero, selector de fecha nativo.
- **Instagram y TikTok embebidos**: solo se probó el reconocimiento de las URL, no la reproducción (dependen de que el post sea público; si no cargan queda el botón "Abrir en el sitio").
- Lector de pantalla y escala de texto grande del sistema.
