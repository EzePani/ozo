# Ozo

Tracker de entrenamiento personal, pensado como una planilla: **Rutina → Programa → Semanas**. PWA instalable, 100% local (IndexedDB), sin cuentas ni backend, funciona sin conexión después de la primera carga.

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

## Cómo se usa

- **Hoy**: tira de la semana, "hoy toca" con Empezar, objetivo del mes con su barra, racha y objetivos por rutina.
- **Programa**: mes con flechas y una tarjeta por programa. "Nuevo" abre el asistente (pegar JSON o subir archivo → tipo → día y mes → semanas → objetivo). Abajo, la lista de rutinas.
- **Grilla** (al tocar un programa): en celu, semana anterior y actual sin scroll horizontal; en compu, todas las semanas estilo planilla con acciones al pasar el mouse. Tocar una celda abre el teclado numérico con el último valor. ▲ mejoró, = igual, ▼ menos (además del color).
- **Carga del día**: un ejercicio (o superserie) por pantalla, con "Anterior", "Copiar anterior", video, 🏆 récord y descanso sugerido. "Terminar entreno" tacha el día.
- **Biblioteca**: cada ejercicio existe una sola vez; su historial y su video se comparten entre rutinas.
- **Progreso**: calendario del mes, contador, objetivo del mes, objetivos por rutina y récords.
- **Ajustes** (ícono arriba a la derecha en celu, menú lateral en compu): tema, backup, tipos propios, borrar todo.

## Datos

- Todo vive en IndexedDB del navegador (base `ozo`, esquema v2). Al iniciar se pide almacenamiento persistente.
- **Toda la app accede a los datos por `src/data/`** (funciones tipadas: `getRoutines()`, `saveProgram()`, `saveEntry()`…). Ninguna página importa Dexie: cambiar a otra base después toca solo esa carpeta.
- Backup: Ajustes → "Exportar todo a un archivo" / "Importar backup completo". Es un JSON plano con `schemaVersion: 2` y todas las tablas (`routines`, `blocks`, `library`, `routineItems`, `programs`, `sessions`, `entries`, `goals`, `settings`). También acepta backups de la versión anterior (`version: 1`) y los convierte.
- **Migración v1 → v2**: automática al abrir la app (`version(2).upgrade()` en `src/data/schema.ts`). Los días pasan a rutinas, los ejercicios a biblioteca + ítems de rutina (mismo nombre sin tildes ni mayúsculas = un solo ejercicio con historial unido), y cada rutina + mes con sesiones pasa a ser un programa. No se pierde ningún registro.
- La primera vez (base nueva) se siembra la rutina "Lower" de ejemplo con un programa de 4 semanas: dos hechas, la de hoy y la próxima. Se borra desde Ajustes → "Borrar todo".

## Estructura

```
src/data/schema.ts   modelo, Dexie (v1 y v2), migración pura v1→v2, datos de ejemplo
src/data/index.ts    capa de datos: rutinas, superseries, biblioteca, programas, semanas, registros, objetivos, backup
src/lib.ts           formato (fechas, tiempos), campos por tipo, comparación de series, links, validación de JSON y backup
src/ui.tsx           íconos, hoja inferior, confirmación, aviso con Deshacer, teclado numérico, controles
src/goals.tsx        objetivos del mes y por rutina (lectura, barras y editor)
src/CellEditor.tsx   teclado de una celda (semana + ejercicio + ronda) con su nota
src/Stopwatch.tsx    cronómetro y cuenta regresiva (timestamps, wake lock, vibración y sonido)
src/LinkSheet.tsx    video embebido (YouTube, Instagram, TikTok) como pop-up
src/pages/           Hoy, Programa, NuevoPrograma, Grilla, RoutineEditor, SessionMode, Biblioteca, Progreso, Ajustes
```

## Decisiones que no estaban en el pedido

- `Program.goal` no existe: el objetivo es de la rutina (`goals` con `scope: "routine"`), así vale para todos sus meses. Los objetivos de rutina guardan además `exerciseId` para saber con qué ejercicio medir la barra.
- Un mismo ejercicio de la biblioteca no puede estar dos veces en la misma rutina (el historial es por ejercicio + semana + ronda). "Duplicar" crea "Nombre (copia)".
- Quitar un ejercicio de una rutina no borra sus registros: quedan en el historial de la biblioteca. Quitar una ronda del medio corre las siguientes un lugar.
- Una semana pasa a "entrenada" al marcar la primera serie como hecha o con "Terminar entreno". Se puede desmarcar desde el menú de la semana.
- "Entrenar hoy igual" (cuando no hay nada programado) suma una columna con la fecha de hoy al programa del mes de esa rutina.
- Si el programa tiene más semanas que el mes, sigue en el mes siguiente (ej. 6 semanas desde el 7 dic terminan el 11 ene) y se ve bajo el mes en que empieza.
- Al importar un JSON cuyo nombre de rutina ya existe, se ofrece usar la rutina que ya está o crear otra.
- Se sacaron el "saltear / dejar para después" de la sesión (ahora se navega libre entre ejercicios) y el mover ejercicios entre días (lo reemplaza "+ Ejercicio" desde la biblioteca).
- Colores: la base sigue en grises; se suman verde/naranja en la grilla y azul para "hoy", siempre con símbolo o texto.

## Verificación (v2)

Probado en navegador a 390×844 y 1280×800 (dev y versión compilada):

- **Migración**: una base v1 sembrada a mano (2 días, 5 ejercicios con "Crunch" y "crúnch" repetido, 4 sesiones, 5 registros, tema y tipo propio) abre en v2 con 2 rutinas, 4 ejercicios de biblioteca (Crunch unido, con su link), 3 programas y los 5 registros intactos.
- **Asistente**: pegar el JSON de Lower A muestra "Leí: Lower A · 5 ejercicios · 15 series · 3 ejercicios nuevos"; Lower + lunes + 4 semanas en diciembre 2026 crea 7, 14, 21 y 28 dic (los lunes reales de ese mes) y aparece bajo Diciembre. Repetirlo avisa que ya existen y no duplica; con 6 semanas agrega solo las 2 nuevas.
- **Semanas**: agregar la 5.ª y quitarla (con Deshacer) en celu y en compu. Quitar una semana con datos pide confirmar.
- **Filas**: agregar ronda, quitar una ronda del medio (corre las siguientes), agregar ejercicio nuevo y de biblioteca, subir/bajar, quitar ejercicio; todo con Deshacer, en celu y en compu.
- **Superserie**: agrupar Tibial raises + Crunch desde la grilla persiste en todas las semanas, tras recargar y tras deshacer un borrado; en la carga del día alternan R1/R1/R2/R2.
- **Celu sin scroll horizontal** en todas las pantallas; el nombre del ejercicio siempre visible en su barra.
- **Notas** de ejercicio, de celda y de entreno: se guardan y reaparecen tras recargar.
- **Video**: YouTube abre embebido sobre la carga del día y al cerrarlo se sigue en el mismo ejercicio.
- **Carga del día**: prellenado con el último valor, 🏆 al superar la mejor marca, "Copiar anterior", descanso que abre la cuenta regresiva con el tiempo sugerido. "Terminar entreno" tacha el día en Hoy y en Progreso; el objetivo del mes (5 / 16) y el de rutina (22 kg de 24 kg) avanzan y persisten.
- **Historial compartido**: Crunch usado en tres rutinas muestra una sola ficha con las series de todas.
- **Backup**: exportar → borrar todo → restaurar deja las 9 tablas idénticas; un archivo ajeno o con referencias rotas se rechaza.
- `npm run build` sin errores; consola sin errores; controles ≥ 48×48 px medidos por script en celu; tema claro y oscuro.
- Service worker activo y con todo precacheado (HTML, JS, CSS, manifest, íconos).

Sin probar:

- **Recarga real sin conexión** de esta versión (se comprobó que el service worker controla la página y tiene todos los archivos en caché, no el corte de red).
- **Exportar/importar por el diálogo de archivos** del navegador (el ida y vuelta se probó con las mismas funciones que usan los botones).
- **Android real**: instalación, arrastre con el dedo en el editor de rutina, wake lock, vibración, selector de fecha nativo.
- **Arrastrar para reordenar** en el editor de rutina después del cambio de modelo (sí se probó subir/bajar y agrupar).
- **Instagram y TikTok embebidos**: solo el reconocimiento de las URL.
- **Deploy**: el workflow de GitHub Pages no cambió; corre al hacer push a `main`.
- Lector de pantalla y escala de texto grande del sistema.
