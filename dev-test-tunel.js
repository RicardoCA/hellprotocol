/* Teste do TÚNEL MQTT (fallback entre redes diferentes) — headless, sem rede real.
   Cria um broker MQTT em memória + RTCPeerConnection falsos e roda DUAS instâncias
   isoladas do net.js (host e convidado) em contextos VM separados. Valida:
     1. sinalização completa (hostRoom/joinRoom) pelo broker em memória;
     2. canal direto que NUNCA abre -> túnel automático ativa nos dois lados;
     3. dados do jogo fluem pelo túnel nos dois sentidos (com remetente correto);
     4. dedupe: a mesma mensagem entregue 2x só chega 1x ao jogo;
     5. quando o canal direto "abre", o tráfego volta ao P2P (túnel silencia);
     6. quando o canal direto "cai", o túnel assume de novo na hora.
   Uso: node dev-test-tunel.js */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ===================== broker MQTT em memória =====================
const CONNS = [];          // conexões conectadas: { ws, tag, url, clientId, topics:Set, pid }
const LOG = [];            // todo PUBLISH roteado: { de, topic, payload }
let pubsTunel = 0;         // nº de publishes em tópicos de túnel (/d/)

function varint(n) { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0); return out; }
function u8(s) { return Array.from(new TextEncoder().encode(s)); }
function pkt(tipo, flags, body) { return new Uint8Array([(tipo << 4) | flags].concat(varint(body.length), body)); }

function enviar(reg, bytes) {
  setTimeout(function () {
    if (reg && reg.ws.readyState === 1 && reg.ws.onmessage) reg.ws.onmessage({ data: bytes });
  }, 0);
}
function match(sub, topic) {
  const a = sub.split('/'), b = topic.split('/');
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== '+' && a[i] !== b[i]) return false;
  return true;
}
function rotear(de, topic, payload) {
  LOG.push({ de: de.clientId, topic: topic, payload: payload });
  if (topic.indexOf('/d/') >= 0) pubsTunel++;
  for (const c of CONNS) {
    let bate = false;
    for (const sub of c.topics) if (match(sub, topic)) { bate = true; break; }
    if (!bate) continue;
    const pid = c.pid++; if (c.pid > 65535) c.pid = 1;
    const tl = u8(topic);
    const body = [tl.length >> 8, tl.length & 255].concat(tl, [pid >> 8, pid & 255], u8(payload));
    enviar(c, pkt(3, 2, body));
  }
}
function parsePkt(b) {
  let i = 1, len = 0, mul = 1;
  do { len += (b[i] & 127) * mul; mul *= 128; i++; } while ((b[i - 1] & 128) && i < b.length);
  const bs = i, be = bs + len;
  const tipo = b[0] >> 4, flags = b[0] & 15;
  if (tipo === 3) { // PUBLISH
    const tl = (b[i] << 8) | b[i + 1]; i += 2;
    const topic = new TextDecoder().decode(b.subarray(i, i + tl)); i += tl;
    let pid = 0;
    if (flags & 6) { pid = (b[i] << 8) | b[i + 1]; i += 2; }
    return { tipo: tipo, topic: topic, pid: pid, payload: new TextDecoder().decode(b.subarray(i, be)) };
  }
  if (tipo === 8) { // SUBSCRIBE
    const pid = (b[i] << 8) | b[i + 1]; i += 2;
    const topics = [];
    while (i < be) {
      const tl = (b[i] << 8) | b[i + 1]; i += 2;
      topics.push(new TextDecoder().decode(b.subarray(i, i + tl))); i += tl + 1; // + qos
    }
    return { tipo: tipo, pid: pid, topics: topics };
  }
  if (tipo === 1) { // CONNECT
    const pl = (b[i] << 8) | b[i + 1]; i += 2 + pl; // 'MQTT'
    i += 4; // nível, flags, keepalive
    const cl = (b[i] << 8) | b[i + 1]; i += 2;
    return { tipo: tipo, clientId: new TextDecoder().decode(b.subarray(i, i + cl)) };
  }
  return { tipo: tipo, pid: (b[i] << 8) | b[i + 1] };
}
function brokerReceive(reg, bytes) {
  const p = parsePkt(bytes);
  if (p.tipo === 1) { reg.clientId = p.clientId; enviar(reg, pkt(2, 0, [0, 0])); }
  else if (p.tipo === 8) {
    for (const t of p.topics) reg.topics.add(t);
    const codes = p.topics.map(function () { return 1; });
    enviar(reg, pkt(9, 0, [p.pid >> 8, p.pid & 255].concat(codes)));
  } else if (p.tipo === 3) {
    if (p.pid) enviar(reg, pkt(4, 0, [p.pid >> 8, p.pid & 255])); // PUBACK
    rotear(reg, p.topic, p.payload);
  } else if (p.tipo === 12) enviar(reg, pkt(13, 0, [])); // PINGREQ -> PINGRESP
}
function addConn(ws, tag, url) {
  const reg = { ws: ws, tag: tag, url: url, clientId: '', topics: new Set(), pid: 1 };
  CONNS.push(reg);
  return reg;
}
function removeConn(reg) {
  const i = CONNS.indexOf(reg);
  if (i >= 0) CONNS.splice(i, 1);
}
function pubsTunelCount() { return pubsTunel; }

// ===================== fakes de navegador (por contexto) =====================
function makeFakeWebSocket(tag) {
  return function FakeWebSocket(url, protocol) {
    const self = this;
    this.url = url; this.protocol = protocol; this.binaryType = 'arraybuffer';
    this.readyState = 0;
    this.onopen = null; this.onmessage = null; this.onclose = null; this.onerror = null;
    let reg = null;
    this.send = function (data) {
      if (self.readyState !== 1) throw new Error('ws fechado');
      brokerReceive(reg, data instanceof Uint8Array ? data : new Uint8Array(data));
    };
    this.close = function () {
      if (reg) { removeConn(reg); reg = null; }
      if (self.readyState !== 3) {
        self.readyState = 3;
        const cb = self.onclose;
        if (cb) setTimeout(cb, 0);
      }
    };
    setTimeout(function () {
      self.readyState = 1;
      reg = addConn(self, tag, url);
      if (self.onopen) self.onopen();
    }, 0);
  };
}
// FIM_PARTE_1
function makeFakePC(tag, pcs) {
  function FakeDC() {
    this.onopen = null; this.onclose = null; this.onmessage = null;
    this.readyState = 'connecting'; this.enviados = [];
  }
  FakeDC.prototype.send = function (json) {
    if (this.readyState !== 'open') throw new Error('canal fechado');
    this.enviados.push(json);
    const par = this.par;
    if (par) setTimeout(function () { if (par.onmessage) par.onmessage({ data: json }); }, 0);
  };
  FakeDC.prototype.close = function () {
    this.readyState = 'closed';
    if (this.onclose) this.onclose();
  };
  FakeDC.prototype._abrir = function () {
    this.readyState = 'open';
    if (this.onopen) this.onopen();
  };
  FakeDC.prototype._ligar = function (outro) { // liga os dois pares do canal direto
    this.par = outro; outro.par = this;
  };
  function FakePC(conf) {
    this.conf = conf;
    this.iceGatheringState = 'complete'; // waitIce resolve na hora
    this.localDescription = null; this.remoteDescription = null;
    this.ondatachannel = null; this.onicecandidate = null; this.onicegatheringstatechange = null;
    this.dc = null;
    pcs.push(this);
  }
  FakePC.prototype.createDataChannel = function () { this.dc = new FakeDC(); return this.dc; };
  FakePC.prototype.createOffer = function () { return Promise.resolve({ type: 'offer', sdp: 'oferta-' + tag }); };
  FakePC.prototype.createAnswer = function () { return Promise.resolve({ type: 'answer', sdp: 'resposta-' + tag }); };
  FakePC.prototype.setLocalDescription = function (d) { this.localDescription = d; return Promise.resolve(); };
  FakePC.prototype.setRemoteDescription = function (d) { this.remoteDescription = d; return Promise.resolve(); };
  FakePC.prototype.close = function () { if (this.dc) this.dc.close(); };
  FakePC.prototype._canalRemoto = function () { // simula o outro lado abrindo o canal
    const dc = new FakeDC();
    if (this.ondatachannel) this.ondatachannel({ channel: dc });
    return dc;
  };
  return FakePC;
}

// ===================== contexto VM isolado por "aparelho" =====================
function criarContexto(tag) {
  const pcs = []; // instâncias FakePC deste contexto (o globalThis do host não alcança a VM)
  const sandbox = {
    console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout, setInterval: setInterval, clearInterval: clearInterval,
    TextEncoder: TextEncoder, TextDecoder: TextDecoder,
    location: { protocol: 'https:' }, // só os 3 brokers wss entram (HTTPS)
    fetch: function () { return Promise.reject(new Error('sem API neste teste')); },
    localStorage: { getItem: function () { return null; }, setItem: function () {} },
    WebSocket: makeFakeWebSocket(tag),
    RTCPeerConnection: makeFakePC(tag, pcs)
  };
  sandbox.__pcs = pcs;
  sandbox.window = sandbox;   // net.js exporta em window.Net
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'net.js'), 'utf8'), sandbox, { filename: 'net.js' });
  return sandbox;
}

// ===================== ajudantes =====================
const sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
async function esperar(fn, desc, tetoMs) {
  const teto = Date.now() + (tetoMs || 8000);
  while (Date.now() < teto) {
    if (fn()) return;
    await sleep(25);
  }
  throw new Error('tempo esgotado esperando: ' + desc);
}
// ===================== o teste =====================
(async function main() {
  const t0 = Date.now();
  setTimeout(function () { console.error('WATCHDOG — main não concluiu em 20s'); process.exit(2); }, 20000);
  const ctxH = criarContexto('host');
  const ctxG = criarContexto('guest');
  ctxH.__HP_TUNNEL_MS = 400; // acelera o gatilho do túnel (padrão: 9000ms)
  ctxG.__HP_TUNNEL_MS = 400;
  const NH = ctxH.Net, NG = ctxG.Net;
  NH.onStage(function (t) { console.log('[stage host]', t); });
  NG.onStage(function (t) { console.log('[stage guest]', t); });
  const recebH = [], recebG = [];
  NH.onMsg(function (d, f) { recebH.push({ d: d, f: f }); });
  NG.onMsg(function (d, f) { recebG.push({ d: d, f: f }); });

  // 1) sinalização completa via broker em memória
  NH.host('Servidor de Teste'); // define role='host' (o jogo chama antes de hostRoom)
  const code = await NH.hostRoom({ map: 1 });
  assert(/^\d{6}$/.test(code), 'código da sala inválido');
  await NG.joinRoom(code);
  await esperar(function () {
    const ps = NH._roomState().peers;
    return ps.length === 1 && ps[0].hasAnswer;
  }, 'resposta do convidado chegando ao host');
  console.log('ok 1 — sinalização completa (sala ' + code + ')');

  // 2) canal direto nunca abre -> túnel ativa sozinho no convidado...
  await esperar(function () { return NG._roomState().tunel.ativo; }, 'túnel do convidado conectando');
  await esperar(function () {
    return NG._roomState().peers.some(function (p) { return p.tunel; });
  }, 'peer marcado com túnel no convidado');
  console.log('ok 2 — túnel automático ativo no convidado (canal direto não abriu)');
  // o host ativa o túnel pelo próprio timer (tunelDelay+3000 = 3400ms no teste)
  await esperar(function () { return NH._roomState().tunel.ativo; }, 'túnel do host conectando');

  // 3) dados fluem pelo túnel nos dois sentidos
  NG.send({ t: 'hi', n: 'Convidado' });
  await esperar(function () { return recebH.some(function (r) { return r.d.t === 'hi'; }); }, "'hi' chegando ao host via túnel");
  assert.strictEqual(recebH[0].f, NG.id, 'remetente errado no host');
  NH.send({ t: 'world', map: 1, round: 1, phase: 'menu' });
  await esperar(function () { return recebG.some(function (r) { return r.d.t === 'world'; }); }, "'world' chegando ao convidado via túnel");
  assert.strictEqual(recebG[0].f, NH.id, 'remetente errado no convidado');
  console.log('ok 3 — tráfego do jogo via túnel nos dois sentidos (remetentes corretos)');

  // 4) dedupe: re-entrega idêntica não pode duplicar a mensagem no jogo
  const antesHi = recebH.filter(function (r) { return r.d.t === 'hi'; }).length;
  const reg = LOG.filter(function (e) { return e.topic.indexOf('/d/') >= 0 && e.payload.indexOf('"t":"hi"') >= 0; }).pop();
  assert(reg, 'registro do túnel não encontrado no broker');
  rotear({ clientId: reg.de }, reg.topic, reg.payload); // mesma mensagem, 2ª entrega
  await sleep(80);
  const depoisHi = recebH.filter(function (r) { return r.d.t === 'hi'; }).length;
  assert.strictEqual(depoisHi, antesHi, 'dedupe falhou — mensagem duplicada chegou ao jogo');
  console.log('ok 4 — dedupe descarta a entrega repetida');

  // 5) canal direto "abre" -> tráfego volta ao P2P e o túnel silencia
  const pcH = ctxH.__pcs[0], pcG = ctxG.__pcs[0];
  const dcG = pcG._canalRemoto();
  pcH.dc._ligar(dcG); // canal direto conectado de verdade entre os dois fakes
  dcG._abrir();
  pcH.dc._abrir();
  await esperar(function () {
    const meuCanal = NG._roomState().peers.filter(function (p) { return p.id === NG.id; })[0];
    return NH._roomState().peers[0].open && meuCanal && meuCanal.open;
  }, 'canal direto abrindo nos dois lados');
  const pubsAntes = pubsTunelCount();
  NH.send({ t: 'p', x: 1, y: 2, a: 3, hp: 100 });
  await esperar(function () { return recebG.some(function (r) { return r.d.t === 'p'; }); }, "'p' chegando via canal direto");
  assert.strictEqual(pubsTunelCount(), pubsAntes, 'tráfego deveria estar no P2P — túnel recebeu mensagem');
  console.log('ok 5 — canal direto abriu: tráfego voltou ao P2P (túnel silenciou)');

  // 6) canal direto "cai" -> túnel assume de novo na hora
  const pubsAntes2 = pubsTunelCount();
  pcH.dc.close();
  await esperar(function () { return NH._roomState().peers[0].tunel === true; }, 'túnel reativado no host');
  NH.send({ t: 'p', x: 5, y: 6, a: 7, hp: 50 });
  await esperar(function () { return recebG.some(function (r) { return r.d.t === 'p' && r.d.x === 5; }); }, "'p' voltando a fluir via túnel");
  assert.ok(pubsTunelCount() > pubsAntes2, 'queda do canal direto deveria voltar ao túnel');
  console.log('ok 6 — canal direto caiu: túnel assumiu na hora');

  // encerramento limpo
  NH.stop(); NG.stop();
  await sleep(80);
  assert.strictEqual(NH._roomState().tunel.ativo, false, 'túnel deveria fechar no stop()');
  assert.strictEqual(CONNS.length, 0, 'conexões sobrando no broker');
  console.log('ok 7 — stop() fecha sinalização e túnel sem sobras');
  console.log('PASS — túnel entre redes validado em ' + (Date.now() - t0) + 'ms');
  process.exit(0);
})().catch(function (e) {
  console.error('FALHOU:', e && e.message);
  console.error(e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  process.exit(1);
});
