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

## Sesión 2026-09-28 — Pedidos de varias piezas desde un PDF + pedidos agrupados

### El problema
Con la plantilla `pedido_proveedor` solo se pide **una pieza por envío**. En Recambios
generan en el catálogo (Microcat EPC) un PDF con varias piezas (Vehículo / Descripción /
Ctd. / Número) y se lo mandan al proveedor por el chat, pero ese PDF solo se reenviaba a
WhatsApp: **nadie lo leía** (Laura solo analiza lo que ENTRA de clientes, y ni ahí abre
documentos). Tampoco existía la cantidad: se apuntaba a mano en la referencia ("1735761 / 4ud").

### Qué cambió
- **`server/src/partOrdersPdf.ts` (nuevo, sin dependencias del servidor):** prompt y
  `responseSchema` de Gemini, `validatePdfOrderLines` (cada referencia que devuelve la IA
  tiene que aparecer en el texto real del PDF sacado con pdf-parse; si no, la línea se
  descarta y la nota lo dice; la matrícula que no aparece solo se vacía),
  `normalizeCantidad` ("1,0" → 1), `newPedidoGrupoId` y el texto de la nota.
- **`POST /api/upload`:** si el archivo es PDF y lo manda un perfil de Recambios/Taller
  (`isPartsProfile`, misma regla que el botón del Sidebar), tras enviarlo se lanza en
  segundo plano `registerPartOrdersFromPdf`: Gemini 2.5 Flash lee el PDF (inlineData +
  JSON, temperature 0); si es un pedido, crea una fila por línea en `PartOrders` con un
  `pedidoGrupo` común y deja una **nota interna** en el chat (remitente "Pedidos de
  Piezas") con lo registrado. Si no es un pedido (factura, presupuesto…), no hace nada.
- **Ventana de 24 h cerrada** (`isServiceWindowOpen`: último mensaje ENTRANTE del contacto
  por esa línea en `Messages`): la IA lee el PDF ANTES de enviar y, si es un pedido, lo
  manda dentro de la plantilla **`pedido_proveedor_pdf`** (cabecera de documento con el
  media id ya subido, sin variables). Si la plantilla no existe/no está aprobada, sale
  como documento suelto y actúa la red de seguridad.
- **Red de seguridad (sin pedidos fantasma):** el wamid del PDF se registra nada más
  enviarlo (`trackPdfOrderMessage`, ANTES de cualquier await: el fallo puede llegar en 1-2 s).
  Si el webhook de estados dice `failed`, `handlePartOrderPdfFailed` borra las piezas de
  ese PDF y avisa con una nota. Si el fallo llega antes de que la IA termine, el registro
  lo ve y no crea nada. Además, todas las subidas registran `registerPendingDelivery`, así
  que una foto/PDF no entregado ya se marca como "No entregado" en el chat.
- **Duplicados:** el mismo PDF (sha256) al mismo contacto **por la misma línea** en 24 h
  no se registra dos veces (la clave lleva `cleanTo:originPhoneId:hash` — la línea entra
  a propósito: si dos líneas mandan el mismo PDF al mismo proveedor, son dos envíos
  independientes con resultado propio). La reserva se hace ANTES del primer await (dos
  envíos seguidos, incluso genuinamente simultáneos) y solo la suelta el envío que la
  creó: un reenvío fallido no puede anular la protección de otro pedido.
- **Todo o nada:** `createPartRecords` deshace lo guardado si falla un lote intermedio
  (pedidos de más de 10 líneas); si no puede, la nota dice qué `pedidoGrupo` borrar a mano.
  Borrar las piezas de un PDF no entregado reintenta una vez y avisa si algo se queda.
- Si la plantilla no existe, se recuerda 10 min (no se consulta a Meta en cada envío ni se
  hace esperar a la IA antes de mandar).
- **`cantidad`** en crear/editar/listar/Excel; la plantilla `pedido_proveedor` también la
  guarda si algún día se le añade `{{cantidad}}`. Endpoints nuevos `POST .../bulk-update`
  y `.../bulk-delete` (acciones de pedido entero, en lotes de 10 por el límite de Airtable).
- **Panel (`PartOrdersDashboard.tsx`, el listado unificado pedidos+abonos con pestañas
  Pendientes / Recibidos / Abonos):** columna **Ctd.** (editable con un clic, en pedidos y
  abonos) y campo Cantidad al añadir. Las piezas de pedido con el mismo `pedidoGrupo` salen
  como **un pedido desplegable** (replegado al entrar): cabecera con matrícula, nº de
  piezas, proveedor, fecha, el estado de la pieza más urgente y "x/N" recibidas, más
  **plazo para todas**, **marcar todo** (recibido) y **borrar pedido entero**. Un pedido
  está en Pendientes hasta que llegan todas sus piezas y entonces pasa a Recibidos; los
  abonos nunca se agrupan. Buscar una referencia despliega su pedido (al borrar la
  búsqueda todo vuelve como estaba). Las tarjetas de arriba siguen contando PIEZAS.
- **Recarga del panel:** ya no recarga (con spinner) al abrir/cerrar un modal; solo al
  entrar y cada 15 s. `loadSeq` + `dataVersion`: una lectura que salió antes de una
  edición y llega después no pisa el dato recién guardado.
- **Cantidad no válida** (0, > 9999, texto) → 400 en el servidor en vez de borrar la que había.

### Airtable
Creados el 2026-09-28: `PartOrders.cantidad` (número, 2 decimales),
`PartOrders.pedidoGrupo` (texto) y `PartAbonos.cantidad`. Si faltaran en otra base,
`createPartRecords` reintenta sin ellas (no se pierde el pedido).

### Meta (lo tiene que hacer el cliente)
Crear en WhatsApp Manager, en la WABA de la línea de Recambios, la plantilla
`pedido_proveedor_pdf`: categoría Utilidad, idioma español, encabezado **Documento**,
cuerpo sin variables (p. ej. "Hola, os enviamos un pedido de recambios. Tenéis el detalle
en el PDF adjunto. Gracias."). Mientras no esté aprobada, con la ventana cerrada el PDF no
llega y sus piezas se quitan solas del panel.

### Verificado
`tsc` limpio en server y client, `vite build` OK. 33 pruebas de la lógica pura con el PDF
real de ejemplo (4 líneas bien, referencias inventadas rechazadas, cantidades, id, nota).
Panel probado en navegador con datos simulados (agrupar, desplegar, marcar todo, plazo
para todas, borrar pedido, editar Ctd., filtros, búsqueda, claro/oscuro, móvil).

Además de la revisión de código, se montó un **arnés de simulación** (`server/pdfFlowHarness.ts`,
borrado antes de subir) que copia literalmente las funciones de orquestación de `index.ts`
(reserva anti-duplicados, `createPartRecords`, `removePdfOrderPieces`, caché de plantilla
por línea…) con Airtable/Meta/Gemini simulados, y ejecuta 16 escenarios (66 comprobaciones):
camino feliz, PDF que no es pedido, fallo de Gemini, 0 líneas válidas, fallo total/parcial
de Airtable con rollback, la IA leyendo mientras Meta avisa de un fallo (antes y durante el
guardado), reenvío tras un fallo, no se puede borrar (avisa igualmente), plantilla que
falta en una línea sin bloquear otra, cantidades inválidas, columnas opcionales que
faltan, concurrencia real (`Promise.all`) y el mismo PDF desde dos líneas distintas.

3 rondas de revisión adversarial (servidor y panel) sobre el código + la propia simulación:
11 fallos reales corregidos, entre ellos:
- Borrado de plazos al guardar vacío en un pedido "Varios".
- Carreras del anti-duplicados (reenvío bloqueado por la reserva de un envío ya fallido).
- Altas a medias sin deshacer y notas que decían "no ha llegado" antes de comprobarlo.
- Recargas del panel que pisaban una edición recién guardada.
- **La clave anti-duplicados no distinguía la LÍNEA de WhatsApp**: el mismo PDF al mismo
  proveedor desde dos líneas distintas (p. ej. Recambios y Taller comparten un proveedor)
  hacía que la 2ª se diera por "ya registrada" sin comprobar nada; si esa 2ª línea fallaba
  de verdad al entregarse, no se avisaba de nada (se quedaba con un "ya se registró"
  engañoso). Corregido añadiendo `originPhoneId` a la clave.

**Sin probar aún:** la llamada real a Gemini (la clave solo está en Render) y un envío real.

### Límite conocido
No hay forma de saber si un contacto es proveedor o cliente: se confía en que la IA
distinga un pedido de un presupuesto. Si Taller manda un presupuesto que la IA tome por
pedido, se registraría (se borra con la papelera del pedido) y, con la ventana cerrada,
saldría con la plantilla de pedido.

---

## Sesión 2026-09-08 — Importar plantillas de Meta + pedidos de piezas por plantilla

### El problema real
El pedido de recambio al proveedor se registraba parseando el **mensaje en clave**
(`Ref:` / `Pieza:` / `Matricula:`) en texto libre. Fuera de la ventana de 24h Meta
rechaza el texto libre (131047): el proveedor **no recibía nada** y aun así se creaba
el pedido → pedidos fantasma. La solución es enviarlo como plantilla aprobada.

Al intentarlo aparecieron dos bloqueos que no eran obvios:
1. **`sync-status` nunca importó plantillas.** Nació así (commit `0ee859f`): recorre
   los registros que YA están en Airtable y solo actualiza `Status`. Una plantilla
   creada en la consola web de Meta era invisible para la app, porque
   `/api/templates` lee solo de Airtable.
2. **La consola de Meta ya no deja crear variables numeradas.** Obliga a
   `{{referencia}}` en minúsculas con guion bajo. La app solo enviaba parámetros
   posicionales, que Meta rechaza en una plantilla nombrada.

### Qué cambió (`server/src/index.ts`)
- **Importación en `POST /api/templates/sync-status`**: además de actualizar estados,
  da de alta en Airtable las plantillas que están en Meta y no en la app. Pagina
  siguiendo `paging.next` (una WABA admite 250 plantillas, 6.000 si está verificada).
  Devuelve `{updated, imported, skipped, importErrors}`.
- **Variables con nombre**: `buildTemplateBodyParameters()` emite `parameter_name`
  cuando el cuerpo usa `{{nombre}}`, y posicional cuando usa `{{1}}`. Lo usan los
  tres caminos de envío (`send-template`, `sendTemplateMessage` y
  `sendTemplateWithDocument`), no solo uno.
- **`getTemplateBody()` cacheado** (`templateBodyCache`): `sendTemplateMessage` se
  llama una vez POR DESTINATARIO en campañas; sin caché serían 1.000
  consultas contra el límite de 5/s de Airtable. Se invalida al crear, borrar e importar.
- **Captura del pedido movida a `POST /api/send-template`**. Identifica qué variable
  es referencia/pieza/matrícula por la CLAVE (`{{referencia}}`) o, en las numeradas,
  por la etiqueta de `VariableMapping`. Exige un hueco de "pieza" para no registrar
  pedidos desde otras plantillas que lleven matrícula.
- **Se retiró** la captura desde el mensaje en clave (socket `chatMessage`) y la
  función `parsePartOrderClave`.
- **`v18.0` → `GRAPH_TEMPLATES_VERSION = 'v21.0'`** en las 5 llamadas de plantillas.
  v18.0 expiró el 26-ene-2026; Graph reenrutaba solo a otra versión sin avisar.

### Trampas encontradas en revisión (no repetir)
- **`\b` NO sirve para `snake_case`**: `_` es carácter de palabra, así que
  `\bpieza\b` no casa con `nombre_pieza` — justo el formato que obliga Meta. Se
  trocea el identificador con `split(/[^a-z0-9]+/)` y se comparan palabras enteras.
  Con `includes` a secas el problema es el contrario: "limpieza" contiene "pieza" y
  "refrigerante" contiene "ref".
- **Buscar la plantilla por nombre + idioma necesita fallback a solo nombre**: las
  campañas mandan `es_ES` por defecto y una plantilla importada de Meta puede ser `es`.
- **Un fallo de Airtable no es lo mismo que "no existe"**: el flag `tplLookupOk`
  evita bloquear un envío que hoy funciona si Airtable da un 429.
- Un regex con `/g` es stateful con `.test()` → existe `HAS_PLACEHOLDER_RE` sin `/g`.
- Airtable tumba el lote ENTERO si falta una columna, y `typecast` NO crea campos:
  el import reintenta registro a registro quitando columnas opcionales.

### Airtable
**Nada que crear.** Se reutiliza la tabla `Templates` existente. Las columnas
opcionales que falten (`MirroredWabas`, `Footer`, `MetaId`, `VariableMapping`) se
detectan y se omiten sin romper la importación.

### Verificado EN PRODUCCIÓN (2026-09-08, tras desplegar)
`tsc` limpio en server y client, `vite build` OK, 24 pruebas de lógica sobre las
plantillas reales + snake_case + falsos positivos, y **la sincronización ejecutada
contra la API real**:
```
{"updated":0,"imported":2,"importErrors":[],
 "skipped":["coche_listo_recogida_factura: variables en el encabezado multimedia",
            "factura_entrega_: variables en el encabezado multimedia"]}
```
Importó `pedido_proveedor` (ojo: **singular**) con
`variableMapping = {referencia, pieza, matricula}`, y se comprobó que genera los
`parameter_name` correctos y que el emparejador de pedidos extrae bien los 3 campos.

Las dos plantillas de FACTURA se omiten a propósito: llevan encabezado de documento
y se envían por `sendTemplateWithDocument`, no por el selector genérico. No es una
regresión — tampoco estaban antes en la lista de la app.

**Lo único sin probar es un envío real** (mandaría un WhatsApp a un proveedor de
verdad y crearía un pedido real en el panel).

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

## Sesión 2026-09-17 — Eliminada la función de Grupos

Tras el feedback de los clientes se quitó por completo la sección **Grupos** de Mensajería
(varios clientes + varios trabajadores en un mismo hilo, modos `fanout` y `native`). Esto
sustituye a las notas de las sesiones del 2026-07-22 y 2026-08-01, que ya no aplican.

### Qué se quitó
- **Frontend:** `GroupChatWindow.tsx` y `GroupCreateModal.tsx` (borrados); la pestaña GRUPOS y su
  contador de no leídos en `Sidebar.tsx`; la vista `group_chat` en `App.tsx`; la prop `groupId` de
  `ChatTemplateSelector.tsx`.
- **Backend (`server/src/index.ts`):** caché de `ChatGroups`, reparto fanout, Groups API nativa,
  endpoints `/api/groups/*`, sockets `request_group_history` y `group_message`, ramas de grupo del
  webhook, el parámetro `group` del pipeline de Laura y el filtro `selectMessagesExcludingGroupThread`.
- El código normal que los grupos habían tocado (guardado en `Messages`, historial de Laura,
  `request_conversation`, respuestas de Laura, avisos de entrega fallida) quedó como estaba antes.
- `GRAPH_TEMPLATES_VERSION` / `graphTemplatesUrl` vivían dentro del bloque de grupos pero son de
  plantillas: **se conservan**.

### Airtable
- No se borró nada. La tabla `ChatGroups` y los campos `group_id` / `group_msg_id` de `Messages`
  quedan sin uso; se pueden eliminar a mano.
- El único grupo que existía ("PRUEBA", fanout) se puso a `Active = false`.

---

## Notas generales

- Los archivos subidos **antes** del fix de Cloudinary (guardados en disco de Render) están perdidos permanentemente. Los mensajes en Airtable que los referencian mostrarán 404. Es comportamiento esperado.
- Los mensajes de equipo con "INVALID DATE" son anteriores al fix del timestamp. Los nuevos mensajes tienen timestamp correcto.
- El error `[WebPush] Permiso denegado` en consola es el navegador bloqueando notificaciones push, no afecta al funcionamiento.
