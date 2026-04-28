# 🤖 Configuración de Laura — Wizard + RAG (Documentos)

Esta guía explica los pasos para que el sistema de IA personalizada de Laura funcione en cada empresa.

---

## 📋 Lo que tienes que hacer en Airtable

Solo **1 paso obligatorio**: crear una tabla nueva llamada `BotKnowledge`.

### 1️⃣ Crear tabla `BotKnowledge`

En la base de Airtable de la empresa, **crea una tabla nueva** con este nombre exacto: **`BotKnowledge`**

Añade estos **5 campos** (con el **nombre EXACTO**, distingue mayúsculas):

| Nombre del campo | Tipo de campo | Notas |
|------------------|---------------|-------|
| `chunkText` | **Long text** | El primary field, contiene un trozo del documento |
| `embedding` | **Long text** | Vector numérico serializado como JSON (~3.000 caracteres por chunk) |
| `source` | **Single line text** | Nombre del documento de origen (ej: `tarifas.pdf`) |
| `uploadedAt` | **Date** ⚠️ con la opción **"Incluir hora"** | Cuándo se subió |
| `chunkIndex` | **Number** (entero, 0 decimales) | Orden del trozo dentro del documento |

⚠️ **Importante:**
- Los nombres son sensibles a mayúsculas — escríbelos exactamente como están aquí.
- En `uploadedAt` activa "Incluir hora" (igual que en otros campos de fecha).
- En `chunkIndex` configura "0 decimales" (entero).

---

## ✅ Que NO necesitas hacer

- ❌ La tabla `BotSettings` ya existe (no la toques)
- ❌ No hay que añadir variables de entorno nuevas (la `GEMINI_API_KEY` ya está)
- ❌ No hay que cambiar nada en Render

---

## 🛠️ Cómo funciona el sistema completo

### Cuando un cliente abre Chatgorim por primera vez:

```
1. El admin va a Ajustes → Configuración del Bot
2. Pulsa "🪄 Iniciar wizard de configuración"
3. Pasa por los 7 pasos:
   - Sector del negocio (taller, dental, peluquería...)
   - Nombre del negocio
   - Servicios que ofreces
   - Horario
   - ¿Reserva citas o no?
   - ¿Qué datos pides al cliente?
   - Tono (formal/cercano/divertido) + info extra
4. Al terminar, el sistema GENERA automáticamente un prompt completo
5. Lo guarda en Airtable (tabla BotSettings, Setting='system_prompt')
```

### Cuando el admin sube un documento:

```
1. En la pestaña "Configuración del Bot" → sección "Documentos de Laura"
2. Sube un PDF, Word o TXT (hasta 20 MB)
3. El sistema:
   - Extrae el texto del documento
   - Lo divide en trozos (~500 palabras)
   - Genera embeddings (vectores numéricos) con Gemini
   - Guarda cada trozo + su vector en la tabla BotKnowledge
4. El documento queda indexado y disponible para consultas
```

### Cuando un cliente escribe a Laura por WhatsApp:

```
1. El cliente: "¿Cuánto cuesta una limpieza dental?"
2. El backend:
   a) Convierte la pregunta en un vector (embedding)
   b) Busca en BotKnowledge los 4 trozos más similares
   c) Solo si la similitud es alta (>0.5), los inyecta en el prompt
   d) Llama a Gemini con: prompt sistema + chunks relevantes + pregunta
3. Laura responde con datos REALES del negocio
```

### Ejemplo real:

**Sin documento:**
> Cliente: ¿Cuánto cuesta una limpieza dental?
> Laura: Tenemos varios servicios. Le derivo a un compañero para precios concretos.

**Con tarifa PDF subida:**
> Cliente: ¿Cuánto cuesta una limpieza dental?
> Laura: ¡Hola! Una limpieza dental completa con ultrasonido cuesta 50€. Si lleva la pieza de ortodoncia incluida son 65€. ¿Le agendo una cita?

---

## 📊 Costes reales

### Procesar documentos (una sola vez):
- Embeddings de Google: **GRATIS** hasta 1.500 requests/día
- Una empresa con 50 páginas → **0,005€** procesar todo

### Por consulta del cliente:
- Coste extra por mensaje: **~0,001€**
- Para 100 conversaciones/día = ~1,10€/mes extra por empresa

### Almacenamiento en Airtable:
- Hasta 5.000 chunks por empresa (≈ 50.000 palabras = 150 páginas A4) → cabe en plan Pro

---

## 🔧 Endpoints implementados

```
GET    /api/bot-config              # Lee el prompt actual (existía)
POST   /api/bot-config              # Guarda prompt manual (existía)
POST   /api/bot/setup-wizard        # Recibe respuestas del wizard, genera prompt
POST   /api/bot/knowledge/upload    # Sube y procesa un documento
GET    /api/bot/knowledge           # Lista documentos subidos
DELETE /api/bot/knowledge/:source   # Elimina un documento
```

---

## 🧪 Cómo probarlo después del deploy

### Paso 1: Crea la tabla `BotKnowledge` en Airtable (5 min)

### Paso 2: Despliega
```bash
git add .
git commit -m "feat: wizard de configuracion de Laura por sector + RAG con subida de documentos"
git push
```
- Backend se redespliega solo en Render
- Frontend: dashboard de Render → `chatgorithm-frontend` → Manual Deploy → Deploy latest commit

### Paso 3: Prueba el wizard
1. Refresca la app (Ctrl+F5)
2. Ve a **Ajustes → Configuración del Bot**
3. Pulsa **"🪄 Iniciar wizard de configuración"**
4. Completa los 7 pasos
5. Comprueba que se guarda

### Paso 4: Prueba la subida de documentos
1. En la misma pantalla → sección **"Documentos de Laura"**
2. Pulsa la zona de "Subir documento"
3. Sube un PDF de prueba (cualquiera, ej: tarifa de servicios)
4. Espera a que se procese (5-30 segundos según tamaño)
5. Verás el documento en la lista con el número de chunks indexados

### Paso 5: Prueba con un mensaje real
1. Manda un WhatsApp a Laura preguntando algo que esté en el PDF
2. Laura debe responder con la información del documento
3. En los logs de Render verás algo como: `📚 [RAG] 3 chunks relevantes inyectados (top score: 0.78)`

---

## 🚨 Errores comunes y soluciones

### "Error procesando documento"
- Comprueba que el PDF no está protegido con contraseña
- Comprueba que el documento tiene texto seleccionable (no es solo imagen escaneada)
- Para PDFs escaneados necesitarías OCR (no incluido en v1)

### "GEMINI_API_KEY no configurada"
- En Render → servicio backend → Environment → comprueba que `GEMINI_API_KEY` existe

### "Tabla BotKnowledge no encontrada"
- Crea la tabla siguiendo la sección 1️⃣ exactamente como dice

### Laura no usa la información del documento
- Comprueba en logs de Render si aparece el mensaje `📚 [RAG] X chunks relevantes inyectados`
- Si aparece pero Laura no lo usa, es que el prompt del sistema no le indica cómo usarlo. El wizard automáticamente lo incluye, pero si has editado el prompt manualmente y has eliminado la sección RAG, vuelve a generar con el wizard.
- Si NO aparece, probablemente la pregunta del cliente no es similar al contenido (score < 0.5). Prueba con una pregunta más directa sobre el contenido.

---

## 💡 Buenas prácticas para los clientes

### Qué documentos subir:
- ✅ Catálogo de servicios + precios
- ✅ Tarifa por horas/intervenciones
- ✅ FAQ (preguntas frecuentes)
- ✅ Información sobre garantías
- ✅ Política de cancelación
- ✅ Información del equipo médico/técnico

### Qué NO subir:
- ❌ Datos personales de clientes (RGPD)
- ❌ Contraseñas, claves API
- ❌ Información financiera sensible (cuentas bancarias)
- ❌ Documentos legales privados

### Recomendaciones de formato:
- Mejor un PDF estructurado con títulos claros que un PDF plano
- Mejor varios documentos pequeños temáticos que uno gigante con todo
- Si la información cambia (precios, horarios), borra el documento antiguo y sube el nuevo
