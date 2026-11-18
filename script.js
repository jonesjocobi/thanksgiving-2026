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
  { id: 'vino-tinto',   category: 'Bebidas', icon: '🍷', name: 'Vino tinto',                         suggestion: '2–3 botellas',             slots: 1 },
  { id: 'vino-blanco',  category: 'Bebidas', icon: '🥂', name: 'Vino blanco',                        suggestion: '2–3 botellas',             slots: 1 },
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

const LOCAL_KEY = 'tg26-entries';  // modo de prueba
const MINE_KEY = 'tg26-mine';      // lo que este dispositivo registró

let entries = [];
let currentItem = null;
let lastUpdated = null;

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

/* ---------- Comunicación con el servicio ---------- */
async function apiList() {
  if (!CONFIG.API_URL) return storageGet(LOCAL_KEY, []);
  const res = await fetch(CONFIG.API_URL + (CONFIG.API_URL.includes('?') ? '&' : '?') + 't=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'error');
  return data.entries || [];
}

async function apiAdd(itemId, name, dish) {
  if (!CONFIG.API_URL) {
    const list = storageGet(LOCAL_KEY, []);
    const item = CONTRIBUTIONS.find((c) => c.id === itemId);
    if (item && list.filter((e) => e.itemId === itemId).length >= item.slots) {
      return { ok: false, error: 'full', entries: list };
    }
    list.push(itemId === CUSTOM_ID ? { itemId, name, dish, ts: new Date().toISOString() } : { itemId, name, ts: new Date().toISOString() });
    storageSet(LOCAL_KEY, list);
    return { ok: true, entries: list };
  }
  // text/plain evita la verificación CORS previa (necesario para Google Apps Script)
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'add', itemId, name, dish }),
  });
  return res.json();
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
  const mine = storageGet(MINE_KEY, []);
  const cards = CONTRIBUTIONS.map((item) => {
    const s = statusOf(item);
    const multi = item.slots > 1;
    const iAmIn = s.claimers.some((c) => mine.some((m) => m.itemId === item.id && m.name === c.name));

    const btn = s.full
      ? el('button', { class: 'btn btn-done', type: 'button', disabled: true }, iAmIn ? '🧡 ¡Tú llevas esto!' : '✓ ¡Ya está cubierto!')
      : el('button', { class: 'btn btn-primary', type: 'button', onclick: () => openDialog(item) }, 'Yo llevo esto');

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
        s.claimers.map((c) => el('li', {
          class: mine.some((m) => m.itemId === item.id && m.name === c.name) ? 'mine' : '',
        }, c.name))) : null,
      multi ? el('div', { class: 'progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(item.slots), 'aria-valuenow': String(s.count), 'aria-label': 'Familias registradas' },
        el('span', { style: `width:${Math.min(100, (s.count / item.slots) * 100)}%` })) : null,
      multi ? el('p', { class: 'progress-label' }, `${s.count} de ${item.slots} familias`) : null,
      btn,
    );
  });
  // Lo que los invitados agregaron por su cuenta
  entries.filter((e) => e.itemId === CUSTOM_ID).forEach((e) => {
    const isMine = mine.some((m) => m.itemId === CUSTOM_ID && m.name === e.name && m.dish === e.dish);
    cards.push(el('article', { class: `card contrib-card custom-card${highlightId === CUSTOM_ID + ':' + e.dish ? ' just-claimed' : ''}`, 'data-id': CUSTOM_ID + ':' + e.dish },
      el('span', { class: 'chip' }, 'Idea de invitado'),
      el('div', { class: 'card-icon', 'aria-hidden': 'true' }, dishIcon(e.dish)),
      el('h4', { class: 'card-name' }, e.dish),
      el('span', { class: 'badge badge-confirmado' }, 'Confirmado'),
      el('ul', { class: 'claimers', 'aria-label': 'Lo lleva' }, el('li', { class: isMine ? 'mine' : '' }, e.name)),
    ));
  });

  // Tarjeta para agregar algo diferente
  cards.push(el('article', { class: 'card contrib-card add-card', 'data-id': CUSTOM_ID },
    el('span', { class: 'chip' }, 'Opcional'),
    el('div', { class: 'card-icon', 'aria-hidden': 'true' }, '✨'),
    el('h4', { class: 'card-name' }, 'Quiero traer algo diferente', el('small', {}, '(opcional)')),
    el('p', { class: 'add-text' }, 'Un platillo especial, una botana, un postre de la familia… ¡Todo se agradece!'),
    el('button', { class: 'btn btn-primary', type: 'button', onclick: () => openDialog(CUSTOM_ITEM) }, '➕ Agregar'),
  ));

  const grid = $('#contributions');
  grid.replaceChildren(...cards);
  if (window.__observeGrid) window.__observeGrid(grid);
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
}

/* ---------- Cargar datos ---------- */
async function refresh({ quiet = false } = {}) {
  try {
    entries = await apiList();
    lastUpdated = new Date();
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
  $('#dialog-title').textContent = item.custom ? 'Quiero traer algo diferente' : '¡Gracias por participar!';
  $('#dialog-item').parentElement.hidden = Boolean(item.custom);
  $('#dialog-item').textContent = item.name + (item.en ? ` (${item.en})` : '');
  $('#dialog-suggestion').textContent = item.custom
    ? 'Cuéntanos qué te gustaría compartir con todos.'
    : `Cantidad sugerida: ${item.suggestion}`;
  $('#dish-field').hidden = !item.custom;
  $('#claim-dish').required = Boolean(item.custom);
  $('#claim-dish').value = '';
  $('#dialog-error').textContent = '';
  const input = $('#claim-name');
  input.value = storageGet('tg26-lastname', '');
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
  b.textContent = on ? 'Guardando…' : 'Confirmar 🧡';
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
    const result = await apiAdd(item.id, name, dish);
    if (result.entries) entries = result.entries;
    lastUpdated = new Date();

    if (result.ok) {
      const mine = storageGet(MINE_KEY, []);
      mine.push(item.custom ? { itemId: item.id, name, dish } : { itemId: item.id, name });
      storageSet(MINE_KEY, mine);
      storageSet('tg26-lastname', name);
      closeDialog();
      const key = item.custom ? CUSTOM_ID + ':' + dish : item.id;
      renderAll(key);
      showToast(item.custom
        ? `¡Gracias, ${name}! Quedó registrado: ${dish} ${dishIcon(dish)}`
        : `¡Gracias, ${name}! Quedó registrado: ${item.name} ${item.icon}`);
      celebrate([...document.querySelectorAll('.contrib-card')].find((c) => c.dataset.id === key));
    } else if (result.error === 'full') {
      closeDialog();
      renderAll();
      showToast('¡Uy! Alguien acaba de elegir esta opción. Elige otra, por favor 🍂', true);
    } else {
      $('#dialog-error').textContent = 'No se pudo guardar. Inténtalo de nuevo.';
      setSubmitting(false);
    }
  } catch (err) {
    console.error(err);
    $('#dialog-error').textContent = 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
    setSubmitting(false);
  }
});

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

  refresh();
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
    if (document.visibilityState === 'visible' && !dialog.open) refresh({ quiet: true });
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
