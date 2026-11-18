# 🦃 Thanksgiving 2026 | Familia Jones Jocobi

Invitación digital interactiva: portada animada con nuestro pavo del jardín, menú confirmado,
lista colaborativa de contribuciones ("Yo llevo esto") y mensaje de agradecimiento.

```
index.html                    Contenido de la invitación
style.css                     Colores, tipografía, animaciones y diseño para teléfonos
script.js                     Interacciones y registro de contribuciones (⚙️ CONFIG arriba)
assets/                       Ilustraciones (pavo en su carrito de elote, calabaza, hojas, bellota)
google-apps-script/Code.gs    Opción A: guardar respuestas en Google Sheets  ← recomendada
api/contributions.js          Opción B: guardar respuestas en MongoDB (vía Vercel)
```

Sin configurar nada, la página funciona en **modo de prueba** (las selecciones solo se guardan
en el dispositivo y aparece un aviso amarillo). Para que todos vean las mismas contribuciones,
conecta **una** de las dos opciones y pega su URL en `script.js`:

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

## 2. Opción A: Google Sheets (recomendada, la más sencilla)

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

### Problemas comunes con Google Sheets

| Síntoma | Solución |
|---|---|
| Al abrir `/exec` pide iniciar sesión o dice "No tienes permiso" | En la implementación, el acceso debe ser **Cualquier usuario** (paso 5). |
| La página dice "No pudimos cargar las contribuciones" | Verifica que la URL termine en `/exec` (no `/dev`) y esté entre comillas en `script.js`. |
| Cambié `Code.gs` pero no se nota | Cada cambio requiere **Implementar → Administrar implementaciones → ✏️ → Versión: Nueva versión → Implementar**. La URL no cambia. |
| Error de permisos al ejecutar `setup` | Usa una cuenta personal de Gmail; algunas cuentas de trabajo o escuela bloquean Apps Script. |
| Tengo varias cuentas de Google abiertas | Haz los pasos en una ventana de incógnito con una sola cuenta: es una causa muy común de errores. |

---

## 3. Opción B: MongoDB Atlas + Vercel

Una página de GitHub Pages no puede conectarse directamente a MongoDB (tendría que exponer la
contraseña de la base de datos), así que la función `api/contributions.js` funciona como intermediaria.

**MongoDB Atlas (gratis)**
1. Crea una cuenta en [mongodb.com/atlas](https://www.mongodb.com/atlas) y un clúster **M0 (Free)**.
2. **Database Access → Add New Database User**: usuario y contraseña (guárdalos).
3. **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`).
   Vercel no tiene una IP fija, así que este paso es necesario.
4. **Connect → Drivers** → copia la cadena `mongodb+srv://usuario:<password>@...` y
   reemplaza `<password>` por tu contraseña.

**Vercel (gratis)**
1. Entra a [vercel.com](https://vercel.com) con tu cuenta de GitHub → **Add New → Project** → importa `thanksgiving-2026`.
2. En **Environment Variables** agrega:
   - `MONGODB_URI` = la cadena de conexión del paso 4
   - `ALLOWED_ORIGIN` = `https://TU-USUARIO.github.io` *(opcional, limita quién puede usar la API)*
3. **Deploy**. Tu API quedará en `https://thanksgiving-2026.vercel.app/api/contributions`
   (abre esa URL: debes ver `{"ok":true,"entries":[]}`).
4. Pega esa URL en `CONFIG.API_URL`.
   *Opcional:* Vercel también publica la página en `https://thanksgiving-2026.vercel.app`, así
   que puedes compartir ese enlace en lugar del de GitHub Pages y usar `API_URL: '/api/contributions'`.

Las respuestas se guardan en la base `thanksgiving2026`, colección `contributions`
(puedes verlas en Atlas → **Browse Collections**).

---

## 4. Personalizar

- **Horario y dirección:** en `index.html`, dentro de la lista `event-details` de la portada.
- **Contribuciones y cantidades sugeridas:** lista `CONTRIBUTIONS` en `script.js`.
  `slots` indica cuántas familias se necesitan (vinos = 1, refrescos y pay = 2).
  Si agregas o cambias un `id` o `slots`, actualízalo también en `ITEMS` del servidor
  (`Code.gs` o `api/contributions.js`).
- **Frases del pavo:** lista `TURKEY_LINES` en `script.js`.
- **Quitar una contribución registrada por error:** borra la fila en la hoja *Contribuciones*
  (Opción A) o el documento en Atlas (Opción B).

## 5. Detalles de la experiencia

- El pavo del jardín llega manejando su carrito de elote con ruedas de calabaza; al tocarlo, saluda y suelta hojitas.
- Las letras del título caen y rebotan; las hojas caen suavemente y las luces titilan.
- Al tocar cualquier parte de la portada salen hojitas 🍁.
- Las tarjetas aparecen escalonadas y se inclinan en 3D con el mouse.
- Al confirmar una contribución hay confeti de hojas y un mensaje de agradecimiento.
- La lista se actualiza sola cada minuto y al volver a la pestaña.
- Si dos personas eligen el último lugar al mismo tiempo, solo una queda registrada y la otra ve un aviso amable.
- Respeta la opción "reducir movimiento" del teléfono y funciona en WhatsApp, iMessage, correo y cualquier navegador moderno.
