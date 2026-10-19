/* Hell Protocol — rede multiplayer: WebRTC P2P autoritativo no host.
   Conexões: BroadcastChannel (abas do mesmo navegador) + sala de 6 dígitos
   sinalizada por MQTT em brokers públicos (entre aparelhos diferentes). */
(function () {
'use strict';

// ---------- detecção de suporte ----------
const hasRTC = typeof RTCPeerConnection !== 'undefined';
const hasBC = typeof BroadcastChannel !== 'undefined';
const hasWS = typeof WebSocket !== 'undefined';
const channelName = 'hellproto-lobby';

// ---------- estado ----------
let role = 'off';           // 'off' | 'host' | 'guest'
let onMsg = null;           // callback (data, fromId)
let onPeers = null;         // callback (lista de peers conectados)
let onLobby = null;         // callback (lista de servidores descobertos)
let bc = null;
let beaconTimer = null;
let lobbyPeers = {};        // BroadcastChannel: id -> info
let rtcPeers = {};          // RTCPeerConnection: id -> {pc, dc, open, offerSdp}
let myId = 'p' + Math.floor(Math.random() * 1e6).toString(36);
let serverName = 'Servidor';
// sala de 6 dígitos (sinalização via MQTT público)
let room = '';              // código atual (host: gerado; convidado: digitado)
let roomEpoch = 0;          // geração da sala — invalida tentativas antigas ao refazer
let roomConns = [];         // conexões MQTT ativas: [{m, broker, idx}] — TODOS os brokers
let roomHandler = null;     // roteador (tópico, payload) da sala
let roomReconn = {};        // idx -> timer de reconexão
let offerPubT = {};         // gid -> ts da última publicação da oferta (evita spam no retry)
let roomRetryT = null;      // host: re-envia a oferta para quem ainda não respondeu
let joinTentativas = 0;     // convidado: quantas tentativas de entrada foram enviadas
let hostJoins = 0;          // host: quantas tentativas de entrada chegaram pela sinalização
let onBroker = null;        // callback de estado por sinalizador (diagnóstico na UI)
let onStage = null;         // callback de progresso da conexão (mostrado na UI)
// fecha todas as conexões de sinalização abertas
function roomCloseConns() {
  for (let i = 0; i < roomConns.length; i++) { try { roomConns[i].m.close(); } catch (e) {} }
  roomConns = [];
}

function peers() {
  const out = [];
  for (const id in rtcPeers) if (rtcPeers[id].open) out.push(id);
  return out;
}
function lobbyList() {
  // servidores descobertos via BroadcastChannel (tela "Browse Servers")
  const out = [];
  for (const id in lobbyPeers) out.push({ id: id, name: lobbyPeers[id].name, players: lobbyPeers[id].players });
  return out;
}
function broadcastLobby() {
  if (role !== 'host' || !bc) return;
  const info = { kind: 'lobby', id: myId, name: serverName, players: peers().length + 1, t: Date.now() };
  bc.postMessage(info);
}
function startLobbyBeacon() {
  broadcastLobby();
  beaconTimer = setInterval(broadcastLobby, 1500);
}
// limpa servidores que não anunciam há 4s
setInterval(function () {
  let changed = false;
  const now = Date.now();
  for (const id in lobbyPeers) {
    if (now - lobbyPeers[id].t > 4000) { delete lobbyPeers[id]; changed = true; }
  }
  if (changed && onLobby) onLobby(lobbyList());
}, 1500);
function listenLobby() {
  if (!hasBC) return;
  if (bc) { try { bc.close(); } catch (e) {} }
  bc = new BroadcastChannel(channelName);
  bc.onmessage = function (ev) {
    const d = ev.data;
    if (d.kind === 'lobby' && d.id !== myId) {
      lobbyPeers[d.id] = { name: d.name, players: d.players, t: Date.now() };
      if (onLobby) onLobby(lobbyList());
    } else if (d.kind === 'join' && role === 'host') {
      hostToTab(d.id);
    }
  };
}

// ---------- MQTT minimalista (protocolo 3.1.1 sobre WebSocket, implementado aqui) ----------
// wss:// funciona em qualquer página; ws:// só em páginas HTTP/arquivo (em HTTPS o
// navegador bloqueia conteúdo misto) — por isso filtramos pela origem da página
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',      // EMQX público (TLS)
  'wss://broker.hivemq.com:8884/mqtt',   // HiveMQ público (TLS)
  'wss://test.mosquitto.org:8081/mqtt',  // Mosquitto test (TLS)
  'ws://broker.emqx.io:8083/mqtt',       // EMQX público (texto puro)
  'ws://broker.hivemq.com:8000',         // HiveMQ público (texto puro)
  'ws://test.mosquitto.org:8080'         // Mosquitto test (texto puro)
].filter(function (url) {
  if (typeof location === 'undefined') return true;
  if (location.protocol === 'https:') return url.indexOf('wss://') === 0;
  return true; // http:// e file:// aceitam ws:// e wss://
});
function concatBytes() {
  let n = 0;
  for (const a of arguments) n += a.length;
  const out = new Uint8Array(n);
  let i = 0;
  for (const a of arguments) { out.set(a, i); i += a.length; }
  return out;
}
function mqttUtf8(s) {
  const b = new TextEncoder().encode(s);
  return concatBytes(new Uint8Array([b.length >> 8, b.length & 255]), b);
}
function mqttVarLen(n) {
  const out = [];
  do { const b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0);
  return new Uint8Array(out);
}
function mqttPacket(type, flags, body) {
  return concatBytes(new Uint8Array([(type << 4) | flags]), mqttVarLen(body.length), body);
}
function mqttParse(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 2) return null;
  let i = 1, len = 0, mul = 1;
  do { len += (b[i] & 127) * mul; mul *= 128; i++; } while ((b[i - 1] & 128) && i < b.length);
  const bodyStart = i, bodyEnd = bodyStart + len;
  if (bodyEnd > b.length) return null;
  const type = b[0] >> 4, flags = b[0] & 15;
  if (type === 3) { // PUBLISH
    const tl = (b[i] << 8) | b[i + 1]; i += 2;
    const topic = new TextDecoder().decode(b.subarray(i, i + tl)); i += tl;
    let pid = 0;
    if ((flags & 6) > 0) { pid = (b[i] << 8) | b[i + 1]; i += 2; } // packet id (QoS > 0)
    const payload = new TextDecoder().decode(b.subarray(i, bodyEnd));
    return { type: type, topic: topic, payload: payload, pid: pid };
  }
  if (type === 9) { // SUBACK — body: [packet id] + códigos por inscrição
    const codes = [];
    for (let k = bodyStart + 2; k < bodyEnd; k++) codes.push(b[k]);
    return { type: type, codes: codes };
  }
  return { type: type, rc: type === 2 ? b[bodyStart + 1] : 0 };
}
// abre uma conexão MQTT e resolve após o CONNACK; keepalive 30s com PINGREQ a cada 15s
function mqttConnect(broker, clientId, onPublish, onClose) {
  return new Promise(function (resolve, reject) {
    let ws;
    try { ws = new WebSocket(broker, 'mqtt'); } catch (e) { reject(e); return; }
    ws.binaryType = 'arraybuffer';
    let connected = false, settled = false, pingT = null, nextPid = 1;
    const cleanup = function () { if (pingT) { clearInterval(pingT); pingT = null; } };
    const fail = function (err) {
      if (settled) return; // idempotente: onclose/onerror/timeout podem competir
      settled = true;
      cleanup();
      clearTimeout(timer);
      try { ws.close(); } catch (e) {}
      reject(err);
    };
    const timer = setTimeout(function () { fail(new Error('timeout')); }, 4500);
    ws.onerror = function () { fail(new Error('falha no WebSocket')); };
    ws.onclose = function () {
      if (!connected) fail(new Error('conexão fechada pelo broker'));
      else { cleanup(); console.log('[sala] sinalizador caiu:', broker); if (onClose) onClose(); }
    };
    ws.onopen = function () {
      // CONNECT: nome MQTT, nível 4, clean session, keepalive 30s, client id
      try { ws.send(mqttPacket(1, 0, concatBytes(mqttUtf8('MQTT'), new Uint8Array([4, 2, 0, 30]), mqttUtf8(clientId)))); } catch (e) { fail(e); }
    };
    ws.onmessage = function (ev) {
      const m = mqttParse(ev.data);
      if (!m) return;
      if (m.type === 2) { // CONNACK
        if (m.rc !== 0) { fail(new Error('broker recusou (' + m.rc + ')')); return; }
        clearTimeout(timer);
        connected = true;
        pingT = setInterval(function () {
          if (ws.readyState === 1) { try { ws.send(mqttPacket(12, 0, new Uint8Array(0))); } catch (e) {} }
        }, 15000);
        resolve({
          readyState: function () { return ws.readyState; },
          subscribe: function (topic) {
            if (ws.readyState !== 1) return;
            const pid = nextPid++; if (nextPid > 65535) nextPid = 1;
            // QoS 1: o broker confirma a inscrição e retransmite entregas não confirmadas
            try { ws.send(mqttPacket(8, 2, concatBytes(new Uint8Array([pid >> 8, pid & 255]), mqttUtf8(topic), new Uint8Array([1])))); } catch (e) {}
          },
          publish: function (topic, text) {
            if (ws.readyState !== 1) return;
            const pid = nextPid++; if (nextPid > 65535) nextPid = 1;
            // QoS 1: o broker guarda e retransmite até o destinatário confirmar (PUBACK)
            try { ws.send(mqttPacket(3, 2, concatBytes(mqttUtf8(topic), new Uint8Array([pid >> 8, pid & 255]), new TextEncoder().encode(text)))); } catch (e) {}
          },
          close: function () {
            cleanup();
            if (ws.readyState === 1) { try { ws.send(mqttPacket(14, 0, new Uint8Array(0))); } catch (e) {} }
            try { ws.close(); } catch (e) {}
          }
        });
      } else if (m.type === 3 && onPublish) { // PUBLISH (QoS 1): entrega a mensagem e confirma
        if (onPublish(m.topic, m.payload) !== false && m.pid) {
          try { ws.send(mqttPacket(4, 0, new Uint8Array([m.pid >> 8, m.pid & 255]))); } catch (e) {} // PUBACK
        }
      } else if (m.type === 9) { // SUBACK — 0x80 = inscrição recusada pelo broker
        for (const c of (m.codes || [])) {
          if (c === 0x80) console.log('[sala] inscrição RECUSADA pelo broker em', broker);
        }
      }
    };
  });
}
// conecta em TODOS os brokers de uma vez — host e convidado precisam compartilhar
// pelo menos um; publicar/escutar em todos garante o encontro mesmo se um broker
// estiver bloqueado em uma das redes. Cada conexão é usada NO INSTANTE em que abre
// (sem esperar as demais) — onConnOpen(m) subscreve e publica o que for preciso.
function mqttConnectAll(onConnOpen, ep) {
  const base = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const attempts = BROKERS.map(function (b, idx) {
    if (onBroker) onBroker(brokerName(b), 'conectando…');
    return mqttConnect(b, 'hp' + base + idx, function (t, p) {
      console.log('[sala] <-', brokerName(b), t);
      roomOnPublish(t, p);
    }, function () {
      if (onBroker) onBroker(brokerName(b), 'caiu — reconectando…');
      roomConnDropped(idx);
    })
      .then(function (m) {
        if (ep !== undefined && ep !== roomEpoch) { try { m.close(); } catch (e) {} if (onBroker) onBroker(brokerName(b), 'descartado'); return { m: m, broker: b, idx: idx }; }
        if (!roomConns.some(function (x) { return x.idx === idx; })) roomConns.push({ m: m, broker: b, idx: idx });
        roomSubscribeAll(m);
        if (onConnOpen) { try { onConnOpen(m); } catch (e) {} }
        if (onBroker) onBroker(brokerName(b), 'conectado');
        return { m: m, broker: b, idx: idx };
      })
      .catch(function () {
        if (onBroker) onBroker(brokerName(b), 'falhou');
        return null;
      });
  });
  return Promise.all(attempts).then(function (list) {
    const conns = list.filter(Boolean);
    if (conns.length === 0) throw new Error('Servidor de sinalização indisponível — tente novamente em instantes.');
    return conns;
  });
}
function roomOnPublish(topic, payload) { if (roomHandler) roomHandler(topic, payload); }
function roomPublish(topic, text) {
  for (let i = 0; i < roomConns.length; i++) { try { roomConns[i].m.publish(topic, text); } catch (e) {} }
}
function roomSubscribeAll(m) {
  if (role === 'host') { m.subscribe(topicJoin()); m.subscribe('hp/' + room + '/a/+'); }
  else if (role === 'guest') { m.subscribe(topicOf(myId)); m.subscribe(topicOAll()); }
}
// se uma conexão cair com a sala ativa, reconecta o mesmo broker sozinho (re-subscreve)
function roomConnDropped(idx) {
  const ep = roomEpoch;
  roomConns = roomConns.filter(function (c) { return c.idx !== idx; });
  if (!room || roomReconn[idx]) return;
  if (onBroker) onBroker(brokerName(BROKERS[idx]), 'reconectando…');
  roomReconn[idx] = setTimeout(function () {
    delete roomReconn[idx];
    if (ep !== roomEpoch || !room) return;
    mqttConnect(BROKERS[idx], 'hpr' + Date.now().toString(36) + idx, roomOnPublish, function () { roomConnDropped(idx); })
      .then(function (m) {
        if (ep !== roomEpoch || !room) { try { m.close(); } catch (e) {} return; }
        if (onBroker) onBroker(brokerName(BROKERS[idx]), 'conectado');
        roomConns.push({ m: m, broker: BROKERS[idx], idx: idx });
        roomSubscribeAll(m);
        if (onStage) onStage('Sinalização reconectada (' + brokerName(BROKERS[idx]) + ')');
      }).catch(function () {
        if (onBroker) onBroker(brokerName(BROKERS[idx]), 'falhou');
        roomConnDropped(idx);
      });
  }, 3000);
}
function brokerName(url) { return String(url).split('/')[2]; }

// ---------- sala de 6 dígitos (host gera; convidados entram) ----------
function topicJoin() { return 'hp/' + room + '/j'; }
function topicOf(gid) { return 'hp/' + room + '/o/' + gid; }
function topicOAll() { return 'hp/' + room + '/o'; } // difusão: oferta para TODOS os convidados
function topicAn(gid) { return 'hp/' + room + '/a/' + gid; }
// resolve com o SDP local quando o ICE termina (ou após 2,5s — dá tempo ao STUN
// sem travar a sala em redes lentas)
function waitIce(pc) {
  return new Promise(function (resolve) {
    let done = false;
    const fin = function () { if (!done) { done = true; resolve({ type: pc.localDescription.type, sdp: pc.localDescription.sdp }); } };
    pc.onicecandidate = function (ev) { if (ev.candidate === null) fin(); };
    setTimeout(fin, 2500);
  });
}
// host: gera o código de 6 dígitos (resolve já — a sala reconecta os sinalizadores em loop
// por trás até todos responderem) e escuta os convidados em TODOS os brokers
function hostRoom() {
  if (!hasRTC) return Promise.reject(new Error('WebRTC não suportado neste navegador.'));
  if (!hasWS) return Promise.reject(new Error('WebSocket não suportado neste navegador.'));
  roomCloseConns();
  const ep = ++roomEpoch;
  offerPubT = {};
  hostJoins = 0;
  room = String(Math.floor(100000 + Math.random() * 900000));
  if (onStage) onStage('Conectando ao servidor de sinalização…');
  roomHandler = function (topic, payload) {
    try {
      let d = null;
      if (topic === topicJoin()) {
        try { d = JSON.parse(payload); } catch (e) { return; }
        if (d && d.id) {
          hostJoins++;
          console.log('[sala] convidado pediu entrada:', d.id, '(tentativas recebidas:', hostJoins + ')');
          if (hostJoins === 1 || hostJoins % 5 === 0) {
            if (onStage) onStage('Tentativas de entrada recebidas pela sinalização: ' + hostJoins + ' — negociando…');
          }
          hostRoomAccept(d.id);
        }
      } else if (topic.indexOf('hp/' + room + '/a/') === 0) {
        try { d = JSON.parse(payload); } catch (e) { return; }
        if (d && d.a) { console.log('[sala] resposta recebida de', topic); hostRoomAnswer(topic.slice(('hp/' + room + '/a/').length), d.a); }
      }
    } catch (e) {
      console.log('[sala] erro ao processar mensagem:', e && e.message);
      if (onStage) onStage('Erro ao processar a mensagem da sala: ' + (e && e.message));
    }
  };
  const connectPhase = function () {
    if (ep !== roomEpoch) return;
    mqttConnectAll(null, ep).then(function (conns) {
      if (ep !== roomEpoch) return;
      for (let i = 0; i < BROKERS.length; i++) {
        if (!conns.some(function (c) { return c.idx === i; })) roomConnDropped(i);
      }
      const nomes = conns.map(function (c) { return brokerName(c.broker); }).join(' + ');
      console.log('[sala] host conectado aos sinalizadores:', nomes);
      if (onStage) onStage('Sala aberta — sinalização: ' + nomes);
    }).catch(function () {
      if (ep !== roomEpoch) return;
      if (onStage) onStage('Sinalizadores indisponíveis agora — tentando novamente…');
      for (let i = 0; i < BROKERS.length; i++) roomConnDropped(i);
    });
  };
  connectPhase();
  // auto-curativo: re-envia a oferta (até 1x a cada 1,5s por convidado) enquanto
  // houver convidado sem resposta — mensagens perdidas no broker são retransmitidas
  roomRetryT = setInterval(function () {
    if (ep !== roomEpoch || role !== 'host') { clearInterval(roomRetryT); return; }
    for (const gid in rtcPeers) {
      const p = rtcPeers[gid];
      if (p.offerSdp && !p.answered && roomConns.length && Date.now() - (offerPubT[gid] || 0) > 1500) {
        offerPubT[gid] = Date.now();
        roomPublish(topicOf(gid), JSON.stringify({ o: p.offerSdp }));
      }
    }
  }, 2000);
  return Promise.resolve(room);
}
// host: um convidado pediu entrada — cria o pc e publica a oferta para ele
function hostRoomAccept(gid) {
  if (!gid) return;
  if (rtcPeers[gid]) {
    // retry do convidado: reenvia a MESMA oferta (no máximo 1x a cada 1,5s)
    if (rtcPeers[gid].offerSdp && roomConns.length && Date.now() - (offerPubT[gid] || 0) > 1500) {
      offerPubT[gid] = Date.now();
      roomPublish(topicOf(gid), JSON.stringify({ o: rtcPeers[gid].offerSdp }));
      roomPublish(topicOAll(), JSON.stringify({ o: rtcPeers[gid].offerSdp }));
    }
    return;
  }
  offerPubT[gid] = Date.now();
  const pc = makePc();
  const dc = pc.createDataChannel('game');
  wireChannel(gid, dc);
  rtcPeers[gid] = { pc: pc, dc: dc, open: false };
  pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
    .then(function () { return waitIce(pc); })
    .then(function (desc) {
      rtcPeers[gid].offerSdp = desc;
      // publica em DOIS tópicos: direto para o convidado + difusão da sala
      // (se uma rota falhar no broker, a outra entrega)
      roomPublish(topicOf(gid), JSON.stringify({ o: desc }));
      roomPublish(topicOAll(), JSON.stringify({ o: desc }));
      if (onStage) onStage('Oferta enviada ao convidado — aguardando resposta…');
    }).catch(function (e) {
      console.log('[sala] falha ao publicar oferta:', e && e.message);
      if (onStage) onStage('Falha ao preparar a oferta: ' + (e && e.message));
    });
}
// host: recebe a resposta de um convidado específico (pode chegar duplicada via vários brokers)
function hostRoomAnswer(gid, answer) {
  const p = rtcPeers[gid];
  if (!p || p.answered) return;
  p.answered = true;
  p.pc.setRemoteDescription(answer).catch(function () { p.answered = false; });
}
// convidado: entra na sala pelo código de 6 dígitos — fica tentando (conexão + join)
// em todos os sinalizadores por até 30s, contornando oscilações de broker/rede
function joinRoom(code) {
  if (!hasRTC) return Promise.reject(new Error('WebRTC não suportado neste navegador.'));
  if (!hasWS) return Promise.reject(new Error('WebSocket não suportado neste navegador.'));
  room = String(code || '').replace(/\D/g, '');
  if (room.length !== 6) return Promise.reject(new Error('O código da sala tem 6 dígitos.'));
  role = 'guest';
  roomCloseConns();
  const ep = ++roomEpoch;
  joinTentativas = 0;
  if (onStage) onStage('Conectando ao servidor de sinalização…');
  return new Promise(function (resolve, reject) {
    let joined = false, retryT = null, giveT = null, waited = 0, respostas = 0;
    const offTopic = topicOf(myId);
    roomHandler = function (topic, payload) {
      try {
        if (topic !== offTopic && topic !== topicOAll()) return;
        let d = null;
        try { d = JSON.parse(payload); } catch (e) { return; }
        if (!d || !d.o) return;
        if (joined) {
          // o host re-enviou a oferta (não recebeu nossa resposta) — re-publica a resposta
          const me = rtcPeers[myId];
          if (me && me.answerSdp && !me.open) {
            respostas++;
            if (onStage) onStage('Reenviando a resposta ao host (' + respostas + ')…');
            roomPublish(topicAn(myId), JSON.stringify({ a: me.answerSdp }));
          }
          return;
        }
        joined = true; // ofertas duplicadas (vários brokers) são ignoradas — a primeira vence
        clearInterval(retryT); clearTimeout(giveT);
        console.log('[sala] oferta recebida — respondendo via', roomConns.length, 'sinalizador(es)');
        const pc = makePc();
        rtcPeers[myId] = { pc: pc, dc: null, open: false };
        pc.ondatachannel = function (ev) {
          rtcPeers[myId].dc = ev.channel;
          wireChannel(myId, ev.channel);
        };
        pc.setRemoteDescription(d.o).then(function () { return pc.createAnswer(); })
          .then(function (a) { return pc.setLocalDescription(a); })
          .then(function () { return waitIce(pc); })
          .then(function (desc) {
            rtcPeers[myId].answerSdp = desc;
            roomPublish(topicAn(myId), JSON.stringify({ a: desc }));
            resolve();
            // sinalizou, mas o canal direto precisa abrir: se não abrir, avisa a causa provável
            setTimeout(function () {
              if (ep !== roomEpoch) return;
              if (!(rtcPeers[myId] && rtcPeers[myId].open) && onStage) {
                onStage('Sala encontrada, mas a conexão direta não abriu — aparelhos em redes diferentes podem bloquear o WebRTC. Tente na mesma rede Wi-Fi.');
              }
            }, 15000);
          }).catch(reject);
      } catch (e) {
        if (onStage) onStage('Erro ao processar a mensagem da sala: ' + (e && e.message));
      }
    };
    const attempt = function () {
      if (ep !== roomEpoch) { clearInterval(retryT); return; } // tentativa cancelada — para de publicar
      waited += 2.5;
      if (roomConns.length && !joined) { joinTentativas++; roomPublish(topicJoin(), JSON.stringify({ id: myId })); }
      if (waited % 10 === 0 && onStage) onStage('Ainda procurando a sala ' + room + '… (' + waited + 's) — tentativas enviadas: ' + joinTentativas);
    };
    const connectPhase = function () {
      if (ep !== roomEpoch) return;
      mqttConnectAll(function (m) { attempt(); }, ep).then(function (conns) {
        if (ep !== roomEpoch) return;
        for (let i = 0; i < BROKERS.length; i++) {
          if (!conns.some(function (c) { return c.idx === i; })) roomConnDropped(i);
        }
        if (onStage && !joined) onStage('Procurando a sala ' + room + ' em ' + conns.length + ' servidor(es) de sinalização…');
      }).catch(function () {
        if (ep !== roomEpoch) return;
        // nenhum sinalizador respondeu agora — entram em reconexão em loop (o giveT de 30s manda parar)
        if (onStage) onStage('Sinalizadores indisponíveis agora — tentando novamente…');
        for (let i = 0; i < BROKERS.length; i++) roomConnDropped(i);
      });
    };
    connectPhase();
    retryT = setInterval(attempt, 2500); // re-pede a oferta até o host responder
    giveT = setTimeout(function () {
      clearInterval(retryT);
      if (ep !== roomEpoch) return; // tentativa já foi cancelada — não rejeita
      const vivos = roomConns.length;
      reject(new Error('O host não respondeu em 30s — sinalizadores conectados neste aparelho: ' + vivos + '/' + BROKERS.length +
        (vivos === 0 ? ' (NENHUM — verifique a internet do celular)' : '') +
        ' · tentativas de entrada enviadas: ' + joinTentativas +
        '. Confira o código e tente de novo.'));
    }, 30000);
  });
}
function makePc() {
  // STUN: descobre o IP público (conexão direta quando o NAT permite)
  // TURN público gratuito: retransmite quando a conexão direta é bloqueada —
  // é o que permite jogar pela internet (celular no 4G ↔ PC no Wi-Fi).
  // Na mesma rede Wi-Fi a conexão é direta e o TURN nem é usado.
  return new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      {
        urls: [
          'turn:openrelay.metered.ca:80',
          'turn:openrelay.metered.ca:443',
          'turn:openrelay.metered.ca:443?transport=tcp'
        ],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      },
      {
        urls: 'turns:openrelay.metered.ca:443?transport=tcp',
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });
}
function wireChannel(id, dc) {
  dc.onopen = function () {
    rtcPeers[id].open = true;
    if (onPeers) onPeers(peers());
    if (role === 'host') broadcastLobby();
  };
  dc.onclose = function () { rtcPeers[id].open = false; if (onPeers) onPeers(peers()); };
  dc.onmessage = function (ev) {
    let d;
    try { d = JSON.parse(ev.data); } catch (e) { return; }
    if (onMsg) onMsg(d, id);
  };
}

// ---------- HOST ----------
function host(name) {
  if (!hasRTC) return { ok: false, err: 'WebRTC não suportado neste navegador.' };
  role = 'host';
  serverName = name || 'Servidor LAN';
  rtcPeers = {};
  listenLobby();
  startLobbyBeacon();
  return { ok: true };
}
// host abre canal para aba do mesmo navegador (via BroadcastChannel)
function hostToTab(guestId) {
  if (rtcPeers[guestId] && rtcPeers[guestId].open) return;
  const pc = makePc();
  const dc = pc.createDataChannel('game');
  wireChannel(guestId, dc);
  rtcPeers[guestId] = { pc: pc, dc: dc, open: false };
  pc.createOffer().then(function (offer) {
    return pc.setLocalDescription(offer);
  }).then(function () {
    if (bc) bc.postMessage({ kind: 'offer', from: myId, to: guestId, sdp: sdpToCode(pc.localDescription) });
  }).catch(function () {});
}
// (o fluxo manual de convite gigante foi substituído pela sala de 6 dígitos)

// ---------- GUEST ----------
// (joinRoom está na seção da sala de 6 dígitos)
function joinLobbyServer(sid) {
  listenLobby();
  if (bc) bc.postMessage({ kind: 'join', from: myId, to: sid });
  role = 'guest';
}

// ---------- mensagens ----------
function send(data) {
  const json = JSON.stringify(data);
  for (const id in rtcPeers) {
    if (rtcPeers[id].open) {
      try { rtcPeers[id].dc.send(json); } catch (e) {}
    }
  }
}
function stop() {
  role = 'off';
  roomEpoch++; // invalida reconexões/tentativas pendentes da sala
  roomHandler = null;
  roomCloseConns();
  if (roomRetryT) { clearInterval(roomRetryT); roomRetryT = null; }
  for (const k in roomReconn) { clearTimeout(roomReconn[k]); delete roomReconn[k]; }
  offerPubT = {};
  room = '';
  if (beaconTimer) { clearInterval(beaconTimer); beaconTimer = null; }
  for (const id in rtcPeers) {
    try { rtcPeers[id].pc.close(); } catch (e) {}
  }
  rtcPeers = {}; lobbyPeers = {};
  if (bc) { try { bc.close(); } catch (e) {} bc = null; }
  if (onPeers) onPeers([]);
}

// ---------- export ----------
window.Net = {
  host: host,
  hostRoom: hostRoom,
  joinRoom: joinRoom,
  joinLobbyServer: joinLobbyServer,
  send: send,
  stop: stop,
  get room() { return room; },
  get role() { return role; },
  get id() { return myId; },
  get peers() { return peers(); },
  get lobby() { return lobbyList(); },
  // diagnóstico da sala: estado dos paces WebRTC criados por ela + sinalizadores em uso
  _roomState: function () {
    const out = {
      room: room,
      brokers: roomConns.map(function (c) { return brokerName(c.broker); }),
      joinTentativas: joinTentativas,
      hostJoins: hostJoins,
      peers: []
    };
    for (const id in rtcPeers) {
      const p = rtcPeers[id];
      out.peers.push({ id: id, open: !!p.open, hasOffer: !!(p.offerSdp || (p.pc && p.pc.localDescription)), hasAnswer: !!(p.pc && p.pc.remoteDescription) });
    }
    return out;
  },
  // progresso da conexão (o jogo mostra na tela)
  onStage: function (cb) { onStage = cb; },
  // estado por sinalizador (diagnóstico ao vivo na tela de entrada)
  onBroker: function (cb) { onBroker = cb; },
  onMsg: function (cb) { onMsg = cb; },
  onPeers: function (cb) { onPeers = cb; },
  onLobby: function (cb) { onLobby = cb; },
  // diagnóstico: valida o servidor de sinalização (conecta, subscreve, publica e recebe eco)
  _testMqtt: function () {
    const topic = 'hp/teste/' + Date.now().toString(36);
    const prevHandler = roomHandler;
    return mqttConnectAll().then(function (conns) {
      const m = conns[0].m;
      return new Promise(function (resolve, reject) {
        roomHandler = function (t, p) {
          if (t !== topic) return;
          roomHandler = prevHandler;
          try { m.close(); } catch (e) {}
          resolve(p === 'ok');
        };
        m.subscribe(topic);
        setTimeout(function () { roomHandler = prevHandler; reject(new Error('broker não ecoou a mensagem')); }, 6000);
        setTimeout(function () { m.publish(topic, 'ok'); }, 300);
      });
    }).catch(function (e) { roomHandler = prevHandler; throw e; });
  }
};
})();

