// Spoedit server: ONE file that handles every /api route (me, consume, pay, admin, health).
// Called as /api/server?route=<name>. Runs on Vercel Node functions with no dependencies.
const _req = require;
const mod_core = (() => {
  const module = { exports: {} };
  const require = _req;
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
    whatsappNumber: s.whatsappNumber || '2348118293462',
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

  return module.exports;
})();
const mod_me = (() => {
  const module = { exports: {} };
  const require = p => (p === '../lib/core' ? mod_core : _req(p));
const { redis, send, fail, uidOk, ipHash, getPrices, getSettings, getUser, saveUser, isBanned, SERVICES, FREE_PER_IP } = require('../lib/core');

// Returns the visitor's remaining free trials, paid credits, ban status and current prices.
module.exports = async (req, res) => {
  try {
    const id = req.headers['x-uid'];
    if (!uidOk(id)) return send(res, 400, { error: 'bad_uid' });
    const [u, prices, st] = await Promise.all([getUser(id), getPrices(), getSettings()]);
    u.last = Date.now();
    await saveUser(u);
    const ipUsed = Number(await redis('GET', 'spo:ip:' + ipHash(req))) || 0;
    send(res, 200, {
      free: ipUsed >= FREE_PER_IP ? 0 : u.free,
      credits: u.credits,
      banned: await isBanned(u),
      prices,
      pay: { whatsapp: st.methods.whatsapp, whatsappNumber: st.whatsappNumber, bank: { enabled: st.methods.bank, name: st.bank.name, number: st.bank.number, holder: st.bank.holder } },
      services: SERVICES
    });
  } catch (e) { fail(res, e); }
};

  return module.exports;
})();
const mod_consume = (() => {
  const module = { exports: {} };
  const require = p => (p === '../lib/core' ? mod_core : _req(p));
const { redis, send, fail, readBody, uidOk, ipHash, getPrices, getUser, saveUser, isBanned, SERVICES, FREE_PER_IP } = require('../lib/core');

// Called when someone taps Download. The server decides: clean file (paid credit), watermarked (free trial) or payment needed.
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const id = req.headers['x-uid'];
    if (!uidOk(id)) return send(res, 400, { error: 'bad_uid' });
    const { service } = readBody(req);
    if (!SERVICES[service]) return send(res, 400, { error: 'bad_service' });

    const u = await getUser(id);
    if (await isBanned(u)) return send(res, 403, { error: 'banned' });

    if ((u.credits[service] || 0) > 0) {
      u.credits[service] -= 1; u.last = Date.now();
      await saveUser(u);
      return send(res, 200, { ok: true, watermark: false });
    }

    const ipKey = 'spo:ip:' + ipHash(req);
    const ipUsed = Number(await redis('GET', ipKey)) || 0;
    if (u.free > 0 && ipUsed < FREE_PER_IP) {
      u.free -= 1; u.last = Date.now();
      await saveUser(u);
      await redis('INCR', ipKey);
      await redis('EXPIRE', ipKey, 60 * 60 * 24 * 30);
      return send(res, 200, { ok: true, watermark: true });
    }

    const prices = await getPrices();
    return send(res, 402, { error: 'payment_required', price: prices[service] });
  } catch (e) { fail(res, e); }
};

  return module.exports;
})();
const mod_pay = (() => {
  const module = { exports: {} };
  const require = p => (p === '../lib/core' ? mod_core : _req(p));
const crypto = require('crypto');
const { redis, send, fail, readBody, uidOk, normPhone, getPrices, getSettings, getUser, saveUser, isBanned, SERVICES } = require('../lib/core');

// Creates a pending payment request. The customer then pays you on WhatsApp and you confirm it in /admin.
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const id = req.headers['x-uid'];
    if (!uidOk(id)) return send(res, 400, { error: 'bad_uid' });
    const { service, phone, method, payer, claim } = readBody(req);

    // "I've paid": flag the customer's pending payment so you can spot it in /admin
    if (claim) {
      const raw = await redis('GET', 'spo:p:' + String(claim).slice(0, 20));
      const rec0 = raw ? JSON.parse(raw) : null;
      if (rec0 && rec0.uid === id && rec0.status === 'pending') { rec0.claimed = Date.now(); await redis('SET', 'spo:p:' + rec0.ref, JSON.stringify(rec0)); }
      return send(res, 200, { ok: true });
    }
    if (!SERVICES[service]) return send(res, 400, { error: 'bad_service' });

    const u = await getUser(id);
    const p = normPhone(phone);
    if (p) { u.phone = p; await saveUser(u); }
    if (await isBanned(u)) return send(res, 403, { error: 'banned' });

    const rateKey = 'spo:payrate:' + id;
    const n = await redis('INCR', rateKey);
    if (n === 1) await redis('EXPIRE', rateKey, 3600);
    if (n > 8) return send(res, 429, { error: 'too_many' });

    const how = method === 'bank' ? 'bank' : 'whatsapp';
    const st = await getSettings();
    if (!st.methods[how]) return send(res, 400, { error: 'method_disabled' });
    const prices = await getPrices();
    const rec = { ref: '', uid: id, service, amount: prices[service], status: 'pending', method: how, payer: String(payer || '').slice(0, 60), created: Date.now(), phone: u.phone || '' };
    for (let i = 0; i < 4; i++) {
      rec.ref = 'SPO-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      if (await redis('SET', 'spo:p:' + rec.ref, JSON.stringify(rec), 'NX')) break;
      rec.ref = '';
    }
    if (!rec.ref) return send(res, 500, { error: 'server_error' });
    await redis('SADD', 'spo:payments', rec.ref);
    send(res, 200, { ok: true, ref: rec.ref, amount: rec.amount });
  } catch (e) { fail(res, e); }
};

  return module.exports;
})();
const mod_admin = (() => {
  const module = { exports: {} };
  const require = p => (p === '../lib/core' ? mod_core : _req(p));
const crypto = require('crypto');
const { redis, send, fail, readBody, ipHash, normPhone, getPrices, getSettings, getUser, saveUser, SERVICES } = require('../lib/core');

// ---- Admin accounts (email + password), stored in the database ----
const emailOk = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 120;
const hashPw = (pw, salt) => crypto.scryptSync(String(pw), salt, 64).toString('hex');
let _secret = '';
async function secret() {
  if (process.env.ADMIN_SECRET) return process.env.ADMIN_SECRET;
  if (_secret) return _secret;
  let s = await redis('GET', 'spo:secret');
  if (!s) { await redis('SET', 'spo:secret', crypto.randomBytes(32).toString('hex'), 'NX'); s = await redis('GET', 'spo:secret'); }
  return (_secret = s);
}
async function sign(email) {
  const body = Buffer.from(JSON.stringify({ exp: Date.now() + 12 * 3600e3, email })).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', await secret()).update(body).digest('base64url');
}
async function verify(t) {
  if (!t || !t.includes('.')) return null;
  const [b, s] = t.split('.');
  const e = crypto.createHmac('sha256', await secret()).update(b).digest('base64url');
  if (!s || s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  try { const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
}
async function limit(req, name, max) {
  const key = 'spo:rl:' + name + ':' + ipHash(req);
  const n = await redis('INCR', key);
  if (n === 1) await redis('EXPIRE', key, 900);
  return n <= max;
}
async function createAdmin(email, password) {
  const salt = crypto.randomBytes(16).toString('hex');
  await redis('SET', 'spo:admin:' + email, JSON.stringify({ email, salt, hash: hashPw(password, salt), created: Date.now() }));
  await redis('SADD', 'spo:admins', email);
}
const loadMany = async (prefix, ids) => ids.length ? (await redis('MGET', ...ids.map(i => prefix + i))).filter(Boolean).map(JSON.parse) : [];

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req), a = b.action;
    const email = String(b.email || '').trim().toLowerCase();

    // Is this a brand-new site that still needs its first admin account?
    if (a === 'status') {
      const admins = await redis('SMEMBERS', 'spo:admins');
      return send(res, 200, { needsSetup: admins.length === 0 || process.env.RESET_ADMIN === 'true' });
    }

    // Create the first admin account (only while none exists, or while RESET_ADMIN=true is set in Vercel)
    if (a === 'setup') {
      if (!(await limit(req, 'setup', 10))) return send(res, 429, { error: 'too_many' });
      const admins = await redis('SMEMBERS', 'spo:admins');
      if (admins.length > 0 && process.env.RESET_ADMIN !== 'true') return send(res, 403, { error: 'already_setup' });
      if (!emailOk(email)) return send(res, 400, { error: 'bad_email' });
      if (String(b.password || '').length < 8 || String(b.password).length > 200) return send(res, 400, { error: 'weak_password' });
      await createAdmin(email, b.password);
      return send(res, 200, { token: await sign(email), email });
    }

    if (a === 'login') {
      if (!(await limit(req, 'login', 10))) return send(res, 429, { error: 'too_many' });
      const raw = emailOk(email) ? await redis('GET', 'spo:admin:' + email) : null;
      const acc = raw ? JSON.parse(raw) : { salt: 'x'.repeat(32), hash: '0'.repeat(128) };
      const given = Buffer.from(hashPw(b.password || '', acc.salt)), real = Buffer.from(acc.hash);
      if (!raw || given.length !== real.length || !crypto.timingSafeEqual(given, real)) return send(res, 401, { error: 'bad_login' });
      return send(res, 200, { token: await sign(email), email });
    }

    const me = await verify((req.headers.authorization || '').replace(/^Bearer /, ''));
    if (!me) return send(res, 401, { error: 'unauthorized' });

    switch (a) {
      case 'payments': {
        const rows = await loadMany('spo:p:', await redis('SMEMBERS', 'spo:payments'));
        rows.sort((x, y) => y.created - x.created);
        const done = rows.filter(p => p.status === 'confirmed');
        return send(res, 200, {
          payments: rows.slice(0, 400),
          services: SERVICES,
          stats: { pending: rows.filter(p => p.status === 'pending').length, confirmed: done.length, revenue: done.reduce((s, p) => s + p.amount, 0) }
        });
      }
      case 'confirm':
      case 'reject': {
        const raw = await redis('GET', 'spo:p:' + b.ref);
        if (!raw) return send(res, 404, { error: 'not_found' });
        const p = JSON.parse(raw);
        if (p.status !== 'pending') return send(res, 409, { error: 'already_' + p.status });
        if (a === 'confirm') {
          const u = await getUser(p.uid, false);
          if (!u) return send(res, 404, { error: 'user_not_found' });
          p.status = 'confirmed'; p.confirmedAt = Date.now();
          await redis('SET', 'spo:p:' + p.ref, JSON.stringify(p));
          u.credits[p.service] = (u.credits[p.service] || 0) + 1;
          await saveUser(u);
        } else {
          p.status = 'rejected'; p.rejectedAt = Date.now();
          await redis('SET', 'spo:p:' + p.ref, JSON.stringify(p));
        }
        return send(res, 200, { ok: true, status: p.status });
      }
      case 'addAdmin': {
        if (!emailOk(email)) return send(res, 400, { error: 'bad_email' });
        if (String(b.password || '').length < 8) return send(res, 400, { error: 'weak_password' });
        if (await redis('GET', 'spo:admin:' + email)) return send(res, 409, { error: 'exists' });
        await createAdmin(email, b.password);
        return send(res, 200, { ok: true });
      }
      case 'changePassword': {
        const acc = JSON.parse((await redis('GET', 'spo:admin:' + me.email)) || 'null');
        if (!acc) return send(res, 404, { error: 'not_found' });
        const given = Buffer.from(hashPw(b.current || '', acc.salt)), real = Buffer.from(acc.hash);
        if (given.length !== real.length || !crypto.timingSafeEqual(given, real)) return send(res, 403, { error: 'bad_login' });
        if (String(b.password || '').length < 8) return send(res, 400, { error: 'weak_password' });
        await createAdmin(me.email, b.password);
        return send(res, 200, { ok: true });
      }
      case 'settings':
        return send(res, 200, await getSettings());
      case 'setSettings': {
        const m = b.methods || {}, bk = b.bank || {};
        const clean = (v, n) => String(v || '').replace(/[<>]/g, '').trim().slice(0, n);
        const number = String(bk.number || '').replace(/\D/g, '');
        const wa = normPhone(b.whatsappNumber);
        if (!m.whatsapp && !m.bank) return send(res, 400, { error: 'need_one_method' });
        if (m.bank && !/^\d{10}$/.test(number)) return send(res, 400, { error: 'bad_account' });
        if (!wa) return send(res, 400, { error: 'bad_whatsapp' });
        const next = { methods: { whatsapp: !!m.whatsapp, bank: !!m.bank }, whatsappNumber: wa, bank: { name: clean(bk.name, 40) || 'Kuda Bank', number: number || '2013463188', holder: clean(bk.holder, 60) } };
        await redis('SET', 'spo:settings', JSON.stringify(next));
        return send(res, 200, { ok: true, settings: await getSettings() });
      }
      case 'prices':
        return send(res, 200, { prices: await getPrices(), services: SERVICES });
      case 'setPrice': {
        const price = Math.round(Number(b.price));
        if (!SERVICES[b.service] || !Number.isFinite(price) || price < 0 || price > 1000000) return send(res, 400, { error: 'bad_input' });
        const prices = await getPrices();
        prices[b.service] = price;
        await redis('SET', 'spo:prices', JSON.stringify(prices));
        return send(res, 200, { ok: true, prices });
      }
      case 'users': {
        const rows = await loadMany('spo:u:', await redis('SMEMBERS', 'spo:users'));
        rows.sort((x, y) => y.last - x.last);
        return send(res, 200, { users: rows.slice(0, 500), services: SERVICES });
      }
      case 'ban':
      case 'unban': {
        const u = await getUser(String(b.id || ''), false);
        if (!u) return send(res, 404, { error: 'not_found' });
        u.banned = a === 'ban';
        if (u.phone) await redis(a === 'ban' ? 'SADD' : 'SREM', 'spo:bannedphones', u.phone);
        await saveUser(u);
        return send(res, 200, { ok: true, banned: u.banned });
      }
      case 'grant': {
        const u = await getUser(String(b.id || ''), false);
        const n = Math.round(Number(b.n));
        if (!u || !SERVICES[b.service] || !Number.isFinite(n) || Math.abs(n) > 20) return send(res, 400, { error: 'bad_input' });
        u.credits[b.service] = Math.max(0, (u.credits[b.service] || 0) + n);
        await saveUser(u);
        return send(res, 200, { ok: true, credits: u.credits });
      }
      default:
        return send(res, 400, { error: 'unknown_action' });
    }
  } catch (e) { fail(res, e); }
};

  return module.exports;
})();
const mod_health = (() => {
  const module = { exports: {} };
  const require = p => (p === '../lib/core' ? mod_core : _req(p));
const { redis } = require('../lib/core');

// Open /api/health in your browser to check that the server and database are connected. Shows no secrets.
module.exports = async (req, res) => {
  const hasDb = !!((process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL) && (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN));
  const out = { server: 'ok', version: 'email-admin-v2', database: hasDb ? 'variables found' : 'NOT connected (no database variables)' };
  if (hasDb) {
    try { await redis('PING'); out.database = 'connected'; }
    catch (e) { out.database = 'ERROR: ' + String(e.message).slice(0, 120); }
  }
  res.status(200).setHeader('Cache-Control', 'no-store').json(out);
};

  return module.exports;
})();

const handlers = { me: mod_me, consume: mod_consume, pay: mod_pay, admin: mod_admin, health: mod_health };
module.exports = async (req, res) => {
  let route = (req.query && req.query.route) || '';
  if (!route) { const m = String(req.url || '').match(/route=([a-z]+)/) || String(req.url || '').match(/\/api\/([a-z]+)/); route = m ? m[1] : ''; }
  const h = handlers[route];
  if (!h) return res.status(404).setHeader('Cache-Control', 'no-store').json({ error: 'unknown_route' });
  return h(req, res);
};
