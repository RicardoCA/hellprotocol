/* Preview headless: rasterizador 2D software + gerador de PNG.
   Renderiza as armas, os frames dos bots e uma cena real do jogo em dev-out/*.png */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

// ---------- rasterizador 2D software ----------
function makeSoftCtx(w, h) {
  let buf = new Uint8ClampedArray(w * h * 4);
  let W = w, H = h;
  const stack = [{ m: [1, 0, 0, 1, 0, 0], al: 1 }];
  let path = [];
  const ctx = {
    canvas: null,
    get buf() { return buf; },
    get W() { return W; },
    get H() { return H; },
    fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1,
    imageSmoothingEnabled: false, lineJoin: 'round', lineWidth: 1,
    resize(nw, nh) { W = nw; H = nh; buf = new Uint8ClampedArray(nw * nh * 4); },
    save() { stack.push({ m: stack[stack.length - 1].m.slice(), al: ctx.globalAlpha }); },
    restore() { if (stack.length > 1) { const s = stack.pop(); ctx.globalAlpha = s.al; } },
    _top() { return stack[stack.length - 1]; },
    _mul(a, b) {
      return [
        a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
        a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
        a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
      ];
    },
    translate(x, y) { const t = ctx._top(); t.m = ctx._mul(t.m, [1, 0, 0, 1, x, y]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); const t = ctx._top(); t.m = ctx._mul(t.m, [c, s, -s, c, 0, 0]); },
    scale(x, y) { const t = ctx._top(); t.m = ctx._mul(t.m, [x, 0, 0, y, 0, 0]); },
    _tp(x, y) { const m = ctx._top().m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; },
    beginPath() { path = []; },
    moveTo(x, y) { path.push({ pts: [ctx._tp(x, y)], closed: false }); },
    lineTo(x, y) { const p = ctx._tp(x, y); if (!path.length) path.push({ pts: [p], closed: false }); path[path.length - 1].pts.push(p); },
    closePath() { if (path.length) path[path.length - 1].closed = true; },
    arc(x, y, r, a0, a1) { ctx._arcPts(x, y, r, r, 0, a0, a1); },
    ellipse(x, y, rx, ry, rot, a0, a1) { ctx._arcPts(x, y, rx, ry, rot || 0, a0, a1); },
    _arcPts(x, y, rx, ry, rot, a0, a1) {
      if (!path.length) path.push({ pts: [], closed: false });
      const sub = path[path.length - 1];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (a1 - a0) * (i / n);
        const px = Math.cos(a) * rx, py = Math.sin(a) * ry;
        const rxx = px * Math.cos(rot) - py * Math.sin(rot);
        const ryy = px * Math.sin(rot) + py * Math.cos(rot);
        sub.pts.push(ctx._tp(x + rxx, y + ryy));
      }
    },
    fill() { ctx._fillPath(path); },
    fillRect(x, y, ww, hh) {
      const sub = { pts: [ctx._tp(x, y), ctx._tp(x + ww, y), ctx._tp(x + ww, y + hh), ctx._tp(x, y + hh)], closed: true };
      ctx._fillPath([sub]);
    },
    strokeRect(x, y, ww, hh) {
      const px = ctx.fillStyle;
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillRect(x, y, ww, 1); ctx.fillRect(x, y + hh - 1, ww, 1);
      ctx.fillRect(x, y, 1, hh); ctx.fillRect(x + ww - 1, y, 1, hh);
      ctx.fillStyle = px;
    },
    stroke() {
      const col = ctx.strokeStyle;
      for (const sub of path) {
        const pts = sub.pts;
        for (let i = 0; i + 1 < pts.length; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b[0] - a[0], dy = b[1] - a[1];
          const L = Math.hypot(dx, dy) || 1;
          const nx = -dy / L * 0.5, ny = dx / L * 0.5;
          ctx._fillPath([{ pts: [
            [a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny],
            [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]
          ], closed: true }]);
        }
      }
    },
    _fillPath(subs) {
      const m = ctx._top().m;
      const A = ctx.globalAlpha;
      if (A <= 0) return;
      const fs = ctx.fillStyle;
      const grad = (fs && typeof fs === 'object' && fs._g) ? fs : null;
      const baseCol = grad ? null : parseColor(fs);
      let minY = 1e9, maxY = -1e9;
      const edges = [];
      for (const sub of subs) {
        const pts = sub.pts;
        for (let i = 0; i < pts.length; i++) {
          const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
          if (p1[1] !== p2[1]) edges.push([p1, p2]);
          if (p1[1] < minY) minY = p1[1];
          if (p1[1] > maxY) maxY = p1[1];
        }
      }
      if (!edges.length) return;
      const y0 = Math.max(0, Math.floor(minY));
      const y1 = Math.min(H - 1, Math.ceil(maxY));
      for (let y = y0; y <= y1; y++) {
        const yc = y + 0.5;
        const xs = [];
        for (const e of edges) {
          const a = e[0], b = e[1];
          if ((a[1] <= yc && b[1] > yc) || (b[1] <= yc && a[1] > yc)) {
            const t = (yc - a[1]) / (b[1] - a[1]);
            xs.push(a[0] + (b[0] - a[0]) * t);
          }
        }
        if (xs.length < 2) continue;
        xs.sort(function (p, q) { return p - q; });
        for (let i = 0; i + 1 < xs.length; i += 2) {
          let x0 = Math.ceil(xs[i] - 0.5), x1 = Math.ceil(xs[i + 1] - 0.5) - 1;
          if (x0 < 0) x0 = 0;
          if (x1 > W - 1) x1 = W - 1;
          for (let x = x0; x <= x1; x++) {
            let col = baseCol;
            if (grad) col = gradAt(grad, x + 0.5, yc, m);
            const sa = A * col[3];
            const di = (y * W + x) * 4;
            const da = buf[di + 3] / 255;
            buf[di] = buf[di] * (1 - sa) + col[0] * sa;
            buf[di + 1] = buf[di + 1] * (1 - sa) + col[1] * sa;
            buf[di + 2] = buf[di + 2] * (1 - sa) + col[2] * sa;
            buf[di + 3] = (sa + da * (1 - sa)) * 255;
          }
        }
      }
    },
createLinearGradient(x0, y0, x1, y1) {
      return { _g: [x0, y0, x1, y1], stops: [], addColorStop(t, c) { this.stops.push([t, c]); this.stops.sort(function (a, b) { return a[0] - b[0]; }); } };
    },
    getImageData(x, y, ww, hh) { return { data: buf, width: W, height: H }; },
    createImageData(ww, hh) { return { data: new Uint8ClampedArray(ww * hh * 4), width: ww, height: hh }; },
    putImageData(img) {
      const iw = img.width, ih = img.height;
      for (let y = 0; y < Math.min(ih, H); y++) {
        for (let x = 0; x < Math.min(iw, W); x++) {
          const si = (y * iw + x) * 4, di = (y * W + x) * 4;
          buf[di] = img.data[si]; buf[di + 1] = img.data[si + 1];
          buf[di + 2] = img.data[si + 2]; buf[di + 3] = img.data[si + 3];
        }
      }
    },
    drawImage(src, dx, dy, dw, dh) {
      const sc = src._ctx;
      if (!sc) return;
      const sbuf = sc.buf, sw = sc.W, sh = sc.H;
      dw = dw || sw; dh = dh || sh;
      for (let y = 0; y < dh; y++) {
        const sy = Math.min(sh - 1, (y * sh / dh) | 0);
        for (let x = 0; x < dw; x++) {
          const sx = Math.min(sw - 1, (x * sw / dw) | 0);
          const si = (sy * sw + sx) * 4;
          const sa = (sbuf[si + 3] / 255) * ctx.globalAlpha;
          if (sa <= 0) continue;
          const X = Math.round(dx + x), Y = Math.round(dy + y);
          if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
          const di = (Y * W + X) * 4;
          const da = buf[di + 3] / 255;
          buf[di] = sbuf[si] * sa + buf[di] * (1 - sa);
          buf[di + 1] = sbuf[si + 1] * sa + buf[di + 1] * (1 - sa);
          buf[di + 2] = sbuf[si + 2] * sa + buf[di + 2] * (1 - sa);
          buf[di + 3] = (sa + da * (1 - sa)) * 255;
        }
      }
    }
  };
  function parseColor(c) {
    if (c[0] === '#') return [parseInt(c.substr(1, 2), 16), parseInt(c.substr(3, 2), 16), parseInt(c.substr(5, 2), 16), 1];
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (m) { const p = m[1].split(','); return [+p[0], +p[1], +p[2], p.length > 3 ? +p[3] : 1]; }
    return [0, 0, 0, 1];
  }
  function gradAt(g, px, py, m) {
    const x0 = m[0] * g._g[0] + m[2] * g._g[1] + m[4];
    const y0 = m[1] * g._g[0] + m[3] * g._g[1] + m[5];
    const x1 = m[0] * g._g[2] + m[2] * g._g[3] + m[4];
    const y1 = m[1] * g._g[2] + m[3] * g._g[3] + m[5];
    const dx = x1 - x0, dy = y1 - y0;
    const L2 = dx * dx + dy * dy || 1;
    let t = ((px - x0) * dx + (py - y0) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const st = g.stops;
    for (let i = 1; i < st.length; i++) {
      if (t <= st[i][0]) {
        const a = st[i - 1], b = st[i];
        const f = (t - a[0]) / ((b[0] - a[0]) || 1);
        const ca = parseColor(a[1]), cb = parseColor(b[1]);
        return [ca[0] + (cb[0] - ca[0]) * f, ca[1] + (cb[1] - ca[1]) * f, ca[2] + (cb[2] - ca[2]) * f, 1];
      }
    }
    const c = parseColor(st[st.length - 1][1]);
    return [c[0], c[1], c[2], 1];
  }
  return ctx;
}

// ---------- PNG ----------
const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.length);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    src.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}
function upscale(rgba, w, h, f) {
  const W = w * f, H = h * f;
  const out = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    const sy = ((y / f) | 0) * w;
    for (let x = 0; x < W; x++) {
      const si = (sy + ((x / f) | 0)) * 4;
      const di = (y * W + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return { data: out, w: W, h: H };
}
// ---------- stubs de DOM ----------
const listeners = [];
let rafCb = null;
function fakeCanvas(w2, h2) {
  const cv = { style: {}, addEventListener() {}, requestPointerLock: undefined };
  const ctx = makeSoftCtx(w2, h2);
  ctx.canvas = cv;
  let cw = w2, ch = h2;
  Object.defineProperty(cv, 'width', { get() { return cw; }, set(v) { cw = v; ctx.resize(cw, ch); } });
  Object.defineProperty(cv, 'height', { get() { return ch; }, set(v) { ch = v; ctx.resize(cw, ch); } });
  cv.getContext = function () { return ctx; };
  cv._ctx = ctx;
  return cv;
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
const mainCanvas = fakeCanvas(960, 600);
const minimapCanvas = fakeCanvas(132, 132);
const DOC = {
  createElement(tag) { return tag === 'canvas' ? fakeCanvas(1, 1) : fakeEl('dyn-' + tag + '-' + Math.random()); },
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
const els = {};

const createdCanvases = [];
const origCreate = DOC.createElement;
DOC.createElement = function (tag) { const c = origCreate(tag); if (tag === 'canvas') createdCanvases.push(c); return c; };

const dir = __dirname;
for (const f of ['audio.js', 'textures.js', 'engine.js', 'game.js']) {
  vm.runInThisContext(fs.readFileSync(path.join(dir, f), 'utf8'), { filename: f });
}

function fire(target, type, ev) {
  for (const [t, ty, fn] of listeners) if (t === target && ty === type) { fn(ev); return; }
  throw new Error('listener ausente: ' + type);
}

const OT = global.window.__OT;
if (!OT) throw new Error('gancho __OT ausente');
const outDir = path.join(__dirname, 'dev-out');
fs.mkdirSync(outDir, { recursive: true });
function savePNG(name, w, h, rgba) {
  fs.writeFileSync(path.join(outDir, name), encodePNG(w, h, rgba));
  console.log('PNG:', name, w + 'x' + h);
}

// ---- varredura: bot visível em vários ângulos e distâncias? ----
fire(els['play'], 'click', {});
global.document.pointerLockElement = mainCanvas;
fire(global.document, 'pointerlockchange', {});

const D2R = Math.PI / 180;
const botTex = Tex.bot[0];
function shot(tag, ang, botX) {
  OT.player.x = 12.5; OT.player.y = 21.5; OT.player.a = ang;
  OT.bots[0].x = botX; OT.bots[0].y = 21.5;
  Engine.debug = true;
  Engine.render(12.5, 21.5, ang, [{ x: botX, y: 21.5, tex: botTex, scale: 0.82, vMove: 36 }]);
  Engine.debug = false;
  Engine.blit(mainCanvas.getContext('2d'), mainCanvas.width, mainCanvas.height);
  const b = mainCanvas._ctx.buf;
  let count = 0, minx = 1e9, maxx = -1;
  for (let y = 0; y < 600; y++) {
    for (let x = 0; x < 960; x++) {
      const i = (y * 960 + x) * 4;
      const r = b[i], g = b[i + 1], bl = b[i + 2];
      if (bl >= 90 && bl - r >= 25 && g > r) { count++; if (x < minx) minx = x; if (x > maxx) maxx = x; }
    }
  }
  console.log(tag, '| pixels do bot:', count, count ? ('| x ' + minx + '..' + maxx) : '| INVISIVEL!');
  const engineCv2 = createdCanvases.find(function (c) { return c.width === 640; });
  if (engineCv2) {
    const eb = engineCv2._ctx.buf;
    const di2 = (200 * 640 + 320) * 4;
    console.log(tag, '| engine buf @(320,200):', eb[di2], eb[di2 + 1], eb[di2 + 2]);
  }
  console.log(tag, '| dbg:', JSON.stringify(Engine._dbg));
  savePNG('vis-' + tag + '.png', 960, 600, b);
}
// corredor leste: jogador olhando para LESTE (ang 0), bot a leste
for (const a of [-28, -15, 0, 15, 28]) shot('perto-a' + a, a * D2R, 15.5);
for (const a of [-28, -15, 0, 15, 28]) shot('longe-a' + a, a * D2R, 19.5);
console.log('VARREDURA CONCLUÍDA');
process.exit(0);