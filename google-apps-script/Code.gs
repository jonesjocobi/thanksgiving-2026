/**
 * Thanksgiving 2026 · Familia Jones Jocobi
 * Servicio de la invitación con Google Sheets (Apps Script):
 *   • Contribuciones ("Yo llevo esto" y "Quiero traer algo diferente")
 *   • Confirmación de asistencia (RSVP)
 *   • Correos de confirmación con enlace privado para modificar
 *   • Recordatorios por correo
 *
 * Instrucciones completas en README.md → "Opción A: Google Sheets".
 * Después de cambiar este código: Implementar → Administrar implementaciones
 * → ✏️ → Versión: "Nueva versión" → Implementar (la URL no cambia).
 */

/* ============ ⚙️ CONFIGURACIÓN ============ */
const SITE_URL = 'https://jonesjocobi.github.io/thanksgiving-2026/';
const HOSTS = 'Familia Jones Jocobi';
const EVENT = {
  fecha: 'Jueves 26 de noviembre de 2026',
  horario: 'Llegada: cuando gusten · Cena: 5:00 p.m.',
  direccion: '12089 Rue Des Amis, San Diego, CA 92131',
  mapa: 'https://www.google.com/maps/search/?api=1&query=12089+Rue+Des+Amis,+San+Diego,+CA+92131',
};
// Recibir un correo cada vez que alguien confirma asistencia
const NOTIFY_HOST = true;
// Fecha del recordatorio automático (ejecuta scheduleReminder una vez)
const REMINDER_AT = '2026-11-25T10:00:00-08:00';

// Debe coincidir con CONTRIBUTIONS en script.js (id y slots)
const ITEMS = {
  'refrescos':    { name: 'Refrescos (Soda)',              slots: 2 },
  'vino-tinto':   { name: 'Vino tinto',                    slots: 3 },
  'vino-blanco':  { name: 'Vino blanco',                   slots: 3 },
  'pay-calabaza': { name: 'Pay de calabaza (Pumpkin Pie)', slots: 2 },
};
const CUSTOM_ID = 'otro'; // contribuciones libres (sin límite)

/* ============ Hojas ============ */
const SHEETS = {
  contrib: { name: 'Contribuciones', header: ['Fecha', 'ID entrada', 'ID', 'Contribución', 'Nombre / Familia', 'Correo'] },
  rsvp:    { name: 'RSVP',           header: ['Actualizado', 'Correo', 'Nombre / Familia', '¿Asiste?', 'Adultos', 'Niños', 'Mensaje'] },
  guests:  { name: 'Invitados',      header: ['Correo', 'Nombre', 'Clave', 'Creado'] },
};

/* ============ Entrada web ============ */
function doGet() {
  return json(publicState());
}

function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad_request' });
  }
  const actions = { add: addContribution, rsvp: saveRsvp, cancel: cancelContribution, me: whoAmI, sendLink: sendLink };
  const fn = actions[data.action];
  if (!fn) return json({ ok: false, error: 'bad_action' });

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return json(fn(data));
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: 'server' });
  } finally {
    lock.releaseLock();
  }
}

/* ============ Acciones ============ */
function addContribution(data) {
  const isCustom = data.itemId === CUSTOM_ID;
  const item = ITEMS[data.itemId];
  if (!item && !isCustom) return { ok: false, error: 'bad_item' };
  const name = safeText(data.name);
  if (name.length < 2) return { ok: false, error: 'missing_name' };
  const email = cleanEmail(data.email);
  if (!email) return { ok: false, error: 'bad_email' };
  const dish = isCustom ? safeText(data.dish) : '';
  if (isCustom && dish.length < 2) return { ok: false, error: 'missing_dish' };

  const entries = readEntries();
  if (!isCustom && entries.filter(function (x) { return x.itemId === data.itemId; }).length >= item.slots) {
    return Object.assign(publicState(entries), { ok: false, error: 'full' });
  }

  const auth = identify(email, name, data.key);
  const id = Utilities.getUuid().slice(0, 8);
  sheet('contrib').appendRow([new Date(), id, data.itemId, isCustom ? dish : item.name, name, email]);
  SpreadsheetApp.flush();
  sendGuestEmail(email, 'confirm');

  return Object.assign(publicState(), { ok: true, entryId: id, key: auth.key, needsLink: !auth.key });
}

function saveRsvp(data) {
  const name = safeText(data.name);
  if (name.length < 2) return { ok: false, error: 'missing_name' };
  const email = cleanEmail(data.email);
  if (!email) return { ok: false, error: 'bad_email' };
  const attending = data.attending === 'no' ? 'No' : 'Sí';
  const adults = attending === 'Sí' ? clampInt(data.adults, 0, 30) : 0;
  const kids = attending === 'Sí' ? clampInt(data.kids, 0, 30) : 0;
  if (attending === 'Sí' && adults + kids < 1) return { ok: false, error: 'bad_count' };
  const message = safeText(data.message, 300);

  const existing = findRsvpRow(email);
  const auth = identify(email, name, data.key);
  if (existing && !auth.key) {
    // Ya hay una respuesta con este correo: solo su dueño puede cambiarla
    sendGuestEmail(email, 'link');
    return { ok: false, error: 'needs_link' };
  }
  const row = [new Date(), email, name, attending, adults, kids, message];
  if (existing) sheet('rsvp').getRange(existing, 1, 1, row.length).setValues([row]);
  else sheet('rsvp').appendRow(row);
  SpreadsheetApp.flush();

  sendGuestEmail(email, 'confirm');
  if (NOTIFY_HOST) notifyHost(name, attending, adults, kids, message, Boolean(existing));

  return Object.assign(publicState(), { ok: true, key: auth.key, needsLink: !auth.key });
}

function cancelContribution(data) {
  const guest = guestByKey(data.key);
  if (!guest) return { ok: false, error: 'not_allowed' };
  const sh = sheet('contrib');
  const last = sh.getLastRow();
  if (last >= 2) {
    const rows = sh.getRange(2, 1, last - 1, 6).getValues();
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][1]) === String(data.entryId) && cleanEmail(rows[i][5]) === guest.email) {
        sh.deleteRow(i + 2);
        SpreadsheetApp.flush();
        return Object.assign(publicState(), { ok: true });
      }
    }
  }
  return Object.assign(publicState(), { ok: false, error: 'not_found' });
}

function whoAmI(data) {
  const guest = guestByKey(data.key);
  if (!guest) return { ok: false, error: 'not_allowed' };
  return { ok: true, guest: { name: guest.name, email: guest.email }, rsvp: rsvpFor(guest.email), entryIds: entriesFor(guest.email).map(function (x) { return x.id; }) };
}

function sendLink(data) {
  const email = cleanEmail(data.email);
  if (email && findGuest(email)) sendGuestEmail(email, 'link');
  // Siempre responde igual para no revelar qué correos están registrados
  return { ok: true };
}

/* ============ Identidad (enlace privado por correo) ============ */
function identify(email, name, key) {
  const guest = findGuest(email);
  if (!guest) {
    const newKey = Utilities.getUuid().replace(/-/g, '');
    sheet('guests').appendRow([email, name, newKey, new Date()]);
    return { key: newKey, isNew: true };
  }
  if (key && String(key) === guest.key) return { key: guest.key, isNew: false };
  return { key: null, isNew: false };
}

function findGuest(email) {
  const sh = sheet('guests');
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 3).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (cleanEmail(rows[i][0]) === email) return { email: email, name: String(rows[i][1]), key: String(rows[i][2]) };
  }
  return null;
}

function guestByKey(key) {
  if (!key || String(key).length < 20) return null;
  const sh = sheet('guests');
  const last = sh.getLastRow();
  if (last < 2) return null;
  const rows = sh.getRange(2, 1, last - 1, 3).getValues();
  for (let i = 0; i < rows.length; i++) {
    if (String(rows[i][2]) === String(key)) return { email: cleanEmail(rows[i][0]), name: String(rows[i][1]), key: String(key) };
  }
  return null;
}

/* ============ Lectura ============ */
function readEntries() {
  const sh = sheet('contrib');
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 6).getValues()
    .filter(function (r) { return r[2] && r[4]; })
    .map(function (r) {
      const entry = {
        id: String(r[1]),
        itemId: String(r[2]),
        name: unquote(r[4]),
        email: cleanEmail(r[5]),
        ts: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      };
      if (entry.itemId === CUSTOM_ID) entry.dish = unquote(r[3]);
      return entry;
    });
}

function readRsvps() {
  const sh = sheet('rsvp');
  const last = sh.getLastRow();
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, 7).getValues()
    .filter(function (r) { return r[1]; })
    .map(function (r) {
      return { email: cleanEmail(r[1]), name: unquote(r[2]), attending: r[3] === 'No' ? 'no' : 'si', adults: Number(r[4]) || 0, kids: Number(r[5]) || 0, message: unquote(r[6]) };
    });
}

// Lo que cualquier visitante puede ver (sin correos ni claves)
function publicState(entries) {
  const list = (entries || readEntries()).map(function (x) {
    const pub = { id: x.id, itemId: x.itemId, name: x.name, ts: x.ts };
    if (x.dish) pub.dish = x.dish;
    return pub;
  });
  const yes = readRsvps().filter(function (r) { return r.attending === 'si'; });
  return {
    ok: true,
    entries: list,
    rsvp: {
      families: yes.length,
      adults: yes.reduce(function (s, r) { return s + r.adults; }, 0),
      kids: yes.reduce(function (s, r) { return s + r.kids; }, 0),
    },
  };
}

function findRsvpRow(email) {
  const sh = sheet('rsvp');
  const last = sh.getLastRow();
  if (last < 2) return 0;
  const emails = sh.getRange(2, 2, last - 1, 1).getValues();
  for (let i = 0; i < emails.length; i++) if (cleanEmail(emails[i][0]) === email) return i + 2;
  return 0;
}

function rsvpFor(email) {
  const r = readRsvps().filter(function (x) { return x.email === email; })[0];
  return r ? { attending: r.attending, adults: r.adults, kids: r.kids, message: r.message, name: r.name } : null;
}

function entriesFor(email) {
  return readEntries().filter(function (x) { return x.email === email; });
}

/* ============ Correos ============ */
function sendGuestEmail(email, kind) {
  const guest = findGuest(email);
  if (!guest) return;
  const rsvp = rsvpFor(email);
  const mine = entriesFor(email);
  const link = SITE_URL + '?clave=' + guest.key;
  const name = (rsvp && rsvp.name) || guest.name;

  let subject, intro;
  if (kind === 'reminder') {
    subject = '🦃 ¡Ya casi es Thanksgiving! Te esperamos este jueves';
    intro = '<p>¡Hola, <b>' + esc(name) + '</b>! Te recordamos que este jueves celebramos Thanksgiving juntos. ¡Te esperamos con mucho cariño!</p>';
  } else if (kind === 'link') {
    subject = '🍂 Tu enlace para modificar tu respuesta · Thanksgiving 2026';
    intro = '<p>¡Hola, <b>' + esc(name) + '</b>! Aquí está tu enlace personal para ver o cambiar tu confirmación y tus contribuciones.</p>';
  } else {
    subject = '🧡 ¡Recibimos tu respuesta! · Thanksgiving 2026';
    intro = '<p>¡Gracias, <b>' + esc(name) + '</b>! Esto es lo que tenemos registrado:</p>';
  }

  let summary = '';
  if (rsvp) {
    summary += rsvp.attending === 'si'
      ? '<p>✅ <b>Asistirás</b> · ' + rsvp.adults + ' adulto(s)' + (rsvp.kids ? ' y ' + rsvp.kids + ' niño(s)' : '') + '</p>'
      : '<p>😢 <b>No podrás asistir.</b> ¡Te vamos a extrañar!</p>';
  }
  if (mine.length) {
    summary += '<p><b>Vas a traer:</b></p><ul>' + mine.map(function (x) {
      return '<li>' + esc(x.dish || (ITEMS[x.itemId] ? ITEMS[x.itemId].name : x.itemId)) + '</li>';
    }).join('') + '</ul>';
  } else if (kind !== 'link') {
    summary += '<p>Si quieres, todavía puedes elegir algo para compartir en la invitación. 🥧</p>';
  }

  const html =
    '<div style="font-family:Georgia,serif;max-width:560px;margin:auto;color:#3A2418;background:#FBF4E6;padding:28px;border-radius:14px">' +
    '<h1 style="color:#7A2E2E;margin:0 0 4px">🦃 Thanksgiving 2026</h1>' +
    '<p style="color:#B5501C;margin:0 0 18px"><i>Celebremos juntos en familia</i></p>' +
    '<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.6">' + intro + summary +
    '<p style="background:#fff;padding:12px 16px;border-radius:10px;border-left:4px solid #E8B04A">' +
    '🗓️ ' + EVENT.fecha + '<br>🕒 ' + EVENT.horario + '<br>📍 <a href="' + EVENT.mapa + '" style="color:#7A2E2E">' + EVENT.direccion + '</a></p>' +
    '<p style="text-align:center;margin:24px 0"><a href="' + link + '" style="background:#D9682A;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:bold">Ver o cambiar mi respuesta</a></p>' +
    '<p style="font-size:12px;color:#8A6A4F">Este enlace es personal: no lo compartas. Con él puedes cambiar tu confirmación o tus contribuciones desde cualquier teléfono o computadora.</p>' +
    '</div><p style="font-size:20px;color:#7A2E2E;margin:20px 0 0">Con cariño, ' + HOSTS + ' 🧡</p></div>';

  MailApp.sendEmail({ to: email, subject: subject, htmlBody: html, name: HOSTS });
}

function notifyHost(name, attending, adults, kids, message, updated) {
  const owner = Session.getEffectiveUser().getEmail();
  if (!owner) return;
  const totals = publicState().rsvp;
  MailApp.sendEmail({
    to: owner,
    subject: (updated ? '✏️ Cambio de RSVP: ' : '🦃 Nuevo RSVP: ') + name + ' (' + attending + ')',
    htmlBody: '<p><b>' + esc(name) + '</b> ' + (attending === 'Sí' ? 'asistirá con ' + adults + ' adulto(s) y ' + kids + ' niño(s).' : 'no podrá asistir.') + '</p>' +
      (message ? '<p>Mensaje: <i>' + esc(message) + '</i></p>' : '') +
      '<p>Total confirmado: <b>' + totals.families + '</b> familia(s) · ' + totals.adults + ' adultos · ' + totals.kids + ' niños.</p>',
    name: 'Invitación Thanksgiving 2026',
  });
}

/**
 * ▶ Envía un recordatorio a todos los que confirmaron asistencia
 * (o eligieron una contribución y no dijeron que no van).
 * Puedes ejecutarla a mano desde el editor, o programarla con scheduleReminder().
 */
function sendReminders() {
  const declined = {};
  readRsvps().forEach(function (r) { if (r.attending === 'no') declined[r.email] = true; });
  const emails = {};
  readRsvps().forEach(function (r) { if (r.attending === 'si') emails[r.email] = true; });
  readEntries().forEach(function (x) { if (x.email && !declined[x.email]) emails[x.email] = true; });
  const list = Object.keys(emails);
  list.forEach(function (email) { sendGuestEmail(email, 'reminder'); });
  Logger.log('Recordatorios enviados: ' + list.length + ' · Correos disponibles hoy: ' + MailApp.getRemainingDailyQuota());
  return list.length;
}

/** ▶ Ejecuta una vez para programar el recordatorio automático en REMINDER_AT. */
function scheduleReminder() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'sendReminders') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendReminders').timeBased().at(new Date(REMINDER_AT)).create();
  Logger.log('Recordatorio programado para ' + new Date(REMINDER_AT));
}

/* ============ Utilidades ============ */
function sheet(kind) {
  const def = SHEETS[kind];
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(def.name);
  if (!sh) {
    sh = ss.insertSheet(def.name);
    sh.appendRow(def.header);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, def.header.length).setFontWeight('bold');
    if (kind === 'guests') sh.hideSheet();
  }
  return sh;
}

// Convierte la hoja de la versión anterior (4 columnas) al formato nuevo
function migrateContributions() {
  const sh = sheet('contrib');
  const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  if (header[1] === 'ID entrada') return;
  sh.insertColumnAfter(1);
  sh.getRange(1, 1, 1, 6).setValues([SHEETS.contrib.header]).setFontWeight('bold');
  const last = sh.getLastRow();
  if (last >= 2) {
    const ids = [];
    for (let i = 2; i <= last; i++) ids.push([Utilities.getUuid().slice(0, 8)]);
    sh.getRange(2, 2, last - 1, 1).setValues(ids);
  }
}

function safeText(value, max) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, max || 60);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
function unquote(v) { return String(v || '').replace(/^'/, ''); }
function cleanEmail(v) {
  const e = String(v || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120 ? e : '';
}
function clampInt(v, min, max) { const n = parseInt(v, 10); return isNaN(n) ? min : Math.max(min, Math.min(max, n)); }
function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** ▶ Ejecuta esta función una vez (y otra vez después de actualizar el código) para crear las hojas y autorizar los permisos de correo. */
function setup() {
  sheet('contrib'); sheet('rsvp'); sheet('guests');
  migrateContributions();
  Logger.log('¡Listo! Hojas creadas. Correos disponibles hoy: ' + MailApp.getRemainingDailyQuota() +
    ' · Dueño: ' + Session.getEffectiveUser().getEmail());
}
