# 🔓 Activación de Módulos Premium

Esta guía explica **cómo activar y desactivar manualmente** los módulos premium de pago de Chatgorim para cada empresa.

## 🎯 Cómo funciona

Cada empresa tiene su **propia base de Airtable**. Los módulos premium se activan creando un registro en la tabla **`Config`** con:

- `name` = el identificador del módulo (empieza por `feature_`)
- `type` = `enabled` (literal, así escrito)

Cuando el cliente abre la app, el frontend pregunta al backend qué módulos están activos. El backend lee la tabla `Config` y le devuelve la lista. Si el módulo aparece, **se desbloquea al instante** sin redeploy.

---

## 📋 Módulos disponibles

| Módulo | `name` en Airtable | Precio | Qué desbloquea |
|--------|-------------------|--------|---------------|
| Auditoría de Respuesta | `feature_response_audit` | 199€ pago único | Pestaña "Auditoría de respuesta" en Analíticas con métricas de tiempo de respuesta del equipo |

*(en el futuro se añadirán más módulos siguiendo el mismo patrón)*

---

## ✅ Cómo ACTIVAR un módulo (cuando el cliente paga)

1. Abre **Airtable** → la base del cliente
2. Ve a la tabla **`Config`**
3. Pulsa **`+ Add record`** (nuevo registro)
4. Rellena los campos:
   ```
   name:  feature_response_audit
   type:  enabled
   ```
5. Guarda. **Ya está activado.**

El cliente verá el módulo desbloqueado la próxima vez que cargue la página (refresca con F5 si lo tiene abierto).

---

## ❌ Cómo DESACTIVAR un módulo (si deja de pagar)

Tienes 2 opciones:

### Opción A — Borrar el registro (recomendado)
1. En la tabla `Config`
2. Encuentra el registro con `name = feature_response_audit` y `type = enabled`
3. Pulsa el botón derecho → **Delete record**

### Opción B — Cambiar el estado
1. Encuentra el registro
2. Cambia el campo `type` de `enabled` a cualquier otra cosa (`disabled`, vacío, lo que quieras)
3. Guarda

El cliente verá la vista bloqueada (con el CTA de pago) la próxima vez que entre.

---

## 🧪 Verificación rápida

Para comprobar manualmente qué módulos están activos en una empresa, abre en el navegador:

```
https://chatgorithm-vubn.onrender.com/api/features
```

Te devolverá un JSON tipo:

```json
{
  "feature_response_audit": true
}
```

Si está vacío `{}` significa que la empresa no tiene ningún módulo premium activado.

---

## 💰 Precios y enlaces de WhatsApp pre-rellenados

Cuando el cliente pulsa el botón "Activar este módulo" en la vista bloqueada, se abre WhatsApp con un mensaje listo a tu número:

- Número configurado: **+34 711246279**
- Mensaje: *"Hola Alex, quiero activar el módulo de Auditoría de Respuesta (199€) en mi cuenta de Chatgorim. ¿Cómo procedemos?"*

Para cambiar el número, edita la constante `SUPPORT_PHONE` al principio de:
```
client/src/components/ResponseTimeAudit.tsx
```

---

## 🚀 Cómo añadir nuevos módulos premium en el futuro

Patrón a seguir para escalar:

### En el backend (`server/src/index.ts`):
1. En tu endpoint nuevo, comprobar el flag con la función helper:
   ```ts
   const enabled = await isFeatureEnabled('feature_NOMBRE_MODULO');
   if (!enabled) {
       return res.status(403).json({ error: 'feature_locked', module: 'feature_NOMBRE_MODULO' });
   }
   ```

### En el frontend:
1. Crear componente con vista bloqueada/desbloqueada (copiar el patrón de `ResponseTimeAudit.tsx`)
2. Leer `features.feature_NOMBRE_MODULO` desde el endpoint `/api/features`
3. Si `false` → vista promo con precio + CTA WhatsApp
4. Si `true` → contenido real

### Para activar:
- Crear registro en `Config` con `name = feature_NOMBRE_MODULO` y `type = enabled`

---

## ⚠️ Cuidado importante

- **NUNCA hardcodees los flags** en el código del backend ni del frontend. Siempre se controlan desde Airtable.
- **El feature flag debe verificarse en el BACKEND** antes de devolver datos. No basta con ocultar la pestaña en el frontend, alguien con conocimientos podría llamar al endpoint directamente.
- En este caso ya está bien hecho: `/api/audit/response-times` devuelve `403 feature_locked` si el módulo no está activo.

---

## 📞 Soporte

Si algo no va, comprueba en orden:

1. ¿Existe la tabla `Config` en la base del cliente? (debe existir, es del setup inicial)
2. ¿El registro tiene `name` exactamente `feature_response_audit` (sensible a mayúsculas)?
3. ¿El registro tiene `type` exactamente `enabled` (en minúsculas)?
4. ¿El cliente refrescó la página tras la activación?

Si todo lo anterior es correcto y aún no funciona, mira los logs de Render del servicio backend del cliente para ver si hay errores en `[Features]` o `[Audit]`.
