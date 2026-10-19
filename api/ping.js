/* Health check da sinalização própria: o cliente chama /api/ping para decidir
   entre a API (Vercel + KV) e o MQTT de reserva. Retorna ok somente quando o
   KV está configurado no projeto. */
const URL_DO_KV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_DO_KV = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
};

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const ok = !!(URL_DO_KV && TOKEN_DO_KV);
  if (!ok) {
    res.writeHead(503, Object.assign({ 'content-type': 'application/json' }, CORS));
    return res.end(JSON.stringify({ erro: 'KV não configurado — conecte o Vercel KV ao projeto' }));
  }
  res.writeHead(200, Object.assign({ 'content-type': 'application/json' }, CORS));
  res.end(JSON.stringify({ ok: true }));
};