// Música original de Gravle: lo-fi de estudio pero con chispa (90 BPM), sintetizada
// en directo con Web Audio, sin archivos. Piano eléctrico, bajo, batería con swing,
// una melodía que entra y sale y crujido de vinilo. Se carga después de juice.js.
(() => {
  const BPM = 90, SPB = 60 / BPM, S16 = SPB / 4, SWING = 0.17 * S16;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ii – V – I – VI en Do: Dm9 · G13 · Cmaj9 · A7(b13). Voces cercanas para que fluya.
  const CHORDS = [
    { bass: 38, notes: [53, 57, 60, 64] },
    { bass: 43, notes: [53, 59, 64, 69] },
    { bass: 36, notes: [52, 55, 59, 62] },
    { bass: 45, notes: [55, 61, 65, 69] },
  ];
  // Melodías: [semicorchea, nota MIDI, duración en semicorcheas], un compás por acorde.
  const P1 = [
    [[0, 76, 3], [3, 74, 3], [6, 72, 2], [8, 69, 6]],
    [[2, 71, 2], [4, 74, 3], [7, 76, 5]],
    [[0, 76, 4], [6, 79, 2], [8, 76, 2], [10, 74, 6]],
    [[0, 73, 3], [3, 76, 3], [6, 77, 2], [8, 76, 6]],
  ];
  const P2 = [
    [[0, 81, 2], [2, 79, 2], [4, 77, 2], [6, 76, 2], [8, 74, 4], [12, 72, 3]],
    [[0, 71, 5], [8, 74, 2], [10, 77, 2], [12, 76, 4]],
    [[0, 79, 4], [4, 76, 2], [6, 74, 2], [8, 71, 7]],
    [[0, 69, 3], [4, 73, 3], [8, 76, 3], [12, 79, 3]],
  ];
  // Forma de 16 compases: groove · melodía · respuesta · melodía.
  const FORM = [null, P1, P2, P1];
  const KICK = [0, 7, 10], KICK_FILL = [0, 10, 14];
  const COMP = [[0, 6, 1], [6, 2, 0.55], [10, 3, 0.7]];          // acordes: [paso, duración, volumen]
  const BASS = [[0, 5, 0], [6, 2, 7], [10, 3, 0], [14, 2, 'next']];

  function engine(ctx, out, mix = {}) {
    const lv = (k) => mix[k] ?? 1;
    const node = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const filter = (type, f, q, to) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (to) b.connect(to); return b; };

    const bus = gain(1, out);
    const drums = filter('lowpass', 5200, 0.4, gain(0.9 * lv('drums'), bus));
    const keys = filter('lowpass', 2300, 0.5, gain(lv('keys'), bus));
    const low = filter('lowpass', 850, 0.6, gain(lv('bass'), bus));
    const leadOut = filter('lowpass', 3400, 0.5, gain(lv('lead'), bus));
    // eco de la melodía (3 semicorcheas, apagándose)
    const dly = ctx.createDelay(1); dly.delayTime.value = S16 * 3;
    const fb = gain(0.33), wet = gain(0.38, bus), dlp = filter('lowpass', 1800, 0.3);
    leadOut.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(wet);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    // vinilo: siseo muy bajo con chasquidos sueltos
    const vinyl = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    { const d = vinyl.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.04;
      for (let k = 0; k < 46; k++) { const p = Math.floor(Math.random() * (d.length - 40)), a = (0.25 + Math.random() * 0.75) * (Math.random() < 0.5 ? -1 : 1); for (let j = 0; j < 30; j++) d[p + j] += a * Math.exp(-j / 4); } }
    let crackle = null;

    const env = (g, t, peak, a, sustain, end, rel) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      if (sustain) g.gain.setTargetAtTime(peak * sustain, t + a, 0.25);
      g.gain.setTargetAtTime(0.0001, end, rel);
    };
    function kick(t, v = 1) {
      const o = node('sine', 125), g = gain(0, drums);
      o.frequency.setValueAtTime(125, t); o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.85 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.36);
      o.connect(g); o.start(t); o.stop(t + 0.4);
    }
    function snare(t, v = 1) {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const g = gain(0, drums), bp = filter('bandpass', 1750, 0.75, g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.36 * v, t + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.19);
      s.connect(bp); s.start(t, Math.random() * 0.5); s.stop(t + 0.22);
      const o = node('triangle', 190), og = gain(0, drums);
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.2 * v, t + 0.003); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      o.connect(og); o.start(t); o.stop(t + 0.1);
    }
    function hat(t, v = 1) {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const g = gain(0, drums), hp = filter('highpass', 7600, 0.5, g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.085 * v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
      s.connect(hp); s.start(t, Math.random() * 0.5); s.stop(t + 0.05);
    }
    function ep(m, t, dur, v) {                       // piano eléctrico suave
      const f = mtof(m), g = gain(0, keys), det = (Math.random() - 0.5) * 8;
      const a = node('sine', f), b = node('sine', f * 2.003), bg = gain(0.13, g), c = node('triangle', f), cg = gain(0.05, g);
      a.detune.value = det; a.connect(g); b.connect(bg); c.connect(cg);
      env(g, t, 0.072 * v, 0.018, 0.5, t + dur, 0.12);
      for (const o of [a, b, c]) { o.start(t); o.stop(t + dur + 0.8); }
    }
    function bass(m, t, dur) {
      const f = mtof(m), g = gain(0, low), a = node('triangle', f), b = node('sine', f);
      a.connect(g); b.connect(g);
      env(g, t, 0.085, 0.012, 0.6, t + dur, 0.06);
      for (const o of [a, b]) { o.start(t); o.stop(t + dur + 0.5); }
    }
    function lead(m, t, dur) {                        // campanita con eco
      const f = mtof(m), g = gain(0, leadOut), a = node('triangle', f), b = node('sine', f * 2), bg = gain(0.22, g);
      a.connect(g); b.connect(bg);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.13, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.035, t + Math.min(0.5, dur)); g.gain.setTargetAtTime(0.0001, t + dur, 0.09);
      for (const o of [a, b]) { o.start(t); o.stop(t + dur + 0.6); }
    }

    return {
      step(n, t) {
        const bar = Math.floor(n / 16), s = n % 16, ch = CHORDS[bar % 4], next = CHORDS[(bar + 1) % 4];
        const tt = t + (s % 2 ? SWING : 0), fill = bar % 8 === 7, intro = bar === 0;
        // batería (entra en el segundo compás)
        if (!intro) {
          if ((fill ? KICK_FILL : KICK).includes(s)) kick(tt, s === 0 ? 1 : 0.8);
          if (s === 4 || s === 12) snare(tt);
          if (fill && s >= 13) snare(tt, 0.35 + (s - 13) * 0.15);
          if (s % 2 === 0) hat(tt, s % 4 === 0 ? 1 : 0.7);
          else if (s === 3 || s === 11 || s === 15) hat(tt, 0.4);
        }
        // acordes
        for (const [st, d, v] of COMP) if (st === s) ch.notes.forEach((m, i) => ep(m, tt + i * 0.011, d * S16, v * (intro ? 0.8 : 1)));
        // bajo
        if (!intro) for (const [st, d, w] of BASS) if (st === s) bass(w === 'next' ? next.bass - 1 : ch.bass + w, tt, d * S16 * 0.9);
        // melodía
        const ph = FORM[Math.floor(bar / 4) % 4];
        if (ph) for (const [st, m, d] of ph[bar % 4]) if (st === s) lead(m, tt, d * S16);
      },
      crackle(on, t) {
        if (on && !crackle) { crackle = ctx.createBufferSource(); crackle.buffer = vinyl; crackle.loop = true; const hp = filter('highpass', 1200, 0.5, gain(0.32 * lv('vinyl'), bus)); crackle.connect(hp); crackle.start(t); }
        else if (!on && crackle) { try { crackle.stop(t); } catch (e) {} crackle = null; }
      },
    };
  }

  /* ---------- reproductor en la web ---------- */
  const J = window.Juice; if (!J) return;
  const VOL = 0.3;
  const read = () => { try { const v = localStorage.getItem('gravle:music'); return v == null ? true : JSON.parse(v); } catch (e) { return true; } };
  let on = read(), playing = false, eng = null, master = null, filt = null, timer = 0, n = 0, nextT = 0;
  function tick() {
    const c = J.ctx(); if (!c || !playing) return;
    if (nextT < c.currentTime) nextT = c.currentTime + 0.05;           // si la pestaña se durmió, no se acumulan notas
    while (nextT < c.currentTime + 0.25) { eng.step(n++, nextT); nextT += S16; }
  }
  function start() {
    if (playing || !on || !J.sound || document.hidden) return;
    const c = J.ctx(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    if (!eng) {
      filt = c.createBiquadFilter(); filt.type = 'lowpass'; filt.frequency.value = 14000; filt.Q.value = 0.7;
      master = c.createGain(); master.gain.value = 0; filt.connect(master); master.connect(c.destination);
      eng = engine(c, filt);
    }
    playing = true; n = 0; nextT = c.currentTime + 0.08;
    master.gain.cancelScheduledValues(c.currentTime); master.gain.setTargetAtTime(VOL, c.currentTime, 0.6);
    eng.crackle(true, nextT);
    clearInterval(timer); timer = setInterval(tick, 30); tick();
  }
  function stop(fade = 0.35) {
    if (!playing) return; playing = false; clearInterval(timer);
    const c = J.ctx(); if (!c) return;
    master.gain.cancelScheduledValues(c.currentTime); master.gain.setTargetAtTime(0, c.currentTime, fade / 3);
    eng.crackle(false, c.currentTime + fade);
  }
  // Durante la cámara lenta la música suena «bajo el agua»; al chocar vuelve de golpe.
  function muffle(v) {
    if (!filt) return; const c = J.ctx(); if (!c) return;
    filt.frequency.cancelScheduledValues(c.currentTime);
    filt.frequency.setTargetAtTime(v ? 520 : 14000, c.currentTime, v ? 0.07 : 0.18);
    if (playing) master.gain.setTargetAtTime(v ? VOL * 0.75 : VOL, c.currentTime, 0.1);
  }
  const sync = () => { if (on && J.sound) start(); else stop(); paint(); };

  const ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 17.5V6l10-2v11.5" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linejoin="round"/><ellipse cx="6.6" cy="17.6" rx="2.6" ry="2.1" fill="currentColor"/><ellipse cx="16.6" cy="15.6" rx="2.6" ry="2.1" fill="currentColor"/></svg>';
  const ICON_OFF = ICON.replace('</svg>', '<path d="M4 4l16 16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>');
  function paint() {
    const b = document.getElementById('musBtn'); if (!b) return;
    const lit = on && J.sound;
    b.innerHTML = lit ? ICON : ICON_OFF; b.setAttribute('aria-pressed', String(lit));
    b.setAttribute('aria-label', lit ? 'Music on' : 'Music off');
  }
  function toggle() {
    if (!J.sound) { on = true; J.setSound(true); }                // con todo silenciado, el botón de música lo activa
    else on = !on;
    try { localStorage.setItem('gravle:music', JSON.stringify(on)); } catch (e) {}
    sync();
  }
  // El navegador solo deja sonar audio tras un toque: arranca con la primera interacción.
  addEventListener('pointerdown', () => { if (on && J.sound) start(); }, true);
  addEventListener('keydown', () => { if (on && J.sound) start(); }, true);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(0.2); else if (on && J.sound && J.ctx(false)?.state === 'running') start(); });
  document.addEventListener('DOMContentLoaded', () => { paint(); document.getElementById('musBtn')?.addEventListener('click', toggle); });
  if (document.readyState !== 'loading') paint();

  J.music = { start, stop, muffle, sync, toggle, get on() { return on; }, engine, BPM, S16 };
})();
