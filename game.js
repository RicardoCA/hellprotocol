/* Operação Tática — lógica do jogo (100% original). */
(function () {
'use strict';

// ---------- mapas (6 arenas 24x24) ----------
const MW = 24, MH = 24;
let map = new Uint8Array(MW * MH);
let botSpawns = [], pickupsSpots = [];
let PLAYER_SPAWN = [12.5, 21.5];
let mapName = 'DEPÓSITO';
let selectedMap = 1;
let scenery = [];
const scenerySolid = new Set();
// 1 = tijolo, 2 = concreto, 3 = caixote, 4 = reboco, 5 = metal
function buildMap(id) {
  const m = new Uint8Array(MW * MH);
  const R = function (x, y, w, h, t) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) m[j * MW + i] = t; };
  for (let i = 0; i < MW; i++) { m[i] = 1; m[(MH - 1) * MW + i] = 1; }
  for (let j = 0; j < MH; j++) { m[j * MW] = 1; m[j * MW + MW - 1] = 1; }
  const info = { map: m, botSpawns: [], pickups: [], playerSpawn: [12.5, 21.5], name: '', scenery: [] };
  if (id === 2) {
    info.name = 'PÁTIO';
    R(5, 3, 2, 2, 2); R(9, 2, 6, 1, 5); R(17, 4, 2, 2, 3); R(20, 8, 2, 2, 2);
    R(3, 8, 3, 1, 3); R(10, 7, 4, 4, 5); R(17, 12, 4, 1, 3); R(5, 13, 2, 2, 4);
    R(9, 15, 3, 2, 2); R(16, 17, 4, 1, 5); R(2, 17, 3, 1, 3); R(11, 20, 4, 1, 2);
    info.botSpawns = [[21.5, 2.5], [7.5, 4.5], [2.5, 12.5], [21.5, 12.5], [2.5, 21.5], [21.5, 21.5], [16.5, 7.5], [2.5, 5.5], [12.5, 13.5]];
    info.pickups = [[7.5, 20.5, 'health'], [18.5, 6.5, 'health'], [7.5, 7.5, 'armor'], [19.5, 14.5, 'armor'], [2.5, 10.5, 'ammo'], [21.5, 17.5, 'ammo'], [12.5, 12.5, 'ammo']];
    // cenário: caminhões e carros estacionados (colisão sólida)
    info.scenery = [
      { x: 5.5, y: 20.5, k: 'truck', scale: 1.15, vMove: 14, solid: true },
      { x: 15.5, y: 20.5, k: 'car', scale: 0.95, vMove: 32, solid: true },
      { x: 18.5, y: 20.5, k: 'car', scale: 0.95, vMove: 32, solid: true },
      { x: 8.5, y: 5.5, k: 'truck', scale: 1.15, vMove: 14, solid: true },
      { x: 3.5, y: 5.5, k: 'car', scale: 0.95, vMove: 32, solid: true }
    ];
  } else if (id === 3) {
    info.name = 'SILO';
    info.playerSpawn = [7.5, 21.5];
    R(2, 3, 4, 1, 5); R(9, 2, 2, 4, 5); R(14, 3, 3, 1, 3); R(19, 2, 3, 2, 5);
    R(2, 8, 1, 4, 3); R(5, 10, 4, 1, 5); R(12, 8, 2, 2, 3); R(16, 9, 1, 5, 5);
    R(20, 10, 2, 1, 3); R(3, 15, 3, 1, 2); R(9, 14, 1, 4, 5); R(13, 16, 4, 1, 3);
    R(18, 14, 2, 2, 2); R(6, 19, 3, 1, 3); R(12, 20, 2, 2, 5); R(17, 19, 4, 1, 2);
    R(2, 20, 2, 1, 3);
    info.botSpawns = [[2.5, 2.5], [16.5, 2.5], [9.5, 7.5], [21.5, 7.5], [2.5, 12.5], [21.5, 16.5], [2.5, 17.5], [14.5, 20.5], [7.5, 15.5]];
    info.pickups = [[12.5, 13.5, 'health'], [20.5, 20.5, 'health'], [5.5, 7.5, 'armor'], [18.5, 10.5, 'armor'], [2.5, 6.5, 'ammo'], [12.5, 2.5, 'ammo'], [7.5, 17.5, 'ammo']];
  } else if (id === 4) {
    info.name = 'DUNAS';
    // tema deserto: muros de adobe/reboco (1, 4) com caixotes de madeira (3)
    R(6, 3, 1, 5, 1); R(6, 11, 1, 5, 1);
    R(10, 7, 4, 1, 4); R(10, 15, 4, 1, 4);
    R(17, 4, 3, 2, 1); R(20, 8, 2, 2, 4);
    R(3, 4, 2, 2, 3); R(2, 14, 3, 1, 4);
    R(15, 11, 2, 2, 3); R(9, 19, 3, 1, 4); R(4, 20, 2, 1, 1); R(19, 16, 3, 1, 3);
    info.botSpawns = [[2.5, 2.5], [7.5, 4.5], [2.5, 8.5], [12.5, 3.5], [17.5, 2.5], [21.5, 3.5], [21.5, 12.5], [11.5, 12.5], [8.5, 21.5]];
    info.pickups = [[2.5, 12.5, 'health'], [8.5, 8.5, 'ammo'], [13.5, 11.5, 'armor'], [21.5, 20.5, 'health'], [5.5, 17.5, 'ammo'], [17.5, 9.5, 'armor'], [11.5, 21.5, 'ammo']];
  } else if (id === 5) {
    info.name = 'OÁSIS';
    // tema deserto: prédio central de adobe (1) com caixotes de madeira (3)
    R(9, 9, 5, 4, 1);
    R(3, 3, 2, 2, 3); R(18, 3, 2, 2, 3); R(3, 18, 2, 2, 3); R(18, 18, 2, 2, 3);
    R(7, 6, 1, 2, 4); R(16, 15, 1, 2, 4); R(10, 18, 3, 1, 4);
    info.botSpawns = [[2.5, 2.5], [7.5, 2.5], [16.5, 2.5], [21.5, 2.5], [2.5, 11.5], [21.5, 11.5], [11.5, 15.5], [2.5, 20.5], [20.5, 20.5]];
    info.pickups = [[4.5, 15.5, 'health'], [19.5, 7.5, 'health'], [2.5, 6.5, 'armor'], [21.5, 13.5, 'armor'], [11.5, 16.5, 'ammo'], [6.5, 2.5, 'ammo'], [17.5, 21.5, 'ammo']];
  } else if (id === 6) {
    info.name = 'FORJA';
    // tema industrial: muros de tijolo escuro (1) e metal (5)
    R(4, 16, 1, 5, 5); R(5, 11, 1, 5, 5); R(6, 6, 1, 5, 5);
    R(2, 2, 2, 2, 5);
    R(11, 8, 2, 2, 1); R(15, 12, 2, 2, 1); R(13, 3, 1, 3, 5);
    R(20, 5, 1, 3, 1); R(17, 2, 2, 1, 5); R(17, 16, 1, 3, 5);
    R(10, 19, 3, 1, 1); R(9, 9, 1, 3, 5);
    info.botSpawns = [[5.5, 2.5], [2.5, 9.5], [2.5, 20.5], [8.5, 2.5], [15.5, 2.5], [21.5, 2.5], [21.5, 10.5], [21.5, 20.5], [12.5, 12.5]];
    info.pickups = [[2.5, 6.5, 'armor'], [20.5, 3.5, 'health'], [3.5, 15.5, 'health'], [12.5, 6.5, 'ammo'], [18.5, 15.5, 'armor'], [21.5, 17.5, 'ammo'], [9.5, 20.5, 'health']];
  } else {
    info.name = 'DEPÓSITO';
    R(2, 2, 3, 2, 2); R(7, 2, 5, 1, 3); R(15, 2, 1, 5, 4); R(19, 3, 3, 2, 2);
    R(4, 5, 1, 4, 3); R(9, 5, 2, 2, 3); R(12, 7, 4, 1, 2); R(18, 8, 1, 5, 5);
    R(3, 9, 2, 1, 4); R(7, 11, 3, 1, 3); R(13, 10, 2, 3, 2); R(20, 12, 2, 1, 3);
    R(5, 14, 1, 5, 2); R(9, 15, 4, 1, 4); R(16, 15, 3, 2, 3);
    R(3, 18, 4, 1, 2); R(11, 19, 1, 3, 3); R(15, 19, 5, 1, 4); R(20, 18, 2, 2, 2);
    info.botSpawns = [[6.5, 4.5], [21.5, 2.5], [12.5, 2.5], [2.5, 12.5], [21.5, 10.5], [16.5, 4.5], [9.5, 9.5], [21.5, 21.5], [2.5, 16.5]];
    info.pickups = [[6.5, 12.5, 'health'], [17.5, 20.5, 'health'], [12.5, 5.5, 'armor'], [6.5, 3.5, 'armor'], [2.5, 6.5, 'ammo'], [21.5, 15.5, 'ammo'], [12.5, 17.5, 'ammo']];
  }
  return info;
}
function applyMap(id) {
  const info = buildMap(id);
  map = info.map;
  botSpawns = info.botSpawns;
  scenery = info.scenery || [];
  // células ocupadas por veículos ficam sólidas (colisão com o cenário)
  scenerySolid.clear();
  for (const s of scenery) {
    if (s.solid) scenerySolid.add((s.y | 0) * MW + (s.x | 0));
  }
  if (Engine.setFloorCeil && Tex.floors && Tex.ceils) {
    Engine.setFloorCeil(Tex.floors[id] || Tex.floor, Tex.ceils[id] || Tex.ceil);
  }
  pickupsSpots = info.pickups;
  PLAYER_SPAWN = info.playerSpawn;
  mapName = info.name;
  Engine.setMap(MW, MH, map);
}

// ---------- armas ----------
const WEAPONS = {
  pistol:   { name: 'PISTOLA 9MM',       short: 'PISTOLA',  dmg: 26, spread: 0.028, rate: 0.34,  mag: 12, reload: 1.1, range: 22, auto: false, sfx: 'pistol',   pellets: 1, kick: 16, noise: 9,  price: 0 },
  pistol50: { name: 'PISTOLA .50',       short: '.50',      dmg: 48, spread: 0.022, rate: 0.55,  mag: 7,  reload: 1.4, range: 24, auto: false, sfx: 'pistol50', pellets: 1, kick: 30, noise: 11, price: 650 },
  shotgun:  { name: 'ESCOPETA',          short: 'ESCOPETA', dmg: 12, spread: 0.085, rate: 0.95,  mag: 8,  reload: 2.2, range: 14, auto: false, sfx: 'shotgun',  pellets: 8, kick: 34, noise: 13, price: 1800 },
  rifle:    { name: 'FUZIL DE ASSALTO',  short: 'FUZIL',    dmg: 30, spread: 0.05,  rate: 0.105, mag: 30, reload: 1.7, range: 26, auto: true,  sfx: 'rifle',    pellets: 1, kick: 10, noise: 11, price: 2500 },
  mg:       { name: 'METRALHADORA LEVE', short: 'METRA',    dmg: 20, spread: 0.065, rate: 0.085, mag: 60, reload: 3.2, range: 24, auto: true,  sfx: 'mg',       pellets: 1, kick: 6,  noise: 12, price: 3500 }
};
const SLOTS = ['pistol', 'pistol50', 'shotgun', 'rifle', 'mg'];
const BUY_LIST = [
  { k: 'pistol50', price: 650 },
  { k: 'shotgun', price: 1800 },
  { k: 'rifle', price: 2500 },
  { k: 'mg', price: 3500 },
  { k: 'armor', price: 1000 },
  { k: 'health', price: 600 }
];

// ---------- estado ----------
const player = {
  x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1], a: -Math.PI / 2,
  hp: 100, armor: 0, w: 'pistol', moving: false, run: true,
  ammo: { pistol: { mag: 12, res: 36 }, pistol50: { mag: 7, res: 21 }, shotgun: { mag: 8, res: 24 }, rifle: { mag: 30, res: 90 }, mg: { mag: 60, res: 120 } },
  owned: { pistol: true },
  cool: 0, reloading: 0, bob: 0
};
let state = 'menu'; // menu | play | pause | win | dead
let round = 1, kills = 0, winT = 0, deadT = 0;
let bots = [], pickups = [], parts = [];
let firing = false, locked = false, minimapOn = true;
let smoke = [], lastMuzzle = { x: 780, y: 420 };
let money = 800, menuOpen = false, buyTime = 0, pendingCount = 0, botsSpawned = false, buyMsgT = 0;
let level = 1, xp = 0, roundKills = 0, xpAnim = null;
let hurtT = 0, hitT = 0;
let best = 0;
try { best = +(localStorage.getItem('ot_best') || 0); } catch (e) {}

// ---------- mobile (controles touch estilo emulador) ----------
let isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const mStick = { active: false, id: null, dx: 0, dy: 0 };
let mLookId = null, mLookLastX = 0;

// ---------- DOM ----------
const $ = function (id) { return document.getElementById(id); };
const canvas = $('game'), ctx = canvas.getContext('2d');
const cross = $('cross'), vig = $('vig'), banner = $('banner');
const bh = $('bh'), bp = $('bp'), feed = $('feed');
const mmCv = $('minimap'), mm = mmCv.getContext('2d');
const menuOv = $('menu'), pauseOv = $('pause');
const keys = {};

// ---------- colisão / raios ----------
function solidBox(x, y, r) {
  const x0 = (x - r) | 0, x1 = (x + r) | 0, y0 = (y - r) | 0, y1 = (y + r) | 0;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    if (i < 0 || j < 0 || i >= MW || j >= MH) return true;
    if (map[j * MW + i] > 0) return true;
    if (scenerySolid.has(j * MW + i)) return true;
  }
  return false;
}
function tryMove(o, vx, vy, r) {
  const nx = o.x + vx;
  if (!solidBox(nx, o.y, r)) o.x = nx;
  const ny = o.y + vy;
  if (!solidBox(o.x, ny, r)) o.y = ny;
}
function los(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist * 8);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const cx = (x0 + dx * t) | 0, cy = (y0 + dy * t) | 0;
    if (map[cy * MW + cx] > 0) return false;
  }
  return true;
}
function wallDist(x, y, ang, max) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  for (let t = 0.05; t < max; t += 0.05) {
    const cx = (x + dx * t) | 0, cy = (y + dy * t) | 0;
    if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return t;
    if (map[cy * MW + cx] > 0) return t;
  }
  return max;
}
function bfsPath(sx, sy, tx, ty) {
  const start = (sy | 0) * MW + (sx | 0);
  const goal = (ty | 0) * MW + (tx | 0);
  if (start === goal) return [];
  if (start < 0 || goal < 0 || start >= MW * MH || goal >= MW * MH) return null;
  if (map[goal] > 0) return null;
  const prev = new Int32Array(MW * MH).fill(-1);
  const seen = new Uint8Array(MW * MH);
  const q = [start];
  seen[start] = 1;
  let found = false;
  while (q.length) {
    const c = q.shift();
    if (c === goal) { found = true; break; }
    const cx = c % MW, cy = (c / MW) | 0;
    for (const nb of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]]) {
      const nx = nb[0], ny = nb[1];
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      const idx = ny * MW + nx;
      if (seen[idx] || map[idx] > 0) continue;
      seen[idx] = 1; prev[idx] = c; q.push(idx);
    }
  }
  if (!found) return null;
  const path = [];
  let c = goal;
  while (c !== start && c >= 0) { path.push(c); c = prev[c]; }
  path.reverse();
  return path;
}
function setBotPath(b, tx, ty) {
  b.path = bfsPath(b.x, b.y, tx, ty);
  b.pathI = 0;
}
function followPath(b, dt, speedMul) {
  if (!b.path || b.pathI >= b.path.length) return false;
  const c = b.path[b.pathI];
  const tx = (c % MW) + 0.5, ty = ((c / MW) | 0) + 0.5;
  const dxn = tx - b.x, dyn = ty - b.y;
  const dn = Math.hypot(dxn, dyn) || 0.001;
  if (dn < 0.25) { b.pathI++; return followPath(b, dt, speedMul); }
  const ox = b.x, oy = b.y;
  const step = Math.min(b.speed * speedMul * dt, dn);
  tryMove(b, (dxn / dn) * step, (dyn / dn) * step, 0.25);
  const moved = Math.hypot(b.x - ox, b.y - oy);
  if (moved < step * 0.2) {
    b.stuckT += dt;
    if (b.stuckT > 0.7) { b.stuckT = 0; b.path = null; return false; }
  } else {
    b.stuckT = 0;
  }
  b.a = Math.atan2(dyn, dxn);
  b.ft += dt * 1.5 * speedMul;
  return true;
}

// ---------- movimento ----------
function movePlayer(dt) {
  let fw = 0, st = 0;
  if (keys['KeyW']) fw += 1;
  if (keys['KeyS']) fw -= 1;
  if (keys['KeyD']) st += 1;
  if (keys['KeyA']) st -= 1;
  if (isMobile && mStick.active) {
    // tela: para cima é -Y; no jogo, frente é +Y — joystick dá controle analógico (-1..1)
    fw += -mStick.dy;
    st += mStick.dx;
  }
  if (keys['ArrowLeft']) player.a -= 2.6 * dt;
  if (keys['ArrowRight']) player.a += 2.6 * dt;
  const run = !keys['ShiftLeft'] && !keys['ShiftRight'];
  const sp = run ? 3.3 : 1.5;
  if (fw || st) {
    const dx = Math.cos(player.a), dy = Math.sin(player.a);
    const vx = (dx * fw - dy * st) * sp * dt;
    const vy = (dy * fw + dx * st) * sp * dt;
    tryMove(player, vx, vy, 0.22);
    player.bob += dt * (run ? 11 : 7);
    player.moving = true; player.run = run;
  } else {
    player.moving = false;
  }
}

// ---------- armas ----------
function startReload() {
  const w = WEAPONS[player.w], am = player.ammo[player.w];
  if (player.reloading > 0 || am.mag >= w.mag || am.res <= 0) return;
  player.reloading = w.reload;
  Sfx.reload();
}
function finishReload() {
  const w = WEAPONS[player.w], am = player.ammo[player.w];
  const need = w.mag - am.mag;
  const take = Math.min(need, am.res);
  am.mag += take; am.res -= take;
  player.reloading = 0;
}
function switchWeapon(w) {
  if (player.w === w) return;
  player.w = w;
  player.reloading = 0;
  player.cool = Math.max(player.cool, 0.22);
  firing = false;
}
function toggleMenu() {
  if (state !== 'play' || buyTime <= 0) { Sfx.deny(); return; }
  menuOpen = !menuOpen;
  if (menuOpen) {
    if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    refreshBuyMenu();
    $('buymenu').classList.remove('hidden');
  } else {
    $('buymenu').classList.add('hidden');
    lockPointer();
  }
}
function refreshBuyMenu() {
  $('bmoney').textContent = money;
  $('buymsg').textContent = '';
}
function flashBuyMsg(msg) {
  $('buymsg').textContent = msg;
  if (buyMsgT) clearTimeout(buyMsgT);
  buyMsgT = setTimeout(function () { $('buymsg').textContent = ''; }, 1600);
}
function buyItem(k) {
  if (!menuOpen || state !== 'play') return;
  const item = BUY_LIST.find(function (b2) { return b2.k === k; });
  if (money < item.price) { Sfx.deny(); flashBuyMsg('DINHEIRO INSUFICIENTE'); return; }
  if (k === 'armor') {
    if (player.armor >= 100) { Sfx.deny(); flashBuyMsg('COLETE JÁ ESTÁ COMPLETO'); return; }
    money -= item.price;
    player.armor = 100;
    addFeed('Colete comprado');
  } else if (k === 'health') {
    if (player.hp >= 100) { Sfx.deny(); flashBuyMsg('VIDA JÁ ESTÁ CHEIA'); return; }
    money -= item.price;
    player.hp = Math.min(100, player.hp + 50);
    addFeed('Kit de cura usado (+50 vida)');
  } else {
    money -= item.price;
    player.owned[k] = true;
    const w = WEAPONS[k];
    player.ammo[k] = { mag: w.mag, res: w.mag * 4 };
    switchWeapon(k);
    addFeed(w.name + ' comprada');
  }
  Sfx.buy();
  $('bmoney').textContent = money;
  updateHud();
}
function traceShot(ang, range) {
  const wd = wallDist(player.x, player.y, ang, range);
  let hitB = null, hitD = 1e9;
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    if (!b.alive) continue;
    const dx = b.x - player.x, dy = b.y - player.y;
    const d = Math.hypot(dx, dy);
    if (d > wd + 0.3) continue;
    let da = Math.atan2(dy, dx) - ang;
    da = Math.atan2(Math.sin(da), Math.cos(da));
    if (Math.abs(da) <= Math.atan2(0.36, Math.max(0.5, d)) && d < hitD) { hitD = d; hitB = b; }
  }
  return { bot: hitB, wall: wd, hit: !!hitB };
}
function playerShoot() {
  const w = WEAPONS[player.w], am = player.ammo[player.w];
  if (player.reloading > 0 || player.cool > 0) return;
  if (am.mag <= 0) { Sfx.empty(); player.cool = 0.3; if (am.res > 0) startReload(); return; }
  am.mag--;
  player.cool = w.rate;
  Sfx[w.sfx]();
  smoke.push({ x: lastMuzzle.x, y: lastMuzzle.y, vx: -18 - Math.random() * 30, vy: -12 - Math.random() * 18, life: 0.4 + Math.random() * 0.25, max: 0.6, r: 5 + Math.random() * 7 });
  const moving = player.moving ? (player.run ? 1.35 : 1.9) : 1;
  const spread = w.spread * moving;
  const dmgMap = {};
  let dust = 0;
  for (let p2 = 0; p2 < w.pellets; p2++) {
    const ang = player.a + (Math.random() * 2 - 1) * spread;
    const res = traceShot(ang, w.range);
    if (res.hit) {
      dmgMap[res.bot.id] = (dmgMap[res.bot.id] || 0) + w.dmg * (0.85 + Math.random() * 0.3);
      parts.push({ x: res.bot.x, y: res.bot.y, life: 0.4, max: 0.4, s: 0.22, tex: 'blood', v: 60 });
    } else if (dust < 3) {
      dust++;
      parts.push({ x: player.x + Math.cos(ang) * res.wall, y: player.y + Math.sin(ang) * res.wall, life: 0.35, max: 0.35, s: 0.16, tex: 'dust', v: 80 });
    }
  }
  if (mpRole === 'guest') {
    // autoridade do host: o dano do convidado é reportado ao host
    // (a cópia local dos bots é sobrescrita pelo sync a cada 0,1s)
    if (Object.keys(dmgMap).length > 0) {
      Net.send({ t: 'shot', d: dmgMap, x: +player.x.toFixed(2), y: +player.y.toFixed(2), n: w.noise });
      cross.classList.add('hit'); hitT = 0.12;
      Sfx.hit();
    }
  } else {
    for (const idStr in dmgMap) {
      const id = +idStr;
      for (let i = 0; i < bots.length; i++) {
        if (bots[i].id === id && bots[i].alive) {
          const crit = Math.random() < 0.15;
          damageBot(bots[i], Math.round(dmgMap[idStr] * (crit ? 1.5 : 1)), crit);
          break;
        }
      }
    }
  }
  for (let i = 0; i < bots.length; i++) {
    const b = bots[i];
    if (!b.alive) continue;
    if (Math.hypot(b.x - player.x, b.y - player.y) < w.noise) { b.alert = true; b.lastSeen = 0; }
  }
}
function damageBot(b, dmg, crit) {
  b.hp -= dmg;
  b.flash = 0.12;
  b.alert = true; b.lastSeen = 0;
  cross.classList.add('hit'); hitT = 0.12;
  if (b.hp <= 0) {
    b.alive = false;
    kills++;
    roundKills++;
    money = Math.min(99999, money + 300);
    Sfx.kill();
    addFeed('Bot-' + b.id + ' eliminado (+$300)');
  } else {
    if (crit) Sfx.crit(); else Sfx.hit();
  }
}
function hurtPlayer(dmg) {
  if (state !== 'play') return;
  if (player.armor > 0) {
    const ab = Math.min(player.armor, dmg * 0.6);
    player.armor -= ab;
    dmg -= ab;
  }
  player.hp -= dmg;
  hurtT = 0.35;
  Sfx.hurt();
  if (player.hp <= 0) { player.hp = 0; die(); }
}
function die() {
  state = 'dead'; deadT = 0; firing = false;
  if (mpOn) {
    // avisa o outro player para que a rodada só reinicie quando ambos terminarem
    Net.send({ t: 'death' });
    // se o outro player já terminou, dispara o reinício sincronizado agora
    if (mpPeerDone) mpFinishRound();
  }
  Sfx.lose();
  showBanner('VOCÊ MORREU', mpOn && !mpPeerDone ? 'Aguardando o outro jogador concluir a rodada…' : 'Reiniciando a rodada ' + round + '…');
  awardRoundXp(false);
}
// reinício sincronizado: reinicia a rodada local e força o peer a fazer o mesmo
function mpFinishRound() {
  if (state === 'dead') {
    Net.send({ t: 'syncRound', round: round, map: selectedMap });
    startRound(round);
  } else if (state === 'win') {
    Net.send({ t: 'syncRound', round: round + 1, map: selectedMap });
    startRound(round + 1);
  }
}

// ---------- pickups ----------
function buildPickups() {
  const list = [];
  for (const s of pickupsSpots) list.push({ t: s[2], x: s[0], y: s[1], taken: false, seed: Math.random() * 6 });
  return list;
}
function checkPickups() {
  for (const p of pickups) {
    if (p.taken) continue;
    const dx = p.x - player.x, dy = p.y - player.y;
    if (dx * dx + dy * dy > 0.36) continue;
    if (p.t === 'health') {
      if (player.hp >= 100) continue;
      player.hp = Math.min(100, player.hp + 30);
      addFeed('Medkit coletado (+30 vida)');
    } else if (p.t === 'armor') {
      if (player.armor >= 100) continue;
      player.armor = Math.min(100, player.armor + 50);
      addFeed('Colete equipado (+50 armadura)');
    } else {
      player.ammo.pistol.res = Math.min(120, player.ammo.pistol.res + 24);
      player.ammo.rifle.res = Math.min(180, player.ammo.rifle.res + 30);
      player.ammo.shotgun.res = Math.min(60, player.ammo.shotgun.res + 8);
      addFeed('Munição coletada');
    }
    p.taken = true;
    Sfx.pickup();
  }
}
// ---------- bots ----------
function makeBot(id, x, y, r) {
  return {
    id: id, x: x, y: y, a: Math.random() * 6.283,
    hp: 100, alive: true, alert: false, lastSeen: 0,
    wt: Math.random() * 2.5, dx: 0, dy: 0,
    cool: 0.8 + Math.random() * 1.2, flash: 0, ft: Math.random() * 3,
    deathT: 0, strafeT: 0, strafeDir: 0,
    path: null, pathI: 0, repathT: 0, stuckT: 0,
    speed: 1.5 + r * 0.06 + Math.random() * 0.2, dmg: 7 + r * 0.8
  };
}
function chaseMove(b, dx, dy, d, dt) {
  const ux = dx / d, uy = dy / d;
  const sp = b.speed;
  let moved = false;
  if (d > 1.1) {
    const nx = b.x + ux * sp * dt, ny = b.y + uy * sp * dt;
    if (!solidBox(nx, ny, 0.25)) { b.x = nx; b.y = ny; moved = true; }
    else {
      const nx2 = b.x + ux * sp * dt;
      if (!solidBox(nx2, b.y, 0.25)) { b.x = nx2; moved = true; }
      const ny2 = b.y + uy * sp * dt;
      if (!solidBox(b.x, ny2, 0.25)) { b.y = ny2; moved = true; }
      if (!moved) {
        const sx2 = b.x - uy * sp * dt, sy2 = b.y + ux * sp * dt;
        if (!solidBox(sx2, sy2, 0.25)) { b.x = sx2; b.y = sy2; moved = true; }
      }
    }
    if (moved) b.ft += dt * 1.5;
  }
}
function updateBot(b, dt) {
  if (!b.alive) { b.deathT += dt; return; }
  if (b.flash > 0) b.flash -= dt;
  const dx = player.x - b.x, dy = player.y - b.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const seen = d < 15 && los(b.x, b.y, player.x, player.y);
  if (seen) { b.alert = true; b.lastSeen = 0; }
  else if (b.alert) b.lastSeen += dt;
  if (b.alert && b.lastSeen > 7) b.alert = false;
  if (b.alert) {
    if (seen) b.a = Math.atan2(dy, dx);
    if (seen && d < 12) {
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafeT = 0.7 + Math.random() * 0.9; b.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      if (d > 1.6 && b.strafeDir) {
        tryMove(b, (-dy / d) * b.strafeDir * b.speed * 0.6 * dt, (dx / d) * b.strafeDir * b.speed * 0.6 * dt, 0.25);
        b.ft += dt;
      }
      b.cool -= dt;
      if (b.cool <= 0) {
        b.cool = 0.55 + Math.random() * 0.9;
        b.flash = 0.1;
        Sfx.enemyShot(Math.max(0.08, 0.5 - d * 0.032));
        const acc = Math.max(0.12, 0.62 - d * 0.035);
        if (Math.random() < acc) hurtPlayer(b.dmg * (0.8 + Math.random() * 0.5));
      }
      if (d < 0.7) tryMove(b, (-dx / d) * dt, (-dy / d) * dt, 0.25);
    } else {
      // persegue com pathfinding — contorna paredes de verdade
      b.repathT -= dt;
      if (b.repathT <= 0 || !b.path) {
        b.repathT = 0.4 + Math.random() * 0.3;
        setBotPath(b, player.x, player.y);
      }
      if (!followPath(b, dt, 1)) chaseMove(b, dx, dy, d, dt);
    }
  } else {
    b.wt -= dt;
    if (b.wt <= 0) {
      b.wt = 1.5 + Math.random() * 2.5;
      if (Math.random() < 0.45) {
        // ronda em direção à área do jogador — encontros acontecem
        const gx = Math.max(1.5, Math.min(MW - 1.5, player.x + (Math.random() * 12 - 6)));
        const gy = Math.max(1.5, Math.min(MH - 1.5, player.y + (Math.random() * 12 - 6)));
        setBotPath(b, gx, gy);
      } else {
        b.path = null;
        const a2 = Math.random() * 6.283;
        b.dx = Math.cos(a2); b.dy = Math.sin(a2);
      }
    }
    if (b.path) {
      if (!followPath(b, dt, 0.6)) b.path = null;
    } else {
      const nx = b.x + b.dx * b.speed * 0.55 * dt;
      const ny = b.y + b.dy * b.speed * 0.55 * dt;
      let moved = false;
      if (!solidBox(nx, b.y, 0.25)) { b.x = nx; moved = true; } else b.dx *= -1;
      if (!solidBox(b.x, ny, 0.25)) { b.y = ny; moved = true; } else b.dy *= -1;
      if (moved) b.ft += dt;
    }
  }
}

// ---------- lista de sprites para o motor ----------
function spriteList(t) {
  const out = [];
  // cenário estático (veículos, caixotes grandes) — sempre atrás dos bots no z-buffer automático do motor
  for (const s of scenery) {
    out.push({ x: s.x, y: s.y, tex: Tex.scenery[s.k], scale: s.scale, vMove: s.vMove });
  }
  // jogadores remotos (multiplayer) — desenhados como soldados
  if (mpOn) {
    for (const id in mpRemote) {
      const r = mpRemote[id];
      if (r.hp <= 0) continue;
      const frame = r.m ? Tex.bot[(t * 6 | 0) % 4] : Tex.bot[0];
      out.push({ x: r.x, y: r.y, tex: frame, scale: 0.82, vMove: 36 });
    }
  }
  for (const b of bots) {
    if (!b.alive) {
      if (b.deathT < 0.28) out.push({ x: b.x, y: b.y, tex: Tex.bot[5], scale: 0.72, vMove: 56 });
      else out.push({ x: b.x, y: b.y, tex: Tex.bot[6], scale: 0.5, vMove: 100 });
    } else if (b.flash > 0) {
      out.push({ x: b.x, y: b.y, tex: Tex.bot[4], scale: 0.82, vMove: 36, flash: true });
    } else {
      out.push({ x: b.x, y: b.y, tex: Tex.bot[(b.ft * 6 | 0) % 4], scale: 0.82, vMove: 36 });
    }
  }
  for (const p of pickups) {
    if (p.taken) continue;
    out.push({ x: p.x, y: p.y, tex: Tex.pickups[p.t], scale: 0.34, vMove: 132 + Math.sin(t * 2.5 + p.seed) * 9 });
  }
  for (const q of parts) {
    out.push({ x: q.x, y: q.y, tex: q.tex === 'dust' ? Tex.dust : Tex.blood, scale: q.s * (0.35 + 0.65 * (q.life / q.max)), vMove: q.v || 60 });
  }
  return out;
}

// ---------- progressão (XP/nível — persistente em localStorage) ----------
function xpNeed(lv) { return 100 * lv; }
function saveProgress() {
  try { localStorage.setItem('ot_player', JSON.stringify({ level: level, xp: xp })); } catch (e) {}
  $('menulvl').textContent = 'NÍVEL ' + level + ' — ' + xp + '/' + xpNeed(level) + ' XP';
}
function loadProgress() {
  try {
    const s = JSON.parse(localStorage.getItem('ot_player') || 'null');
    if (s && typeof s.level === 'number' && s.level >= 1 && typeof s.xp === 'number' && s.xp >= 0) {
      level = Math.min(99, Math.floor(s.level));
      xp = Math.min(xpNeed(level) - 1, Math.floor(s.xp));
      if (xp < 0) xp = 0;
    }
  } catch (e) {}
  $('menulvl').textContent = 'NÍVEL ' + level + ' — ' + xp + '/' + xpNeed(level) + ' XP';
}
function awardRoundXp(win) {
  const gained = roundKills * 25 + (win ? 100 : 0);
  if (gained <= 0) { xpAnim = null; $('xppanel').classList.add('hidden'); return; }
  const fromLevel = level, fromXp = xp;
  let nx = xp + gained, nl = level;
  while (nx >= xpNeed(nl)) { nx -= xpNeed(nl); nl++; }
  level = nl; xp = nx;
  saveProgress();
  xpAnim = { t: 0, dur: 2.4, fromLevel: fromLevel, fromXp: fromXp, gained: gained, shown: fromLevel };
  $('xptitle').textContent = 'NÍVEL ' + fromLevel;
  $('xpgain').textContent = '+' + gained + ' XP';
  $('xppanel').classList.remove('hidden');
  updateHud();
}
function updateXpPanel(dt) {
  if (!xpAnim) return;
  xpAnim.t += dt;
  const p = Math.min(1, xpAnim.t / xpAnim.dur);
  const e = p * p * (3 - 2 * p);
  let disp = xpAnim.fromXp + xpAnim.gained * e;
  let lv = xpAnim.fromLevel;
  while (disp >= xpNeed(lv)) { disp -= xpNeed(lv); lv++; }
  if (lv > xpAnim.shown) { xpAnim.shown = lv; $('xptitle').textContent = 'SUBIU DE NÍVEL — NÍVEL ' + lv; Sfx.buy(); }
  $('xpfill2').style.width = (disp / xpNeed(lv) * 100).toFixed(1) + '%';
  $('xpxt').textContent = Math.floor(disp) + ' / ' + xpNeed(lv) + ' XP';
}

// ---------- rodadas ----------
function startRound(r) {
  round = r;
  // nova rodada: reseta os flags de sincronização multiplayer
  mpPeerDone = false;
  mpDoneSent = false;
  applyMap(selectedMap);
  pendingCount = Math.min(4 + (r - 1) * 2, 12);
  bots = []; botsSpawned = false;
  buyTime = 10;
  if (menuOpen) { menuOpen = false; $('buymenu').classList.add('hidden'); }
  pickups = buildPickups();
  parts = []; smoke = [];
  roundKills = 0; xpAnim = null;
  $('xppanel').classList.add('hidden');
  player.x = PLAYER_SPAWN[0]; player.y = PLAYER_SPAWN[1]; player.a = -Math.PI / 2;
  player.hp = 100; player.cool = 0; player.reloading = 0;
  firing = false; winT = 0; deadT = 0;
  $('mapname').textContent = mapName;
  hideBanner();
  updateTop();
  updateHud();
  state = 'play';
}
function spawnPendingBots() {
  const spots = botSpawns.slice();
  for (let i = spots.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const tmp = spots[i]; spots[i] = spots[j]; spots[j] = tmp;
  }
  for (let i = 0; i < pendingCount; i++) {
    const s = spots[i % spots.length];
    const jitter = i >= spots.length ? 0.5 : 0;
    bots.push(makeBot(i + 1, s[0] + (Math.random() - 0.5) * jitter, s[1] + (Math.random() - 0.5) * jitter, round));
  }
  botsSpawned = true;
  addFeed('Inimigos entraram em ação!');
}
function roundWinFn() {
  state = 'win'; winT = 0;
  if (mpOn) {
    // notifica o peer imediatamente ao concluir a rodada
    mpDoneSent = true;
    Net.send({ t: 'win' });
  }
  Sfx.win();
  money = Math.min(99999, money + 1000);
  addFeed('+$1000 — rodada vencida');
  awardRoundXp(true);
  if (round > best) {
    best = round;
    try { localStorage.setItem('ot_best', String(best)); } catch (e) {}
  }
  showBanner('ROUND GANHO', 'Preparando a rodada ' + (round + 1) + '…');
}
// ---------- HUD ----------
function updateHud() {
  $('hpnum').textContent = Math.ceil(player.hp);
  $('hpbar').firstElementChild.style.width = Math.max(0, player.hp) + '%';
  $('arnum').textContent = Math.ceil(player.armor);
  $('armorbar').firstElementChild.style.width = Math.max(0, player.armor) + '%';
  const am = player.ammo[player.w];
  $('mag').textContent = am.mag;
  $('res').textContent = am.res;
    $('wname').textContent = WEAPONS[player.w].name;
  $('money').textContent = money;
  $('lvl').textContent = level;
  $('xpfill').style.width = (xp / xpNeed(level) * 100).toFixed(1) + '%';
  $('menulvl').textContent = 'NÍVEL ' + level + ' — ' + xp + '/' + xpNeed(level) + ' XP';
  for (let i = 0; i < SLOTS.length; i++) {
    const el = $('s' + (i + 1)), k = SLOTS[i];
    el.style.display = player.owned[k] ? 'block' : 'none';
    el.className = player.w === k ? 'on' : '';
  }
  const bt = $('buytimer');
  if (state === 'play' && buyTime > 0) {
    bt.style.display = 'block';
    bt.textContent = menuOpen ? 'MENU ABERTO — os inimigos não nascem enquanto você compra' : 'TEMPO DE COMPRA: ' + Math.ceil(buyTime) + 's — [B] MENU';
  } else {
    bt.style.display = 'none';
  }
  const a = (player.hp < 30 ? 0.32 : 0) + (hurtT > 0 ? 0.3 : 0);
  vig.style.boxShadow = 'inset 0 0 120px 40px rgba(190,0,0,' + a.toFixed(2) + ')';
}
function updateTop() {
  $('round').textContent = round;
  let n = 0;
  for (const b of bots) if (b.alive) n++;
  $('left').textContent = n;
  $('kills').textContent = kills;
}
function addFeed(txt) {
  const d = document.createElement('div');
  d.textContent = txt;
  feed.insertBefore(d, feed.firstChild);
  setTimeout(function () {
    d.style.opacity = '0';
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 700);
  }, 2600);
  while (feed.children.length > 5) feed.removeChild(feed.lastChild);
}
function showBanner(h, p) { bh.textContent = h; bp.textContent = p; banner.classList.remove('hidden'); }
function hideBanner() { banner.classList.add('hidden'); }

// ---------- minimapa ----------
function drawMinimap() {
  const s = 132 / MW;
  mm.fillStyle = 'rgba(8,12,10,0.82)';
  mm.fillRect(0, 0, 132, 132);
  mm.fillStyle = '#44523f';
  for (let j = 0; j < MH; j++) {
    for (let i = 0; i < MW; i++) {
      if (map[j * MW + i] > 0) mm.fillRect(i * s, j * s, s + 0.5, s + 0.5);
    }
  }
  for (const p of pickups) {
    if (p.taken) continue;
    mm.fillStyle = p.t === 'health' ? '#7fe08a' : p.t === 'armor' ? '#8cd0f0' : '#e8c85a';
    mm.fillRect(p.x * s - 1.5, p.y * s - 1.5, 3, 3);
  }
  for (const b of bots) {
    if (!b.alive || !b.alert) continue;
    mm.fillStyle = '#ff5a4a';
    mm.fillRect(b.x * s - 2, b.y * s - 2, 4, 4);
  }
  mm.strokeStyle = '#7fe08a'; mm.lineWidth = 1.5;
  mm.beginPath();
  mm.moveTo(player.x * s, player.y * s);
  mm.lineTo((player.x + Math.cos(player.a) * 2.5) * s, (player.y + Math.sin(player.a) * 2.5) * s);
  mm.stroke();
  mm.fillStyle = '#bff5c4';
  mm.beginPath(); mm.arc(player.x * s, player.y * s, 2.6, 0, 6.283); mm.fill();
}

// ---------- arma em primeira pessoa ----------
function drawWeapon(c2, t) {
  if (state === 'dead' || state === 'menu') return;
  const w = WEAPONS[player.w];
  const bobX = Math.sin(player.bob) * 9;
  const bobY = Math.abs(Math.cos(player.bob)) * 7;
  let kick = 0;
  if (player.cool > 0) kick = (player.cool / w.rate) * w.kick;
  let rel = 0;
  if (player.reloading > 0) rel = Math.sin((1 - player.reloading / w.reload) * Math.PI) * 84;
  const spr = Tex.weapons[player.w];
  const bx = 715 + bobX, by = 468 + bobY + kick + rel;
  c2.drawImage(spr.cv, bx - spr.ox, by - spr.oy);
  if (player.cool > w.rate * 0.55) {
    const s2 = 0.8 + Math.random() * 0.6;
    c2.save();
    c2.translate(bx + spr.tipX, by + spr.tipY);
    c2.scale(s2, s2);
    c2.fillStyle = 'rgba(255,243,176,0.95)';
    c2.beginPath();
    c2.moveTo(0, 0); c2.lineTo(26, -13); c2.lineTo(36, 0); c2.lineTo(26, 13);
    c2.closePath(); c2.fill();
    c2.fillStyle = 'rgba(255,210,74,0.9)';
    c2.beginPath(); c2.arc(7, 0, 7, 0, 6.283); c2.fill();
    c2.restore();
    lastMuzzle.x = bx + spr.tipX;
    lastMuzzle.y = by + spr.tipY;
  }
  for (const s3 of smoke) {
    c2.globalAlpha = Math.max(0, s3.life / s3.max) * 0.45;
    c2.fillStyle = '#8d9490';
    c2.beginPath();
    c2.arc(s3.x, s3.y, s3.r * (1.7 - s3.life / s3.max), 0, 6.283);
    c2.fill();
  }
  c2.globalAlpha = 1;
}
// ---------- entradas ----------
window.addEventListener('keydown', function (e) {
  keys[e.code] = true;
  if (menuOpen) {
    if (e.code === 'KeyB' || e.code === 'Escape') { toggleMenu(); e.preventDefault(); return; }
    const nb = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
    if (nb >= 0 && nb < BUY_LIST.length) { buyItem(BUY_LIST[nb].k); e.preventDefault(); return; }
    return;
  }
  if (state !== 'play') return;
  if (e.code === 'KeyB') { toggleMenu(); e.preventDefault(); return; }
  const ns = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'].indexOf(e.code);
  if (ns >= 0) {
    const k = SLOTS[ns];
    if (player.owned[k]) switchWeapon(k); else Sfx.empty();
  }
  if (e.code === 'KeyR') startReload();
  if (e.code === 'KeyM') {
    minimapOn = !minimapOn;
    if (!minimapOn) mm.clearRect(0, 0, 132, 132);
  }
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(e.code) >= 0) e.preventDefault();
});
window.addEventListener('keyup', function (e) { keys[e.code] = false; });
window.addEventListener('blur', function () {
  for (const k in keys) keys[k] = false;
  if (state === 'play' && !menuOpen) pauseGame();
});
document.addEventListener('pointerlockchange', function () {
  locked = document.pointerLockElement === canvas;
  if (!locked && state === 'play' && !menuOpen) pauseGame();
  if (locked && state === 'pause') resumeNow();
});
document.addEventListener('mousemove', function (e) {
  if (locked && state === 'play') player.a += e.movementX * 0.0022;
});
canvas.addEventListener('mousedown', function (e) {
  if (isMobile) return; // no celular o toque é tratado pelas zonas/botões touch
  if (state !== 'play') return;
  if (!locked) { lockPointer(); return; }
  if (e.button === 0) {
    const w = WEAPONS[player.w];
    if (w.auto) firing = true;
    else playerShoot();
  }
});
window.addEventListener('mouseup', function (e) { if (e.button === 0) firing = false; });
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

function lockPointer() { if (canvas.requestPointerLock) canvas.requestPointerLock(); }
function tryFullscreenLandscape() {
  // melhor experiência no celular: tela cheia + trava de orientação (quando suportado)
  try {
    const root = document.documentElement;
    if (!root.requestFullscreen || document.fullscreenElement) return;
    const p = root.requestFullscreen();
    if (p && p.then) p.then(function () {
      try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(function () {}); } catch (e) {}
    }).catch(function () {});
  } catch (e) {}
}
function pauseGame() {
  if (state !== 'play') return;
  state = 'pause'; firing = false;
  for (const k in keys) keys[k] = false;
  pauseOv.classList.remove('hidden');
}
function resumeNow() { state = 'play'; pauseOv.classList.add('hidden'); hideConfirmBack(); }
function hideConfirmBack() {
  $('confirmBack').classList.add('hidden');
  $('pback').classList.remove('hidden');
}
function goMenu() {
  if (menuOpen) { menuOpen = false; $('buymenu').classList.add('hidden'); }
  // desconecta do multiplayer ao voltar ao menu principal
  // (permite que host/convidado joguem singleplayer depois)
  mpDisconnect();
  state = 'menu';
  firing = false;
  for (const k in keys) keys[k] = false;
  pauseOv.classList.add('hidden');
  hideConfirmBack();
  $('best').textContent = best > 0 ? 'Recorde: ' + best + ' rodada(s) vencida(s)' : '';
  showMenuScreen('mode');
  menuOv.classList.remove('hidden');
}
// ---------- telas do menu principal (modo / single / multiplayer) ----------
function showMenuScreen(which) {
  $('modeSelect').classList.toggle('hidden', which !== 'mode');
  $('singleMenu').classList.toggle('hidden', which !== 'single');
  $('mpMenu').classList.toggle('hidden', which !== 'mp');
  if (which === 'mp') $('mpMsg').textContent = '';
}
function resumeClick() {
  if (isMobile) { resumeNow(); return; }
  lockPointer();
  setTimeout(function () { if (!locked && state === 'pause') resumeNow(); }, 350);
}
pauseOv.addEventListener('click', resumeClick);
$('pback').addEventListener('click', function (e) {
  e.stopPropagation(); // não deixa o clique no fundo da pausa retomar o jogo
  $('pback').classList.add('hidden');
  $('confirmBack').classList.remove('hidden');
});
$('pbackNo').addEventListener('click', function (e) {
  e.stopPropagation();
  hideConfirmBack();
});
$('pbackYes').addEventListener('click', function (e) {
  e.stopPropagation();
  goMenu();
});

// ---------- multiplayer LAN (WebRTC P2P — host autoritativo) ----------
let mpOn = false;                    // modo multiplayer ativo
let mpRole = 'off';                  // 'off' | 'host' | 'guest'
let mpReady = false;                 // partida multiplayer em execução
const mpRemote = {};                 // id -> { x, y, a, hp, name, lastT }
let mpPeerDone = false;              // outro player morreu/concluiu a rodada
let mpDoneSent = false;              // já avisei o peer que concluí/morri nesta rodada
let mpName = 'Jogador';
let mpTimer = 0;
const mpBrokerStates = {};           // diagnóstico: estado de cada sinalizador
// desconecta e reseta todo o estado multiplayer (chamado ao voltar ao menu)
function mpDisconnect() {
  if (!mpOn) return;
  // avisa o peer antes de fechar: convidado avisa o host, host avisa os convidados
  if (mpRole === 'guest') {
    Net.send({ t: 'left' });
  } else if (mpRole === 'host') {
    Net.send({ t: 'server_closed' });
  }
  try { Net.stop(); } catch (e) {}
  mpOn = false;
  mpRole = 'off';
  mpReady = false;
  mpPeerDone = false;
  mpDoneSent = false;
  mpTimer = 0;
  for (const id in mpRemote) delete mpRemote[id];
  const mpMapSelEl = $('mpMapSel');
  if (mpMapSelEl) mpMapSelEl.disabled = false; // libera a escolha de mapa para a próxima partida
}

// mensagem do convidado: aparece na tela inicial E na tela de entrada da sala
// (o mpMsg da home fica escondido enquanto o convidado está na tela de entrar)
function mpGuestMsg(text) {
  $('mpMsg').textContent = text;
  const st = $('mpRoomStatus');
  if (st) st.textContent = text;
}

function mpConnectNet() {
  if (typeof Net === 'undefined') { $('mpMsg').textContent = 'Módulo de rede não carregado.'; return false; }
  Net.onMsg(function (d, from) { mpOnMsg(d, from); });
  Net.onPeers(function (list) { mpUpdatePeers(list); });
  Net.onLobby(function (list) { mpRenderServers(list); });
  Net.onStage(function (txt) {
    // progresso da conexão da sala: host vê no status, convidado no msg
    if (mpRole === 'host') $('mpStatus').textContent = txt;
    else if (mpRole === 'guest') mpGuestMsg(txt);
  });
  Net.onBroker(function (name, state) {
    // diagnóstico ao vivo: estado de cada sinalizador (mostrado na tela de entrada)
    mpBrokerStates[name] = state;
    if (mpRole !== 'guest') return;
    const parts = Object.keys(mpBrokerStates).map(function (n) { return n + ': ' + mpBrokerStates[n]; });
    const el = $('mpBrokers');
    if (el) el.textContent = parts.join(' · ');
  });
  return true;
}
function mpUpdatePeers(list) {
  // convidado: quando o canal abre, apresenta-se e aguarda o host iniciar a partida
  if (mpRole === 'guest' && !mpOn && list.length > 0) {
    mpOn = true;
    Net.send({ t: 'hi', n: mpName });
    mpGuestMsg('Conectado! Aguardando o host iniciar a partida…');
  }
  if (!mpOn) return;
  for (const id in mpRemote) {
    if (list.indexOf(id) < 0) delete mpRemote[id];
  }
  if (mpRole === 'host') $('mpStatus').textContent = list.length === 0
    ? 'Servidor no ar — aguardando jogadores…'
    : 'Servidor no ar — ' + (list.length + 1) + ' jogador(es) conectado(s)';
}
// ---------- sincronização ----------
function mpOnMsg(d, from) {
  if (d.t === 'hi') {
    if (!mpOn) return;
    mpRemote[from] = { x: 12.5, y: 21.5, a: 0, hp: 100, name: d.n || 'Jogador' };
    if (mpRole === 'host') {
      // informa ao convidado o estado atual do mundo
      Net.send({ t: 'world', map: selectedMap, round: round, phase: state });
      addFeed(d.n + ' entrou no servidor');
    }
    return;
  }
  if (d.t === 'p' && mpOn) {
    const r = mpRemote[from] || (mpRemote[from] = { x: d.x, y: d.y, a: d.a, hp: d.hp, name: 'Jogador' });
    r.x = d.x; r.y = d.y; r.a = d.a; r.m = d.m; r.hp = d.hp;
    if (d.s) mpRemoteShoot(r);
    return;
  }
  if (d.t === 'world' && mpRole === 'guest') {
    selectedMap = d.map;
    if (d.phase === 'play' && state === 'menu') mpGuestStart(d.round);
    return;
  }
  if (d.t === 'start' && mpRole === 'guest') {
    selectedMap = d.map || selectedMap;
    if (!mpReady) mpGuestStart(d.round);
    return;
  }
  if (d.t === 'left') {
    // um convidado saiu para o menu — remove apenas ele do servidor
    const nm = (mpRemote[from] || {}).name || 'Jogador';
    delete mpRemote[from];
    if (mpRole === 'host') addFeed(nm + ' saiu do servidor');
    return;
  }
  if (d.t === 'server_closed') {
    // o host fechou o servidor — todos os convidados voltam ao menu
    mpDisconnect();
    if (state !== 'menu') {
      state = 'menu';
      menuOv.classList.remove('hidden');
      showMenuScreen('mode');
    }
    return;
  }
  if (d.t === 'death') {
    // o outro player morreu: aguardamos o syncRound dele para reiniciar juntos
    mpPeerDone = true;
    return;
  }
  if (d.t === 'win') {
    // o outro player concluiu a rodada (matou todos os bots)
    mpPeerDone = true;
    if (state === 'play') {
      // convidado ainda jogando: força a entrada no estado de vitória
      roundWinFn();
    } else if (state === 'dead' || state === 'win') {
      mpFinishRound();
    }
    return;
  }
  if (d.t === 'syncRound' && mpOn) {
    // o peer reiniciou a rodada e está me forçando a sincronizar com ele
    if (d.map) selectedMap = d.map; // garante estar no mesmo mapa do host
    if (state !== 'play' || round !== d.round) startRound(d.round);
    return;
  }
  if (d.t === 'shot' && mpRole === 'host') {
    // autoridade do host: aplica o dano acertado pelo convidado
    for (const idStr in d.d) {
      const id = +idStr;
      for (const b of bots) {
        if (b.id === id && b.alive) {
          const crit = Math.random() < 0.15;
          const dmg = Math.round(d.d[idStr] * (crit ? 1.5 : 1));
          if (b.hp - dmg <= 0) {
            // abate do convidado — host não recebe a recompensa
            b.hp -= dmg; b.flash = 0.12; b.alert = true; b.lastSeen = 0; b.alive = false;
            Net.send({ t: 'kill', id: b.id });
          } else {
            damageBot(b, dmg, crit);
          }
          break;
        }
      }
    }
    // ruído do tiro do convidado alerta os bots perto dele
    for (const b of bots) {
      if (!b.alive) continue;
      if (Math.hypot(b.x - d.x, b.y - d.y) < d.n) { b.alert = true; b.lastSeen = 0; }
    }
    return;
  }
  if (d.t === 'kill' && mpRole === 'guest') {
    // crédito do abate vai para o convidado
    kills++; roundKills++;
    money = Math.min(99999, money + 300);
    Sfx.kill();
    addFeed('Bot-' + d.id + ' eliminado (+$300)');
    return;
  }
  if (d.t === 'bots' && mpRole === 'guest' && mpOn) {
    mpSyncBots(d.b);
    return;
  }
}
function mpRemoteShoot(r) {
  // feedback visual/sonoro do tiro do outro jogador
  Sfx.pistol();
}
function mpSyncBots(list) {
  // substitui o estado local dos bots pelo do host
  if (!list) return;
  for (let i = 0; i < bots.length && i < list.length; i++) {
    const s = list[i], b = bots[i];
    b.x = s.x; b.y = s.y; b.a = s.a; b.hp = s.hp; b.alive = s.al; b.ft = s.f;
  }
}
function mpTick(dt) {
  if (!mpOn || !mpReady) return;
  mpTimer += dt;
  if (mpTimer < 0.1) return; // 10 Hz
  mpTimer = 0;
  if (mpRole === 'host') {
    const list = [];
    for (const b of bots) list.push({ x: +b.x.toFixed(2), y: +b.y.toFixed(2), a: +b.a.toFixed(2), hp: b.hp, al: b.alive, f: +(b.ft % 100).toFixed(2) });
    Net.send({ t: 'bots', b: list });
    // host também envia a própria posição — sem isso o convidado não o vê
    Net.send({ t: 'p', x: +player.x.toFixed(2), y: +player.y.toFixed(2), a: +player.a.toFixed(2), m: player.moving ? 1 : 0, hp: player.hp, s: player.cool > WEAPONS[player.w].rate * 0.7 });
  } else {
    Net.send({ t: 'p', x: +player.x.toFixed(2), y: +player.y.toFixed(2), a: +player.a.toFixed(2), m: player.moving ? 1 : 0, hp: player.hp, s: player.cool > WEAPONS[player.w].rate * 0.7 });
  }
}

$('btnSingle').addEventListener('click', function () {
  showMenuScreen('single');
});
$('btnMulti').addEventListener('click', function () {
  showMenuScreen('mp');
});
$('backMode1').addEventListener('click', function () {
  showMenuScreen('mode');
});
// ---------- navegação do menu multiplayer LAN ----------
function mpShow(screen) {
  $('mpHome').classList.toggle('hidden', screen !== 'home');
  $('mpHostView').classList.toggle('hidden', screen !== 'host');
  $('mpBrowseView').classList.toggle('hidden', screen !== 'browse');
  if (screen === 'browse') mpListenServers();
}
function mpListenServers() {
  mpConnectNet();
  mpRenderServers(Net.lobby);
}
function mpRenderServers(list) {
  if (!list || !$('mpServers')) return;
  const el = $('mpServers');
  el.innerHTML = '';
  if (list.length === 0) {
    const d = document.createElement('div');
    d.className = 'finemode';
    d.textContent = 'Nenhum servidor encontrado nesta aba/navegador — junte-se por código para jogar entre aparelhos.';
    el.appendChild(d);
    return;
  }
  for (const s of list) {
    const row = document.createElement('div');
    row.className = 'srvrow';
    const info = document.createElement('span');
    info.textContent = s.name + ' — ' + s.players + ' jogador(es)';
    const btn = document.createElement('button');
    btn.className = 'srvjoin';
    btn.textContent = 'Entrar';
    btn.addEventListener('click', function () {
      Net.joinLobbyServer(s.id);
      mpRole = 'guest'; // papel definido já na entrada
      $('mpMsg').textContent = 'Conectando ao ' + s.name + '…';
    });
    row.appendChild(info);
    row.appendChild(btn);
    el.appendChild(row);
  }
}
$('mpHost').addEventListener('click', function () {
  if (!mpConnectNet()) return;
  mpRole = 'host';
  mpShow('host');
});
$('mpBrowse').addEventListener('click', function () {
  mpShow('browse');
});
$('mpStart').addEventListener('click', function () {
  if (mpOn) return; // servidor já no ar — não reabre a sala
  if (!mpConnectNet()) return;
  selectMap(+$('mpMapSel').value || 1); // o servidor sobe no mapa escolhido no dropdown do host
  const res = Net.host('Servidor de ' + mpName);
  if (!res.ok) { $('mpStatus').textContent = res.err; $('mpLobby').classList.remove('hidden'); return; }
  mpOn = true;
  mpRole = 'host';
  mpReady = false; // servidor no ar, mas a partida só começa no "Iniciar Partida"
  $('mpLobby').classList.remove('hidden');
  $('mpRoom').textContent = '······';
  $('mpStatus').textContent = 'Abrindo a sala…';
  Net.hostRoom({ map: selectedMap }).then(function (code) {
    $('mpRoom').textContent = code;
    $('mpStatus').textContent = 'Servidor no ar — aguardando jogadores…';
  }).catch(function (e) {
    $('mpStatus').textContent = 'Erro ao abrir a sala: ' + e.message;
  });
});
$('mpGo').addEventListener('click', function () {
  if (!mpReady) {
    mpReady = true;
    $('mpMapSel').disabled = true; // mapa travado durante a partida (evita dessincronizar as rodadas)
    menuOv.classList.add('hidden');
    startRound(1);
    if (!isMobile) lockPointer();
    // avisa todos os convidados para iniciar a mesma partida
    Net.send({ t: 'start', map: selectedMap, round: 1 });
  }
});
$('mpCopyRoom').addEventListener('click', function () {
  const code = $('mpRoom').textContent;
  try { document.execCommand('copy'); } catch (e) {}
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).catch(function () {});
  $('mpStatus').textContent = 'Código da sala copiado.';
});
$('mpHostBack').addEventListener('click', function () {
  if (mpOn && mpRole === 'host' && !mpReady) { Net.stop(); mpOn = false; mpRole = 'off'; $('mpMapSel').disabled = false; }
  mpShow('home');
});
$('mpJoinRoom').addEventListener('click', function () {
  const code = $('mpRoomInput').value.trim();
  if (!/^\d{6}$/.test(code)) { mpGuestMsg('Digite o código de 6 dígitos da sala.'); return; }
  mpConnectNet();
  mpRole = 'guest'; // papel definido já na entrada — permite processar world/start do host
  for (const k in mpBrokerStates) delete mpBrokerStates[k]; // zera o diagnóstico da tentativa
  const bs = $('mpBrokers');
  if (bs) bs.textContent = 'conectando aos sinalizadores…';
  mpGuestMsg('Entrando na sala ' + code + '…');
  Net.joinRoom(code).then(function () {
    mpGuestMsg('Sala encontrada — conectando ao host…');
  }).catch(function (e) {
    if (mpRole === 'guest') mpGuestMsg('Erro: ' + e.message); // só mostra se ainda estiver aguardando
  });
});
$('mpRoomInput').addEventListener('input', function () {
  this.value = this.value.replace(/\D/g, '').slice(0, 6); // só dígitos, no máximo 6
});
$('mpRoomInput').addEventListener('keydown', function (e) {
  if (e.key === 'Enter') { e.preventDefault(); $('mpJoinRoom').click(); }
});
$('mpBrowseBack').addEventListener('click', function () {
  // se o convidado estava aguardando a sala, cancela a tentativa (sem vazar erro tardio)
  if (mpRole === 'guest' && !mpOn) { try { Net.stop(); } catch (e) {} mpRole = 'off'; mpGuestMsg(''); }
  mpShow('home');
});
// convidado inicia a partida quando o host sinaliza
function mpGuestStart(r) {
  mpOn = true;
  mpRole = 'guest';
  menuOv.classList.add('hidden');
  startRound(r || 1);
  mpReady = true;
}


$('play').addEventListener('click', function () {
  Sfx.unlock();
  menuOv.classList.add('hidden');
  startRound(1);
  if (isMobile) tryFullscreenLandscape();
  else lockPointer();
});

// ---------- seleção de mapa (dropdowns sincronizados: singleplayer e host) ----------
function selectMap(id) {
  selectedMap = id;
  const ms = $('mapSel');
  if (ms) ms.value = String(id);
  const mms = $('mpMapSel');
  if (mms) mms.value = String(id);
}
$('mapSel').addEventListener('change', function () {
  const v = +$('mapSel').value;
  if (v >= 1) selectMap(v);
});
// o dropdown da tela de host também define o mapa do servidor
$('mpMapSel').addEventListener('change', function () {
  const v = +$('mpMapSel').value;
  if (v >= 1) selectMap(v);
});
selectMap(1);

// ---------- loop principal ----------
let last = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  const t = ts / 1000;
  if (hurtT > 0) hurtT -= dt;
  if (hitT > 0) { hitT -= dt; if (hitT <= 0) cross.classList.remove('hit'); }
  for (let i = smoke.length - 1; i >= 0; i--) {
    const s3 = smoke[i];
    s3.life -= dt; s3.x += s3.vx * dt; s3.y += s3.vy * dt; s3.vy -= 12 * dt;
    if (s3.life <= 0) smoke.splice(i, 1);
  }
  if (state === 'play') {
    movePlayer(dt);
    mpTick(dt);
    if (buyTime > 0 && !menuOpen) {
      buyTime -= dt;
      if (buyTime <= 0) { buyTime = 0; spawnPendingBots(); }
    }
    if (firing && WEAPONS[player.w].auto) playerShoot();
    if (player.reloading > 0) {
      player.reloading -= dt;
      if (player.reloading <= 0) finishReload();
    }
    player.cool = Math.max(0, player.cool - dt);
    if (botsSpawned) {
      for (const b of bots) updateBot(b, dt);
      let alive = 0;
      for (const b of bots) if (b.alive) alive++;
      if (alive === 0) roundWinFn();
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      parts[i].life -= dt;
      if (parts[i].life <= 0) parts.splice(i, 1);
    }
    checkPickups();
  } else if (state === 'win') {
    updateXpPanel(dt);
    if (mpOn) {
      // avisa o outro player (uma única vez) que concluí a rodada
      if (!mpPeerDone && !mpDoneSent) { mpDoneSent = true; Net.send({ t: 'win' }); }
      // se o outro player já terminou, dispara o reinício sincronizado agora
      if (mpPeerDone) { mpFinishRound(); return; }
      // senão aguarda o outro player concluir ou morrer
      return Engine.render(player.x, player.y, player.a, spriteList(t));
    }
    winT += dt;
    if (winT > 3.2) startRound(round + 1);
  } else if (state === 'dead') {
    updateXpPanel(dt);
    if (mpOn) {
      // multiplayer: o reinício é sempre sincronizado via syncRound do peer
      // (evita divergência de rounds entre host e convidado)
      return Engine.render(player.x, player.y, player.a, spriteList(t));
    }
    deadT += dt;
    if (deadT > 3.2) startRound(round);
  }
  Engine.render(player.x, player.y, player.a, spriteList(t));
  Engine.blit(ctx, canvas.width, canvas.height);
  drawWeapon(ctx, t);
  if (minimapOn) drawMinimap();
  updateHud();
  updateTop();
  updateMobileVis();
}

// ---------- inicialização ----------
Engine.setTextures({ walls: Tex.walls, floor: Tex.floor, ceil: Tex.ceil });
applyMap(selectedMap); // aplica o tema de chão/teto do mapa escolhido
pickups = buildPickups();
BUY_LIST.forEach(function (item, i) {
  const row = document.createElement('div');
  row.className = 'bitem';
  const nm = item.k === 'armor' ? 'COLETE (+100 armadura)' : item.k === 'health' ? 'KIT DE CURA (+50 vida)' : WEAPONS[item.k].name;
  row.innerHTML = '<span class="bnum">' + (i + 1) + '</span><span class="bname">' + nm + '</span><span class="bprice">$' + item.price + '</span>';
  row.addEventListener('click', function () { buyItem(item.k); });
  $('buyitems').appendChild(row);
});
$('bclose').addEventListener('click', function () { toggleMenu(); });
if (best > 0) $('best').textContent = 'Recorde: ' + best + ' rodada(s) vencida(s)';
loadProgress();
updateTop();
updateHud();
// ---------- controles móveis (touch — estilo emulador) ----------
function updateMobileVis() {
  if (!isMobile) return;
  // mostra os controles só durante o combate; esconde no menu/pausa/loja/morte
  $('mcontrols').classList.toggle('hidden', !(state === 'play' && !menuOpen));
}
function initMobileControls() {
  document.body.classList.add('mobile');
  const mCtl = $('mcontrols');
  // slots de arma passam a viver dentro da camada de controles (tocáveis e
  // escondidos junto com os controles fora do combate)
  mCtl.appendChild($('slots'));
  mCtl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });

  // --- joystick virtual (esquerda) ---
  const stickZone = $('stickZone'), stickKnob = $('stickKnob');
  function stickUpdate(t) {
    const r = stickZone.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const dist = Math.sqrt(dx * dx + dy * dy), max = r.width / 2;
    if (dist > max) { dx = dx / dist * max; dy = dy / dist * max; }
    mStick.active = true;
    mStick.dx = dx / max;
    mStick.dy = dy / max;
    stickKnob.style.transform = 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px))';
  }
  function stickEnd(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === mStick.id) {
        mStick.active = false; mStick.id = null; mStick.dx = 0; mStick.dy = 0;
        stickKnob.style.transform = 'translate(-50%, -50%)';
      }
    }
  }
  stickZone.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (mStick.id === null) {
      const t = e.changedTouches[0];
      mStick.id = t.identifier;
      stickUpdate(t);
    }
  }, { passive: false });
  stickZone.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === mStick.id) stickUpdate(t);
  }, { passive: false });
  stickZone.addEventListener('touchend', stickEnd, { passive: false });
  stickZone.addEventListener('touchcancel', stickEnd, { passive: false });

  // --- zona de mira: arrastar no resto da tela gira a câmera ---
  const lookZone = $('lookZone');
  lookZone.addEventListener('touchstart', function (e) {
    e.preventDefault();
    if (mLookId === null) {
      const t = e.changedTouches[0];
      mLookId = t.identifier;
      mLookLastX = t.clientX;
    }
  }, { passive: false });
  lookZone.addEventListener('touchmove', function (e) {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === mLookId && state === 'play') {
        const dx = t.clientX - mLookLastX;
        mLookLastX = t.clientX;
        player.a += dx * 0.006;
      }
    }
  }, { passive: false });
  function lookEnd(e) {
    for (const t of e.changedTouches) if (t.identifier === mLookId) mLookId = null;
  }
  lookZone.addEventListener('touchend', lookEnd, { passive: false });
  lookZone.addEventListener('touchcancel', lookEnd, { passive: false });

  // --- botões de ação (direita) ---
  function bindBtn(id, onDown, onUp) {
    const el = $(id);
    el.addEventListener('touchstart', function (e) {
      e.preventDefault();
      el.classList.add('press');
      onDown();
    }, { passive: false });
    if (onUp) {
      const up = function (e) {
        e.preventDefault();
        el.classList.remove('press');
        onUp();
      };
      el.addEventListener('touchend', up, { passive: false });
      el.addEventListener('touchcancel', up, { passive: false });
    }
  }
  bindBtn('bFire', function () {
    if (state !== 'play') return;
    const w = WEAPONS[player.w];
    if (w.auto) firing = true;
    else playerShoot();
  }, function () { firing = false; });
  bindBtn('bReload', function () { if (state === 'play') startReload(); });
  bindBtn('bBuy', function () { if (state === 'play') toggleMenu(); });
  bindBtn('bMap', function () {
    if (state !== 'play') return;
    minimapOn = !minimapOn;
    if (!minimapOn) mm.clearRect(0, 0, 132, 132);
  });
  bindBtn('bPause', function () { if (state === 'play') pauseGame(); });

  // --- slots de arma (1-5) tocáveis ---
  const slotsEl = $('slots');
  slotsEl.style.pointerEvents = 'auto';
  for (let i = 1; i <= 5; i++) {
    (function (n) {
      const el = $('s' + n);
      el.addEventListener('touchstart', function (e) {
        e.preventDefault();
        if (state !== 'play' || menuOpen) return;
        const k = SLOTS[n - 1];
        if (player.owned[k]) switchWeapon(k); else Sfx.empty();
      }, { passive: false });
    })(i);
  }

  // girar para retrato pausa o combate (o aviso de rotação aparece via CSS)
  const portraitMq = window.matchMedia('(orientation: portrait)');
  const onOrient = function () {
    if (portraitMq.matches && state === 'play' && !menuOpen) pauseGame();
  };
  if (portraitMq.addEventListener) portraitMq.addEventListener('change', onOrient);
  else if (portraitMq.addListener) portraitMq.addListener(onOrient);
}
if (isMobile) {
  initMobileControls();
} else {
  // fallback: se a detecção falhar (ex.: iPad com user agent de desktop),
  // o primeiro toque real ativa o modo celular
  document.addEventListener('touchstart', function () {
    if (!isMobile) { isMobile = true; initMobileControls(); }
  }, { once: true, passive: true });
}


requestAnimationFrame(loop);

// marca de build — permite conferir (console do PC / telas do multiplayer) se o navegador carregou ESTE arquivo
const OT_BUILD = 'v11 — ICE completo no SDP (canal direto abre na mesma rede)';
console.log('[Operação Tática] game.js build ' + OT_BUILD);
const mpVersionEl = $('mpVersion');
if (mpVersionEl) mpVersionEl.textContent = 'build ' + OT_BUILD;
const mpRoomStatusEl = $('mpRoomStatus');
if (mpRoomStatusEl) mpRoomStatusEl.textContent = 'build ' + OT_BUILD; // conferir no celular antes de entrar

// gancho de depuração para testes automatizados (não afeta a jogabilidade)
window.__OT = {
  player: player,
  get bots() { return bots; },
  setState: function (s) { state = s; },
  stateNow: function () { return state; },
  roundNow: function () { return round; },
  killsNow: function () { return kills; },
  startRound: startRound,
  playerShoot: playerShoot,
  damageBot: function (b, d) { damageBot(b, d, false); },
  hurtPlayer: hurtPlayer,
  spriteList: spriteList,
  mapInfo: function (id) { return buildMap(id); },
  setMoney: function (v) { money = v; },
  getMoney: function () { return money; },
  buy: function (k) { buyItem(k); },
  give: function (k) { player.owned[k] = true; const w = WEAPONS[k]; player.ammo[k] = { mag: w.mag, res: w.mag * 4 }; },
  skipBuyTime: function () { buyTime = 0; spawnPendingBots(); },
  menuOpenNow: function () { return menuOpen; },
  getBuyTime: function () { return buyTime; },
  getLevel: function () { return level; },
  getXp: function () { return xp; },
  loadProgress: loadProgress
};
})();