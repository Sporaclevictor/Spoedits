// Shared helpers for all Spoedit API routes (Vercel serverless, Node 20, no dependencies)
const crypto = require('crypto');

const DB_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const DB_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

const SERVICES = {
  passport: 'Passport photo',
  enhance: 'Blurry photo fix',
  iphone: 'iPhone look',
  poster: 'Poster & flyer',
  invoice: 'Invoice & receipt',
  idcard: 'ID card',
  doc: 'Document edit'
};
const DEFAULT_PRICE = 500;
const FREE_TRIALS = Number(process.env.FREE_TRIALS || 2);
const FREE_PER_IP = Number(process.env.FREE_PER_IP || 10); // shared mobile networks are common, so keep this generous

async function redis(...cmd) {
  if (!DB_URL || !DB_TOKEN) throw new Error('DB_NOT_CONFIGURED');
  const r = await fetch(DB_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + DB_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

function send(res, status, obj) {
  res.status(status).setHeader('Cache-Control', 'no-store').json(obj);
}
function fail(res, e) {
  if (e && e.message === 'DB_NOT_CONFIGURED') return send(res, 503, { error: 'db_not_configured' });
  console.error(e);
  return send(res, 500, { error: 'server_error' });
}
function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

const uidOk = s => typeof s === 'string' && /^[a-zA-Z0-9-]{16,64}$/.test(s);

function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.length === 11 && d.startsWith('0')) d = '234' + d.slice(1);
  return d.length >= 10 && d.length <= 15 ? d : '';
}

function ipHash(req) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || (req.socket && req.socket.remoteAddress) || '';
  return crypto.createHash('sha256').update(ip + (process.env.ADMIN_SECRET || '')).digest('hex').slice(0, 24);
}

async function getPrices() {
  let stored = {};
  try { stored = JSON.parse((await redis('GET', 'spo:prices')) || '{}'); } catch {}
  const out = {};
  for (const k of Object.keys(SERVICES)) {
    const v = Number(stored[k]);
    out[k] = Number.isFinite(v) && v >= 0 ? v : DEFAULT_PRICE;
  }
  return out;
}

// Payment options you control from /admin
async function getSettings() {
  let s = {};
  try { s = JSON.parse((await redis('GET', 'spo:settings')) || '{}'); } catch {}
  const m = s.methods || {}, bk = s.bank || {};
  return {
    methods: { whatsapp: m.whatsapp !== false, bank: m.bank !== false },
    whatsappNumber: s.whatsappNumber || '2349124154453',
    bank: { name: bk.name || 'Kuda Bank', number: bk.number || '2013463188', holder: bk.holder || '' }
  };
}

async function getUser(id, create = true) {
  const raw = await redis('GET', 'spo:u:' + id);
  if (raw) return JSON.parse(raw);
  if (!create) return null;
  const u = { id, created: Date.now(), last: Date.now(), free: FREE_TRIALS, credits: {}, banned: false, phone: '', name: '' };
  await redis('SET', 'spo:u:' + id, JSON.stringify(u));
  await redis('SADD', 'spo:users', id);
  return u;
}
async function saveUser(u) { await redis('SET', 'spo:u:' + u.id, JSON.stringify(u)); }

async function isBanned(u) {
  if (u.banned) return true;
  if (u.phone && (await redis('SISMEMBER', 'spo:bannedphones', u.phone))) return true;
  return false;
}

module.exports = { redis, send, fail, readBody, uidOk, normPhone, ipHash, getPrices, getSettings, getUser, saveUser, isBanned, SERVICES, DEFAULT_PRICE, FREE_TRIALS, FREE_PER_IP };
