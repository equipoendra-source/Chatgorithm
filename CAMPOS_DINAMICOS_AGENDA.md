# 🎨 Campos dinámicos de la agenda según sector

Este documento explica cómo funcionan los **5 campos personalizados** de las citas según el sector configurado en el wizard de Laura.

---

## 📋 Lo que tienes que hacer en Airtable

Necesitas añadir **2 campos nuevos** a la tabla `Appointments`.

### Campo 1: `Extra`

1. Abre tu base de Airtable de Chatgorim
2. Ve a la tabla **`Appointments`**
3. Pulsa el botón **`+`** al final de las cabeceras
4. Configura:
   - **Nombre:** `Extra`
   - **Tipo:** `Single line text`
5. **Crear**

### Campo 2: `Notas`

1. En la misma tabla `Appointments`
2. Pulsa **`+`** al final
3. Configura:
   - **Nombre:** `Notas`
   - **Tipo:** `Long text` (porque las notas pueden ser largas)
4. **Crear**

⚠️ Los nombres son sensibles a mayúsculas. Tienen que ser exactamente **`Extra`** y **`Notas`**.

---

## ✅ Lo que NO hay que hacer

- ❌ NO renombres los campos existentes (`Matricula`, `Marca`, `Modelo`) — siguen funcionando igual
- ❌ NO cambies su tipo
- ❌ NO añadas otros campos

---

## 🎯 Cómo funciona el sistema

### Estructura interna

Internamente, los 4 campos se identifican como `field1`, `field2`, `field3`, `field4`. Pero en Airtable se mapean así:

| Identificador interno | Columna Airtable |
|----------------------|------------------|
| `field1` | `Matricula` |
| `field2` | `Marca` |
| `field3` | `Modelo` |
| `field4` | `Extra` (el nuevo) |

Los nombres de columna en Airtable se mantienen por compatibilidad con datos antiguos. El **contenido** de cada columna depende del sector configurado.

### Plantillas por sector

Cuando el cliente completa el wizard de Laura y elige un sector, los 4 campos se muestran con etiquetas distintas:

| Sector | Field 1 (Matricula) | Field 2 (Marca) | Field 3 (Modelo) | Field 4 (Extra) |
|--------|---------------------|-----------------|------------------|-----------------|
| 🚗 Taller | Matrícula | Marca | Modelo | Año / Kms |
| 🦷 Clínica dental | Paciente | Tratamiento | Mutua / Seguro | Doctor |
| 💅 Peluquería | Cliente | Servicio | Estilista | Notas |
| 🩺 Centro médico | Paciente | Especialidad | Mutua / Seguro | Doctor |
| ⚖️ Gestoría | Nombre | Tipo de gestión | NIF / CIF | Notas |
| 🏠 Inmobiliaria | Cliente | Tipo de propiedad | Zona | Presupuesto |
| 🎓 Academia | Alumno | Curso | Nivel / Edad | Notas |
| 🐶 Veterinario | Mascota | Especie / raza | Motivo | Edad |
| ✏️ Otro | Campo 1 | Campo 2 | Campo 3 | Campo 4 |

---

## 🧠 Cómo se aplica automáticamente

Cuando el cliente completa el wizard de Laura:

1. Selecciona su sector (paso 1 del wizard)
2. Termina los 7 pasos
3. Al guardar, el backend hace 2 cosas:
   - Guarda el system prompt de Laura
   - **Guarda los field labels en `BotSettings`** con la plantilla del sector elegido

Después:
- **Laura** sabe qué preguntar al cliente (mascota, especie, etc.)
- **La agenda** muestra los inputs con los nombres correctos
- **El backend** guarda los datos en las columnas de Airtable como siempre

---

## 🔄 Cambiar de sector

Si el cliente cambia de sector (vuelve al wizard y elige otro):

- Las plantillas de field labels se actualizan automáticamente
- **Las citas antiguas no se modifican** — sus datos siguen ahí
- Pero ahora se muestran con las etiquetas nuevas (puede haber inconsistencias visuales si el cambio fue grande, ej: taller → clínica dental)

⚠️ **Recomendación:** elegir bien el sector la primera vez. Si hay que cambiarlo mucho después, podríamos añadir una migración de datos antiguos (no implementado en v1).

---

## 🔧 Endpoints técnicos (para devs)

```
GET /api/bot/field-labels       # Devuelve las labels configuradas
POST /api/bot/setup-wizard      # Guarda labels al elegir sector (junto con prompt)
```

La función `getFieldLabels()` lee de la tabla `BotSettings` el registro con `Setting='field_labels'`. Si no existe, usa la plantilla de taller por defecto (compatibilidad).

---

## 🧪 Cómo probarlo

### Antes del deploy

1. **Añade el campo `Extra` en Airtable** (sección 1 de este documento)

### Tras el deploy

1. Ve a **Ajustes → Configuración del Bot → Iniciar wizard**
2. Elige un sector distinto del taller (ej: "Veterinario")
3. Completa el wizard
4. Ve a **Ajustes → Agenda**
5. Pulsa cualquier cita reservada
6. **Verás los 4 campos con etiquetas de veterinario:** Mascota, Especie/raza, Motivo, Edad

Si vuelves al wizard y eliges Taller, al refrescar la agenda verás de nuevo: Matrícula, Marca, Modelo, Año/Kms.

---

## ⚠️ Limitaciones conocidas

1. **Solo 4 campos** — no se pueden añadir más sin cambiar el código y Airtable
2. **No editables uno a uno** — solo plantillas predefinidas por sector (en v1)
3. **Datos antiguos:** si cambias de sector, las citas anteriores muestran sus datos con las nuevas labels (puede ser confuso). Por ejemplo, una cita guardada como veterinario ("Mascota: Firulais") seguirá teniendo "Firulais" en la columna `Matricula` de Airtable. Si cambias después a taller, la agenda mostrará "Matrícula: Firulais" — feo pero funcional.

---

## 📞 Soporte

Si tras añadir el campo `Extra` y desplegar todo no se ven las etiquetas correctas:

1. Comprueba que el campo `Extra` existe en `Appointments`
2. Comprueba en Airtable que en `BotSettings` hay un registro con `Setting='field_labels'` y un JSON válido en `Value`
3. Si no existe, completa el wizard de Laura (paso final genera el registro)
4. Mira los logs de Render por si hay errores en `[Wizard]` o `getFieldLabels`
