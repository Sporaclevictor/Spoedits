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
