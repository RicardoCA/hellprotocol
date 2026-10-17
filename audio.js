/* Operação Tática — efeitos sonoros 100% sintetizados (WebAudio, sem arquivos). */
const Sfx = (function () {
  'use strict';
  let ctx = null, master = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function noise(dur) {
    const n = (ctx.sampleRate * dur) | 0;
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function burst(o) {
    const src = ctx.createBufferSource();
    src.buffer = noise(o.dur);
    const f = ctx.createBiquadFilter();
    f.type = o.type || 'bandpass';
    f.frequency.setValueAtTime(o.freq, ctx.currentTime);
    if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, ctx.currentTime + o.dur);
    f.Q.value = o.q || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + o.dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(); src.stop(ctx.currentTime + o.dur);
  }
  function tone(freq, dur, gain, type, slideTo) {
    const o = ctx.createOscillator();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(ctx.currentTime + dur);
  }
  return {
    unlock: function () { ensure(); },
    pistol: function () { if (!ensure()) return; burst({ dur: .14, freq: 1600, freqEnd: 600, q: .8, gain: .9 }); tone(150, .1, .5, 'triangle', 60); },
    rifle: function () { if (!ensure()) return; burst({ dur: .1, freq: 2400, freqEnd: 900, q: .9, gain: 1 }); tone(120, .08, .6, 'triangle', 50); },
    shotgun: function () { if (!ensure()) return; burst({ dur: .2, freq: 700, freqEnd: 140, q: .7, gain: 1.1, type: 'lowpass' }); tone(90, .14, .7, 'triangle', 40); burst({ dur: .05, freq: 2600, q: 1, gain: .6 }); },
    pistol50: function () { if (!ensure()) return; burst({ dur: .18, freq: 1100, freqEnd: 300, q: .8, gain: 1.1 }); tone(100, .13, .7, 'triangle', 40); },
    mg: function () { if (!ensure()) return; burst({ dur: .09, freq: 2000, freqEnd: 800, q: .9, gain: .9 }); tone(110, .07, .5, 'triangle', 55); },
    buy: function () { if (!ensure()) return; tone(880, .07, .3, 'square'); setTimeout(function () { if (ctx) tone(1320, .1, .3, 'square'); }, 70); },
    deny: function () { if (!ensure()) return; tone(150, .14, .35, 'sawtooth'); },
    enemyShot: function (v) { if (!ensure()) return; burst({ dur: .12, freq: 900, freqEnd: 300, q: 1, gain: Math.max(.08, v || .3) }); },
    hit: function () { if (!ensure()) return; tone(1300, .05, .35, 'square'); },
    crit: function () { if (!ensure()) return; tone(1700, .06, .4, 'square'); },
    kill: function () { if (!ensure()) return; tone(600, .09, .4, 'square'); setTimeout(function () { if (ctx) tone(400, .12, .4, 'square'); }, 80); },
    reload: function () { if (!ensure()) return; burst({ dur: .04, freq: 3000, q: 3, gain: .5 }); setTimeout(function () { if (ctx) burst({ dur: .04, freq: 2200, q: 3, gain: .5 }); }, 160); },
    empty: function () { if (!ensure()) return; burst({ dur: .03, freq: 2500, q: 4, gain: .4 }); },
    pickup: function () { if (!ensure()) return; tone(620, .09, .35, 'sine', 980); },
    hurt: function () { if (!ensure()) return; tone(95, .16, .6, 'triangle', 55); burst({ dur: .08, freq: 300, q: 1, gain: .4, type: 'lowpass' }); },
    win: function () { if (!ensure()) return; [523, 659, 784].forEach(function (f, i) { setTimeout(function () { if (ctx) tone(f, .22, .35, 'triangle'); }, i * 140); }); },
    lose: function () { if (!ensure()) return; [392, 311, 233].forEach(function (f, i) { setTimeout(function () { if (ctx) tone(f, .3, .4, 'triangle'); }, i * 180); }); }
  };
})();