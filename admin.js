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
