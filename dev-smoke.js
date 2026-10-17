/* Smoke test headless: stubs de DOM/Canvas + roda o jogo por ~60s simulados. */
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
    beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, arc() {}, ellipse() {},
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    fillStyle: '', strokeStyle: '', lineWidth: 1, imageSmoothingEnabled: false, lineJoin: '', globalAlpha: 1
  };
}
function fakeCanvas(w, h) {
  const c = {
    width: w, height: h, style: {},
    getContext() { return fakeCtx(); },
    addEventListener(type, fn) { listeners.push([c, type, fn]); },
    requestPointerLock: undefined
  };
  return c;
}
function fakeEl(id) {
  const e = {
    id, style: {}, textContent: '', children: [], parentNode: null,
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

const mainCanvas = fakeCanvas(960, 600);
const minimapCanvas = fakeCanvas(132, 132);
const els = {};
const WIN = {
  addEventListener(type, fn) { listeners.push([WIN, type, fn]); }
};
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
const memStore = {};
global.localStorage = {
  getItem: function (k) { return (k in memStore) ? memStore[k] : null; },
  setItem: function (k, v) { memStore[k] = String(v); }
};
global.requestAnimationFrame = cb => { rafCb = cb; return 1; };
global.performance = { now: () => 0 };

const dir = __dirname;
for (const f of ['audio.js', 'textures.js', 'engine.js', 'game.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
}

function findListener(target, type) {
  for (const [t, ty, fn] of listeners) if (t === target && ty === type) return fn;
  return null;
}
function fire(target, type, ev) {
  const fn = findListener(target, type);
  if (!fn) throw new Error('listener não encontrado: ' + type);
  fn(ev);
}

// inicia o jogo
let t = 0, frames = 0;
fire(els['play'], 'click', {});
{ // roda 1 frame para consolidar o HUD
  t += 16.7;
  const cb0 = rafCb; rafCb = null; cb0(t); frames++;
}
if (String(els['round'].textContent) !== '1') throw new Error('round deveria ser 1, é ' + els['round'].textContent);
if (String(els['left'].textContent) !== '0') throw new Error('durante o tempo de compra não deve haver bots, há ' + els['left'].textContent);

const OT = global.window.__OT;
if (!OT) throw new Error('gancho __OT ausente');

// ativa pointer lock fake e anda
global.document.pointerLockElement = mainCanvas;
fire(global.document, 'pointerlockchange', {});
fire(global.window, 'keydown', { code: 'KeyW', preventDefault() {} });
fire(mainCanvas, 'mousedown', { button: 0 });

function runFrames(n) {
  for (let i = 0; i < n; i++) {
    t += 16.7;
    if (!rafCb) break;
    const cb = rafCb; rafCb = null;
    cb(t);
    frames++;
  }
}

// 0) menu de compra: abre, compra o fuzil ($2500), fecha
fire(global.window, 'keydown', { code: 'KeyB', preventDefault() {} });
if (!OT.menuOpenNow()) throw new Error('menu de compra não abriu');
if (String(els['bmoney'].textContent) !== '800') throw new Error('bmoney deveria ser 800, é ' + els['bmoney'].textContent);
OT.setMoney(3000);
fire(global.window, 'keydown', { code: 'Digit3', preventDefault() {} }); // item 3 = fuzil
if (OT.getMoney() !== 500) throw new Error('compra deveria debitar $2500, dinheiro: ' + OT.getMoney());
if (OT.player.w !== 'rifle') throw new Error('não trocou para o fuzil comprado');
// menu aberto pausa o tempo de compra e segura os bots
const bt0 = OT.getBuyTime();
runFrames(60);
if (OT.getBuyTime() !== bt0) throw new Error('tempo de compra correu com o menu aberto');
if (String(els['left'].textContent) !== '0') throw new Error('bots nasceram com o menu aberto!');
console.log('menu de compra: abrir/comprar/pausar spawn ✔');
fire(global.window, 'keydown', { code: 'KeyB', preventDefault() {} });
if (OT.menuOpenNow()) throw new Error('menu não fechou');

// spawna os bots (fim do tempo de compra)
OT.skipBuyTime();
if (OT.bots.length !== 4) throw new Error('deveriam nascer 4 bots, nasceram ' + OT.bots.length);
runFrames(1);
if (String(els['left'].textContent) !== '4') throw new Error('HUD deveria mostrar 4 bots');
console.log('spawn após tempo de compra ✔');

// 1) patrulha livre (2s simulados)
runFrames(120);

// 2) combate: posições fixas em células abertas, mira e atira
{
  const p = OT.player;
  const target = OT.bots[0];
  for (const b of OT.bots) if (b !== target) { b.x = 2.5; b.y = 2.5; b.alert = false; }
  p.x = 12.5; p.y = 21.5; p.a = -Math.PI / 2;
  target.x = 12.5; target.y = 18.5; target.alert = false;
  p.hp = 100; p.armor = 0; p.w = 'rifle'; p.cool = 0; p.reloading = 0;
  OT.player.ammo.rifle.mag = 30; OT.player.ammo.rifle.res = 60;
  const before = OT.killsNow();
  const moneyBefore = OT.getMoney();
  for (let i = 0; i < 40 && OT.killsNow() === before; i++) { p.cool = 0; OT.playerShoot(); }
  if (OT.killsNow() !== before + 1) throw new Error('dano/abate falhou');
  if (OT.getMoney() !== moneyBefore + 300) throw new Error('recompensa de abate falhou: ' + OT.getMoney());
  if (target.alive) throw new Error('bot deveria estar morto');
  if (els['feed'].children.length < 1) throw new Error('killfeed vazio');
  console.log('combate: abate + $300 ✔');
}
// 2b) escopeta comprada: abate com chumbo grosso
{
  const p = OT.player;
  let target2 = null;
  for (const b of OT.bots) if (b.alive) { target2 = b; break; }
  for (const b of OT.bots) if (b !== target2) { b.x = 2.5; b.y = 2.5; b.alert = false; }
  p.x = 12.5; p.y = 21.5; p.a = -Math.PI / 2;
  target2.x = 12.5; target2.y = 17.5; target2.alert = false;
  p.w = 'shotgun'; p.cool = 0; p.reloading = 0; p.hp = 100;
  OT.give('shotgun');
  OT.player.ammo.shotgun.mag = 8; OT.player.ammo.shotgun.res = 24;
  const before2 = OT.killsNow();
  for (let i = 0; i < 6 && OT.killsNow() === before2; i++) { p.cool = 0; OT.playerShoot(); }
  if (OT.killsNow() !== before2 + 1) throw new Error('escopeta falhou');
  if (target2.alive) throw new Error('bot da escopeta vivo');
  console.log('escopeta: abate confirmado ✔');
}

// 3) vitória de rodada: elimina todos, ganha $1000 e avança
{
  const moneyPre = OT.getMoney();
  let alive3 = 0;
  for (const b of OT.bots) if (b.alive) alive3++;
  OT.setState('play'); OT.player.hp = 100;
  for (const b of OT.bots) if (b.alive) OT.damageBot(b, 999);
  runFrames(300); // >3.2s simulados
  if (OT.roundNow() !== 2) throw new Error('deveria avançar para o round 2, está no ' + OT.roundNow());
  if (OT.stateNow() !== 'play') throw new Error('estado após vitória: ' + OT.stateNow());
  const esperado = moneyPre + alive3 * 300 + 1000;
  if (OT.getMoney() !== esperado) throw new Error('bônus de rodada falhou: esperado ' + esperado + ', veio ' + OT.getMoney());
  if (OT.bots.length !== 0) throw new Error('round 2 deveria começar sem bots');
  if (OT.getBuyTime() <= 0) throw new Error('round 2 deveria ter tempo de compra');
  // menu aberto pausa o tempo de compra e segura os bots do round 2
  const btR2 = OT.getBuyTime();
  fire(global.window, 'keydown', { code: 'KeyB', preventDefault() {} });
  if (!OT.menuOpenNow()) throw new Error('menu deveria abrir no round 2');
  runFrames(120);
  if (OT.bots.length !== 0) throw new Error('bots nasceram com o menu aberto (round 2)');
  if (OT.getBuyTime() !== btR2) throw new Error('tempo de compra correu com o menu aberto (round 2)');
  fire(global.window, 'keydown', { code: 'KeyB', preventDefault() {} });
  if (OT.menuOpenNow()) throw new Error('menu deveria fechar');
  OT.skipBuyTime();
  runFrames(1);
  if (String(els['left'].textContent) !== '6') throw new Error('round 2 deveria ter 6 bots, tem ' + els['left'].textContent);
  // XP/nível: 4 abates + vitória = 4·25 + 100 = 200 XP → sobe para o nível 2 (100/200)
  if (OT.getLevel() !== 2) throw new Error('deveria subir para o nível 2, está no ' + OT.getLevel());
  if (OT.getXp() !== 100) throw new Error('xp deveria ser 100, é ' + OT.getXp());
  if (String(els['lvl'].textContent) !== '2') throw new Error('HUD de nível incorreto: ' + els['lvl'].textContent);
  if (els['xpgain'].textContent !== '+200 XP') throw new Error('painel de xp não mostrou o ganho: ' + els['xpgain'].textContent);
  const savedP = JSON.parse(memStore['ot_player']);
  if (savedP.level !== 2 || savedP.xp !== 100) throw new Error('persistência falhou: ' + memStore['ot_player']);
  memStore['ot_player'] = JSON.stringify({ level: 5, xp: 30 });
  OT.loadProgress();
  if (OT.getLevel() !== 5 || OT.getXp() !== 30) throw new Error('loadProgress (F5) falhou');
  console.log('XP/nível: level-up + persistência em localStorage ✔');
  console.log('rodadas: bônus $1000 + avanço + spawn travado com menu aberto ✔');
}

// 5) morte e reinício da rodada
{
  OT.setState('play');
  OT.player.hp = 1; OT.player.armor = 0;
  OT.hurtPlayer(50);
  if (OT.stateNow() !== 'dead') throw new Error('deveria morrer');
  runFrames(300);
  if (OT.stateNow() !== 'play') throw new Error('deveria renascer, estado: ' + OT.stateNow());
  if (OT.roundNow() !== 2) throw new Error('morte deveria repetir o round 2');
  if (OT.player.hp !== 100) throw new Error('vida deveria restaurar para 100');
  console.log('morte/retry ✔');
}

// 6) maratona final de robustez
runFrames(4000);
if (frames < 3600) throw new Error('loop parou cedo: ' + frames + ' frames');
const hp = parseFloat(els['hpnum'].textContent);
if (!(hp >= 0 && hp <= 100)) throw new Error('hp inválido: ' + hp);
console.log('frames executados:', frames);
console.log('SMOKE TEST PASSOU ✔ (economia, menu de compra, spawns, combate, rodadas, morte/retry — sem exceções)');
process.exit(0);