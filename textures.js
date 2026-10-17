/* Operação Tática v2 — texturas e sprites procedurais (arte 100% original em código). */
const Tex = (function () {
  'use strict';
  function cnv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function finish(c) {
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height);
    return { data: d.data, w: c.width, h: c.height };
  }
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  function bakeAO(g, strength) {
    const grd = 10;
    g.fillStyle = 'rgba(0,0,0,' + strength + ')';
    g.fillRect(0, 0, 64, grd);
    g.fillRect(0, 64 - grd, 64, grd);
    g.fillRect(0, 0, grd, 64);
    g.fillRect(64 - grd, 0, grd, 64);
  }

  // ---------- paredes 64x64 ----------
  function brick(seed) {
    const c = cnv(64, 64), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#2e2019'; g.fillRect(0, 0, 64, 64);
    const BH = 8;
    for (let row = 0; row < 8; row++) {
      const off = (row % 2) ? 8 : 0;
      for (let bx = -16; bx < 80; bx += 16) {
        const v = (r() * 26 - 13) | 0;
        const dark = r() < 0.18 ? 22 : 0;
        const rr = Math.max(0, 148 + v - dark), gg = Math.max(0, 70 + v - dark), bb = Math.max(0, 54 + v - dark);
        const gr = g.createLinearGradient(0, row * BH, 0, row * BH + BH);
        gr.addColorStop(0, 'rgb(' + Math.min(255, rr + 26) + ',' + Math.min(255, gg + 26) + ',' + Math.min(255, bb + 26) + ')');
        gr.addColorStop(1, 'rgb(' + rr + ',' + gg + ',' + bb + ')');
        g.fillStyle = gr;
        g.fillRect(bx + off, row * BH, 15, 7);
        if (r() < 0.25) {
          g.strokeStyle = 'rgba(0,0,0,0.3)'; g.lineWidth = 1;
          g.beginPath();
          const sx = bx + off + 2 + r() * 10, sy = row * BH + 1;
          g.moveTo(sx, sy); g.lineTo(sx + 2 + r() * 4, sy + 5); g.stroke();
        }
      }
    }
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 70; i++) g.fillRect((r() * 64) | 0, (r() * 64) | 0, 2, 2);
    bakeAO(g, 0.14);
    return finish(c);
  }
  function concrete(seed) {
    const c = cnv(64, 64), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#70756f'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 380; i++) {
      const v = (r() * 24 - 12) | 0;
      g.fillStyle = 'rgba(' + (112 + v) + ',' + (117 + v) + ',' + (111 + v) + ',0.45)';
      g.fillRect((r() * 64) | 0, (r() * 64) | 0, 2, 2);
    }
    for (let i = 0; i < 5; i++) {
      g.fillStyle = 'rgba(60,66,60,' + (0.10 + r() * 0.12) + ')';
      g.beginPath(); g.arc(r() * 64, r() * 64, 4 + r() * 9, 0, 6.283); g.fill();
    }
    for (let py = 0; py < 64; py += 32) {
      for (let px = 0; px < 64; px += 32) {
        g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 1;
        g.strokeRect(px + 0.5, py + 0.5, 31, 31);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.beginPath(); g.moveTo(px + 0.5, py + 31.5); g.lineTo(px + 31.5, py + 31.5); g.stroke();
      }
    }
    g.fillStyle = '#3d423d';
    [[16, 16], [48, 16], [16, 48], [48, 48]].forEach(function (p) { g.fillRect(p[0] - 2, p[1] - 2, 4, 4); });
    g.fillStyle = '#8a8f88';
    [[16, 16], [48, 16], [16, 48], [48, 48]].forEach(function (p) { g.fillRect(p[0] - 1, p[1] - 1, 2, 2); });
    bakeAO(g, 0.12);
    return finish(c);
  }
  function crate(seed) {
    const c = cnv(64, 64), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#82613a'; g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) {
      const v = ((r() * 22 - 11) | 0);
      g.fillStyle = 'rgb(' + (130 + v) + ',' + (97 + v) + ',' + (58 + v) + ')';
      g.fillRect(0, y, 64, 15);
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(0, y + 15, 64, 1);
      for (let i = 0; i < 26; i++) {
        g.fillStyle = 'rgba(50,32,12,0.22)';
        g.fillRect((r() * 60) | 0, y + 2 + ((r() * 12) | 0), 6 + ((r() * 8) | 0), 1);
      }
    }
    g.strokeStyle = 'rgba(52,34,14,0.55)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(6, 58); g.lineTo(58, 6); g.stroke();
    g.fillStyle = '#5a5f58';
    g.fillRect(0, 0, 8, 64); g.fillRect(56, 0, 8, 64);
    g.fillStyle = '#71766e';
    g.fillRect(0, 0, 8, 3); g.fillRect(56, 0, 8, 3);
    g.fillStyle = '#2c2f2a';
    [[3, 4], [3, 58], [59, 4], [59, 58], [3, 30], [59, 30]].forEach(function (p) { g.fillRect(p[0] - 1, p[1] - 1, 3, 3); });
    g.fillStyle = '#4a5636'; g.fillRect(24, 26, 16, 10);
    g.fillStyle = '#2f3822'; g.fillRect(26, 28, 12, 2); g.fillRect(26, 32, 12, 2);
    bakeAO(g, 0.10);
    return finish(c);
  }
  function plaster(seed) {
    const c = cnv(64, 64), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#b7a678'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 300; i++) {
      const v = (r() * 18 - 9) | 0;
      g.fillStyle = 'rgba(' + (183 + v) + ',' + (166 + v) + ',' + (120 + v) + ',0.5)';
      g.fillRect((r() * 64) | 0, (r() * 64) | 0, 2, 2);
    }
    g.strokeStyle = 'rgba(90,78,48,0.6)'; g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      let x = 6 + r() * 50, y = 4 + r() * 20;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (r() * 10 - 5); y += 6 + r() * 6; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = '#8f7c50'; g.fillRect(0, 54, 64, 10);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 54, 64, 2);
    bakeAO(g, 0.10);
    return finish(c);
  }
  function metal(seed) {
    const c = cnv(64, 64), g = c.getContext('2d'), r = rng(seed);
    g.fillStyle = '#4b5158'; g.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 4) {
      g.fillStyle = (y % 8) ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.16)';
      g.fillRect(0, y, 64, 2);
    }
    for (let i = 0; i < 60; i++) {
      g.fillStyle = 'rgba(20,24,28,0.25)';
      g.fillRect((r() * 64) | 0, (r() * 64) | 0, 2, 1);
    }
    g.fillStyle = '#343a40';
    g.fillRect(0, 28, 64, 8);
    g.fillStyle = '#c9a23c';
    for (let x = 0; x < 64; x += 16) g.fillRect(x, 28, 8, 8);
    g.fillStyle = '#23272c';
    for (let x = 4; x < 64; x += 16) g.fillRect(x, 30, 2, 4);
    g.fillStyle = '#2c3136';
    [[2, 2], [62, 2], [2, 62], [62, 62]].forEach(function (p) { g.fillRect(p[0] - 2, p[1] - 2, 4, 4); });
    bakeAO(g, 0.16);
    return finish(c);
  }
  function floorTex() {
    const c = cnv(64, 64), g = c.getContext('2d'), r = rng(99);
    g.fillStyle = '#43474a'; g.fillRect(0, 0, 64, 64);
    for (let ty = 0; ty < 64; ty += 32) {
      for (let tx = 0; tx < 64; tx += 32) {
        const v = ((r() * 14 - 7) | 0);
        g.fillStyle = 'rgba(' + (70 + v) + ',' + (74 + v) + ',' + (78 + v) + ',0.8)';
        g.fillRect(tx, ty, 32, 32);
      }
    }
    for (let i = 0; i < 260; i++) {
      const v = (r() * 16 - 8) | 0;
      g.fillStyle = 'rgba(' + (68 + v) + ',' + (72 + v) + ',' + (76 + v) + ',0.5)';
      g.fillRect((r() * 64) | 0, (r() * 64) | 0, 2, 2);
    }
    for (let i = 0; i < 4; i++) {
      g.fillStyle = 'rgba(20,22,20,' + (0.08 + r() * 0.10) + ')';
      g.beginPath(); g.arc(r() * 64, r() * 64, 5 + r() * 10, 0, 6.283); g.fill();
    }
    g.fillStyle = '#26292b';
    g.fillRect(0, 0, 64, 2); g.fillRect(0, 0, 2, 64);
    g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64);
    return finish(c);
  }
  function ceilTex() {
    const c = cnv(64, 64), g = c.getContext('2d'), r = rng(55);
    g.fillStyle = '#24272b'; g.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 140; i++) {
      g.fillStyle = 'rgba(255,255,255,0.035)';
      g.fillRect((r() * 64) | 0, (r() * 64) | 0, 2, 1);
    }
    g.fillStyle = '#181b1e';
    g.fillRect(0, 0, 64, 3); g.fillRect(0, 0, 3, 64);
    g.fillStyle = '#101214'; g.fillRect(20, 20, 24, 24);
    g.fillStyle = '#6f7d66'; g.fillRect(24, 24, 16, 16);
    g.fillStyle = '#a8bd8f'; g.fillRect(27, 27, 10, 10);
    g.fillStyle = '#d7e8bd'; g.fillRect(30, 30, 4, 4);
    return finish(c);
  }
  // ---------- soldado inimigo 64x64 ----------
  // frames: 0-3 andar, 4 atirar, 5 caindo, 6 morto
  function soldier(frame) {
    const c = cnv(64, 64), g = c.getContext('2d');
    if (frame === 6) {
      g.fillStyle = 'rgba(115,12,12,0.85)';
      g.beginPath(); g.ellipse(32, 56, 22, 7, 0, 0, 6.283); g.fill();
      g.fillStyle = '#2c3729'; g.fillRect(16, 50, 30, 9);
      g.fillStyle = '#4d5e42'; g.fillRect(16, 50, 30, 4);
      g.fillStyle = '#20261f'; g.fillRect(20, 55, 8, 4);
      g.fillStyle = '#c9a26a'; g.fillRect(46, 51, 8, 7);
      g.fillStyle = '#454f42'; g.fillRect(46, 49, 8, 4);
      g.fillStyle = '#1b1e20'; g.fillRect(8, 52, 9, 3);
      return finish(c);
    }
    if (frame === 5) {
      g.save();
      g.translate(32, 44); g.rotate(0.6);
      g.fillStyle = '#4d5e42'; g.fillRect(-11, -18, 22, 30);
      g.fillStyle = '#232b20'; g.fillRect(-9, -14, 18, 16);
      g.fillStyle = '#c9a26a'; g.fillRect(-6, -30, 12, 12);
      g.fillStyle = '#454f42'; g.fillRect(-7, -34, 14, 6);
      g.fillStyle = '#2c372c'; g.fillRect(-8, 10, 7, 14); g.fillRect(2, 10, 7, 14);
      g.restore();
      g.fillStyle = 'rgba(115,12,12,0.5)';
      g.beginPath(); g.ellipse(32, 60, 14, 4, 0, 0, 6.283); g.fill();
      return finish(c);
    }
    const shoot = frame === 4;
    const wf = frame;
    let l1 = { y: 42, h: 20 }, l2 = { y: 42, h: 20 };
    if (wf === 1) { l1 = { y: 40, h: 18 }; l2 = { y: 44, h: 18 }; }
    if (wf === 3) { l1 = { y: 44, h: 18 }; l2 = { y: 40, h: 18 }; }
    g.fillStyle = '#232c23';
    g.fillRect(24, l1.y, 7, l1.h); g.fillRect(34, l2.y, 7, l2.h);
    g.fillStyle = '#121511';
    g.fillRect(24, l1.y + l1.h - 3, 7, 4); g.fillRect(34, l2.y + l2.h - 3, 7, 4);
    g.fillStyle = '#4d5e42'; g.fillRect(21, 24, 22, 19);
    g.fillStyle = 'rgba(31,40,27,0.8)';
    [[22, 25, 7, 5], [33, 26, 8, 4], [24, 33, 6, 6], [36, 32, 5, 6], [29, 38, 9, 4]].forEach(function (p) { g.fillRect(p[0], p[1], p[2], p[3]); });
    g.fillStyle = '#1d241b'; g.fillRect(23, 27, 18, 13);
    g.fillStyle = '#161c14';
    g.fillRect(25, 29, 5, 4); g.fillRect(34, 29, 5, 4);
    g.fillStyle = '#0f130d'; g.fillRect(23, 39, 18, 3);
    g.fillStyle = '#4d5e42'; g.fillRect(17, 25, 5, 8); g.fillRect(42, 25, 5, 8);
    g.fillStyle = '#c9a26a'; g.fillRect(43, 30, 4, 4);
    g.fillStyle = '#191d1f';
    if (shoot) {
      g.fillRect(38, 26, 20, 4);
      g.fillStyle = '#fff3b0';
      g.beginPath(); g.moveTo(58, 28); g.lineTo(64, 24); g.lineTo(64, 32); g.closePath(); g.fill();
      g.fillStyle = '#ffd24a'; g.beginPath(); g.arc(58, 28, 3.5, 0, 6.283); g.fill();
    } else {
      g.fillRect(38, 29, 20, 4);
    }
    g.fillStyle = '#c9a26a'; g.fillRect(26, 12, 12, 12);
    g.fillStyle = '#b08a55'; g.fillRect(26, 20, 12, 4);
    g.fillStyle = '#10141a'; g.fillRect(25, 15, 14, 4);
    g.fillStyle = '#a5e0f2'; g.fillRect(27, 16, 4, 2); g.fillRect(33, 16, 4, 2);
    g.fillStyle = '#5b6851'; g.fillRect(24, 6, 16, 7);
    g.fillStyle = '#48533c'; g.fillRect(24, 10, 16, 3);
    g.fillStyle = '#6e7d60'; g.fillRect(24, 6, 16, 2);
    return finish(c);
  }
  function medkit() {
    const c = cnv(64, 64), g = c.getContext('2d');
    g.fillStyle = '#e4ebe4'; g.fillRect(15, 22, 34, 30);
    g.fillStyle = '#f4f8f4'; g.fillRect(15, 22, 34, 6);
    g.fillStyle = '#c3cbc3'; g.fillRect(15, 48, 34, 4);
    g.strokeStyle = '#77807a'; g.lineWidth = 2; g.strokeRect(16, 23, 32, 28);
    g.fillStyle = '#2fae5a';
    g.fillRect(29, 28, 6, 18); g.fillRect(23, 34, 18, 6);
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(24, 29, 3, 3);
    return finish(c);
  }
  function ammoBox() {
    const c = cnv(64, 64), g = c.getContext('2d');
    g.fillStyle = '#3f4838'; g.fillRect(12, 28, 40, 24);
    g.fillStyle = '#4c5642'; g.fillRect(12, 28, 40, 5);
    g.fillStyle = '#2a3025'; g.fillRect(12, 47, 40, 5);
    g.fillStyle = '#c8a23c';
    for (let i = 0; i < 7; i++) g.fillRect(16 + i * 5, 36, 3, 9);
    g.fillStyle = '#8a8f7a'; g.fillRect(12, 44, 40, 3);
    g.strokeStyle = '#1d211a'; g.lineWidth = 2; g.strokeRect(13, 29, 38, 22);
    return finish(c);
  }
  function vest() {
    const c = cnv(64, 64), g = c.getContext('2d');
    g.fillStyle = '#3c5266';
    g.beginPath();
    g.moveTo(21, 22); g.lineTo(43, 22); g.lineTo(45, 29);
    g.lineTo(43, 50); g.lineTo(21, 50); g.lineTo(19, 29);
    g.closePath(); g.fill();
    g.fillStyle = '#2b3d4c'; g.fillRect(21, 26, 22, 6);
    g.fillStyle = '#243642'; g.fillRect(24, 34, 16, 10);
    g.strokeStyle = '#8cd0f0'; g.lineWidth = 2; g.strokeRect(26, 35, 12, 8);
    g.fillStyle = '#1e2c36'; g.fillRect(28, 22, 8, 5);
    return finish(c);
  }
  function bloodTex() {
    const c = cnv(20, 20), g = c.getContext('2d');
    g.fillStyle = 'rgba(150,18,18,0.95)';
    g.beginPath(); g.arc(10, 10, 6, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(110,10,10,0.9)';
    g.beginPath(); g.arc(5, 13, 3, 0, 6.283); g.fill();
    g.beginPath(); g.arc(15, 6, 2.6, 0, 6.283); g.fill();
    g.beginPath(); g.arc(13, 15, 2.2, 0, 6.283); g.fill();
    g.beginPath(); g.arc(16, 12, 1.6, 0, 6.283); g.fill();
    return finish(c);
  }
  function dustTex() {
    const c = cnv(16, 16), g = c.getContext('2d');
    g.fillStyle = 'rgba(150,148,138,0.95)';
    g.beginPath(); g.arc(8, 8, 5, 0, 6.283); g.fill();
    g.fillStyle = 'rgba(120,118,110,0.9)';
    g.beginPath(); g.arc(4, 6, 2.5, 0, 6.283); g.fill();
    g.beginPath(); g.arc(12, 10, 2.2, 0, 6.283); g.fill();
    return finish(c);
  }

  //__WART1__
  // Desenha a arma com origem no punho; cano aponta para a esquerda; inclinação +0.30 rad.
  // Usa apenas: fillRect, paths (moveTo/lineTo/closePath/fill), arc, createLinearGradient.
  function P(g2, pts, fill) {
    g2.beginPath();
    g2.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g2.lineTo(pts[i][0], pts[i][1]);
    g2.closePath();
    g2.fillStyle = fill;
    g2.fill();
  }
  function LG(g2, x0, y0, x1, y1, stops) {
    const gr = g2.createLinearGradient(x0, y0, x1, y1);
    for (const s of stops) gr.addColorStop(s[0], s[1]);
    return gr;
  }
  function DOT(g2, x, y, r, col) {
    g2.beginPath(); g2.arc(x, y, r, 0, 6.283); g2.fillStyle = col; g2.fill();
  }
  const MET = [[0, '#4d565e'], [0.45, '#333a41'], [1, '#181c20']];
  const MET2 = [[0, '#3d444b'], [0.5, '#272d33'], [1, '#14181c']];
  const SKIN = [[0, '#d2a870'], [0.6, '#c9a26a'], [1, '#a5814e']];

  function weaponArt(g2, kind) {
    g2.save();
    g2.rotate(0.30);
    if (kind === 'pistol') {
      // slide com gradiente
      g2.fillStyle = LG(g2, 0, -54, 0, -30, MET);
      g2.fillRect(-96, -54, 90, 24);
      g2.fillStyle = '#12161a'; g2.fillRect(-100, -48, 6, 12);
      g2.fillStyle = '#5d676f'; g2.fillRect(-96, -54, 90, 2);
      // serrilhas traseiras
      for (let i = 0; i < 6; i++) {
        g2.fillStyle = i % 2 ? '#1a1e22' : '#454e55';
        g2.fillRect(-32 + i * 3, -51, 1.5, 18);
      }
      // janela de ejeção
      g2.fillStyle = '#0f1316'; g2.fillRect(-56, -51, 15, 8);
      g2.fillStyle = '#4a535b'; g2.fillRect(-56, -51, 15, 1);
      // miras com pontos brancos
      g2.fillStyle = '#20252a'; g2.fillRect(-93, -59, 5, 5); g2.fillRect(-12, -59, 8, 5);
      g2.fillStyle = '#e8ecec'; g2.fillRect(-91.5, -57, 2, 2); g2.fillRect(-6, -57, 2, 2);
      // armação + trilho
      g2.fillStyle = LG(g2, 0, -30, 0, -16, MET2);
      g2.fillRect(-72, -30, 60, 14);
      g2.fillStyle = '#101418';
      g2.fillRect(-68, -22, 52, 2); g2.fillRect(-68, -18, 52, 2);
      g2.fillStyle = '#454e55'; g2.fillRect(-14, -28, 8, 3); // alavanca
      // guarda-mato (com furo) + gatilho
      P(g2, [[-40, -16], [-14, -16], [-12, 4], [-38, 4]], '#171b1f');
      P(g2, [[-36, -13], [-18, -13], [-17, 1], [-35, 1]], '#0b0e10');
      P(g2, [[-31, -14], [-26, -14], [-24, -2], [-29, -2]], '#2b3238');
      // punho rakeado + textura
      P(g2, [[-16, -16], [14, -16], [22, 42], [-6, 42]], LG(g2, 0, -16, 0, 42, [[0, '#3a4149'], [0.5, '#272d33'], [1, '#121518']]));
      for (let y = -12; y <= 38; y += 7) {
        const t = (y + 16) / 58;
        const xl = -16 + t * 10 + 3, xr = 14 + t * 8 - 3;
        g2.fillStyle = '#4a535b';
        g2.fillRect(xl, y, xr - xl, 2.5);
      }
      // martelo
      P(g2, [[-10, -60], [-2, -60], [1, -51], [-7, -51]], '#23282d');
      // base do carregador
      g2.fillStyle = '#101418'; g2.fillRect(-8, 40, 28, 6);
      // polegar
      P(g2, [[-20, -26], [-8, -28], [-6, -14], [-18, -12]], LG(g2, 0, -28, 0, -12, SKIN));
      // dedos envolvendo o punho
      for (let i = 0; i < 4; i++) {
        const y = -10 + i * 9;
        const t = (y + 16) / 58;
        const xl = -16 + t * 10 - 2, xr = 14 + t * 8 + 4;
        P(g2, [[xl, y], [xr, y], [xr - 2, y + 7], [xl + 1, y + 7]], LG(g2, 0, y, 0, y + 7, SKIN));
      }
      // dorso da mão
      P(g2, [[14, -22], [30, -14], [34, 18], [20, 38], [8, 30], [12, -6]], LG(g2, 10, -20, 30, 30, SKIN));
      // manga
      P(g2, [[22, 24], [52, 30], [56, 52], [18, 52]], '#4d5e42');
      P(g2, [[20, 24], [50, 29], [51, 34], [21, 29]], '#2c3524');
      // boca do cano
      DOT(g2, -97, -42, 3.5, '#0b0d0f');
    } else if (kind === 'pistol50') {
      // slide pesado
      g2.fillStyle = LG(g2, 0, -58, 0, -30, [[0, '#5a636c'], [0.45, '#343b42'], [1, '#14171b']]);
      g2.fillRect(-106, -58, 100, 28);
      g2.fillStyle = '#6b757e'; g2.fillRect(-106, -58, 100, 3);
      for (let i = 0; i < 7; i++) {
        g2.fillStyle = i % 2 ? '#191d21' : '#4a525a';
        g2.fillRect(-38 + i * 3.2, -55, 1.6, 21);
      }
      g2.fillStyle = '#0d1114'; g2.fillRect(-64, -55, 16, 9);
      g2.fillStyle = '#59636b'; g2.fillRect(-64, -55, 16, 1);
      g2.fillStyle = '#0b0d0f'; g2.fillRect(-110, -52, 6, 14);
      g2.fillStyle = '#23282d'; g2.fillRect(-102, -64, 6, 6); g2.fillRect(-14, -64, 9, 6);
      g2.fillStyle = '#f0f4f0'; g2.fillRect(-100, -62, 2.5, 2.5); g2.fillRect(-7, -62, 2.5, 2.5);
      g2.fillStyle = LG(g2, 0, -30, 0, -14, MET2);
      g2.fillRect(-78, -30, 66, 16);
      g2.fillStyle = '#101418'; g2.fillRect(-74, -22, 56, 2); g2.fillRect(-74, -18, 56, 2);
      P(g2, [[-44, -14], [-14, -14], [-12, 6], [-42, 6]], '#14181c');
      P(g2, [[-40, -11], [-18, -11], [-17, 3], [-39, 3]], '#080a0c');
      P(g2, [[-34, -12], [-28, -12], [-26, 0], [-31, 0]], '#3a4149');
      P(g2, [[-18, -14], [14, -14], [24, 44], [-8, 44]], LG(g2, 0, -14, 0, 44, [[0, '#4a3520'], [0.5, '#3a2918'], [1, '#221709']]));
      for (let y = -10; y <= 40; y += 7) {
        const t = (y + 14) / 58;
        const xl = -18 + t * 10 + 3, xr = 14 + t * 10 - 3;
        g2.fillStyle = '#5d4426';
        g2.fillRect(xl, y, xr - xl, 2.5);
      }
      P(g2, [[-12, -64], [-3, -64], [0, -54], [-9, -54]], '#2b3238');
      g2.fillStyle = '#101418'; g2.fillRect(-10, 42, 30, 6);
      P(g2, [[-22, -24], [-9, -26], [-7, -12], [-20, -10]], LG(g2, 0, -26, 0, -10, SKIN));
      for (let i = 0; i < 4; i++) {
        const y = -8 + i * 9;
        const t = (y + 14) / 58;
        const xl = -18 + t * 10 - 2, xr = 14 + t * 10 + 4;
        P(g2, [[xl, y], [xr, y], [xr - 2, y + 7], [xl + 1, y + 7]], LG(g2, 0, y, 0, y + 7, SKIN));
      }
      P(g2, [[14, -20], [32, -12], [36, 20], [22, 40], [10, 32], [14, -4]], LG(g2, 12, -18, 32, 32, SKIN));
      P(g2, [[24, 26], [54, 32], [58, 54], [20, 54]], '#3d4a35');
      P(g2, [[22, 26], [52, 31], [53, 36], [23, 31]], '#2c3524');
      DOT(g2, -107, -45, 4, '#0b0d0f');
    } else if (kind === 'rifle') {
      // coronha
      P(g2, [[34, -66], [54, -62], [58, -46], [46, -42], [36, -46]], LG(g2, 0, -66, 0, -42, [[0, '#3f4a34'], [0.5, '#2c3524'], [1, '#1a2015']]));
      g2.fillStyle = '#14181c'; g2.fillRect(54, -64, 7, 21);
      g2.fillStyle = '#2c3524'; g2.fillRect(36, -70, 18, 6);
      // recebedor
      g2.fillStyle = LG(g2, 0, -64, 0, -44, MET);
      g2.fillRect(-36, -64, 70, 20);
      g2.fillStyle = '#5d676f'; g2.fillRect(-36, -64, 70, 2);
      // alça/trilho traseiro
      g2.fillStyle = '#20252a'; g2.fillRect(6, -72, 24, 8);
      DOT(g2, 28, -68, 2, '#0b0d0f');
      // janela de ejeção
      g2.fillStyle = '#0f1316'; g2.fillRect(-20, -60, 12, 8);
      g2.fillStyle = '#59636b'; g2.fillRect(-10, -58, 5, 4);
      // guardamão canelado
      g2.fillStyle = LG(g2, 0, -58, 0, -44, [[0, '#44503a'], [0.5, '#3a4530'], [1, '#242c1e']]);
      g2.fillRect(-70, -58, 36, 14);
      for (let i = 0; i < 6; i++) {
        g2.fillStyle = i % 2 ? '#2c3524' : '#1f2519';
        g2.fillRect(-68 + i * 6, -57, 3, 12);
      }
      // cano
      g2.fillStyle = LG(g2, 0, -58, 0, -48, MET2);
      g2.fillRect(-128, -58, 60, 10);
      // quebra-chamas
      g2.fillStyle = '#14181c'; g2.fillRect(-136, -60, 10, 14);
      g2.fillStyle = '#0b0d0f';
      g2.fillRect(-133, -57, 2, 8); g2.fillRect(-129, -57, 2, 8);
      // massa de mira + bloco de gás
      g2.fillStyle = '#20252a'; g2.fillRect(-116, -68, 5, 10);
      DOT(g2, -113.5, -66, 1.5, '#e8ecec');
      g2.fillStyle = '#20252a'; g2.fillRect(-108, -64, 8, 6);
      // carregador curvo
      P(g2, [[-26, -44], [-10, -44], [-6, -28], [-22, -26]], LG(g2, 0, -44, 0, -26, MET2));
      P(g2, [[-22, -26], [-6, -28], [0, -6], [-16, -2]], LG(g2, 0, -26, 0, -2, MET2));
      for (let i = 0; i < 5; i++) {
        g2.fillStyle = '#101418';
        g2.fillRect(-21 + i * 1.5, -40 + i * 7, 15 - i * 2.5, 2);
      }
      g2.fillStyle = '#2c3238'; g2.fillRect(-18, -8, 19, 5);
      // guarda-mato + gatilho
      P(g2, [[-6, -44], [16, -44], [18, -28], [-4, -26]], '#171b1f');
      P(g2, [[-2, -41], [12, -41], [13, -31], [-1, -30]], '#0b0e10');
      P(g2, [[4, -42], [9, -42], [11, -32], [6, -32]], '#2b3238');
      // punho
      P(g2, [[16, -44], [32, -42], [38, -14], [22, -12]], LG(g2, 0, -44, 0, -12, [[0, '#3a4149'], [1, '#15191d']]));
      // mão de apoio (dedos sobre o guardamão)
      for (let i = 0; i < 4; i++) {
        const x = -62 + i * 9;
        P(g2, [[x, -58], [x + 7, -58], [x + 7, -44], [x, -44]], LG(g2, 0, -58, 0, -44, SKIN));
        g2.fillStyle = '#a5814e'; g2.fillRect(x, -52, 7, 2);
      }
      P(g2, [[-66, -46], [-46, -50], [-40, -34], [-62, -30]], LG(g2, 0, -50, 0, -30, SKIN));
      // mão do gatilho
      P(g2, [[14, -46], [34, -44], [42, -18], [36, 6], [20, 2], [24, -22]], LG(g2, 14, -44, 34, 4, SKIN));
      // manga
      P(g2, [[26, 0], [58, 6], [62, 32], [20, 30]], '#4d5e42');
      P(g2, [[24, 1], [56, 7], [57, 13], [25, 7]], '#2c3524');
    } else if (kind === 'mg') {
      // cano com anéis de refrigeração
      g2.fillStyle = LG(g2, 0, -62, 0, -50, MET);
      g2.fillRect(-124, -62, 88, 12);
      for (let i = 0; i < 7; i++) {
        g2.fillStyle = i % 2 ? '#14181c' : '#2c3238';
        g2.fillRect(-120 + i * 11, -62, 4, 12);
      }
      g2.fillStyle = '#0b0d0f'; g2.fillRect(-128, -60, 6, 10);
      g2.fillStyle = '#14181c'; g2.fillRect(-134, -61, 8, 14);
      g2.fillStyle = '#20252a'; g2.fillRect(-118, -70, 5, 8);
      g2.fillStyle = '#262c31'; g2.fillRect(-34, -78, 44, 8);
      g2.fillStyle = '#14181c'; g2.fillRect(-6, -76, 10, 5);
      g2.fillStyle = LG(g2, 0, -70, 0, -46, MET);
      g2.fillRect(-42, -70, 76, 24);
      g2.fillStyle = '#5d676f'; g2.fillRect(-42, -70, 76, 2);
      g2.fillStyle = '#0f1316'; g2.fillRect(-28, -62, 20, 8);
      P(g2, [[-16, -46], [8, -46], [10, -28], [-14, -26]], '#171b1f');
      P(g2, [[-12, -43], [4, -43], [5, -31], [-11, -30]], '#0b0e10');
      P(g2, [[-6, -44], [0, -44], [2, -33], [-4, -33]], '#2b3238');
      P(g2, [[8, -46], [26, -44], [32, -16], [16, -14]], LG(g2, 0, -46, 0, -14, [[0, '#3a4149'], [1, '#15191d']]));
      P(g2, [[-26, -46], [-2, -46], [2, -14], [-22, -10]], LG(g2, 0, -46, 0, -10, MET2));
      for (let i = 0; i < 6; i++) {
        g2.fillStyle = '#101418';
        g2.fillRect(-24 + i * 1.5, -42 + i * 5, 20 - i * 2, 2);
      }
      g2.fillStyle = '#2c3238'; g2.fillRect(-24, -14, 26, 5);
      P(g2, [[30, -70], [56, -66], [60, -48], [48, -44], [32, -48]], LG(g2, 0, -70, 0, -44, [[0, '#3f4a34'], [0.5, '#2c3524'], [1, '#1a2015']]));
      g2.fillStyle = '#14181c'; g2.fillRect(56, -68, 7, 22);
      g2.fillStyle = '#1d2226';
      g2.fillRect(-84, -50, 4, 18); g2.fillRect(-76, -50, 4, 18);
      for (let i = 0; i < 4; i++) {
        const x = -66 + i * 9;
        P(g2, [[x, -54], [x + 7, -54], [x + 7, -40], [x, -40]], LG(g2, 0, -54, 0, -40, SKIN));
        g2.fillStyle = '#a5814e'; g2.fillRect(x, -48, 7, 2);
      }
      P(g2, [[-70, -42], [-58, -48], [-50, -32], [-64, -26]], LG(g2, 0, -48, 0, -26, SKIN));
      P(g2, [[6, -48], [28, -46], [34, -20], [28, 4], [12, 0], [16, -24]], LG(g2, 6, -46, 28, 2, SKIN));
      P(g2, [[20, -2], [52, 2], [56, 28], [14, 26]], '#3d4a35');
      P(g2, [[18, -1], [50, 3], [51, 9], [19, 5]], '#2c3524');
    } else {
      // cano + tubo
      g2.fillStyle = LG(g2, 0, -66, 0, -56, MET);
      g2.fillRect(-116, -66, 84, 10);
      g2.fillStyle = LG(g2, 0, -54, 0, -45, MET2);
      g2.fillRect(-110, -54, 76, 9);
      g2.fillStyle = '#14181c'; g2.fillRect(-120, -67, 6, 12);
      g2.fillStyle = '#20252a'; g2.fillRect(-118, -73, 5, 4);
      g2.fillStyle = '#e8ecec'; g2.fillRect(-117, -72, 3, 2);
      // bomba com sulcos
      g2.fillStyle = LG(g2, 0, -50, 0, -34, [[0, '#7a5230'], [0.5, '#5d3d20'], [1, '#3c2812']]);
      g2.fillRect(-74, -50, 34, 16);
      for (let i = 0; i < 6; i++) {
        g2.fillStyle = i % 2 ? '#54381c' : '#472e16';
        g2.fillRect(-72 + i * 5, -49, 2.5, 14);
      }
      g2.fillStyle = '#2c3238'; g2.fillRect(-77, -46, 4, 8);
      // recebedor
      g2.fillStyle = LG(g2, 0, -66, 0, -46, MET);
      g2.fillRect(-40, -66, 32, 20);
      g2.fillStyle = '#5d676f'; g2.fillRect(-40, -66, 32, 2);
      g2.fillStyle = '#0f1316'; g2.fillRect(-34, -56, 18, 5);
      // guarda-mato + gatilho
      P(g2, [[-16, -46], [6, -46], [8, -30], [-14, -28]], '#171b1f');
      P(g2, [[-12, -43], [2, -43], [3, -33], [-11, -32]], '#0b0e10');
      P(g2, [[-6, -44], [-1, -44], [1, -34], [-4, -34]], '#2b3238');
      // coronha de madeira com veios
      P(g2, [[-8, -66], [34, -62], [40, -44], [30, -40], [-8, -46]], LG(g2, 0, -66, 0, -40, [[0, '#7a5230'], [0.5, '#5d3d20'], [1, '#3c2812']]));
      for (let i = 0; i < 4; i++) {
        g2.fillStyle = '#4a3018';
        g2.fillRect(-4 + i * 10, -61 + i * 4, 32, 1.5);
      }
      g2.fillStyle = '#14181c'; g2.fillRect(36, -64, 7, 22);
      // mão de apoio na bomba
      for (let i = 0; i < 4; i++) {
        const x = -68 + i * 9;
        P(g2, [[x, -50], [x + 7, -50], [x + 7, -34], [x, -34]], LG(g2, 0, -50, 0, -34, SKIN));
        g2.fillStyle = '#a5814e'; g2.fillRect(x, -44, 7, 2);
      }
      P(g2, [[-72, -40], [-60, -46], [-52, -30], [-66, -24]], LG(g2, 0, -46, 0, -24, SKIN));
      // mão do gatilho
      P(g2, [[-2, -48], [18, -46], [26, -20], [20, 4], [4, 0], [8, -24]], LG(g2, -2, -46, 20, 2, SKIN));
      // manga
      P(g2, [[12, -2], [44, 2], [48, 28], [6, 26]], '#4d5e42');
      P(g2, [[10, -1], [42, 3], [43, 9], [11, 5]], '#2c3524');
    }
    g2.restore();
  }
//__WART2__
//__WART2__
  function makeWeaponSprite(kind) {
    const cv = cnv(280, 280), g = cv.getContext('2d');
    g.translate(160, 210);
    weaponArt(g, kind);
    const TIP = { pistol: [-97, -42], pistol50: [-107, -45], rifle: [-131, -53], shotgun: [-117, -61], mg: [-131, -55] };
    const c0 = Math.cos(0.30), s0 = Math.sin(0.30);
    return {
      cv: cv, ox: 160, oy: 210,
      tipX: TIP[kind][0] * c0 - TIP[kind][1] * s0,
      tipY: TIP[kind][0] * s0 + TIP[kind][1] * c0
    };
  }
  const weapons = { pistol: makeWeaponSprite('pistol'), pistol50: makeWeaponSprite('pistol50'), shotgun: makeWeaponSprite('shotgun'), rifle: makeWeaponSprite('rifle'), mg: makeWeaponSprite('mg') };

  return {
    weapons: weapons,
    walls: [null, brick(7), concrete(11), crate(23), plaster(41), metal(67)],
    floor: floorTex(),
    ceil: ceilTex(),
    bot: [soldier(0), soldier(1), soldier(2), soldier(3), soldier(4), soldier(5), soldier(6)],
    pickups: { health: medkit(), ammo: ammoBox(), armor: vest() },
    blood: bloodTex(),
    dust: dustTex()
  };
})();