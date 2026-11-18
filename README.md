# 🦃 Thanksgiving 2026 | Familia Jones Jocobi

Invitación digital interactiva: portada animada con nuestro pavo del jardín, menú confirmado,
lista colaborativa de contribuciones ("Yo llevo esto") y mensaje de agradecimiento.

```
index.html                    Contenido de la invitación
style.css                     Colores, tipografía, animaciones y diseño para teléfonos
script.js                     Interacciones y registro de contribuciones (⚙️ CONFIG arriba)
assets/                       Ilustraciones (pavo en su carrito de elote, calabaza, hojas, bellota)
google-apps-script/Code.gs    Servicio con Google Sheets: contribuciones, RSVP y correos
```

Sin configurar nada, la página funciona en **modo de prueba** (las selecciones solo se guardan
en el dispositivo y aparece un aviso amarillo). Para que todos vean las mismas contribuciones,
conecta Google Sheets y pega su URL en `script.js`:

```js
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/XXXXXXXX/exec',
  ...
```

---

## 1. Publicar la página en GitHub Pages

1. Crea un repositorio público llamado `thanksgiving-2026` y sube todos estos archivos.
2. En el repositorio: **Settings → Pages → Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main** / **(root)** → **Save**
3. En 1–2 minutos tu invitación estará en `https://TU-USUARIO.github.io/thanksgiving-2026/`.

---

## 2. Google Sheets: contribuciones, RSVP y correos

1. Abre [sheets.new](https://sheets.new) y nombra la hoja **Thanksgiving 2026**.
2. Menú **Extensiones → Apps Script**.
3. Borra todo lo que aparece en `Código.gs` y pega el contenido de `google-apps-script/Code.gs`. Guarda (💾).
4. Arriba, en el selector de funciones, elige **setup** y presiona **▶ Ejecutar**.
   - Google pedirá permisos: **Revisar permisos → tu cuenta → Configuración avanzada →
     Ir a (proyecto) (no seguro) → Permitir**. Es normal: es tu propio script.
   - Se creará la pestaña **Contribuciones** en la hoja.
5. **Implementar → Nueva implementación** → ⚙️ tipo **Aplicación web**:
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario** ⚠️ *(no "Cualquier usuario con cuenta de Google")*
   - **Implementar** y copia la URL que termina en **`/exec`**.
6. Pega esa URL en `CONFIG.API_URL` de `script.js` y sube el cambio a GitHub.

**Prueba rápida:** abre la URL `/exec` en el navegador. Debes ver `{"ok":true,"entries":[]}`.

### Actualizar el código del Apps Script

Cada vez que cambie `Code.gs`:
1. Pega el código nuevo en el editor de Apps Script y guarda (💾).
2. Ejecuta **setup** otra vez (▶ Ejecutar). Si pide permisos nuevos, por ejemplo para enviar correos, acéptalos.
3. **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar.** La URL no cambia.

### Qué guarda la hoja

| Pestaña | Contenido |
|---|---|
| **Contribuciones** | Quién lleva qué, con su correo. Borra una fila para quitar una contribución. |
| **RSVP** | Una fila por familia: si asiste, adultos, niños y mensaje. |
| **Invitados** *(oculta)* | El enlace privado de cada invitado. No la compartas. |

### Correos

- **Confirmación:** cada invitado recibe un correo al confirmar asistencia o elegir una contribución. Incluye un botón **"Ver o cambiar mi respuesta"** con su enlace privado, para hacer cambios desde cualquier teléfono.
- **Aviso para ti:** recibes un correo cada vez que alguien confirma o cambia su RSVP. Para apagarlo, cambia `NOTIFY_HOST` a `false`.
- **Recordatorio:** en el editor elige **sendReminders → ▶ Ejecutar** para enviarlo en ese momento, o **scheduleReminder → ▶ Ejecutar** una sola vez para que salga solo el miércoles 25 de noviembre a las 10:00 a.m. (hora de San Diego; se cambia en `REMINDER_AT`). Le llega a quien confirmó que asiste y a quien eligió una contribución sin decir que no va.
- Los correos salen de tu Gmail, con el nombre "Familia Jones Jocobi". Gmail permite unos 100 destinatarios al día.

### Problemas comunes con Google Sheets

| Síntoma | Solución |
|---|---|
| Al abrir `/exec` pide iniciar sesión o dice "No tienes permiso" | En la implementación, el acceso debe ser **Cualquier usuario** (paso 5). |
| La página dice "No pudimos cargar las contribuciones" | Verifica que la URL termine en `/exec` (no `/dev`) y esté entre comillas en `script.js`. |
| Cambié `Code.gs` pero no se nota | Cada cambio requiere **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. La URL no cambia. |
| Error de permisos al ejecutar `setup` | Usa una cuenta personal de Gmail; algunas cuentas de trabajo o escuela bloquean Apps Script. |
| Tengo varias cuentas de Google abiertas | Haz los pasos en una ventana de incógnito con una sola cuenta: es una causa muy común de errores. |

---

## 3. Personalizar

- **Horario y dirección:** en `index.html`, dentro de la lista `event-details` de la portada.
- **Contribuciones y cantidades sugeridas:** lista `CONTRIBUTIONS` en `script.js`.
  `slots` indica cuántas familias pueden compartir una opción (vinos = 3, refrescos y pay = 2).
  Si agregas o cambias un `id` o `slots`, actualízalo también en `ITEMS` del servidor
  (`Code.gs`).
- **Frases del pavo:** lista `TURKEY_LINES` en `script.js`.
- **Quitar una contribución registrada por error:** borra la fila en la hoja *Contribuciones*.

## 5. Detalles de la experiencia

- El pavo del jardín llega manejando su carrito de elote con ruedas de calabaza; al tocarlo, saluda y suelta hojitas.
- Las letras del título caen y rebotan; las hojas caen suavemente y las luces titilan.
- Al tocar cualquier parte de la portada salen hojitas 🍁.
- Las tarjetas aparecen escalonadas y se inclinan en 3D con el mouse.
- Al confirmar una contribución hay confeti de hojas y un mensaje de agradecimiento.
- La lista se actualiza sola cada minuto y al volver a la pestaña.
- Si dos personas eligen el último lugar al mismo tiempo, solo una queda registrada y la otra ve un aviso amable.
- Cada invitado puede cancelar o cambiar sus contribuciones y su RSVP desde el mismo teléfono, o desde cualquier otro con el enlace de su correo.
- Respeta la opción "reducir movimiento" del teléfono y funciona en WhatsApp, iMessage, correo y cualquier navegador moderno.
