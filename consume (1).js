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
