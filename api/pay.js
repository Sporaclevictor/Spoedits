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
