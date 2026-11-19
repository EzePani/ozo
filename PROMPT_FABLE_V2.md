# Prompt v2 para Fable: rediseñar Ozo reciclando lo existente (copiar todo lo de abajo)

---

**Ozo** ya existe en esta carpeta y está desplegada en https://ezepani.github.io/ozo/ (PWA con Vite + React + TS + Dexie + react-router HashRouter + vite-plugin-pwa). El resultado no le sirve al usuario: no entiende la navegación y el flujo no se parece a su planilla de Google Sheets. **No empieces de cero.** Primero leé `src/` completo (db.ts, lib.ts, ui.tsx, Stopwatch.tsx, LinkSheet.tsx, styles.css, pages/*), `SPEC.md`, `wireframes.html` (desktop) y `wireframes-mobile.html` (celu). **Los wireframes son la referencia de pantallas y flujo; seguilos.** Entregá la app funcionando, sin TODOs ni pantallas a medias, compilada, y verificada en navegador a 390×844 y a 1280×800 antes de darla por terminada. Interfaz en español rioplatense, minúscula tipo oración, verbos primero, sin exclamaciones ni "por favor".

## 1. Qué conservar (no reescribir)
- Cronómetro (`Stopwatch.tsx`) y hoja de links embebidos (`LinkSheet.tsx`, `parseLink` en lib.ts).
- Formateo y reglas de campos por tipo (`fieldsFor`, `fmtEntry`, `fmtTarget`, `fmtDur`, `draftToValues`), validación de importación y backup, `applyGroups`/`groupExercises`/`moveExercise` (lógica de bloques/superseries), selección múltiple y drag con `@dnd-kit`.
- Tema claro/oscuro, componentes de `ui.tsx` (confirmaciones, toasts, íconos), PWA, ícono, workflow de deploy a GitHub Pages (`.github/workflows`), y los datos de ejemplo de Lower.
- Los datos que el usuario ya tenga en IndexedDB **no se pueden perder**: toda migración de esquema va en una `version(2)` de Dexie con `upgrade()` y la probás con una base v1 sembrada.

## 2. Qué cambia (lo que pidió el usuario)
**Modelo mental nuevo: Rutina → Programa → Semanas.**
- **Rutina** = plantilla reutilizable (ej. "Lower A") con un **tipo** elegido por el usuario: Lower / Upper / Full body / HIT / Push / Pull / Cardio / otro (editable, se pueden crear tipos). Es el actual `Day`.
- **Programa** = una rutina puesta en un mes: `{ id, routineId, month "YYYY-MM", weekday 0-6, weeks: n, goal? }`. Crea una columna (sesión `planned`) por fecha. El actual "Programar mes" se absorbe en el asistente "Nuevo programa".
- **Semana/columna** = actual `Session`. Se puede **agregar y quitar semanas** en cualquier momento (celu y desktop).
- **Biblioteca de ejercicios**: separar la definición (nombre, tipo, grupo muscular, link de video, unidad de tiempo) de su uso en una rutina (rondas, objetivo, descanso, nota). Cada ejercicio existe una sola vez, se reusa en cualquier rutina y su historial es único. Al importar, los nombres que ya existen (comparar normalizado, sin tildes ni mayúsculas) se vinculan en lugar de duplicarse y se informa cuántos ejercicios son nuevos.

## 3. Navegación (barra inferior fija en celu, lateral en desktop)
**Hoy · Programa · Biblioteca · Progreso.** Reemplaza la barra actual (Inicio/Historial/Ajustes); Ajustes pasa a un ícono arriba a la derecha. Rutas HashRouter. El cronómetro flotante sigue visible. Ver el mapa en `wireframes-mobile.html`.

## 4. Pantallas (seguir wireframes; acá solo lo que no se ve en ellos)
1. **Hoy**: tira de la semana (días entrenados con círculo lleno, hoy con borde grueso + "Hoy"), tarjeta "hoy toca" con botón Empezar, objetivo del mes con barra de avance y contador "3 / 16", racha en semanas, objetivos por rutina con barra. Sin calendario grande acá.
2. **Programa**: selector de mes con flechas (‹ Diciembre 2026 ›), una tarjeta por programa/día con tipo, progreso de semanas y objetivo. **Sin fichero ni solapas.** "+ Nuevo" abre el asistente: (1) pegar JSON o subir archivo y botón "Copiar prompt para Claude"; vista previa "Leí: Lower A · 5 ejercicios · 15 series · 4 ejercicios nuevos"; (2) elegir tipo de rutina; (3) elegir día de la semana y mes; (4) cuántas semanas (2/4/6/otro) con la frase de confirmación "Armamos 4 semanas: 1, 8, 15 y 22 dic"; (5) objetivo de la rutina opcional. Detectar duplicados (misma rutina + fecha) y no crearlos.
3. **Grilla del día**:
   - **Celu**: solo semana anterior y actual (2 columnas de datos), sin scroll horizontal; encabezado "Semana 2 de 4 · 8 dic" con ‹ › para cambiar de semana y menú ⋯ (agregar semana, quitar semana, copiar valores de la semana anterior). Cada ejercicio en una barra negra con nombre, ▶ video y descanso; debajo sus rondas con objetivo, anterior y actual. Verde = mejoró, naranja = igual o menos, siempre acompañado de texto/forma (no solo color).
   - **Desktop**: grilla completa estilo Sheet con todas las semanas, columna de ejercicio fija, botón "＋ sem" y 🗑 por columna.
   - Tocar una celda abre teclado numérico con el último valor prellenado. Celda = peso × reps (o los campos del tipo).
4. **Editar filas y columnas con total facilidad**: celu = tocar la barra del ejercicio abre un menú inferior (editar objetivo/descanso/video, agregar ronda, nota, mover, agrupar en superserie, quitar); tocar una ronda permite editarla o quitarla; "+ Ejercicio" (de biblioteca o nuevo). Desktop = acciones al pasar el mouse, sin modo edición. Todo borrado ofrece **Deshacer** unos segundos y pide confirmar solo si había datos cargados.
5. **Notas de texto libre en tres niveles**: por ejercicio (vale para todas las semanas), por celda (semana + ronda) y por entreno. Indicador 📝 donde haya nota. Se guardan en el modelo (`note` en la rutina, `Entry.note`, `Session.note`).
6. **Editor de rutina**: ver la rutina entera, tipo editable, agrupar en superseries (ya existe; mantener persistencia entre semanas), arrastrar, selección múltiple, duplicar.
7. **Carga del día (celu)**: es el actual Modo sesión, con "Terminar entreno" que marca el día como entrenado. Mantener "Anterior" y "Copiar anterior"; agregar link ▶ bajo el nombre, récord personal 🏆 cuando se supera la mejor marca, y descanso con cronómetro sugerido (solo informativo, no automático).
8. **Video embebido**: un ▶ junto al ejercicio (grilla, carga del día, biblioteca) abre `LinkSheet` como pop-up sobre la pantalla actual. YouTube embebido; Instagram/TikTok con embed oficial y, si falla, botón "Abrir en otra app".
9. **Biblioteca**: lista con tipo, grupo, video, mejor marca y "usado en"; ficha con gráfico SVG de progreso (reutilizar el de History), buscador y filtros. Reemplaza el selector de ejercicio de Historial.
10. **Progreso**: calendario mensual compacto de círculos (lleno = entrenó, azul/borde grueso = hoy, tocar un día muestra qué hizo), contador del mes, **objetivo del mes** (texto libre + meta numérica de entrenos, editable, se recuerda en Hoy), objetivos por rutina con barra (ej. "búlgara 24 kg × 8", la barra se calcula desde la mejor marca) y récords. Todo persistido.
11. **Ajustes**: los actuales (tema, backup, tipos propios, borrar todo).

## 5. Datos y almacenamiento
El usuario eligió "localStorage + exportar/importar JSON" y quiere poder migrar a una DB después. **Mantené Dexie** (ya funciona, local, offline) pero encerrá todo acceso a datos en una capa `src/data/` con funciones tipadas (`getRoutines()`, `saveProgram()`…), de modo que ninguna página llame a `db` directo; así cambiar a una DB real después toca un solo lugar. Exportar/importar backup JSON plano de **todas** las tablas (rutinas, biblioteca, programas, sesiones, entries, objetivos, notas, ajustes) con `schemaVersion`, validado y con confirmación antes de pisar. Nuevas tablas: `library`, `routineItems`, `programs`, `goals {id, scope: "month"|"routine", ref, text, metric?, target?, month?}`.

## 6. Formato JSON que genera Claude (actualizar `CLAUDE_PROMPT` y `validateRoutine`)
Mantener el formato actual de `Routine` y sumar, retrocompatible: `routine.type`, por ejercicio `muscleGroup`, `video` (alias de `link`), y `goal` opcional de la rutina. Rondas especiales como Crunch/Wheel alternados "máx rep" se siguen modelando como superserie. Errores en español con la ruta del campo.

## 7. Visual
Mantené el sistema actual (grises, tarjetas 16px, AA, targets ≥ 48px, `prefers-reduced-motion`). La gamificación es sobria y funcional: barras de avance, rachas, 🏆 en récords y días tachados; **nada decorativo**. El usuario quiere "algo pro, no un Sheet con asteroides". Todo estado se entiende sin color. Desktop: layout de dos paneles o ancho máximo cómodo, no el celu estirado.

## 8. Criterios de aceptación (verificalos vos y reportá)
- La base v1 existente migra a v2 sin perder datos (probalo).
- Pegar el JSON de Lower, elegir tipo, lunes y 4 semanas en diciembre crea el programa con fechas correctas (1, 8, 15, 22) y aparece bajo Diciembre.
- Agregar una 5.ª semana y quitar una semana funciona en celu y en desktop.
- Agregar/editar/quitar ejercicio y ronda desde celu y desktop, con Deshacer.
- Agrupar Tibial raises + Crunch persiste en todas las semanas.
- En celu la grilla no tiene scroll horizontal y el nombre del ejercicio siempre se ve.
- Las notas de los tres niveles se guardan y reaparecen tras recargar.
- El video de un ejercicio abre embebido y se cierra sin perder dónde estaba.
- Terminar entreno tacha el día en Hoy y en Progreso; el objetivo del mes y por rutina avanzan y persisten.
- El mismo ejercicio en dos rutinas comparte historial.
- Exportar e importar backup completo restaura todo.
- Offline, instalable, sin errores en consola, `npm run build` ok, deploy por el workflow existente.

## 9. Forma de trabajar
Planificá, mostrá el plan en pocas líneas y construí por capas: (1) capa `src/data/` + migración v2 + biblioteca, (2) navegación y Hoy, (3) Programa + asistente, (4) grilla celu/desktop + edición de filas/columnas + notas, (5) carga del día + video, (6) Progreso + objetivos, (7) pulido y verificación. Compilá y corré tras cada capa. Sin cuentas, sin backend, sin unidades lb. Al terminar actualizá `README.md` y `SPEC.md` y reportá qué verificaste y qué quedó sin probar.
