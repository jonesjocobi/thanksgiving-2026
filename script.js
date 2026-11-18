/* =========================================================
   Thanksgiving 2026 · Familia Jones Jocobi
   Interacciones y registro de contribuciones
   ========================================================= */

/* ---------------------------------------------------------
   ⚙️ CONFIGURACIÓN
   API_URL: dirección del servicio que guarda las contribuciones.
     • Google Sheets → la URL de tu Apps Script (termina en /exec)
     • MongoDB       → la URL de tu función en Vercel
                        (ej. https://thanksgiving-2026.vercel.app/api/contributions)
     • Vacío ('')    → modo de prueba: se guarda solo en este dispositivo.
   --------------------------------------------------------- */
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbwx1vnsqke3yzUdxVImIHbYNN5aJVld06bdSodxs02cwa1S9MoqDLPFGi6qUbD0eCM-Og/exec',
  EVENT_DATE: '2026-11-26T00:00:00-08:00', // San Diego (hora del Pacífico)
  REFRESH_SECONDS: 60,
};

/* Platillos ya confirmados (no se pueden seleccionar) */
const HOST_DISHES = [
  { icon: '🦃', name: 'Pavo al horno',        family: 'Familia Jones Jocobi' },
  { icon: '🥘', name: 'Cazuela de ejotes',    en: 'Green Bean Casserole',   family: 'Familia Jones Jocobi' },
  { icon: '🍠', name: 'Cazuela de camote',    en: 'Sweet Potato Casserole', family: 'Familia Jones Jocobi' },
  { icon: '🍞', name: 'Cazuela de relleno',   en: 'Stuffing Casserole',     family: 'Familia Jones Jocobi' },
  { icon: '🥔', name: 'Puré de papas',        family: 'Familia Lechuga' },
  { icon: '🥖', name: 'Bollitos de pan',      en: 'Dinner Rolls',           family: 'Familia Lechuga' },
];

/* Contribuciones disponibles para invitados.
   slots = cuántas familias se necesitan para esta opción.
   ⚠️ Si cambias ids o slots, cámbialos también en el servidor
   (google-apps-script/Code.gs o api/contributions.js). */
const CONTRIBUTIONS = [
  { id: 'refrescos',    category: 'Bebidas', icon: '🥤', name: 'Refrescos',      en: 'Soda',        suggestion: '3–4 botellas de 2 litros', slots: 2 },
  { id: 'vino-tinto',   category: 'Bebidas', icon: '🍷', name: 'Vino tinto',                         suggestion: '2–3 botellas en total (se puede compartir)', slots: 3 },
  { id: 'vino-blanco',  category: 'Bebidas', icon: '🥂', name: 'Vino blanco',                        suggestion: '2–3 botellas en total (se puede compartir)', slots: 3 },
  { id: 'pay-calabaza', category: 'Postres', icon: '🥧', name: 'Pay de calabaza', en: 'Pumpkin Pie', suggestion: '1–2 pays',                 slots: 2 },
];

/* Opción libre: los invitados escriben lo que quieren traer (sin límite) */
const CUSTOM_ID = 'otro';

/* Ícono según lo que escriban */
const DISH_ICONS = [
  [/pastel|cake|brownie|galleta|cookie|cupcake/i, '🍰'],
  [/pay|pie|tarta/i, '🥧'],
  [/flan|gelatina|postre|helado|ice cream/i, '🍮'],
  [/ensalada|salad/i, '🥗'],
  [/vino|wine/i, '🍷'],
  [/cerveza|beer/i, '🍺'],
  [/champa|sidra|cider|espumoso/i, '🍾'],
  [/caf[eé]|coffee/i, '☕'],
  [/agua|jugo|juice|limonada|ponche|horchata/i, '🧃'],
  [/hielo|ice/i, '🧊'],
  [/pan|roll|bread|bolillo/i, '🥖'],
  [/queso|cheese|charcuter/i, '🧀'],
  [/fruta|fruit|uva/i, '🍇'],
  [/elote|corn|maíz|maiz/i, '🌽'],
  [/arroz|rice/i, '🍚'],
  [/jam[oó]n|ham/i, '🍖'],
  [/tamal/i, '🫔'],
  [/salsa|dip|guacamole|chips|botana|snack/i, '🥑'],
  [/mac|pasta|espagueti/i, '🍝'],
  [/cranberr|arándano|arandano/i, '🍒'],
  [/flor|flower/i, '💐'],
  [/plato|vaso|servilleta|cubierto|desechable/i, '🍴'],
];
const dishIcon = (text) => (DISH_ICONS.find(([re]) => re.test(text)) || [null, '🍽️'])[1];
const normalize = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();

const LOCAL_KEY = 'tg26-db';      // modo de prueba (sin servicio)
const GUEST_KEY = 'tg26-guest';   // { key, name, email } de este invitado

let entries = [];
let rsvpTotals = null;
let currentItem = null;
let lastUpdated = null;
let guest = null;   // invitado identificado en este dispositivo
let me = null;      // { guest, rsvp, entryIds } según el servidor
let swapFrom = null; // contribución que el invitado está cambiando

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return node;
}

function storageGet(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin almacenamiento */ }
}

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const cleanText = (v) => String(v || '').replace(/\s+/g, ' ').trim();
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());
const myEntryIds = () => new Set(me ? me.entryIds : []);

/* ---------- Comunicación con el servicio ---------- */
async function apiList() {
  if (!CONFIG.API_URL) return localServer({ action: 'list' });
  const res = await fetch(CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'error');
  return data;
}

async function apiPost(payload) {
  if (!CONFIG.API_URL) return localServer(payload);
  // text/plain evita la verificación CORS previa (necesario para Google Apps Script)
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

function applyState(data) {
  if (data && data.entries) {
    entries = data.entries;
    rsvpTotals = data.rsvp || null;
    lastUpdated = new Date();
  }
}

/* Modo de prueba: imita al servidor guardando todo en este dispositivo (no envía correos) */
function localServer(p) {
  const db = storageGet(LOCAL_KEY, { entries: [], guests: [], rsvps: [] });
  const save = () => storageSet(LOCAL_KEY, db);
  const pub = () => {
    const yes = db.rsvps.filter((r) => r.attending === 'si');
    return {
      ok: true,
      entries: db.entries.map(({ email, ...rest }) => rest),
      rsvp: { families: yes.length, adults: yes.reduce((a, r) => a + r.adults, 0), kids: yes.reduce((a, r) => a + r.kids, 0) },
    };
  };
  const identify = (email, name, key) => {
    const g = db.guests.find((x) => x.email === email);
    if (!g) { const k = crypto.getRandomValues(new Uint32Array(4)).join(''); db.guests.push({ email, name, key: k }); return k; }
    return key === g.key ? g.key : null;
  };
  const byKey = (key) => db.guests.find((x) => x.key === key);
  const email = String(p.email || '').trim().toLowerCase();

  if (p.action === 'list') return pub();
  if (p.action === 'add') {
    const item = CONTRIBUTIONS.find((c) => c.id === p.itemId);
    if (item && db.entries.filter((e) => e.itemId === p.itemId).length >= item.slots) return { ...pub(), ok: false, error: 'full' };
    const key = identify(email, p.name, p.key);
    const id = Math.random().toString(36).slice(2, 10);
    db.entries.push({ id, itemId: p.itemId, name: p.name, email, ...(p.dish ? { dish: p.dish } : {}), ts: new Date().toISOString() });
    save();
    return { ...pub(), ok: true, entryId: id, key, needsLink: !key };
  }
  if (p.action === 'rsvp') {
    const existing = db.rsvps.find((r) => r.email === email);
    const key = identify(email, p.name, p.key);
    if (existing && !key) { save(); return { ok: false, error: 'needs_link' }; }
    const row = { email, name: p.name, attending: p.attending, adults: p.attending === 'si' ? +p.adults : 0, kids: p.attending === 'si' ? +p.kids : 0, message: p.message };
    if (existing) Object.assign(existing, row); else db.rsvps.push(row);
    save();
    return { ...pub(), ok: true, key, needsLink: !key };
  }
  if (p.action === 'cancel') {
    const g = byKey(p.key);
    const i = db.entries.findIndex((e) => e.id === p.entryId && g && e.email === g.email);
    if (i < 0) return { ...pub(), ok: false, error: 'not_found' };
    db.entries.splice(i, 1); save();
    return { ...pub(), ok: true };
  }
  if (p.action === 'me') {
    const g = byKey(p.key);
    if (!g) return { ok: false, error: 'not_allowed' };
    const r = db.rsvps.find((x) => x.email === g.email);
    return { ok: true, guest: { name: g.name, email: g.email }, rsvp: r || null, entryIds: db.entries.filter((e) => e.email === g.email).map((e) => e.id) };
  }
  if (p.action === 'sendLink') return { ok: true };
  return { ok: false, error: 'bad_action' };
}

/* Mensajes claros según el error del servidor */
function serverErrorText(code) {
  const messages = {
    bad_email: 'Revisa tu correo: parece que tiene un error.',
    missing_name: 'Escribe tu nombre o el de tu familia.',
    missing_dish: 'Escribe qué te gustaría traer.',
    bad_count: '¿Cuántas personas vienen? Indica al menos una.',
    bad_action: 'La invitación se está actualizando. Inténtalo en unos minutos (código: versión del servicio).',
    server: 'Hubo un problema al guardar. Inténtalo de nuevo en un momento (código: servidor).',
  };
  return messages[code] || `No se pudo guardar. Inténtalo de nuevo (código: ${code || 'desconocido'}).`;
}

/* ---------- Identidad del invitado ---------- */
function rememberGuest(data) {
  guest = { ...(guest || {}), ...data };
  storageSet(GUEST_KEY, guest);
}

async function loadMe() {
  if (!guest || !guest.key) { me = null; return; }
  try {
    const res = await apiPost({ action: 'me', key: guest.key });
    if (res.ok) {
      me = res;
      rememberGuest({ name: res.guest.name, email: res.guest.email });
    } else if (res.error === 'not_allowed') {
      me = null; guest = null; storageSet(GUEST_KEY, null);
    }
  } catch (err) { console.error(err); }
}

/* ---------- Estado de cada contribución ---------- */
function statusOf(item) {
  const claimers = entries.filter((e) => e.itemId === item.id);
  const count = claimers.length;
  const full = count >= item.slots;
  let state = 'disponible';
  if (count > 0) state = full && item.slots > 1 ? 'completo' : 'confirmado';
  return { claimers, count, full, state };
}

const CUSTOM_ITEM = { id: CUSTOM_ID, icon: '✨', name: 'Algo diferente', custom: true };

const STATE_LABEL = { disponible: 'Disponible', confirmado: 'Confirmado', completo: 'Completo' };

/* ---------- Render: menú confirmado ---------- */
function renderMenu() {
  const card = (d) => el('article', { class: 'card' },
    el('div', { class: 'card-icon', 'aria-hidden': 'true' }, d.icon),
    el('h4', { class: 'card-name' }, d.name, d.en ? el('small', {}, `(${d.en})`) : null),
    el('p', { class: 'card-owner' }, 'Lo prepara: ', el('strong', {}, d.family)),
    el('span', { class: 'badge badge-confirmado' }, '✓ Confirmado'),
  );
  $('#menu-jones').replaceChildren(...HOST_DISHES.filter((d) => d.family === 'Familia Jones Jocobi').map(card));
  $('#menu-lechuga').replaceChildren(...HOST_DISHES.filter((d) => d.family === 'Familia Lechuga').map(card));
}

/* ---------- Render: contribuciones ---------- */
function renderContributions(highlightId) {
  const mine = myEntryIds();
  const cards = CONTRIBUTIONS.map((item) => {
    const s = statusOf(item);
    const multi = item.slots > 1;
    const iAmIn = s.claimers.some((c) => mine.has(c.id));

    const btn = s.full
      ? el('button', { class: 'btn btn-done', type: 'button', disabled: true }, iAmIn ? '🧡 ¡Tú llevas esto!' : '✓ ¡Ya está cubierto!')
      : swapFrom && swapFrom.itemId === item.id
        ? el('button', { class: 'btn btn-done', type: 'button', disabled: true }, 'Tu contribución actual')
        : el('button', { class: 'btn btn-primary', type: 'button', onclick: () => openDialog(item) }, swapFrom ? '🔄 Cambiar a esto' : 'Yo llevo esto');

    return el('article', {
      class: `card contrib-card${s.full ? ' is-full' : ''}${highlightId === item.id ? ' just-claimed' : ''}`,
      'data-id': item.id,
    },
      el('span', { class: 'chip' }, item.category),
      el('div', { class: 'card-icon', 'aria-hidden': 'true' }, item.icon),
      el('h4', { class: 'card-name' }, item.name, item.en ? el('small', {}, `(${item.en})`) : null),
      el('p', { class: 'suggestion' }, `Sugerido: ${item.suggestion}*`),
      el('span', { class: `badge badge-${s.state}` }, STATE_LABEL[s.state]),
      s.count ? el('ul', { class: 'claimers', 'aria-label': 'Lo llevan' },
        s.claimers.map((c) => claimerItem(c, mine))) : null,
      multi ? el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(item.slots), 'aria-valuenow': String(s.count), 'aria-label': 'Familias registradas' },
        el('span', { style: `width:${Math.min(100, (s.count / item.slots) * 100)}%` })) : null,
      multi ? el('p', { class: 'progress-label' }, `${s.count} de ${item.slots} familias`) : null,
      btn,
    );
  });
  // Lo que los invitados agregaron por su cuenta
  entries.filter((e) => e.itemId === CUSTOM_ID).forEach((e) => {
    cards.push(el('article', { class: `card contrib-card custom-card${highlightId === CUSTOM_ID + ':' + e.dish ? ' just-claimed' : ''}`, 'data-id': CUSTOM_ID + ':' + e.dish },
      el('span', { class: 'chip' }, 'Idea de invitado'),
      el('div', { class: 'card-icon', 'aria-hidden': 'true' }, dishIcon(e.dish)),
      el('h4', { class: 'card-name' }, e.dish),
      el('span', { class: 'badge badge-confirmado' }, 'Confirmado'),
      el('ul', { class: 'claimers', 'aria-label': 'Lo lleva' }, claimerItem(e, mine)),
    ));
  });

  // Tarjeta para agregar algo diferente
  cards.push(el('article', { class: 'card contrib-card add-card', 'data-id': CUSTOM_ID },
    el('span', { class: 'chip' }, 'Opcional'),
    el('div', { class: 'card-icon', 'aria-hidden': 'true' }, '✨'),
    el('h4', { class: 'card-name' }, 'Quiero traer algo diferente', el('small', {}, '(opcional)')),
    el('p', { class: 'add-text' }, 'Un platillo especial, una botana, un postre de la familia… ¡Todo se agradece!'),
    el('button', { class: 'btn btn-primary', type: 'button', onclick: () => openDialog(CUSTOM_ITEM) }, swapFrom ? '🔄 Cambiar a algo diferente' : '➕ Agregar'),
  ));

  const grid = $('#contributions');
  grid.replaceChildren(...cards);
  if (window.__observeGrid) window.__observeGrid(grid);
}

/* Nombre de quien lo lleva; si es tuyo, con botón para cancelar */
function claimerItem(entry, mine) {
  if (!mine.has(entry.id)) return el('li', {}, entry.name);
  return el('li', { class: 'mine' }, entry.name + ' (tú) ', changeButton(entry), cancelButton(entry));
}

const entryLabel = (e) => e.dish || (CONTRIBUTIONS.find((c) => c.id === e.itemId) || {}).name || e.itemId;

function changeButton(entry) {
  return el('button', {
    type: 'button',
    class: 'change-btn',
    'aria-label': 'Cambiar esta contribución por otra',
    onclick: () => startSwap(entry),
  }, 'Cambiar');
}

function startSwap(entry) {
  swapFrom = entry;
  renderSwapBanner();
  renderContributions();
  $('#contribuir').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
}

function endSwap() {
  swapFrom = null;
  renderSwapBanner();
  renderContributions();
}

function renderSwapBanner() {
  const banner = $('#swap-banner');
  if (!swapFrom) { banner.hidden = true; return; }
  banner.hidden = false;
  banner.replaceChildren(
    el('span', {}, '🔄 Elige qué quieres traer en lugar de ', el('strong', {}, entryLabel(swapFrom))),
    el('button', { type: 'button', class: 'btn btn-ghost', onclick: endSwap }, 'No cambiar'),
  );
}

function cancelButton(entry) {
  let armed = false;
  let timer;
  const btn = el('button', {
    type: 'button',
    class: 'cancel-btn',
    'aria-label': 'Cancelar esta contribución',
    onclick: async () => {
      if (!armed) {
        armed = true;
        btn.textContent = '¿Seguro? Toca otra vez';
        btn.classList.add('armed');
        timer = setTimeout(() => { armed = false; btn.textContent = 'Cancelar'; btn.classList.remove('armed'); }, 4000);
        return;
      }
      clearTimeout(timer);
      btn.disabled = true;
      btn.textContent = 'Cancelando…';
      try {
        const res = await apiPost({ action: 'cancel', entryId: entry.id, key: guest && guest.key });
        applyState(res);
        if (res.ok) {
          if (me) me.entryIds = me.entryIds.filter((id) => id !== entry.id);
          showToast('Listo, cancelamos esa contribución. ¡Puedes elegir otra cuando quieras! 🍂');
        } else {
          showToast('No pudimos cancelarla. Actualiza la página e inténtalo de nuevo.', true);
        }
      } catch (err) {
        console.error(err);
        showToast('No hay conexión. Inténtalo de nuevo.', true);
      }
      renderAll();
    },
  }, 'Cancelar');
  return btn;
}

/* ---------- Render: resumen ---------- */
function renderSummary() {
  const rows = [];
  for (const d of HOST_DISHES) {
    rows.push(el('li', {},
      el('span', { class: 's-icon', 'aria-hidden': 'true' }, d.icon),
      el('span', { class: 's-name' }, d.name),
      el('span', { class: 's-who' }, d.family)));
  }
  for (const item of CONTRIBUTIONS) {
    const s = statusOf(item);
    const who = s.count ? s.claimers.map((c) => c.name).join(', ') : 'Disponible';
    rows.push(el('li', {},
      el('span', { class: 's-icon', 'aria-hidden': 'true' }, item.icon),
      el('span', { class: 's-name' }, item.name),
      el('span', { class: 's-who' + (s.count ? '' : ' open') }, who)));
  }
  for (const e of entries.filter((x) => x.itemId === CUSTOM_ID)) {
    rows.push(el('li', {},
      el('span', { class: 's-icon', 'aria-hidden': 'true' }, dishIcon(e.dish)),
      el('span', { class: 's-name' }, e.dish),
      el('span', { class: 's-who' }, e.name)));
  }
  $('#summary-list').replaceChildren(...rows);
  if (lastUpdated) {
    $('#updated-at').textContent = 'Actualizado a las ' +
      lastUpdated.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
  }
}

function renderAll(highlightId) {
  renderContributions(highlightId);
  renderSummary();
  renderRsvp();
}

/* ---------- Cargar datos ---------- */
async function refresh({ quiet = false } = {}) {
  try {
    applyState(await apiList());
    $('#load-error').hidden = true;
    renderAll();
  } catch (err) {
    console.error(err);
    if (!quiet) {
      $('#load-error').hidden = false;
      renderAll();
    }
  }
}

/* ---------- Diálogo ---------- */
const dialog = $('#claim-dialog');

function openDialog(item) {
  currentItem = item;
  $('#dialog-icon').textContent = item.icon;
  $('#dialog-title').textContent = swapFrom
    ? 'Cambiar mi contribución'
    : item.custom ? 'Quiero traer algo diferente' : '¡Gracias por participar!';
  $('#dialog-item').parentElement.hidden = Boolean(item.custom);
  $('#dialog-item').textContent = item.name + (item.en ? ` (${item.en})` : '');
  $('#dialog-suggestion').textContent = (swapFrom ? `Antes: ${entryLabel(swapFrom)}. ` : '') + (item.custom
    ? 'Cuéntanos qué te gustaría compartir con todos.'
    : `Cantidad sugerida: ${item.suggestion}`);
  $('#dish-field').hidden = !item.custom;
  $('#claim-dish').required = Boolean(item.custom);
  $('#claim-dish').value = '';
  $('#dialog-error').textContent = '';
  const input = $('#claim-name');
  input.value = (guest && guest.name) || '';
  $('#claim-email').value = (guest && guest.email) || '';
  setSubmitting(false);
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
  setTimeout(() => (item.custom ? $('#claim-dish') : input).focus(), 50);
}

function closeDialog() {
  if (typeof dialog.close === 'function') dialog.close();
  else dialog.removeAttribute('open');
}

function setSubmitting(on) {
  const b = $('#dialog-submit');
  b.disabled = on;
  b.textContent = on ? 'Guardando…' : swapFrom ? 'Cambiar 🔄' : 'Confirmar 🧡';
}

$('#dialog-cancel').addEventListener('click', closeDialog);
$('#dialog-close').addEventListener('click', closeDialog);
dialog.addEventListener('click', (e) => { if (e.target === dialog) closeDialog(); });

$('#claim-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#claim-name').value.replace(/\s+/g, ' ').trim();
  if (name.length < 2) {
    $('#dialog-error').textContent = 'Por favor escribe tu nombre o el de tu familia.';
    $('#claim-name').focus();
    return;
  }
  const email = $('#claim-email').value.trim();
  if (!validEmail(email)) {
    $('#dialog-error').textContent = 'Escribe un correo válido. Ahí te llegará tu confirmación.';
    $('#claim-email').focus();
    return;
  }
  const item = currentItem;
  let dish;
  if (item.custom) {
    dish = $('#claim-dish').value.replace(/\s+/g, ' ').trim();
    if (dish.length < 2) {
      $('#dialog-error').textContent = 'Escribe qué te gustaría traer.';
      $('#claim-dish').focus();
      return;
    }
    const dup = entries.find((e) => e.itemId === CUSTOM_ID && normalize(e.dish) === normalize(dish));
    if (dup) {
      $('#dialog-error').textContent = `¡${dup.name} ya va a traer ${dup.dish}! ¿Quizás algo diferente?`;
      $('#claim-dish').focus();
      return;
    }
  }
  setSubmitting(true);
  try {
    const result = await apiPost({ action: 'add', itemId: item.id, name, email, dish, key: guest && guest.key });
    applyState(result);

    if (result.ok) {
      if (result.key) {
        rememberGuest({ key: result.key, name, email });
        if (!me) me = { guest: { name, email }, rsvp: null, entryIds: [] };
        me.entryIds.push(result.entryId);
      }
      closeDialog();
      let swapped = null;
      if (swapFrom && result.key) {
        const old = swapFrom;
        try {
          const res2 = await apiPost({ action: 'cancel', entryId: old.id, key: guest.key });
          applyState(res2);
          if (res2.ok) { me.entryIds = me.entryIds.filter((id) => id !== old.id); swapped = old; }
        } catch (err) { console.error(err); }
      }
      swapFrom = null;
      renderSwapBanner();
      const key = item.custom ? CUSTOM_ID + ':' + dish : item.id;
      renderAll(key);
      const what = item.custom ? `${dish} ${dishIcon(dish)}` : `${item.name} ${item.icon}`;
      if (swapped) showToast(`¡Listo! Cambiaste ${entryLabel(swapped)} por ${what} 🔄`);
      else showToast(result.needsLink
        ? `¡Gracias, ${name}! Quedó registrado: ${what}. Te enviamos un correo con tu enlace para hacer cambios.`
        : `¡Gracias, ${name}! Quedó registrado: ${what}. Te enviamos la confirmación por correo 💌`);
      celebrate([...document.querySelectorAll('.contrib-card')].find((c) => c.dataset.id === key));
    } else if (result.error === 'full') {
      closeDialog();
      renderAll();
      showToast('¡Uy! Alguien acaba de elegir esta opción. Elige otra, por favor 🍂', true);
    } else {
      $('#dialog-error').textContent = serverErrorText(result.error);
      setSubmitting(false);
    }
  } catch (err) {
    console.error(err);
    $('#dialog-error').textContent = 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
    setSubmitting(false);
  }
});


/* ---------- Confirmación de asistencia (RSVP) ---------- */
let editingRsvp = false;

function renderRsvp() {
  // Contador público
  const count = $('#rsvp-count');
  if (rsvpTotals && rsvpTotals.families > 0) {
    const people = rsvpTotals.adults + rsvpTotals.kids;
    count.textContent = `👨‍👩‍👧‍👦 Ya confirmaron ${rsvpTotals.families} ${rsvpTotals.families === 1 ? 'familia' : 'familias'} · ${people} ${people === 1 ? 'persona' : 'personas'}`;
    count.hidden = false;
  } else {
    count.hidden = true;
  }

  const panel = $('#rsvp-me');
  const form = $('#rsvp-form');
  const hasRsvp = Boolean(me && me.rsvp);
  form.hidden = hasRsvp && !editingRsvp;
  $('#lost-wrap').hidden = Boolean(me);
  $('#rsvp-submit').textContent = hasRsvp ? 'Guardar cambios' : 'Enviar confirmación 💌';
  $('#rsvp-cancel-edit').hidden = !(hasRsvp && editingRsvp);

  if (!me) { panel.hidden = true; return; }
  panel.hidden = false;
  const r = me.rsvp;
  const mineList = entries.filter((e) => me.entryIds.includes(e.id));
  const itemName = (e) => e.dish || (CONTRIBUTIONS.find((c) => c.id === e.itemId) || {}).name || e.itemId;
  const itemIcon = (e) => e.dish ? dishIcon(e.dish) : (CONTRIBUTIONS.find((c) => c.id === e.itemId) || {}).icon || '🍽️';

  panel.replaceChildren(
    el('p', { class: 'me-hello' }, `¡Hola, ${me.guest.name}! 👋`),
    r
      ? el('p', { class: 'me-status ' + (r.attending === 'si' ? 'yes' : 'no') },
          r.attending === 'si'
            ? `✅ Asistirás · ${r.adults} ${r.adults === 1 ? 'adulto' : 'adultos'}${r.kids ? ` y ${r.kids} ${r.kids === 1 ? 'niño' : 'niños'}` : ''}`
            : '😢 No podrás asistir. ¡Te vamos a extrañar!')
      : el('p', { class: 'me-status pending' }, 'Todavía no confirmas tu asistencia. Llena el formulario de abajo 👇'),
    r && !editingRsvp ? el('button', { type: 'button', class: 'btn btn-ghost', onclick: () => { editingRsvp = true; fillRsvpForm(); renderRsvp(); $('#rsvp-form').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }); } }, '✏️ Cambiar mi respuesta') : null,
    el('div', { class: 'me-contribs' },
      el('p', { class: 'me-label' }, 'Lo que vas a traer'),
      mineList.length
        ? el('ul', {}, mineList.map((e) => el('li', {}, el('span', { 'aria-hidden': 'true' }, itemIcon(e) + ' '), itemName(e) + ' ', changeButton(e), cancelButton(e))))
        : el('p', { class: 'me-empty' }, 'Nada todavía. ', el('a', { href: '#contribuir' }, 'Elige algo para compartir 🥧')),
    ),
    el('p', { class: 'me-note' }, `Te enviamos tus confirmaciones a ${me.guest.email}.`),
  );
}

function fillRsvpForm() {
  const r = me && me.rsvp;
  $('#rsvp-name').value = (r && r.name) || (guest && guest.name) || '';
  $('#rsvp-email').value = (guest && guest.email) || '';
  const attending = r ? r.attending : 'si';
  $('#rsvp-yes').checked = attending === 'si';
  $('#rsvp-no').checked = attending === 'no';
  $('#rsvp-adults').value = r && r.attending === 'si' ? r.adults : 2;
  $('#rsvp-kids').value = r && r.attending === 'si' ? r.kids : 0;
  $('#rsvp-message').value = (r && r.message) || '';
  syncAttending();
}

function syncAttending() {
  $('#rsvp-counts').hidden = $('#rsvp-no').checked;
}

function setupRsvp() {
  const form = $('#rsvp-form');
  form.addEventListener('change', (e) => { if (e.target.name === 'attending') syncAttending(); });
  document.querySelectorAll('.stepper').forEach((st) => {
    const input = st.querySelector('input');
    st.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
      const v = Math.max(0, Math.min(30, (parseInt(input.value, 10) || 0) + Number(b.dataset.step)));
      input.value = v;
    }));
  });
  $('#rsvp-cancel-edit').addEventListener('click', () => { editingRsvp = false; renderRsvp(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#rsvp-error');
    err.textContent = '';
    const name = cleanText($('#rsvp-name').value);
    const email = $('#rsvp-email').value.trim();
    const attending = $('#rsvp-no').checked ? 'no' : 'si';
    const adults = parseInt($('#rsvp-adults').value, 10) || 0;
    const kids = parseInt($('#rsvp-kids').value, 10) || 0;
    if (name.length < 2) { err.textContent = 'Escribe tu nombre o el de tu familia.'; $('#rsvp-name').focus(); return; }
    if (!validEmail(email)) { err.textContent = 'Escribe un correo válido. Ahí te enviaremos la confirmación.'; $('#rsvp-email').focus(); return; }
    if (attending === 'si' && adults + kids < 1) { err.textContent = '¿Cuántas personas vienen? Indica al menos una.'; return; }

    const btn = $('#rsvp-submit');
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = 'Enviando…';
    try {
      const res = await apiPost({ action: 'rsvp', name, email, attending, adults, kids, message: cleanText($('#rsvp-message').value), key: guest && guest.key });
      applyState(res);
      if (res.ok) {
        if (res.key) {
          rememberGuest({ key: res.key, name, email });
          await loadMe();
        }
        editingRsvp = false;
        renderAll();
        if (res.needsLink) {
          showToast(`¡Gracias, ${name}! Guardamos tu respuesta. Revisa tu correo: ahí está tu enlace para hacer cambios 💌`);
        } else {
          showToast(attending === 'si'
            ? `¡Gracias, ${name}! Te esperamos 🦃 Te enviamos la confirmación a tu correo.`
            : `Gracias por avisarnos, ${name}. ¡Te vamos a extrañar! 🧡`);
        }
        if (attending === 'si') celebrate($('#rsvp-me').hidden ? btn : $('#rsvp-me'));
      } else if (res.error === 'needs_link') {
        err.textContent = 'Ya tenemos una respuesta con este correo. Te acabamos de enviar un enlace para que puedas cambiarla. 💌';
      } else {
        err.textContent = serverErrorText(res.error);
      }
    } catch (error) {
      console.error(error);
      err.textContent = 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
    }
    btn.disabled = false;
    btn.textContent = label;
  });

  // ¿Perdiste tu enlace?
  $('#lost-link-btn').addEventListener('click', () => {
    $('#lost-form').hidden = false;
    $('#lost-email').focus();
  });
  $('#lost-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('#lost-email').value.trim();
    if (!validEmail(email)) { $('#lost-msg').textContent = 'Escribe un correo válido.'; return; }
    $('#lost-msg').textContent = 'Enviando…';
    try {
      await apiPost({ action: 'sendLink', email });
      $('#lost-msg').textContent = 'Si ese correo está registrado, te llegará tu enlace en unos minutos. Revisa también la carpeta de spam.';
    } catch {
      $('#lost-msg').textContent = 'No hay conexión. Inténtalo de nuevo.';
    }
  });
}

/* Enlace privado del correo: ?clave=... */
async function handleKeyFromUrl() {
  const params = new URLSearchParams(location.search);
  const key = params.get('clave');
  if (!key) return false;
  params.delete('clave');
  const clean = location.pathname + (params.toString() ? '?' + params : '') + location.hash;
  history.replaceState(null, '', clean);
  guest = { key };
  await loadMe();
  if (me) {
    showToast(`¡Hola, ${me.guest.name}! Desde aquí puedes cambiar tu respuesta y tus contribuciones.`);
    setTimeout(() => $('#rsvp').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' }), 600);
  } else {
    showToast('Ese enlace ya no es válido. Pide uno nuevo con tu correo.', true);
  }
  return true;
}

/* ---------- Confirmación visual ---------- */
let toastTimer;
function showToast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 5000);
}

function celebrate(target, count = 26) {
  if (reducedMotion || !target || !target.animate) return;
  const r = target.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 3;
  const pieces = ['🍁', '🍂', '🧡', '✨', '🍁', '🦃', '🍂', '✨'];
  for (let i = 0; i < count; i++) {
    const p = el('span', { class: 'burst-piece', 'aria-hidden': 'true' }, pieces[i % pieces.length]);
    p.style.left = cx + 'px';
    p.style.top = cy + 'px';
    document.body.append(p);
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 140;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 60;
    p.animate([
      { transform: 'translate(-50%,-50%) scale(.4) rotate(0)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(1) rotate(${Math.random() * 360}deg)`, opacity: 1, offset: .6 },
      { transform: `translate(calc(-50% + ${dx * 1.1}px), calc(-50% + ${dy + 120}px)) scale(.8) rotate(${Math.random() * 720}deg)`, opacity: 0 },
    ], { duration: 1400 + Math.random() * 600, easing: 'cubic-bezier(.2,.7,.3,1)' }).onfinish = () => p.remove();
  }
}

/* ---------- Decoración de la portada ---------- */
function buildLights() {
  const wrap = $('.lights');
  const n = Math.max(8, Math.round(window.innerWidth / 70));
  wrap.replaceChildren(...Array.from({ length: n }, (_, i) => {
    const b = el('span', { class: 'bulb' });
    b.style.marginTop = (Math.sin((i / (n - 1)) * Math.PI) * 22 + 2) + 'px';
    return b;
  }));
}

function buildLeaves() {
  if (reducedMotion) return;
  const colors = ['#D9682A', '#E8B04A', '#B5462B', '#C4561F', '#8E3A22', '#6E7B3A'];
  const maple = 'M50 4 L57 28 L76 18 L70 42 L95 46 L76 58 L84 78 L59 70 L53 92 L47 92 L41 70 L16 78 L24 58 L5 46 L30 42 L24 18 L43 28 Z';
  const oak = 'M50 4 C78 22 86 66 50 96 C14 66 22 22 50 4 Z';
  const count = window.innerWidth < 600 ? 10 : 18;
  const wrap = $('.leaves');
  for (let i = 0; i < count; i++) {
    const leaf = el('span', { class: 'leaf' });
    const color = colors[i % colors.length];
    const shape = i % 3 === 0 ? oak : maple;
    leaf.innerHTML = `<svg viewBox="0 0 100 100"><path d="${shape}" fill="${color}"/><path d="M50 26 V98" stroke="rgba(0,0,0,.25)" stroke-width="3"/></svg>`;
    leaf.style.left = Math.random() * 100 + '%';
    leaf.style.setProperty('--size', 18 + Math.random() * 22 + 'px');
    leaf.style.setProperty('--dur', 9 + Math.random() * 9 + 's');
    leaf.style.setProperty('--delay', -Math.random() * 18 + 's');
    leaf.style.setProperty('--drift', (Math.random() * 160 - 80) + 'px');
    leaf.style.setProperty('--spin', (Math.random() > .5 ? 1 : -1) * (180 + Math.random() * 360) + 'deg');
    leaf.style.setProperty('--sway', 2 + Math.random() * 3 + 's');
    wrap.append(leaf);
  }
}

function updateCountdown() {
  const diff = new Date(CONFIG.EVENT_DATE) - new Date();
  const days = Math.ceil(diff / 86400000);
  let text = '';
  if (days > 1) text = `🍁 ¡Faltan ${days} días! 🍁`;
  else if (days === 1) text = '🍁 ¡Es mañana! 🍁';
  else if (days > -1) text = '🦃 ¡Hoy es el gran día! 🦃';
  else text = '🧡 ¡Gracias por celebrar con nosotros! 🧡';
  $('#countdown').textContent = text;
}

function setupReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window)) {
    items.forEach((i) => i.classList.add('visible'));
    return;
  }
  const io = new IntersectionObserver((list) => {
    list.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });
  items.forEach((i) => io.observe(i));
}


/* ---------- Efectos divertidos ---------- */
const TURKEY_LINES = [
  '¡Gluglú! 🦃',
  '¡Bip, bip! 🚗💨',
  '¡Feliz Thanksgiving! 🍂',
  '¿Quién trae el pay? 🥧',
  '¡Los espero! 😎',
  '¡Yo no soy la cena! 😅',
  '¡Gluglú, gluglú! 🧡',
];
let lineIndex = 0;
let speechTimer;

function turkeySays(text) {
  const bubble = $('#speech');
  bubble.textContent = text;
  bubble.classList.add('show');
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => bubble.classList.remove('show'), 2600);
}

function setupTurkey() {
  const btn = $('#turkey-btn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    turkeySays(TURKEY_LINES[lineIndex++ % TURKEY_LINES.length]);
    btn.classList.remove('honk');
    void btn.offsetWidth; // reinicia la animación
    btn.classList.add('honk');
    celebrate(btn, 14);
  });
  // Saludo automático cuando termina de llegar
  setTimeout(() => turkeySays(TURKEY_LINES[lineIndex++]), reducedMotion ? 400 : 2300);
}

function splitTitle() {
  const title = $('#hero-title');
  if (reducedMotion) return;
  let i = 0;
  title.querySelectorAll('.word').forEach((word) => {
    const text = word.textContent;
    word.textContent = '';
    for (const ch of text) {
      const span = el('span', { class: 'char', 'aria-hidden': 'true' }, ch);
      span.style.setProperty('--i', i++);
      word.append(span);
    }
  });
  title.classList.add('split');
}

function setupTapLeaves() {
  if (reducedMotion) return;
  const hero = $('.hero');
  const emojis = ['🍁', '🍂', '🍃', '✨'];
  hero.addEventListener('pointerdown', (e) => {
    if (e.target.closest('a, button')) return;
    const r = hero.getBoundingClientRect();
    for (let i = 0; i < 7; i++) {
      const leaf = el('span', { class: 'tap-leaf', 'aria-hidden': 'true' }, emojis[i % emojis.length]);
      leaf.style.left = (e.clientX - r.left) + 'px';
      leaf.style.top = (e.clientY - r.top) + 'px';
      hero.append(leaf);
      const a = Math.random() * Math.PI * 2;
      const d = 40 + Math.random() * 70;
      leaf.animate([
        { transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 50}px)) rotate(${Math.random() * 540 - 270}deg) scale(1)`, opacity: 0 },
      ], { duration: 1100 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => leaf.remove();
    }
  });
}

function setupCardGrids() {
  const grids = document.querySelectorAll('.card-grid');
  const show = (grid) => {
    grid.querySelectorAll('.card').forEach((c, n) => c.style.setProperty('--n', n));
    grid.classList.add('shown');
    setTimeout(() => grid.classList.add('settled'), 1400);
  };
  if (reducedMotion || !('IntersectionObserver' in window)) {
    grids.forEach((g) => g.classList.add('shown', 'settled'));
  } else {
    const io = new IntersectionObserver((list) => {
      list.forEach((entry) => {
        if (entry.isIntersecting && entry.target.querySelector('.card')) {
          show(entry.target);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });
    grids.forEach((g) => io.observe(g));
    // por si las tarjetas llegan después de cargar los datos
    window.__observeGrid = (g) => { if (!g.classList.contains('shown')) { io.unobserve(g); io.observe(g); } };
  }

  // Inclinación 3D en computadoras
  if (reducedMotion || !window.matchMedia('(hover: hover)').matches) return;
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.card');
    document.querySelectorAll('.card.tilting').forEach((c) => {
      if (c !== card) { c.classList.remove('tilting'); c.style.transform = ''; }
    });
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    card.classList.add('tilting');
    card.style.transform = `perspective(700px) rotateX(${-y * 8}deg) rotateY(${x * 10}deg) translateY(-4px)`;
  });
}

/* ---------- Inicio ---------- */
function init() {
  splitTitle();
  setupTurkey();
  setupTapLeaves();
  buildLights();
  buildLeaves();
  updateCountdown();
  setupReveal();
  renderMenu();
  setupCardGrids();
  $('#demo-notice').hidden = Boolean(CONFIG.API_URL);

  setupRsvp();
  guest = storageGet(GUEST_KEY, null);
  (async () => {
    const fromLink = await handleKeyFromUrl();
    if (!fromLink) await loadMe();
    fillRsvpForm();
    await refresh();
  })();
  $('#refresh-btn').addEventListener('click', async () => {
    const b = $('#refresh-btn');
    b.disabled = true;
    await refresh();
    b.disabled = false;
    showToast('Lista actualizada 🍂');
  });
  $('#retry-btn').addEventListener('click', () => refresh());

  // Mantener la información al día mientras la página está abierta
  setInterval(() => {
    if (document.visibilityState === 'visible' && !dialog.open && !editingRsvp) refresh({ quiet: true });
  }, CONFIG.REFRESH_SECONDS * 1000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refresh({ quiet: true });
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(buildLights, 200);
  });
}

init();
