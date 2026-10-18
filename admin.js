const crypto = require('crypto');
const { redis, send, fail, readBody, ipHash, normPhone, getPrices, getSettings, getUser, saveUser, SERVICES } = require('../lib/core');

// Admin password: set ADMIN_PASSWORD in Vercel to override this default.
const PASSWORD = process.env.ADMIN_PASSWORD || 'Sirprof123...';
const secret = () => process.env.ADMIN_SECRET || PASSWORD;
const sha = s => crypto.createHash('sha256').update(String(s)).digest();

function sign() {
  const body = Buffer.from(String(Date.now() + 12 * 3600e3)).toString('base64url');
  return body + '.' + crypto.createHmac('sha256', secret()).update(body).digest('base64url');
}
function verify(t) {
  if (!t || !t.includes('.')) return false;
  const [b, s] = t.split('.');
  const e = crypto.createHmac('sha256', secret()).update(b).digest('base64url');
  if (!s || s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return false;
  return Number(Buffer.from(b, 'base64url').toString()) > Date.now();
}
const loadMany = async (prefix, ids) => ids.length ? (await redis('MGET', ...ids.map(i => prefix + i))).filter(Boolean).map(JSON.parse) : [];

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'method' });
    const b = readBody(req), a = b.action;

    if (a === 'login') {
      const key = 'spo:login:' + ipHash(req);
      let n = 0;
      try { n = await redis('INCR', key); if (n === 1) await redis('EXPIRE', key, 900); }
      catch (e) { if (e.message !== 'DB_NOT_CONFIGURED') throw e; } // lets you sign in before the database is connected
      if (n > 8) return send(res, 429, { error: 'too_many' });
      if (!crypto.timingSafeEqual(sha(b.password || ''), sha(PASSWORD))) return send(res, 401, { error: 'wrong_password' });
      try { await redis('DEL', key); } catch {}
      return send(res, 200, { token: sign() });
    }

    if (!verify((req.headers.authorization || '').replace(/^Bearer /, ''))) return send(res, 401, { error: 'unauthorized' });

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
