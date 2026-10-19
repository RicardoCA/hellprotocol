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

/* --- reserva em memória (dev / vercel dev) --- */
const memoria = globalThis.__hpMemoria || (globalThis.__hpMemoria = { mapa: new Map() });
function memGet(chave) {
  const e = memoria.mapa.get(chave);
  if (!e) return null;
  if (e.exp && e.exp < Date.now()) { memoria.mapa.delete(chave); return null; }
  return e.v;
}
function memExec(ops) {
  const resultados = [];
  for (const op of ops) {
    const cmd = String(op[0]).toUpperCase();
    const chave = op[1];
    if (cmd === 'SET') { memoria.mapa.set(chave, { v: op[2], exp: Date.now() + (op[3] === 'EX' ? (Number(op[4]) || 600) : 600) * 1000 }); resultados.push('OK'); }
    else if (cmd === 'GET') resultados.push(memGet(chave));
    else if (cmd === 'EXISTS') resultados.push(memGet(chave) !== null ? 1 : 0);
    else if (cmd === 'DEL') { resultados.push(memGet(chave) !== null ? 1 : 0); memoria.mapa.delete(chave); }
    else if (cmd === 'LPUSH') { const l = memGet(chave) || []; l.unshift(op[2]); memoria.mapa.set(chave, { v: l, exp: Date.now() + 300000 }); resultados.push(l.length); }
    else if (cmd === 'LTRIM') resultados.push('OK');

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  const q = req.query || {};
  const code = String(q.code || '').replace(/\D/g, '');
  const acao = String(q.acao || '');
  if (code.length !== 6) return json(res, 400, { erro: 'Código de sala inválido' });
  const base = 'hp:' + code;
  try {
    if (req.method === 'POST' && acao === 'abrir') {
      const corpo = await lerCorpo(req);
      const existe = (await exec([['EXISTS', base]]))[0];
      if (existe) await exec([['EXPIRE', base, 600]]);
      else await exec([['SET', base, JSON.stringify({ nome: String(corpo.nome || '').slice(0, 40), map: String(corpo.map || '').slice(0, 20), ts: Date.now() }), 'EX', 600]]);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'POST' && acao === 'entrada') {
      const corpo = await lerCorpo(req);
      const id = limparId(corpo.id);
      if (!id) return json(res, 400, { erro: 'Identificador do convidado ausente' });
      const existe = (await exec([['EXISTS', base]]))[0];
      if (!existe) return json(res, 404, { erro: 'Sala não encontrada ou expirada' });
      await exec([
        ['LPUSH', base + ':ent', JSON.stringify({ id: id, nome: String(corpo.nome || '').slice(0, 40), ts: Date.now() })],
        ['LTRIM', base + ':ent', 0, 49],
        ['EXPIRE', base + ':ent', 300]
      ]);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && acao === 'entradas') {
      const r = await exec([['LRANGE', base + ':ent', 0, -1], ['DEL', base + ':ent']]);
      const lista = (r[0] || []).map(function (t) { try { return JSON.parse(t); } catch (e) { return null; } }).filter(Boolean);
      return json(res, 200, { entradas: lista });
    }
    if (req.method === 'POST' && acao === 'oferta') {
      const corpo = await lerCorpo(req);
      const id = limparId(corpo.id);
      if (!id) return json(res, 400, { erro: 'Identificador do convidado ausente' });
      await exec([['SET', base + ':of:' + id, JSON.stringify(corpo.sdp || null), 'EX', 120]]);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && acao === 'oferta') {
      const id = limparId(q.id);
      if (!id) return json(res, 400, { erro: 'Identificador do convidado ausente' });
      const r = await exec([['GET', base + ':of:' + id], ['DEL', base + ':of:' + id]]);
      let sdp = null;
      if (r[0]) { try { sdp = JSON.parse(r[0]); } catch (e) { sdp = null; } }
      return json(res, 200, { oferta: sdp });
    }
    if (req.method === 'POST' && acao === 'resposta') {
      const corpo = await lerCorpo(req);
      const id = limparId(corpo.id);
      if (!id) return json(res, 400, { erro: 'Identificador ausente' });
      await exec([
        ['LPUSH', base + ':res', JSON.stringify({ id: id, sdp: corpo.sdp || null, ts: Date.now() })],
        ['LTRIM', base + ':res', 0, 49],
        ['EXPIRE', base + ':res', 300]
      ]);
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && acao === 'respostas') {
      const r = await exec([['LRANGE', base + ':res', 0, -1], ['DEL', base + ':res']]);
      const lista = (r[0] || []).map(function (t) { try { return JSON.parse(t); } catch (e) { return null; } }).filter(Boolean);
      return json(res, 200, { respostas: lista });
    }
    return json(res, 404, { erro: 'Ação desconhecida: ' + acao });
  } catch (e) {
    return json(res, 500, { erro: 'Falha interna: ' + (e && e.message ? e.message : 'desconhecida') });
  }
};

    else if (cmd === 'EXPIRE') { const e = memoria.mapa.get(chave); if (e) { e.exp = Date.now() + (Number(op[2]) || 300) * 1000; resultados.push(1); } else resultados.push(0); }
    else if (cmd === 'LRANGE') resultados.push((memGet(chave) || []).slice());
    else resultados.push(null);
  }
  return resultados;
}

/* Pipeline de comandos: sempre um array de arrays de comandos.
   Com KV real: envia tudo numa requisição REST (atômico por conexão).
   Sem KV: executa na memória. */
async function exec(ops) {
  if (URL_DO_KV && TOKEN_DO_KV) {
    const r = await fetch(URL_DO_KV, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + TOKEN_DO_KV, 'content-type': 'application/json' },
      body: JSON.stringify(ops)
    });
    if (!r.ok) throw new Error('KV respondeu ' + r.status);
    const d = await r.json();
    return d.result || [];
  }
  return memExec(ops);
}
