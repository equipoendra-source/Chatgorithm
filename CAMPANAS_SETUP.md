# 📢 SISTEMA DE CAMPAÑAS — Guía de configuración

Esta guía explica paso a paso cómo dejar listo el nuevo sistema de campañas de marketing por WhatsApp en cada empresa que use Chatgorim.

**Importante:** debes hacer estos pasos **una vez por empresa** (cada empresa tiene su propia base de Airtable y su propio servicio de Render).

---

## 1️⃣ Crear las tablas en Airtable

Entra en la base de Airtable de la empresa y crea **dos tablas nuevas** y añade **3 campos** a la tabla existente `Contacts`.

### A) Nueva tabla: `Campaigns`

Crea una tabla con este nombre exacto: **`Campaigns`**

Añade estos campos (con **el nombre EXACTO**, distingue mayúsculas):

| Nombre del campo | Tipo de campo en Airtable | Notas |
|------------------|---------------------------|-------|
| `name` | Single line text | Primary field |
| `templateName` | Single line text | Nombre exacto de la plantilla en Meta |
| `templateLanguage` | Single line text | Por defecto `es_ES` |
| `variables` | Long text | Guardamos el JSON aquí |
| `recipients` | Long text | Lista de teléfonos en JSON |
| `status` | Single select con opciones: `draft`, `scheduled`, `running`, `completed`, `failed`, `cancelled` | |
| `scheduledFor` | Date — incluir hora (Date with time) — formato local | Cuándo enviar si está programada |
| `originPhoneId` | Single line text | ID del teléfono WhatsApp |
| `respectOptIn` | Checkbox | Por defecto debe estar marcado ✓ |
| `createdAt` | Date with time | |
| `createdBy` | Single line text | Username que la creó |
| `startedAt` | Date with time | Cuándo arrancó el envío |
| `completedAt` | Date with time | Cuándo terminó |
| `totalRecipients` | Number (entero) | |
| `sentCount` | Number (entero) | |
| `failedCount` | Number (entero) | |
| `skippedCount` | Number (entero) | |
| `estimatedCost` | Number (decimal, 2 decimales) | Coste en € |
| `notes` | Long text | Errores o observaciones |

### B) Nueva tabla: `CampaignSends`

Crea una tabla con este nombre exacto: **`CampaignSends`**

Añade estos campos:

| Nombre del campo | Tipo de campo en Airtable |
|------------------|---------------------------|
| `phone` | Single line text (Primary field) |
| `campaignId` | Single line text |
| `status` | Single select: `pending`, `sent`, `delivered`, `read`, `failed`, `skipped` |
| `sentAt` | Date with time |
| `error` | Long text |

### C) Añadir 3 campos a la tabla existente `Contacts`

Edita la tabla `Contacts` y añade estos campos al final (sin renombrar nada existente):

| Nombre del campo | Tipo de campo en Airtable |
|------------------|---------------------------|
| `optInMarketing` | Checkbox |
| `optInDate` | Date with time |
| `optInSource` | Single line text |

---

## 2️⃣ Crear plantillas de Marketing en Meta Business Manager

Para enviar mensajes masivos por WhatsApp **necesitas plantillas APROBADAS por Meta**, en categoría **MARKETING** (las de utility/service no valen para campañas).

### Pasos:
1. Entra a **https://business.facebook.com/wa/manage/message-templates/**
2. Selecciona el WABA (WhatsApp Business Account) de la empresa
3. Pulsa **Create Template**
4. Configura:
   - **Category:** `Marketing`
   - **Language:** `Spanish (SPA)` ← MUY IMPORTANTE, esto se traduce a código `es_ES`
   - **Name:** sin espacios y en minúsculas, ej. `feliz_navidad_2026`
5. Diseña el mensaje. Puedes usar variables `{{1}}`, `{{2}}`, etc. para personalizar.

### Ejemplos recomendados para empezar:

#### Plantilla 1 — `feliz_navidad`
```
🎄 ¡Felices Fiestas, {{1}}!

Desde {{2}} queremos desearte unas Navidades llenas de alegría y un próspero año nuevo.

Gracias por confiar en nosotros un año más.

Para darte de baja de promociones responde BAJA.
```

#### Plantilla 2 — `promocion_generica`
```
Hola {{1}} 👋

Esta semana tenemos una promoción especial para ti:
{{2}} con un {{3}}% de descuento.

Reserva tu cita respondiendo a este mensaje.

Para no recibir más promociones responde BAJA.
```

#### Plantilla 3 — `recordatorio_itv`
```
Hola {{1}},

Tu vehículo {{2}} tiene la ITV próxima a vencer ({{3}}).

¿Quieres que te lo llevemos al taller? Responde SÍ y te ayudamos con la gestión.

Para no recibir avisos responde BAJA.
```

> ⚠️ Las plantillas tardan de minutos a 24h en aprobarse. **Planifica con tiempo** las campañas de fechas señaladas.

> ✅ **OBLIGATORIO**: incluir siempre la frase "Para no recibir más promociones responde BAJA" o similar. Sin esto Meta puede rechazar tu plantilla o suspender tu cuenta por incumplir RGPD.

---

## 3️⃣ Variables de entorno opcionales en Render

En el dashboard de Render → servicio backend → **Environment** puedes añadir (opcional):

| Key | Valor | Para qué sirve |
|-----|-------|----------------|
| `MARKETING_COST_PER_MSG` | `0.06` | Coste por mensaje en € (ajusta según tu plan Meta) |
| `CAMPAIGN_SEND_DELAY_MS` | `200` | Milisegundos entre envíos (200ms = 5 msg/seg) |

Si no las pones, usa los valores por defecto (0.06€ y 200ms).

---

## 4️⃣ Recoger consentimientos (opt-in) de tus clientes

Por ley europea (RGPD) y normativa Meta, **solo puedes enviar marketing a quien haya dado consentimiento expreso**.

### Formas de recoger opt-in:

**A) Manual desde la app (rápido)**
Abre la ficha de un contacto en Chatgorim → activa el toggle **"Acepta promociones"**. Hazlo solo si el cliente te ha dicho expresamente que quiere recibir promociones.

**B) Por respuesta de WhatsApp (automático)**
Si un cliente responde alguna de estas frases por WhatsApp, el sistema marca opt-in automáticamente:
- `SI PROMOCIONES`
- `ACEPTO PROMOCIONES`
- `ALTA PROMOCIONES`
- `ALTA MARKETING`

**C) Configurable: bot de bienvenida (recomendado)**
Puedes pedir a la IA Laura que, cuando llega un cliente nuevo, le pregunte: *"¿Te gustaría recibir nuestras promociones puntuales por WhatsApp? Responde ALTA PROMOCIONES para recibirlas."* Y el sistema lo guardará automáticamente.

### Opt-out automático:
Si un cliente responde **`BAJA`**, **`STOP`**, **`CANCELAR`**, **`NO PROMOCIONES`**, **`NO MARKETING`** o **`UNSUBSCRIBE`**, el sistema:
- Desactiva opt-in marketing
- Desactiva opt-out de notificaciones automáticas
- Cancela cualquier notificación pendiente

---

## 5️⃣ Cómo crear y enviar tu primera campaña

Una vez tengas las tablas creadas, las plantillas aprobadas y al menos un contacto con opt-in:

1. En Chatgorim, pulsa el icono de 📢 **megáfono** en la barra inferior izquierda (junto al calendario)
2. Pulsa **"+ Nueva campaña"**
3. **Paso 1:** elige nombre interno + plantilla aprobada
4. **Paso 2:** rellena las variables (puedes usar `{nombre}` para personalización automática)
5. **Paso 3:** selecciona destinatarios con los filtros (etiqueta, departamento, opt-in)
6. **Paso 4:** elige cuándo enviar:
   - **Ahora** → arranca inmediatamente, los envíos se hacen en segundo plano
   - **Programar** → elige fecha/hora, el sistema la ejecuta solo
   - **Borrador** → la guardas y la envías cuando quieras
7. Confirma y listo

### Seguimiento en tiempo real
- El listado de campañas se refresca cada 15 segundos
- Pulsa el ojo 👁 para ver el detalle: progreso, enviados, fallidos, motivo de cada fallo
- Puedes ver teléfono por teléfono qué ha pasado

---

## 6️⃣ Buenas prácticas para no tener problemas con Meta

✅ **HACER:**
- Solo enviar a contactos con opt-in activo
- Personalizar siempre el mensaje (`{nombre}` mínimo)
- Espaciar campañas (máximo 1-2 al mes)
- Mensaje útil y relevante
- Incluir opción de baja en cada plantilla
- Empezar con grupos pequeños (50-100), medir, luego escalar

❌ **NO HACER:**
- Enviar mismo mensaje varias veces a la misma persona
- Mensajes con palabras tipo "URGENTE", todo en mayúsculas, exceso de emojis
- Enviar a horas intempestivas (madrugada, fines de semana muy temprano)
- Saltarse el opt-in (Meta puede banear el número)
- Comprar listas de teléfonos (totalmente ilegal y prohibido por Meta)

### Si tu calidad baja en Meta:
- 🟢 **Verde:** todo bien, sigue así
- 🟡 **Amarillo:** revisa los últimos envíos, baja la frecuencia
- 🔴 **Rojo:** Meta limitará tus envíos. Pausa todas las campañas, espera 7 días.

---

## 7️⃣ Solución de problemas comunes

### "Error 132001: Template name does not exist in es"
La plantilla no está aprobada o el código de idioma no coincide. Asegúrate de que en Meta el idioma sea **Spanish (SPA)** (que se traduce a `es_ES`).

### "Saltado: sin opt-in marketing"
El contacto no tiene marcado `optInMarketing = true` en Airtable. Activa el toggle en la ficha o pídele consentimiento por WhatsApp.

### "Saltado: opt-out global"
El contacto se ha dado de baja con `BAJA`. No se le puede mandar ni recordatorios automáticos ni campañas. Para reactivarlo, en Airtable desmarca `opted_out_notifications`.

### Campaña queda en estado "running" para siempre
Reinicia el servicio en Render. Si los registros en `Campaigns` quedan colgados con `running`, edítalos manualmente en Airtable y cambia el `status` a `failed`.

### No aparecen plantillas en el wizard
- Comprueba que tienes plantillas en Meta con estado `APPROVED`
- Comprueba que el endpoint `/api/templates` del backend funciona (puedes probarlo en el navegador)
- Refresca la página

---

## 8️⃣ Endpoints disponibles (para integraciones avanzadas)

Para desarrolladores que quieran automatizar:

```
GET    /api/campaigns                           — listar campañas
GET    /api/campaigns/:id                       — detalle
POST   /api/campaigns                           — crear
PUT    /api/campaigns/:id                       — editar (solo draft/scheduled)
DELETE /api/campaigns/:id                       — eliminar
POST   /api/campaigns/:id/send                  — lanzar ahora
POST   /api/campaigns/:id/cancel                — cancelar programada
GET    /api/campaigns/:id/sends                 — logs de envío
GET    /api/campaigns-contacts                  — contactos para wizard
GET    /api/campaigns-contacts?onlyOptedIn=true — solo opt-in
POST   /api/contacts/:phone/marketing-opt-in    — cambiar opt-in
GET    /api/campaigns-stats                     — stats globales
```

---

## ✅ Checklist antes de la primera campaña en producción

- [ ] Tablas `Campaigns` y `CampaignSends` creadas en Airtable
- [ ] Campos `optInMarketing`, `optInDate`, `optInSource` añadidos a `Contacts`
- [ ] Al menos una plantilla `MARKETING` aprobada en Meta con idioma `Spanish (SPA)`
- [ ] La plantilla incluye instrucciones de baja ("responde BAJA")
- [ ] Al menos 5 contactos con `optInMarketing = true`
- [ ] Has hecho una campaña de prueba con 1-2 destinatarios primero
- [ ] Has revisado el detalle de envío y todos llegaron correctamente
- [ ] Has comprobado que tu calidad de número en Meta sigue verde

¡Lista para escalar! 🚀
