// Teste de fumaça da API de sinalização (modo memória — sem KV real)
const handler = require('./api/sala/[code]/[acao].js');

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.writeHead = function (s, h) { r.statusCode = s; Object.assign(r.headers, h || {}); };
  r.end = function (b) { r.body = b; };
  return r;
}
function fakeReq(method, url, corpo) {
  const u = new URL('http://x' + url);
  const q = {};
  u.searchParams.forEach(function (v, k) { q[k] = v; });
  return {
    method: method,
    url: url,
    query: q,
    on: function (ev, cb) {
      if (ev === 'data' && corpo) cb(JSON.stringify(corpo));
      if (ev === 'end') cb();
    },
    destroy: function () {}
  };
}

(async function () {
  let falhas = 0;
  const t = async function (nome, cond) {
    if (cond) console.log('PASS:', nome);
    else { console.log('FALHOU:', nome); falhas++; }
  };

  const CODE = '482913';
  const base = '/api/sala?code=' + CODE + '&acao=';

  // 1. host abre a sala (com mapa)
  let res = fakeRes();
  await handler(fakeReq('POST', base + 'abrir', { nome: 'PC-Host', map: 'cidade' }), res);
  await t('abrir → 200', res.statusCode === 200);

  // 2. convidado entra
  res = fakeRes();
  await handler(fakeReq('POST', base + 'entrada', { id: 'pABC123', nome: 'Celular' }), res);
  await t('entrada → 200', res.statusCode === 200);

  // 3. entrada em sala inexistente → 404 com mensagem clara
  res = fakeRes();
  await handler(fakeReq('POST', '/api/sala?code=999999&acao=entrada', { id: 'pX' }), res);
  await t('entrada sala inexistente → 404', res.statusCode === 404 && /encontrada/i.test(res.body));

  // 4. host lê as entradas (LRANGE+DEL)
  res = fakeRes();
  await handler(fakeReq('GET', base + 'entradas'), res);
  const entradas = JSON.parse(res.body || '{}').entradas || [];
  await t('entradas → 200 e contém o convidado', res.statusCode === 200 && entradas.length === 1 && entradas[0].id === 'pABC123');

  // 5. segunda leitura → vazia (fila consumida)
  res = fakeRes();
  await handler(fakeReq('GET', base + 'entradas'), res);
  await t('entradas 2ª leitura → vazia', (JSON.parse(res.body || '{}').entradas || []).length === 0);

  // 6. host publica a oferta para o convidado
  const sdpOferta = { type: 'offer', sdp: 'v=0...oferta-teste' };
  res = fakeRes();
  await handler(fakeReq('POST', base + 'oferta', { id: 'pABC123', sdp: sdpOferta }), res);
  await t('oferta POST → 200', res.statusCode === 200);

  // 7. convidado lê a própria oferta (GET+DEL)
  res = fakeRes();
  await handler(fakeReq('GET', base + 'oferta&id=pABC123'), res);
  const oferta = JSON.parse(res.body || '{}').oferta;
  await t('oferta GET → contém o SDP', res.statusCode === 200 && oferta && oferta.sdp === 'v=0...oferta-teste');

  // 8. segunda leitura → vazia (consumida)
  res = fakeRes();
  await handler(fakeReq('GET', base + 'oferta&id=pABC123'), res);
  await t('oferta GET 2ª → vazia', !JSON.parse(res.body || '{}').oferta);

  // 9. convidado publica a resposta
  const sdpResposta = { type: 'answer', sdp: 'v=0...resposta-teste' };
  res = fakeRes();
  await handler(fakeReq('POST', base + 'resposta', { id: 'pABC123', sdp: sdpResposta }), res);
  await t('resposta POST → 200', res.statusCode === 200);

  // 10. host lê as respostas
  res = fakeRes();
  await handler(fakeReq('GET', base + 'respostas'), res);
  const resps = JSON.parse(res.body || '{}').respostas || [];
  await t('respostas → contém o SDP', res.statusCode === 200 && resps.length === 1 && resps[0].sdp.sdp === 'v=0...resposta-teste');

  // 11. código inválido → 400
  res = fakeRes();
  await handler(fakeReq('POST', '/api/sala?code=123&acao=abrir', {}), res);
  await t('código inválido → 400', res.statusCode === 400);

  // 12. ação desconhecida → 404
  res = fakeRes();
  await handler(fakeReq('POST', base + 'inexistente', {}), res);
  await t('ação desconhecida → 404', res.statusCode === 404);

  console.log(falhas === 0 ? '\nTODOS OS TESTES PASSARAM' : '\n' + falhas + ' TESTE(S) FALHARAM');
  process.exit(falhas === 0 ? 0 : 1);
})().catch(function (e) { console.error('ERRO FATAL:', e); process.exit(1); });
