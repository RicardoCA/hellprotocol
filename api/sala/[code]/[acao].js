/* Sinalização da sala na API própria (Vercel + KV Upstash via REST).
   Ações (rota dinâmica: /api/sala/<código>/<ação>):
     POST abrir     — host abre a sala (registro com TTL)
     POST entrada   — convidado entra na fila de conexões
     GET  entradas  — host consome a fila de entradas
     POST oferta    — host publica a oferta SDP de um convidado
     GET  oferta    — convidado consome a própria oferta (GET+DEL)
     POST resposta  — convidado publica a resposta SDP
     GET  respostas — host consome a fila de respostas
   Sem dependências: fala direto com o KV via REST (pipeline de comandos).
   Se o KV não estiver configurado, usa um armazenamento em memória —
   suficiente para testar localmente com "vercel dev" (uma instância só),
   mas em produção o cliente cai no MQTT quando /api/ping não responde ok. */
// em produção o cliente cai no MQTT quando /api/ping não responde ok. */
'use strict';
const URL_DO_KV = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_DO_KV = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type'
};
function json(res, status, obj) {
  res.writeHead(status, Object.assign({ 'content-type': 'application/json' }, CORS));
  res.end(JSON.stringify(obj));
}
function limparId(v) {
  const s = String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
  return s || null;
}
function lerCorpo(req) {
  return new Promise(function (resolve) {
    let dados = '';
    req.on('data', function (c) { dados += c; if (dados.length > 60000) req.destroy(); });
    req.on('end', function () { try { resolve(JSON.parse(dados) || {}); } catch (e) { resolve({}); } });
    req.on('error', function () { resolve({}); });
  });
}
const MEMORIA = globalThis.__hpMemoria || (globalThis.__hpMemoria = new Map());
function memGet(k) { const e = MEMORIA.get(k); if (!e) return null; if (e.exp && e.exp < Date.now()) { MEMORIA.delete(k); return null; } return e.v; }
function memSet(k, v, ttl) { MEMORIA.set(k, { v: v, exp: Date.now() + ttl * 1000 }); }
function lerJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }
// executa comandos no KV via REST (pipeline); cai no armazenamento em memória se não configurado
async function kvExec(ops) {
  var kvUrl = (URL_DO_KV || '').replace(/\/+$/, '');
  if (URL_DO_KV && TOKEN_DO_KV) {
    // envia cada comando individualmente ao endpoint base — formato universal
    // (o /pipeline varia entre versões do REST; o comando único é garantido)
    var resultados = [];
    for (var i = 0; i < ops.length; i++) {
      var r = await fetch(kvUrl, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + TOKEN_DO_KV, 'content-type': 'application/json' },
        body: JSON.stringify(ops[i])
      });
      if (!r.ok) {
        var detalhe = '';
        try { detalhe = (await r.text()).slice(0, 200); } catch (e) {}
        throw new Error('KV ' + r.status + (detalhe ? ': ' + detalhe : ''));
      }
      var d = await r.json();
      resultados.push(d.result);
    }
    return resultados;
  }
  const RESULTADOS = [];
  for (let i = 0; i < ops.length; i++) {
    const cmd = String(ops[i][0]).toUpperCase(), chave = ops[i][1];
    if (cmd === 'SET') { memSet(chave, ops[i][2], ops[i][3] === 'EX' ? (Number(ops[i][4]) || 600) : 600); RESULTADOS.push('OK'); }
    else if (cmd === 'GET') RESULTADOS.push(memGet(chave));
    else if (cmd === 'EXISTS') RESULTADOS.push(memGet(chave) !== null ? 1 : 0);
    else if (cmd === 'DEL') { RESULTADOS.push(memGet(chave) !== null ? 1 : 0); MEMORIA.delete(chave); }
    else if (cmd === 'LPUSH') { const l = memGet(chave) || []; l.unshift(ops[i][2]); memSet(chave, l, 300); RESULTADOS.push(l.length); }
    else if (cmd === 'LTRIM') RESULTADOS.push('OK');
    else if (cmd === 'EXPIRE') { const e = MEMORIA.get(chave); if (e) { e.exp = Date.now() + (Number(ops[i][2]) || 300) * 1000; RESULTADOS.push(1); } else RESULTADOS.push(0); }
    else if (cmd === 'LRANGE') RESULTADOS.push((memGet(chave) || []).slice());
    else RESULTADOS.push(null);
  }
  return RESULTADOS;
}
// handler principal — rota dinâmica: /api/sala/<código>/<ação>
module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const q = req.query || {};
  const code = String(q.code || '').replace(/\D/g, '');
  const acao = String(q.acao || '');
  if (code.length !== 6) return json(res, 400, { erro: 'Código de sala inválido' });
  const base = 'hp:' + code;
  try {
    // host abre a sala (registro com TTL — guarda o nome e o mapa escolhido)
    if (req.method === 'POST' && acao === 'abrir') {
      const corpo = await lerCorpo(req);
      const existe = (await kvExec([['EXISTS', base]]))[0];
      if (existe) await kvExec([['EXPIRE', base, 600]]);
      else await kvExec([['SET', base, JSON.stringify({ nome: String(corpo.nome || '').slice(0, 40), map: String(corpo.map || '').slice(0, 20), ts: Date.now() }), 'EX', 600]]);
      return json(res, 200, { ok: true });
    }
    // convidado entra na fila de conexões
    if (req.method === 'POST' && acao === 'entrada') {
      const corpo = await lerCorpo(req);
      const id = limparId(corpo.id);
      if (!id) return json(res, 400, { erro: 'Identificador do convidado ausente' });
      const existe = (await kvExec([['EXISTS', base]]))[0];
      if (!existe) return json(res, 404, { erro: 'Sala não encontrada ou expirada' });
      await kvExec([
        ['LPUSH', base + ':ent', JSON.stringify({ id: id, nome: String(corpo.nome || '').slice(0, 40), ts: Date.now() })],
        ['LTRIM', base + ':ent', 0, 49],
        ['EXPIRE', base + ':ent', 300]
      ]);
      return json(res, 200, { ok: true });
    }
    // host consome a fila de entradas
    if (req.method === 'GET' && acao === 'entradas') {
      const r = await kvExec([['LRANGE', base + ':ent', 0, -1], ['DEL', base + ':ent']]);
      const lista = (r[0] || []).map(lerJson).filter(Boolean);
      return json(res, 200, { entradas: lista });
    }
    // host publica a oferta SDP de um convidado
    if (req.method === 'POST' && acao === 'oferta') {
      const corpo = await lerCorpo(req);
      const id = limparId(corpo.id);
      if (!id) return json(res, 400, { erro: 'Identificador do convidado ausente' });
      await kvExec([['SET', base + ':of:' + id, JSON.stringify(corpo.sdp || null), 'EX', 120]]);
      return json(res, 200, { ok: true });
    }
    // convidado consome a própria oferta (GET + DEL)
    if (req.method === 'GET' && acao === 'oferta') {
      const id = limparId(q.id);
      if (!id) return json(res, 400, { erro: 'Identificador do convidado ausente' });
      const r = await kvExec([['GET', base + ':of:' + id], ['DEL', base + ':of:' + id]]);
      const oferta = r[0] ? lerJson(r[0]) : null;
      return json(res, 200, { oferta: oferta });
    }
    // convidado publica a resposta SDP
    if (req.method === 'POST' && acao === 'resposta') {
      const corpo = await lerCorpo(req);
      const id = limparId(corpo.id);
      if (!id) return json(res, 400, { erro: 'Identificador ausente' });
      await kvExec([
        ['LPUSH', base + ':res', JSON.stringify({ id: id, sdp: corpo.sdp || null, ts: Date.now() })],
        ['LTRIM', base + ':res', 0, 49],
        ['EXPIRE', base + ':res', 300]
      ]);
      return json(res, 200, { ok: true });
    }
    // host consome a fila de respostas
    if (req.method === 'GET' && acao === 'respostas') {
      const r = await kvExec([['LRANGE', base + ':res', 0, -1], ['DEL', base + ':res']]);
      const lista = (r[0] || []).map(lerJson).filter(Boolean);
      return json(res, 200, { respostas: lista });
    }
    return json(res, 404, { erro: 'Ação desconhecida: ' + acao });
  } catch (e) {
    return json(res, 500, { erro: 'Falha interna: ' + (e && e.message ? e.message : 'desconhecida') });
  }
};