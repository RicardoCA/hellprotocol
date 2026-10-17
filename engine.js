/* Operação Tática — motor de raycasting (estilo clássico) com z-buffer. Implementação original. */
const Engine = (function () {
  'use strict';
  const RW = 640, RH = 400;
  const cv = document.createElement('canvas');
  cv.width = RW; cv.height = RH;
  const cctx = cv.getContext('2d');
  const img = cctx.createImageData(RW, RH);
  const buf32 = new Uint32Array(img.data.buffer);
  const zbuf = new Float64Array(RW);

  let mapW = 0, mapH = 0, mapData = null;
  let tex = null;

  function setMap(w, h, data) { mapW = w; mapH = h; mapData = data; }
  function setTextures(t) { tex = t; }

  function render(px, py, ang, sprites) {
    const dbg = Engine.debug ? [] : null;
    const dirX = Math.cos(ang), dirY = Math.sin(ang);
    const plX = -dirY * 0.66, plY = dirX * 0.66;

    // fundo
    buf32.fill(0xff0d0f0c);

    // ---- piso e teto (floor casting) ----
    const rdX0 = dirX - plX, rdY0 = dirY - plY;
    const rdX1 = dirX + plX, rdY1 = dirY + plY;
    const fT = tex.floor.data, cT = tex.ceil.data;
    for (let y = (RH >> 1) + 1; y < RH; y++) {
      const p = y - (RH >> 1);
      const rowDist = (0.5 * RH) / p;
      const stepX = rowDist * (rdX1 - rdX0) / RW;
      const stepY = rowDist * (rdY1 - rdY0) / RW;
      let fx = px + rowDist * rdX0;
      let fy = py + rowDist * rdY0;
      const sh8 = ((Math.min(1, 1.25 / (1 + rowDist * 0.35))) * 256) | 0;
      const rowF = y * RW, rowC = (RH - 1 - y) * RW;
      for (let x = 0; x < RW; x++) {
        const ti = (((((fy * 64) | 0) & 63) << 6) + (((fx * 64) | 0) & 63)) << 2;
        const fr = (fT[ti] * sh8) >> 8, fg = (fT[ti + 1] * sh8) >> 8, fb = (fT[ti + 2] * sh8) >> 8;
        buf32[rowF + x] = 0xff000000 | (fb << 16) | (fg << 8) | fr;
        const cr = (cT[ti] * sh8) >> 8, cg = (cT[ti + 1] * sh8) >> 8, cb = (cT[ti + 2] * sh8) >> 8;
        buf32[rowC + x] = 0xff000000 | (cb << 16) | (cg << 8) | cr;
        fx += stepX; fy += stepY;
      }
    }
  // ---- paredes (DDA) ----
    for (let x = 0; x < RW; x++) {
      const cam = 2 * x / RW - 1;
      const rdx = dirX + plX * cam, rdy = dirY + plY * cam;
      let mx = px | 0, my = py | 0;
      const ddx = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      const ddy = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      let sdx, sdy, stX, stY;
      if (rdx < 0) { stX = -1; sdx = (px - mx) * ddx; } else { stX = 1; sdx = (mx + 1 - px) * ddx; }
      if (rdy < 0) { stY = -1; sdy = (py - my) * ddy; } else { stY = 1; sdy = (my + 1 - py) * ddy; }
      let side = 0, cell = 0, guard = 0;
      while (guard++ < 160) {
        if (sdx < sdy) { sdx += ddx; mx += stX; side = 0; } else { sdy += ddy; my += stY; side = 1; }
        if (mx < 0 || my < 0 || mx >= mapW || my >= mapH) { cell = 1; break; }
        cell = mapData[my * mapW + mx];
        if (cell > 0) break;
      }
      let dist = side === 0 ? sdx - ddx : sdy - ddy;
      if (dist < 0.02) dist = 0.02;
      zbuf[x] = dist;
      const lh = (RH / dist) | 0;
      const d0 = (RH >> 1) - (lh >> 1);
      const d1 = d0 + lh;
      const y0 = d0 < 0 ? 0 : d0;
      const y1 = d1 > RH ? RH : d1;
      let wallX = side === 0 ? py + dist * rdy : px + dist * rdx;
      wallX -= Math.floor(wallX);
      let tx = (wallX * 64) | 0;
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = 63 - tx;
      const wt = tex.walls[cell] || tex.walls[1];
      const td = wt.data;
      const sh8 = ((Math.min(1, 1.35 / (1 + dist * 0.30)) * (side === 1 ? 0.75 : 1)) * 256) | 0;
      const step = 64 / lh;
      let tp = (y0 - d0) * step;
      for (let y = y0; y < y1; y++) {
        const ti = (((tp | 0) << 6) + tx) << 2;
        tp += step;
        const r = (td[ti] * sh8) >> 8, g = (td[ti + 1] * sh8) >> 8, b = (td[ti + 2] * sh8) >> 8;
        buf32[y * RW + x] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }
  // ---- sprites (billboards com teste de profundidade por coluna) ----
    const list = [];
    for (let i = 0; i < sprites.length; i++) {
      const s = sprites[i];
      const dx = s.x - px, dy = s.y - py;
      list.push([dx * dx + dy * dy, s]);
    }
    list.sort(function (a, b) { return b[0] - a[0]; });
    const invDet = 1 / (plX * dirY - dirX * plY);
    for (let i = 0; i < list.length; i++) {
      const s = list[i][1];
      const sx = s.x - px, sy = s.y - py;
      const trX = invDet * (dirY * sx - dirX * sy);
      const trY = invDet * (-plY * sx + plX * sy);
      if (trY < 0.08) { if (dbg) dbg.push({ x: s.x, y: s.y, trY: +trY.toFixed(3), skipped: 'trY<0.08', drawn: 0 }); continue; }
      const scrX = ((RW / 2) * (1 + trX / trY)) | 0;
      const hgt = ((RH / trY) * s.scale) | 0;
      if (hgt < 2) { if (dbg) dbg.push({ x: s.x, y: s.y, trY: +trY.toFixed(3), skipped: 'hgt<2', drawn: 0 }); continue; }
      if (dbg) dbg.push({ x: s.x, y: s.y, trX: +trX.toFixed(3), trY: +trY.toFixed(3), scrX: scrX, hgt: hgt, tex: s.tex && s.tex.w ? 'ok' : 'BAD', drawn: 0 });
      const wid = hgt;
      const cy = ((RH >> 1) + (s.vMove || 0) / trY) | 0;
      const x0 = scrX - (wid >> 1), y0 = cy - (hgt >> 1);
      const tx0 = x0 < 0 ? -x0 : 0;
      const tx1 = x0 + wid > RW ? RW - x0 : wid;
      const ty0 = y0 < 0 ? -y0 : 0;
      const ty1 = y0 + hgt > RH ? RH - y0 : hgt;
      const td = s.tex.data, sw = s.tex.w, shh = s.tex.h;
      const dS = Math.sqrt(list[i][0]);
      let shV = 1.45 / (1 + dS * 0.18);
      if (shV < 0.45) shV = 0.45; else if (shV > 1) shV = 1;
      const sh8 = (shV * 256) | 0;
      const fl = s.flash ? 1 : 0;
      for (let txx = tx0; txx < tx1; txx++) {
        const cx2 = x0 + txx;
        if (cx2 < 0 || cx2 >= RW) continue;
        // oclusão exata: a parede esconde a coluna só se for atingida ANTES do plano do billboard
        const cam2 = 2 * cx2 / RW - 1;
        const rdx2 = dirX + plX * cam2, rdy2 = dirY + plY * cam2;
        if (zbuf[cx2] * zbuf[cx2] < trY * trY * (rdx2 * rdx2 + rdy2 * rdy2)) continue;
        const su = (txx * sw / wid) | 0;
        for (let tyy = ty0; tyy < ty1; tyy++) {
          const cy2 = y0 + tyy;
          const ti = (((tyy * shh / hgt) | 0) * sw + su) << 2;
          if (td[ti + 3] < 128) continue;
          let r = (td[ti] * sh8) >> 8, g = (td[ti + 1] * sh8) >> 8, b = (td[ti + 2] * sh8) >> 8;
          if (fl) {
            const m2 = (r + g + b) / 3;
            r = Math.min(255, m2 + 120); g = (m2 * 0.4) | 0; b = (m2 * 0.4) | 0;
          }
          buf32[cy2 * RW + cx2] = 0xff000000 | (b << 16) | (g << 8) | r;
          if (dbg) { const d = dbg[dbg.length - 1]; d.drawn++; if (d.cyMin === undefined || cy2 < d.cyMin) d.cyMin = cy2; if (d.cyMax === undefined || cy2 > d.cyMax) d.cyMax = cy2; if (d.cxMin === undefined || cx2 < d.cxMin) d.cxMin = cx2; if (d.cxMax === undefined || cx2 > d.cxMax) d.cxMax = cx2; }
        }
      }
    }

    cctx.putImageData(img, 0, 0);
    if (dbg) Engine._dbg = dbg;
  }

  function blit(ctx2, w, h) {
    ctx2.imageSmoothingEnabled = false;
    ctx2.drawImage(cv, 0, 0, w, h);
  }

  return { render: render, blit: blit, setMap: setMap, setTextures: setTextures, RW: RW, RH: RH, debug: false, _dbg: null };
})();