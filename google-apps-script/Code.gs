/**
 * Thanksgiving 2026 · Familia Jones Jocobi
 * Servicio de contribuciones con Google Sheets (Apps Script).
 *
 * Instrucciones completas en README.md → "Opción A: Google Sheets".
 */

const SHEET_NAME = 'Contribuciones';

// Contribuciones libres que escriben los invitados (sin límite)
const CUSTOM_ID = 'otro';

// Debe coincidir con CONTRIBUTIONS en script.js (id y slots)
const ITEMS = {
  'refrescos':    { name: 'Refrescos (Soda)',              slots: 2 },
  'vino-tinto':   { name: 'Vino tinto',                    slots: 1 },
  'vino-blanco':  { name: 'Vino blanco',                   slots: 1 },
  'pay-calabaza': { name: 'Pay de calabaza (Pumpkin Pie)', slots: 2 },
};

/** Lista de contribuciones: GET https://script.google.com/.../exec */
function doGet() {
  return json({ ok: true, entries: readEntries() });
}

/** Registrar contribución: POST {"action":"add","itemId":"...","name":"..."} */
function doPost(e) {
  let data;
  try {
    data = JSON.parse(e.postData.contents);
  } catch (err) {
    return json({ ok: false, error: 'bad_request' });
  }
  if (data.action !== 'add') return json({ ok: false, error: 'bad_action' });

  const isCustom = data.itemId === CUSTOM_ID;
  const item = ITEMS[data.itemId];
  if (!item && !isCustom) return json({ ok: false, error: 'bad_item' });

  const name = safeText(data.name);
  if (name.length < 2) return json({ ok: false, error: 'missing_name' });
  const dish = isCustom ? safeText(data.dish) : '';
  if (isCustom && dish.length < 2) return json({ ok: false, error: 'missing_dish' });

  // El candado evita que dos personas tomen el último lugar al mismo tiempo
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const entries = readEntries();
    if (isCustom) {
      getSheet().appendRow([new Date(), CUSTOM_ID, dish, name]);
      SpreadsheetApp.flush();
      return json({ ok: true, entries: readEntries() });
    }
    const taken = entries.filter(function (x) { return x.itemId === data.itemId; }).length;
    if (taken >= item.slots) return json({ ok: false, error: 'full', entries: entries });

    getSheet().appendRow([new Date(), data.itemId, item.name, name]);
    SpreadsheetApp.flush();
    return json({ ok: true, entries: readEntries() });
  } finally {
    lock.releaseLock();
  }
}

/** Limpia el texto y evita que algo como "=FORMULA()" se ejecute en la hoja */
function safeText(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 60);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(['Fecha', 'ID', 'Contribución', 'Nombre / Familia']);
    sheet.setFrozenRows(1);
    sheet.getRange('A1:D1').setFontWeight('bold');
  }
  return sheet;
}

function readEntries() {
  const sheet = getSheet();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 4).getValues()
    .filter(function (r) { return r[1] && r[3]; })
    .map(function (r) {
      const entry = {
        itemId: String(r[1]),
        name: String(r[3]).replace(/^'/, ''),
        ts: r[0] instanceof Date ? r[0].toISOString() : String(r[0]),
      };
      if (entry.itemId === CUSTOM_ID) entry.dish = String(r[2]).replace(/^'/, '');
      return entry;
    });
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/** Ejecuta esta función una vez desde el editor para crear la hoja y autorizar permisos. */
function setup() {
  getSheet();
  Logger.log('¡Listo! Hoja "' + SHEET_NAME + '" creada. Ahora: Implementar → Nueva implementación.');
}
