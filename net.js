/* Hell Protocol — rede LAN (WebRTC P2P + BroadcastChannel, sem backend). */
(function () {
'use strict';

// ---------- detecção de suporte ----------
const hasRTC = typeof RTCPeerConnection !== 'undefined';
const hasBC = typeof BroadcastChannel !== 'undefined';
const channelName = 'hellproto-lobby';

// ---------- estado ----------
let role = 'off';           // 'off' | 'host' | 'guest'
let onMsg = null;           // callback (data, fromId)
let onPeers = null;         // callback (lista de peers conectados)
let onLobby = null;         // callback (lista de servidores descobertos)
let bc = null;
let beaconTimer = null;
let lobbyPeers = {};        // BroadcastChannel: id -> info
let rtcPeers = {};          // RTCPeerConnection: id -> {pc, dc}
let myId = 'p' + Math.floor(Math.random() * 1e6).toString(36);
let serverName = 'Servidor';

function peers() {
  const out = [];
  for (const id in rtcPeers) if (rtcPeers[id].open) out.push(id);
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

// ---------- serialização do SDP (convite manual) ----------
function sdpToCode(desc) { return btoa(JSON.stringify(desc)).replace(/=+$/, ''); }
function codeToSdp(code) {
  code = code.replace(/-/g, '+').replace(/_/g, '/');
  while (code.length % 4) code += '=';
  return JSON.parse(atob(code));
}
function makePc() {
  return new RTCPeerConnection({ iceServers: [] }); // LAN: candidatos locais bastam
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
// host gera código de convite (aparelhos diferentes — copiar/colar)
function hostCreateInvite() {
  if (!hasRTC) return Promise.reject(new Error('WebRTC não suportado'));
  const gid = 'g' + Math.floor(Math.random() * 1e6).toString(36);
  const pc = makePc();
  const dc = pc.createDataChannel('game');
  wireChannel(gid, dc);
  rtcPeers[gid] = { pc: pc, dc: dc, open: false };
  return new Promise(function (resolve) {
    let done = false;
    pc.onicecandidate = function (ev) {
      if (ev.candidate === null && !done) { done = true; resolve(sdpToCode(pc.localDescription)); }
    };
    pc.createOffer().then(function (offer) { return pc.setLocalDescription(offer); }).catch(function () {});
    setTimeout(function () {
      if (!done && pc.localDescription && pc.localDescription.type === 'offer') { done = true; resolve(sdpToCode(pc.localDescription)); }
    }, 1200);
  });
}
// host aceita o "answer" do convidado (primeiro convite pendente sem remoteDescription)
function hostAcceptAnswer(code) {
  let target = null;
  for (const id in rtcPeers) {
    const p = rtcPeers[id];
    if (p.pc.localDescription && p.pc.localDescription.type === 'offer' && !p.pc.remoteDescription) target = p.pc;
  }
  if (target) target.setRemoteDescription(codeToSdp(code)).catch(function () {});
}

// ---------- GUEST ----------
function joinByCode(hostCode) {
  if (!hasRTC) return Promise.reject(new Error('WebRTC não suportado'));
  role = 'guest';
  const pc = makePc();
  rtcPeers[myId] = { pc: pc, dc: null, open: false };
  return new Promise(function (resolve, reject) {
    pc.ondatachannel = function (ev) {
      rtcPeers[myId].dc = ev.channel;
      wireChannel(myId, ev.channel);
    };
    let done = false;
    pc.onicecandidate = function (ev) {
      if (ev.candidate === null && !done) { done = true; resolve(sdpToCode(pc.localDescription)); }
    };
    pc.setRemoteDescription(codeToSdp(hostCode)).then(function () {
      return pc.createAnswer();
    }).then(function (answer) {
      return pc.setLocalDescription(answer);
    }).catch(reject);
    setTimeout(function () {
      if (!done && pc.localDescription && pc.localDescription.type === 'answer') { done = true; resolve(sdpToCode(pc.localDescription)); }
    }, 1200);
  });
}
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
  hostCreateInvite: hostCreateInvite,
  hostAcceptAnswer: hostAcceptAnswer,
  joinByCode: joinByCode,
  joinLobbyServer: joinLobbyServer,
  send: send,
  stop: stop,
  get role() { return role; },
  get id() { return myId; },
  get peers() { return peers(); },
  get lobby() { return lobbyList(); },
  onMsg: function (cb) { onMsg = cb; },
  onPeers: function (cb) { onPeers = cb; },
  onLobby: function (cb) { onLobby = cb; }
};
})();

