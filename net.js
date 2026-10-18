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
let roomMqtt = null;        // conexão MQTT ativa
let roomHandler = null;     // roteador (tópico, payload) da sala

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
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',      // EMQX público
  'wss://broker.hivemq.com:8884/mqtt',   // HiveMQ público
  'wss://test.mosquitto.org:8081/mqtt'   // Mosquitto test
];
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
    if ((flags & 6) > 0) i += 2; // packet id (QoS > 0)
    const payload = new TextDecoder().decode(b.subarray(i, bodyEnd));
    return { type: type, topic: topic, payload: payload };
  }
  return { type: type, rc: type === 2 ? b[bodyStart + 1] : 0 };
}
// abre uma conexão MQTT e resolve após o CONNACK; keepalive 30s com PINGREQ a cada 15s
function mqttConnect(broker, clientId, onPublish, onClose) {
  return new Promise(function (resolve, reject) {
    let ws;
    try { ws = new WebSocket(broker, 'mqtt'); } catch (e) { reject(e); return; }
    ws.binaryType = 'arraybuffer';
    let connected = false, pingT = null, nextPid = 1;
    const cleanup = function () { if (pingT) { clearInterval(pingT); pingT = null; } };
    const fail = function (err) { cleanup(); try { ws.close(); } catch (e) {} reject(err); };
    const timer = setTimeout(function () { fail(new Error('timeout')); }, 7000);
    ws.onerror = function () { clearTimeout(timer); fail(new Error('falha no WebSocket')); };
    ws.onclose = function () {
      clearTimeout(timer);
      if (!connected) fail(new Error('conexão fechada pelo broker'));
      else { cleanup(); if (onClose) onClose(); }
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
          subscribe: function (topic) {
            if (ws.readyState !== 1) return;
            const pid = nextPid++; if (nextPid > 65535) nextPid = 1;
            try { ws.send(mqttPacket(8, 2, concatBytes(new Uint8Array([pid >> 8, pid & 255]), mqttUtf8(topic), new Uint8Array([0])))); } catch (e) {}
          },
          publish: function (topic, text) {
            if (ws.readyState !== 1) return;
            try { ws.send(mqttPacket(3, 0, concatBytes(mqttUtf8(topic), new TextEncoder().encode(text)))); } catch (e) {}
          },
          close: function () {
            cleanup();
            if (ws.readyState === 1) { try { ws.send(mqttPacket(14, 0, new Uint8Array(0))); } catch (e) {} }
            try { ws.close(); } catch (e) {}
          }
        });
      } else if (m.type === 3 && onPublish) onPublish(m.topic, m.payload); // PUBLISH
    };
  });
}
// tenta os brokers em ordem até um responder
function mqttConnectNext() {
  const clientId = 'hp' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
  const tryOne = function (idx) {
    if (idx >= BROKERS.length) return Promise.reject(new Error('Servidor de sinalização indisponível — tente novamente em instantes.'));
    return mqttConnect(BROKERS[idx], clientId,
      function (t, p) { if (roomHandler) roomHandler(t, p); },
      function () { roomMqtt = null; roomHandler = null; }).catch(function () { return tryOne(idx + 1); });
  };
  return tryOne(0);
}

// ---------- sala de 6 dígitos (host gera; convidados entram) ----------
function topicJoin() { return 'hp/' + room + '/j'; }
function topicOf(gid) { return 'hp/' + room + '/o/' + gid; }
function topicAn(gid) { return 'hp/' + room + '/a/' + gid; }
// resolve com o SDP local quando o ICE termina (ou após 1,5s — rede lenta não pode travar a sala)
function waitIce(pc) {
  return new Promise(function (resolve) {
    let done = false;
    const fin = function () { if (!done) { done = true; resolve({ type: pc.localDescription.type, sdp: pc.localDescription.sdp }); } };
    pc.onicecandidate = function (ev) { if (ev.candidate === null) fin(); };
    setTimeout(fin, 1500);
  });
}
// host: gera o código de 6 dígitos, conecta ao broker e escuta os convidados da sala
function hostRoom() {
  if (!hasRTC) return Promise.reject(new Error('WebRTC não suportado neste navegador.'));
  if (!hasWS) return Promise.reject(new Error('WebSocket não suportado neste navegador.'));
  room = String(Math.floor(100000 + Math.random() * 900000));
  return mqttConnectNext().then(function (m) {
    roomMqtt = m;
    roomHandler = function (topic, payload) {
      let d = null;
      if (topic === topicJoin()) {
        try { d = JSON.parse(payload); } catch (e) { return; }
        if (d && d.id) hostRoomAccept(d.id);
      } else if (topic.indexOf('hp/' + room + '/a/') === 0) {
        try { d = JSON.parse(payload); } catch (e) { return; }
        if (d && d.a) hostRoomAnswer(topic.slice(('hp/' + room + '/a/').length), d.a);
      }
    };
    m.subscribe(topicJoin());
    m.subscribe('hp/' + room + '/a/+');
    return room;
  });
}
// host: um convidado pediu entrada — cria o pc e publica a oferta para ele
function hostRoomAccept(gid) {
  if (!gid) return;
  if (rtcPeers[gid]) {
    if (rtcPeers[gid].offerSdp && roomMqtt) roomMqtt.publish(topicOf(gid), JSON.stringify({ o: rtcPeers[gid].offerSdp })); // retry do convidado
    return;
  }
  const pc = makePc();
  const dc = pc.createDataChannel('game');
  wireChannel(gid, dc);
  rtcPeers[gid] = { pc: pc, dc: dc, open: false };
  pc.createOffer().then(function (o) { return pc.setLocalDescription(o); })
    .then(function () { return waitIce(pc); })
    .then(function (desc) {
      rtcPeers[gid].offerSdp = desc;
      if (roomMqtt) roomMqtt.publish(topicOf(gid), JSON.stringify({ o: desc }));
    }).catch(function () {});
}
// host: recebe a resposta de um convidado específico
function hostRoomAnswer(gid, answer) {
  const p = rtcPeers[gid];
  if (p && p.pc.localDescription && !p.pc.remoteDescription) p.pc.setRemoteDescription(answer).catch(function () {});
}
// convidado: entra na sala pelo código de 6 dígitos
function joinRoom(code) {
  if (!hasRTC) return Promise.reject(new Error('WebRTC não suportado neste navegador.'));
  if (!hasWS) return Promise.reject(new Error('WebSocket não suportado neste navegador.'));
  room = String(code || '').replace(/\D/g, '');
  if (room.length !== 6) return Promise.reject(new Error('O código da sala tem 6 dígitos.'));
  role = 'guest';
  return mqttConnectNext().then(function (m) {
    roomMqtt = m;
    return new Promise(function (resolve, reject) {
      let joined = false, retryT = null, giveT = null;
      const offTopic = topicOf(myId);
      roomHandler = function (topic, payload) {
        if (topic !== offTopic || joined) return;
        let d = null;
        try { d = JSON.parse(payload); } catch (e) { return; }
        if (!d || !d.o) return;
        joined = true;
        clearInterval(retryT); clearTimeout(giveT);
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
            if (roomMqtt) roomMqtt.publish(topicAn(myId), JSON.stringify({ a: desc }));
            resolve();
          }).catch(reject);
      };
      m.subscribe(offTopic);
      const attempt = function () { if (roomMqtt && !joined) m.publish(topicJoin(), JSON.stringify({ id: myId })); };
      attempt();
      retryT = setInterval(attempt, 2500); // re-pede a oferta até o host responder
      giveT = setTimeout(function () {
        clearInterval(retryT);
        reject(new Error('O host não respondeu — confira o código da sala.'));
      }, 9000);
    });
  });
}
function makePc() {
  // STUN ajuda a conectar entre redes diferentes (sem TURN, NAT muito restritivo ainda bloqueia)
  return new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
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
  roomHandler = null;
  if (roomMqtt) { try { roomMqtt.close(); } catch (e) {} roomMqtt = null; }
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
  // diagnóstico da sala: estado dos paces WebRTC criados por ela
  _roomState: function () {
    const out = { room: room, peers: [] };
    for (const id in rtcPeers) {
      const p = rtcPeers[id];
      out.peers.push({ id: id, open: !!p.open, hasOffer: !!(p.offerSdp || (p.pc && p.pc.localDescription)), hasAnswer: !!(p.pc && p.pc.remoteDescription) });
    }
    return out;
  },
  onMsg: function (cb) { onMsg = cb; },
  onPeers: function (cb) { onPeers = cb; },
  onLobby: function (cb) { onLobby = cb; },
  // diagnóstico: valida o servidor de sinalização (conecta, subscreve, publica e recebe eco)
  _testMqtt: function () {
    const topic = 'hp/teste/' + Date.now().toString(36);
    const prevHandler = roomHandler;
    return mqttConnectNext().then(function (m) {
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

