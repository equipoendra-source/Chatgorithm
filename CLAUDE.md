# Chatgorithm — Notas del proyecto

## Stack
- **Frontend:** React + TypeScript + Vite + Capacitor (web y APK Android)
- **Backend:** Node.js + Express + TypeScript, desplegado en Render
- **Base de datos:** Airtable
- **Almacenamiento de archivos:** Cloudinary (audios, imágenes, vídeos del chat de equipo)
- **Mensajería en tiempo real:** Socket.IO
- **Notificaciones push:** Firebase (FCM) + Web Push
- **Llamadas VoIP:** Twilio Voice SDK
- **IA:** Google Gemini 2.0 Flash (cambiado de 2.5-flash preview por cuota 20 req/día)
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

## Notas generales

- Los archivos subidos **antes** del fix de Cloudinary (guardados en disco de Render) están perdidos permanentemente. Los mensajes en Airtable que los referencian mostrarán 404. Es comportamiento esperado.
- Los mensajes de equipo con "INVALID DATE" son anteriores al fix del timestamp. Los nuevos mensajes tienen timestamp correcto.
- El error `[WebPush] Permiso denegado` en consola es el navegador bloqueando notificaciones push, no afecta al funcionamiento.
