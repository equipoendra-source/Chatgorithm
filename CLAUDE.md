# Chatgorithm — Notas del proyecto

## Preferencias del usuario (Diego)

- **Avisar SIEMPRE cuando un cambio toque el frontend.** Render no siempre
  redespliega el Static Site de `chatgorithm-frontend` solo. En cuanto
  modifiques cualquier archivo bajo `client/`, recuerda al usuario que:
  1. Verifique el último deploy en el Render Dashboard del frontend.
  2. Si no está al día con el commit nuevo, dele a **Manual Deploy →
     Deploy latest commit**.
  3. Hard refresh en el navegador (Cmd+Shift+R) para invalidar caché.
  Cambios solo en `server/` se redespliegan solos (no hace falta avisar).

## Stack
- **Frontend:** React + TypeScript + Vite + Capacitor (web y APK Android)
- **Backend:** Node.js + Express + TypeScript, desplegado en Render
- **Base de datos:** Airtable
- **Almacenamiento de archivos:** Cloudinary (audios, imágenes, vídeos del chat de equipo)
- **Mensajería en tiempo real:** Socket.IO
- **Notificaciones push:** Firebase (FCM) + Web Push
- **Llamadas VoIP:** Twilio Voice SDK
- **IA:** Google Gemini 2.5 Flash oficial (`gemini-2.5-flash`, billing activo, sin límite de tier gratuito). Temperature fijada a 0.3 en `generationConfig` para evitar alucinaciones (palabras inventadas / idiomas mezclados tipo "l'os del gos"). Modelo en `server/src/index.ts` → `MODEL_NAME`.
- **Repositorio:** https://github.com/equipoendra-source/Chatgorithm.git
- **Servidor:** https://chatgorithm-vubn.onrender.com
- **Frontend desplegado:** https://chatgorithm-frontend.onrender.com

---

## Sesión 2026-03-30 — Fix audio chat de equipo (TeamChat)

### Problema reportado
El audio en el chat interno entre trabajadores (`TeamChat.tsx`) no funcionaba ni en navegador ni en APK.

### Diagnóstico — 3 causas raíz encontradas

#### 1. Render borra los archivos al reiniciar (CRÍTICO)
El servidor guardaba los audios subidos en una carpeta local `/uploads` en el disco de Render.
Render destruye esa carpeta en cada redeploy o reinicio del servidor (disco efímero).
Los mensajes en Airtable seguían apuntando a URLs que ya no existían → 404.

**Solución:** Migrar el almacenamiento de archivos del chat de equipo a **Cloudinary**.
- `teamUpload` cambió de `multer.diskStorage` a `multer.memoryStorage`
- El endpoint `/api/team/upload` ahora sube el buffer a Cloudinary y devuelve una URL permanente
- Se añadió el paquete `cloudinary` al servidor

**Variables de entorno necesarias en Render:**
```
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
```

#### 2. `new File()` falla en la build de producción de Vite (CRÍTICO)
En `TeamChat.tsx`, el handler `onstop` del MediaRecorder intentaba crear un objeto `File`
a partir del Blob grabado con `new File([audioBlob], ...)`.
En la build minificada de producción esto lanzaba:
```
TypeError: Uf is not a constructor
```
El blob se creaba correctamente (chunks recibidos, ~25KB, audio/ogg) pero el upload nunca llegaba al servidor.

**Solución:** Eliminar `new File(...)` y pasar el `Blob` directamente a `FormData.append()` con el filename como tercer parámetro.
- `uploadFile` acepta ahora `File | Blob` con un parámetro opcional `filename`
- En `onstop`: `uploadFile(audioBlob, 'voice.ogg')` en lugar de `new File([audioBlob], ...)`

#### 3. Endpoint `/api/team/upload` duplicado (MENOR)
El endpoint estaba definido dos veces en `server/src/index.ts` (líneas ~1719 y ~2161).
Express usaba el primero; el segundo era código muerto.
**Solución:** Eliminado el duplicado.

#### 4. Timestamp no se guardaba en Airtable (MENOR)
El socket `send_team_message` generaba el timestamp pero no lo incluía al guardar en Airtable,
dejando la columna vacía en los mensajes nuevos.
**Solución:** Añadido `"timestamp": timestamp` al `base(TABLE_TEAM_MESSAGES).create()`.

#### 5. URLs absolutas de Cloudinary rotas en el frontend (MENOR)
`renderMessageContent` en `TeamChat.tsx` asumía que todas las URLs de archivos eran relativas
(empezaban por `/`), por lo que preponía el dominio del servidor a URLs de Cloudinary,
produciendo URLs como `https://chatgorithm-vubn.onrender.com/https://res.cloudinary.com/...`.
**Solución:** Añadida comprobación `relativeUrl.startsWith('http')` para URLs absolutas.

---

### Archivos modificados
| Archivo | Cambio |
|---------|--------|
| `server/src/index.ts` | Cloudinary import + config, teamUpload a memoryStorage, endpoint actualizado, duplicado eliminado, timestamp en Airtable |
| `server/package.json` | Añadida dependencia `cloudinary ^2.0.0` |
| `client/src/components/TeamChat.tsx` | Fix `new File()` → Blob directo, fix URLs absolutas Cloudinary |

---

### Flujo de deploy
1. Cambios en `server/` → push a GitHub → Render despliega el backend automáticamente
2. Cambios en `client/` → `npm run build` → `npx cap sync android` → push → Render despliega el frontend manualmente si no lo hace solo
3. APK → Android Studio: **File → Sync Project with Gradle** → **Build → Clean Project** → **Build → Generate Signed APK**

### Notas sobre Git
- El repositorio se inicializó localmente el 2026-03-30 (el proyecto venía como ZIP sin `.git`)
- Remote: `https://github.com/equipoendra-source/Chatgorithm.git`
- Para hacer push usar token PAT: `git remote set-url origin https://equipoendra-source:TOKEN@github.com/equipoendra-source/Chatgorithm.git`

---

## Sesión 2026-06-11 — Modelo "1 hueco" + Panel Taller (carga de mecánicos)

### Qué cambió
La recepción pasa a ser de **1 solo hueco por cita** (avería/revisión incluidas). Se eliminaron los bloques multi-hueco (líder+secundarios) en reservas nuevas. El campo `Appointments.DurationMin` se **reaprovecha**: ya NO es el span de huecos de recepción, ahora guarda los **minutos de TALLER** (carga de mecánicos) del trabajo — por defecto los del tipo de servicio, editable por cita; sin tipo = 0.

Nuevo **panel "Taller"** (botón junto a Averías/Buscar) con barra de carga por día: minutos de taller comprometidos vs. capacidad (`mecánicos × horas/día × días laborables`, con festivos). El **catálogo de tipos de servicio** se movió de *Ajustes de agenda* a un sub-panel de ajustes dentro del botón Taller (catálogo GLOBAL, independiente de las agendas).

### Backend (`server/src/index.ts`)
- `getTallerConfig()` / `saveTallerConfig()` / `getServiceCatalog()` → BotSettings `taller_config` (siembra perezosa desde las agendas). Endpoints `GET/POST /api/taller/config`.
- `getAvailableAppointments`: `slotsNeeded` siempre 1; servicio validado contra el catálogo global.
- `bookAppointment`: `DurationMin = minutos de taller del tipo` (0 sin tipo); no crea secundarios.
- `PUT /api/appointments/:id`: bloques `wantsServiceBlock`/`isEditingBookedService` simplificados (solo ServiceType + DurationMin, sin multi-hueco). Acepta `durationMin` del body (edición manual de horas de taller).
- **Compat averías viejas**: `cancelAppointment`, PUT-cancelar y DELETE liberan secundarios filtrando por `{ClientName}=''` (los secundarios reales no tienen nombre) → nunca liberan una cita real dentro de la ventana `DurationMin`.
- Prompt del bot Laura: lee el catálogo global; reserva 1 hueco etiquetando el tipo.

### Frontend (`client/src/components/CalendarDashboard.tsx`)
- Render siempre 1 hueco (`formatTimeRange`/`renderChip`/`renderDaySlotRow` usan `slotDuration`, no `durationMin`). Se mantiene `collapseBookedBlocks` (oculta secundarios → averías viejas no se ven feas).
- Ficha de cita: selector de tipo desde catálogo global + campo editable "Horas de taller".
- Panel Taller (`computeTallerLoad`) + sub-panel de ajustes (capacidad, festivos, catálogo).

### Airtable
- **Nada que crear**: `DurationMin` se reaprovecha (una avería de 4h valía 240 y sigue valiendo 240, solo cambia el significado interno). `taller_config` va en BotSettings.
- Recomendado: poner la granularidad de la agenda de recepción en **30 min** (campo "Grid slot" en Ajustes de agenda) para que cada cita se vea como 30 min.

### Verificado
4 agentes (booking/safety/frontend/regress). Backend `tsc` y frontend `tsc && vite build` sin errores. Las 3 alertas del agente de regresiones sobre la ventana `DurationMin` en la liberación de secundarios son falsos positivos: el guard `{ClientName}=''` evita liberar citas reales (de hecho corrige un bug latente del código anterior).

---

## Sesión 2026-06-12 — Colchón de walk-ins + check de capacidad del taller en booking

### Qué cambió
Nuevo campo `TallerConfig.reservedIncidentHoursPerDay` (horas/día reservadas para clientes que llegan al taller sin cita previa = walk-ins / incidencias). Estas horas se **descuentan automáticamente** de la disponibilidad que Laura puede ofrecer para citas previas. La bot ya no muestra días donde el taller estaría lleno (aunque haya hueco de recepción). El manual desde el calendario sigue pudiendo sobrecargar, ahora con `window.confirm` + flag `forceOverride: true`.

**Buckets por día:**
- PREVIAS = Booked con `ClientName!='' AND Incident!=true` → consumen `previasMax = capacityMin − reservedMin`
- WALK-INS = Booked con `ClientName!='' AND Incident=true` → consumen el colchón `reservedMin` (luego total)
- Laura SIEMPRE crea PREVIAS; el campo `Incident` se auto-pone en `POST /api/appointments` cuando la fecha es hoy (L6117), por eso "creado hoy para hoy" = walk-in.

### Backend (`server/src/index.ts`)
- `TallerConfig`: añadido `reservedIncidentHoursPerDay` con clamp a `mechanics × hoursPerDay`.
- Helpers nuevos: `madridDayKey`, `capacityTallerMinForDay`, `reservedIncidentMinForDay`, `getCommittedTallerByDay({excludeId?})`, `checkTallerCapacity({dateKey, durationMin, isIncident, excludeId?})`.
- `getAvailableAppointments`: si el catálogo tiene tipos, EXIGE `serviceName` (no muestra huecos sin tipo). Con tipo, descarta días donde `committedPrevia + tallerMin > previasMax`.
- `getAvailableDays`: acepta `service` y aplica el mismo filtro de capacidad.
- `bookAppointment`: re-validar capacidad DENTRO del lock antes del `updateAppointmentFields`. Rechaza también tipos desconocidos si catalog tiene entradas (paralelo a getAvailableAppointments).
- `PUT /api/appointments/:id`: check único antes de las ramas. Si excede sin `forceOverride` → **409 CAPACITY_EXCEEDED** con detalles (`reason`, `committedPrevia`, `committedWalkin`, `previasMax`, etc.). El check solo se dispara si la operación es "capacity-relevant" (cambia durationMin, service, date, incident, o crea Booked nuevo). Audit log marca `[SOBRECARGA TALLER]` siempre que se use el override.
- Filtro de fecha de `getCommittedTallerByDay` usa ventana UTC amplia + filtro estricto por `madridDayKey >= todayMadrid` (no más cuenta errónea cerca de medianoche).

### Frontend (`client/src/components/CalendarDashboard.tsx`)
- `TallerConfig` + `TALLER_FALLBACK`: añadido `reservedIncidentHoursPerDay`.
- `handleSaveTaller`: clampa el campo a `mechanics × hoursPerDay`.
- `tallerDayKey` (nueva): usa `Europe/Madrid` para que el frontend coincida exactamente con el backend.
- `computeTallerLoad`: separa `committedPrevia` vs `committedWalkin`, expone `reservedMin`, `previasMax`. NO filtra por `selectedAccountId` (el taller es físico).
- Sub-modal Ajustes Taller: input nuevo "Horas reservadas para sin-cita (walk-ins / incidencias)".
- Barra de día: 3 segmentos (previas, walk-ins ya hechas, reserva restante). Color por `previasFull` (no por sobrecarga total). En sobrecarga, `reservedRemaining` se anula visualmente.
- `handleUpdateAppt`: pre-check local antes del PUT con `window.confirm` si excedería. Branch nuevo para 409 CAPACITY_EXCEEDED (otro usuario llenó el día) → confirm + reintento con `forceOverride: true`.

### Airtable
- **Nada que crear**. `Incident` ya existe desde antes. `reservedIncidentHoursPerDay` va en `BotSettings.taller_config` (JSON).

### Verificado
4 agentes adversariales (lógica capacidad / manual override+audit / frontend confirm / regresiones). 12 findings totales: aplicados 4 high+medium críticos (TZ inconsistency, selectedAccountId divergence, false-positive en ediciones inocuas, audit log condición). Backend `tsc` y frontend `tsc && vite build` limpios.

### Pendientes conocidos (fuera de scope, baja prioridad)
- Race condition residual: dos reservas simultáneas en slots distintos del mismo día (probabilidad muy baja con tráfico actual; mitigado por re-check dentro del lock + frontend 409 branch).
- Cancelación PUT desde calendario no limpia los campos de la cita (basura legacy preexistente, no introducido por este cambio).
- `slotDuration` multi-agenda asume una sola granularidad (preexistente).

---

## Notas generales

- Los archivos subidos **antes** del fix de Cloudinary (guardados en disco de Render) están perdidos permanentemente. Los mensajes en Airtable que los referencian mostrarán 404. Es comportamiento esperado.
- Los mensajes de equipo con "INVALID DATE" son anteriores al fix del timestamp. Los nuevos mensajes tienen timestamp correcto.
- El error `[WebPush] Permiso denegado` en consola es el navegador bloqueando notificaciones push, no afecta al funcionamiento.
