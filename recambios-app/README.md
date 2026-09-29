# App Recambios (Android)

App aparte con SOLO el panel de Pedidos de Piezas, para Recambios y Taller en el móvil.
Mismo servidor, misma empresa y mismos usuarios que Chatgorim. El código web vive en
`../client` (`recambios.html` + `src/recambios/`) y comparte componentes con Chatgorim.

## Generar la APK
1. `cd recambios-app && npm install` (solo la primera vez)
2. `npm run sync`  (construye la web y la copia al proyecto Android)
3. Android Studio → abrir `recambios-app/android` → Sync Project with Gradle Files →
   Build → Clean Project → Generate Signed App Bundle / APK → APK (misma clave que Chatgorim).

Identificador: `com.chatgorithm.recambios` (se instala al lado de Chatgorim, no la pisa).

## Probar en el navegador
`cd client && npm run dev:recambios` → http://localhost:5174/recambios.html
