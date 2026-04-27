# 🔁 Campañas recurrentes — campos a añadir en Airtable

Para que el sistema de **campañas recurrentes** funcione, hay que añadir **4 campos nuevos** y **1 opción** en la tabla `Campaigns` que ya tienes creada. Es un cambio mínimo y compatible con todo lo que ya hay.

---

## 1️⃣ Añadir 4 campos nuevos a la tabla `Campaigns`

Abre tu base de Airtable → tabla **`Campaigns`** → añade estos campos al final (con el **nombre EXACTO**):

| Nombre del campo | Tipo de campo |
|------------------|---------------|
| `recurringConfig` | **Long text** |
| `recurringNextRun` | **Date** ⚠️ con la opción **"Incluir hora"** activada |
| `recurringLastRun` | **Date** ⚠️ con la opción **"Incluir hora"** activada |
| `parentCampaignId` | **Single line text** |

⚠️ Importante:
- Los nombres son **sensibles a mayúsculas** — escríbelos exactamente como están aquí.
- En `recurringNextRun` y `recurringLastRun`, después de seleccionar tipo Date, asegúrate de **activar el toggle "Incluir hora"** (igual que hicimos con los otros campos de fecha).
- En `recurringConfig` (Long text), no toques opciones de "Rich text" — déjalo en texto plano.

---

## 2️⃣ Añadir 1 opción nueva al campo `status`

El campo `status` ya existe (Single Select con: `draft`, `scheduled`, `running`, `completed`, `failed`, `cancelled`).

Hay que **añadir una opción nueva**:

1. Pulsa la cabecera del campo `status`
2. Pulsa **"Customize field type"** (Personalizar tipo de campo)
3. Verás la lista de opciones actuales
4. Pulsa **"+ Add option"**
5. Escribe exactamente: `recurring`
6. Elige cualquier color (recomendado: morado/púrpura para diferenciarlo)
7. Pulsa **Save**

---

## ✅ Verificación final

Abre la tabla `Campaigns` y comprueba que tienes:

```
Campos existentes (no tocar):
✓ name, templateName, templateLanguage, variables, recipients,
✓ status, scheduledFor, originPhoneId, respectOptIn,
✓ createdAt, createdBy, startedAt, completedAt,
✓ totalRecipients, sentCount, failedCount, skippedCount,
✓ estimatedCost, notes

Campos nuevos a añadir:
✨ recurringConfig          (Long text)
✨ recurringNextRun         (Date with time)
✨ recurringLastRun         (Date with time)
✨ parentCampaignId         (Single line text)

Opciones del Single Select 'status':
✓ draft, scheduled, running, completed, failed, cancelled
✨ recurring                (nueva)
```

---

## 🧪 Cómo probar después de añadir los campos

1. Despliega el backend y frontend tras hacer `git push`
2. En la app, pulsa el icono 📢 megáfono
3. Pulsa **"+ Nueva campaña"**
4. Configura una campaña normal (nombre, plantilla, variables, contactos)
5. En el **Paso 4** verás 4 botones ahora: **Ahora · Programar · 🔁 Recurrente · Borrador**
6. Pulsa **🔁 Recurrente** → aparece el formulario de cadencia
7. Configura: Diaria/Semanal/Mensual/Custom + hora
8. Pulsa **"Activar campaña recurrente"**

En el listado de campañas verás un nuevo badge morado **🔁 RECURRENTE** y la próxima ejecución programada.

---

## 🛠️ Cómo funciona técnicamente

- La **campaña madre** se guarda con `status = recurring` y nunca se ejecuta directamente
- Cada vez que llega su `recurringNextRun`, el scheduler crea una **campaña hija** (status `running`) con todos los datos heredados de la madre + recipients recalculados con los filtros guardados
- La hija se ejecuta normalmente y su estado pasa a `completed` o `failed`
- Las hijas tienen `parentCampaignId` apuntando a la madre, por lo que **NO aparecen** en el listado principal (solo aparecen en el detalle de la madre, en el bloque "Historial de ejecuciones")
- Si pausas la madre, no se generan más hijas hasta que la reanudes

---

## ❓ FAQ

**Q: ¿Si modifico el `recurringConfig` directamente desde Airtable, se aplica?**
R: Sí, pero es **muy desaconsejado**. El JSON tiene una estructura concreta y editarlo a mano puede romperlo. Mejor edita la campaña desde la interfaz de Chatgorim (pulsa pausa, edita, vuelve a activar).

**Q: ¿Qué pasa si quito una opción del status accidentalmente?**
R: Las campañas que estuvieran con esa opción se mostrarían en blanco. Si lo haces, recreala inmediatamente con el mismo nombre exacto (`recurring`).

**Q: ¿Puedo borrar una campaña recurrente con su historial?**
R: Sí, al borrar la madre se borran también todas las hijas automáticamente. Si quieres conservar el historial, **pausa** la madre en lugar de borrarla.

**Q: ¿Qué hora usa el sistema?**
R: La hora **del servidor de Render** (UTC). Si configuras "10:00" en el wizard, internamente se convierte a UTC. Para España en invierno equivale a 11:00 UTC, en verano a 12:00 UTC. **El sistema gestiona esto automáticamente** según la zona horaria del navegador del usuario que crea la campaña.

---

## 📞 Soporte

Si después de añadir los campos algo no funciona:

1. Comprueba que los nombres de campo son **exactos** (sensibles a mayúsculas)
2. Comprueba que `recurringNextRun` y `recurringLastRun` tienen "Incluir hora" activado
3. Mira los logs de Render → busca errores con etiqueta `[Recurring]` o `[CampaignScheduler]`
