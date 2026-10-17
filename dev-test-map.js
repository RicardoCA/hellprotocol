/* Validação: conectividade dos 6 mapas via gancho __OT.mapInfo (headless, Node). */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const listeners = [];
let rafCb = null;
function fakeCtx() {
  return {
    createImageData(w, h) { const d = new Uint8ClampedArray(w * h * 4); return { data: d, width: w, height: h }; },
    getImageData(x, y, w, h) { const d = new Uint8ClampedArray(w * h * 4); return { data: d, width: w, height: h }; },
    createLinearGradient() { return { addColorStop() {} }; },
    putImageData() {}, drawImage() {}, fillRect() {}, strokeRect() {}, clearRect() {},
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {}, ellipse() {}, bezierCurveTo() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, imageSmoothingEnabled: false, lineJoin: '', globalAlpha: 1
  };
}
function fakeCanvas(w, h) {
  return {
    width: w, height: h, style: {},
    getContext() { return fakeCtx(); },
    addEventListener(type, fn) { listeners.push(['cv', type, fn]); },
    requestPointerLock: undefined
  };
}
function fakeEl(id) {
  const e = {
    id, style: {}, textContent: '', children: [], parentNode: null, className: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    get firstChild() { return e.children[0] || null; },
    get lastChild() { return e.children[e.children.length - 1] || null; },
    get firstElementChild() { return { style: {} }; },
    addEventListener(type, fn) { listeners.push([e, type, fn]); },
    insertBefore(n, ref) { n.parentNode = e; e.children.unshift(n); },
    appendChild(n) { n.parentNode = e; e.children.push(n); },
    removeChild(n) { const i = e.children.indexOf(n); if (i >= 0) e.children.splice(i, 1); n.parentNode = null; }
  };
  return e;
}
const WIN = { addEventListener(type, fn) { listeners.push([WIN, type, fn]); } };
global.window = WIN;
const DOC = {
  createElement(tag) { return tag === 'canvas' ? fakeCanvas(300, 150) : fakeEl('dyn-' + tag + '-' + Math.random()); },
  getElementById(id) {
    if (id === 'game') return mainCanvas;
    if (id === 'minimap') return minimapCanvas;
    if (!els[id]) els[id] = fakeEl(id);
    return els[id];
  },
  addEventListener(type, fn) { listeners.push([DOC, type, fn]); },
  pointerLockElement: null
};
global.document = DOC;
global.localStorage = { getItem: () => null, setItem() {} };
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
const mainCanvas = fakeCanvas(960, 600);
const minimapCanvas = fakeCanvas(132, 132);
const els = {};

const dir = __dirname;
for (const f of ['audio.js', 'textures.js', 'engine.js', 'game.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
}

const OT = global.window.__OT;
if (!OT || !OT.mapInfo) throw new Error('gancho __OT.mapInfo ausente');

let fail = 0;
for (const id of [1, 2, 3, 4, 5, 6]) {
  const info = OT.mapInfo(id);
  const MW = 24, MH = 24, m = info.map;
  const px = info.playerSpawn[0] | 0, py = info.playerSpawn[1] | 0;
  console.log('--- Mapa ' + id + ': ' + info.name + ' ---');
  if (m[py * MW + px] !== 0) { console.error('  ERRO: spawn do jogador dentro de parede'); fail++; continue; }
  const seen = new Uint8Array(MW * MH);
  const q = [py * MW + px];
  seen[q[0]] = 1;
  while (q.length) {
    const c = q.shift();
    const cx = c % MW, cy = (c / MW) | 0;
    for (const nb of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      const nx = nb[0], ny = nb[1];
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const idx = ny * MW + nx;
      if (!seen[idx] && m[idx] === 0) { seen[idx] = 1; q.push(idx); }
    }
  }
  let localFail = 0;
  for (const s of info.botSpawns) {
    const cx = s[0] | 0, cy = s[1] | 0;
    if (!(m[cy * MW + cx] === 0 && seen[cy * MW + cx])) { console.error('  bot spawn bloqueado: (' + s[0] + ',' + s[1] + ')'); fail++; localFail++; }
  }
  for (const p of info.pickups) {
    const cx = p[0] | 0, cy = p[1] | 0;
    if (!(m[cy * MW + cx] === 0 && seen[cy * MW + cx])) { console.error('  pickup bloqueado: (' + p[0] + ',' + p[1] + ')'); fail++; localFail++; }
  }
  if (!localFail) console.log('  OK: ' + info.botSpawns.length + ' spawns e ' + info.pickups.length + ' pickups alcançáveis ✔');
}
if (fail) { console.error('FALHAS:', fail); process.exit(1); }
console.log('TODOS OS MAPAS CONECTÁVEIS ✔');
process.exit(0);