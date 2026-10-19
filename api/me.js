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
