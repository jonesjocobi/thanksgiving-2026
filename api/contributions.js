/**
 * Thanksgiving 2026 · Familia Jones Jocobi
 * Servicio de contribuciones con MongoDB Atlas (función serverless de Vercel).
 *
 * Variables de entorno en Vercel:
 *   MONGODB_URI     → cadena de conexión de MongoDB Atlas (mongodb+srv://...)
 *   ALLOWED_ORIGIN  → (opcional) tu sitio, ej. https://usuario.github.io
 *
 * Instrucciones completas en README.md → "Opción B: MongoDB".
 */
const { MongoClient } = require('mongodb');

// Debe coincidir con CONTRIBUTIONS en script.js (id y slots)
const ITEMS = {
  'refrescos':    { name: 'Refrescos (Soda)',              slots: 2 },
  'vino-tinto':   { name: 'Vino tinto',                    slots: 1 },
  'vino-blanco':  { name: 'Vino blanco',                   slots: 1 },
  'pay-calabaza': { name: 'Pay de calabaza (Pumpkin Pie)', slots: 2 },
};

// Contribuciones libres que escriben los invitados (sin límite)
const CUSTOM_ID = 'otro';

let clientPromise;
async function getCollection() {
  if (!clientPromise) {
    if (!process.env.MONGODB_URI) throw new Error('Falta la variable MONGODB_URI');
    clientPromise = new MongoClient(process.env.MONGODB_URI).connect().then(async (client) => {
      const col = client.db('thanksgiving2026').collection('contributions');
      // Un lugar (slot) por contribución solo puede ocuparse una vez → evita duplicados
      await col.createIndex({ itemId: 1, slot: 1 }, { unique: true, partialFilterExpression: { slot: { $exists: true } } });
      return client;
    });
  }
  const client = await clientPromise;
  return client.db('thanksgiving2026').collection('contributions');
}

async function listEntries(col) {
  const docs = await col.find({}, { projection: { _id: 0, itemId: 1, name: 1, dish: 1, ts: 1 } }).sort({ ts: 1 }).toArray();
  return docs.map((d) => ({ itemId: d.itemId, name: d.name, ...(d.dish ? { dish: d.dish } : {}), ts: d.ts.toISOString() }));
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return Promise.resolve(req.body);
  if (typeof req.body === 'string') return Promise.resolve(JSON.parse(req.body));
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 10000) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const col = await getCollection();

    if (req.method === 'GET') {
      return res.status(200).json({ ok: true, entries: await listEntries(col) });
    }
    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'method' });

    let data;
    try { data = await readBody(req); } catch { return res.status(400).json({ ok: false, error: 'bad_request' }); }
    if (data.action !== 'add') return res.status(400).json({ ok: false, error: 'bad_action' });

    const clean = (v) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const name = clean(data.name);
    if (name.length < 2) return res.status(400).json({ ok: false, error: 'missing_name' });

    // Contribución libre: sin límite
    if (data.itemId === CUSTOM_ID) {
      const dish = clean(data.dish);
      if (dish.length < 2) return res.status(400).json({ ok: false, error: 'missing_dish' });
      await col.insertOne({ itemId: CUSTOM_ID, dish, name, ts: new Date() });
      return res.status(200).json({ ok: true, entries: await listEntries(col) });
    }

    const item = ITEMS[data.itemId];
    if (!item) return res.status(400).json({ ok: false, error: 'bad_item' });

    // Busca el primer lugar libre; el índice único rechaza a quien llegue tarde
    for (let attempt = 0; attempt < 3; attempt++) {
      const taken = await col.distinct('slot', { itemId: data.itemId });
      let slot = 0;
      while (taken.includes(slot)) slot++;
      if (slot >= item.slots) {
        return res.status(200).json({ ok: false, error: 'full', entries: await listEntries(col) });
      }
      try {
        await col.insertOne({ itemId: data.itemId, slot, item: item.name, name, ts: new Date() });
        return res.status(200).json({ ok: true, entries: await listEntries(col) });
      } catch (err) {
        if (err.code !== 11000) throw err; // 11000 = otro invitado tomó ese lugar; reintentar
      }
    }
    return res.status(200).json({ ok: false, error: 'full', entries: await listEntries(col) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ ok: false, error: 'server' });
  }
};
