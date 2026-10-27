// Música original de Gravle: chill pero animada (104 BPM), con un estribillo pegadizo.
// Se sintetiza en directo con Web Audio, sin archivos: piano eléctrico, bajo saltarín,
// batería suave, palmas y una melodía de campanita con eco. Se carga después de juice.js.
(() => {
  const BPM = 104, SPB = 60 / BPM, S16 = SPB / 4, SWING = 0.1 * S16;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // Progresión IV – V – iii – vi en Do (Fmaj7 · G7 · Em7 · Am7): luminosa y muy cantable.
  const CHORDS = [
    { bass: 41, notes: [57, 60, 64, 67] },
    { bass: 43, notes: [55, 59, 62, 65] },
    { bass: 40, notes: [55, 59, 62, 67] },
    { bass: 45, notes: [55, 60, 64, 67] },
  ];
  // Estribillo: siempre el mismo ritmo (3 + 3 + 4 + 2 + 4), pregunta y respuesta.
  // [semicorchea, nota MIDI, duración en semicorcheas]; un compás por acorde.
  const HOOK = [
    [[0, 76, 3], [3, 79, 3], [6, 81, 4], [10, 79, 2], [12, 76, 4]],
    [[0, 74, 3], [3, 76, 3], [6, 79, 6]],
    [[0, 76, 3], [3, 79, 3], [6, 83, 4], [10, 81, 2], [12, 79, 4]],
    [[0, 76, 3], [3, 74, 3], [6, 72, 6], [14, 74, 2]],
  ];
  const HOOK_END = [[0, 76, 3], [3, 79, 3], [6, 81, 8]];             // final que sube, la segunda vez
  // Parte B: arpegio suave del acorde, para respirar antes de volver al estribillo.
  const ARP = [0, 1, 2, 3, 2, 1, 2, 3];
  // Forma (bloques de 8 compases): estribillo · estribillo con más ritmo · parte B · estribillo.
  const FORM = ['A', 'A2', 'B', 'A'];
  const KICK = [0, 6, 8], KICK_FILL = [0, 6, 8, 11, 14];
  const BASS = [[0, 2, 0], [3, 1, 0], [6, 2, 12], [8, 2, 0], [11, 1, 0], [14, 2, 7]];

  function engine(ctx, out, mix = {}) {
    const lv = (k) => mix[k] ?? 1;
    const node = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; return o; };
    const gain = (v, to) => { const g = ctx.createGain(); g.gain.value = v; if (to) g.connect(to); return g; };
    const filter = (type, f, q, to) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q != null) b.Q.value = q; if (to) b.connect(to); return b; };

    const bus = gain(1, out);
    const drums = filter('lowpass', 6500, 0.4, gain(0.9 * lv('drums'), bus));
    const keys = filter('lowpass', 2400, 0.5, gain(lv('keys'), bus));
    const low = filter('lowpass', 900, 0.6, gain(lv('bass'), bus));
    const leadOut = filter('lowpass', 3000, 0.5, gain(lv('lead'), bus));
    const dly = ctx.createDelay(1); dly.delayTime.value = S16 * 3;
    const fb = gain(0.3), wet = gain(0.3, bus), dlp = filter('lowpass', 1800, 0.3);
    leadOut.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(wet);

    const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const burst = (t, v, type, f, q, dec, to) => {
      const s = ctx.createBufferSource(); s.buffer = noise;
      const g = gain(0, to || drums), bp = filter(type, f, q, g);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + dec);
      s.connect(bp); s.start(t, Math.random() * 0.5); s.stop(t + dec + 0.02);
    };
    const env = (g, t, peak, a, sustain, end, rel) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      if (sustain) g.gain.setTargetAtTime(peak * sustain, t + a, 0.25);
      g.gain.setTargetAtTime(0.0001, end, rel);
    };
    function kick(t, v = 1) {
      const o = node('sine', 130), g = gain(0, drums);
      o.frequency.setValueAtTime(130, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.09);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); o.start(t); o.stop(t + 0.32);
    }
    function clap(t, v = 1) {                         // palmas: tres golpecitos muy juntos
      for (const [dt, k] of [[0, 0.7], [0.011, 0.6], [0.022, 1]]) burst(t + dt, 0.26 * v * k, 'bandpass', 1500, 0.9, dt === 0.022 ? 0.16 : 0.03);
    }
    const hat = (t, v = 1) => burst(t, 0.06 * v, 'highpass', 8000, 0.5, 0.035);
    const shaker = (t, v = 1) => burst(t, 0.035 * v, 'bandpass', 5200, 1.2, 0.05);
    function ep(m, t, dur, v) {
      const f = mtof(m), g = gain(0, keys);
      const a = node('sine', f), b = node('sine', f * 2.003), bg = gain(0.12, g), c = node('triangle', f), cg = gain(0.05, g);
      a.detune.value = (Math.random() - 0.5) * 8; a.connect(g); b.connect(bg); c.connect(cg);
      env(g, t, 0.06 * v, 0.015, 0.5, t + dur, 0.1);
      for (const o of [a, b, c]) { o.start(t); o.stop(t + dur + 0.7); }
    }
    function bass(m, t, dur) {
      const f = mtof(m), g = gain(0, low), a = node('triangle', f), b = node('sine', f);
      a.connect(g); b.connect(g);
      env(g, t, 0.085, 0.01, 0.6, t + dur, 0.05);
      for (const o of [a, b]) { o.start(t); o.stop(t + dur + 0.4); }
    }
    function bell(m, t, dur, v = 1, to = leadOut) {   // campanita: redonda, sin agudos que piquen
      const f = mtof(m), g = gain(0, to), a = node('sine', f), b = node('triangle', f * 2), bg = gain(0.12, g), c = node('sine', f * 3.01), cg = gain(0.04, g);
      a.connect(g); b.connect(bg); c.connect(cg);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.15 * v, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.045 * v, t + Math.min(0.35, dur)); g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
      for (const o of [a, b, c]) { o.start(t); o.stop(t + dur + 0.5); }
    }

    return {
      step(n, t) {
        const bar = Math.floor(n / 16), s = n % 16, intro = bar < 2;
        const b = intro ? 0 : bar - 2, ch = CHORDS[b % 4];
        const part = intro ? 'I' : FORM[Math.floor(b / 8) % 4], inPart = b % 8;
        const tt = t + (s % 2 ? SWING : 0), fill = inPart === 7 && part !== 'B';
        // batería: la intro solo lleva charles; la parte B va más ligera
        if (part !== 'I') {
          if (part === 'B') { if (s === 0 || s === 8) kick(tt, 0.7); }
          else if ((fill ? KICK_FILL : KICK).includes(s)) kick(tt, s === 0 ? 1 : 0.75);
          if (s === 4 || s === 12) clap(tt, part === 'B' ? 0.6 : 1);
          if (part === 'A2') shaker(tt, s % 4 === 2 ? 1 : 0.5);
        }
        if (s % 2 === 0) hat(tt, s % 4 === 2 ? 1 : 0.55);
        // acordes: uno largo y un golpecito a contratiempo
        if (s === 0) ch.notes.forEach((m, i) => ep(m, tt + i * 0.01, 9 * S16, intro ? 0.9 : 1));
        if (s === 10 && part !== 'I') ch.notes.forEach((m, i) => ep(m, tt + i * 0.008, 2 * S16, 0.55));
        // bajo saltarín
        if (part !== 'I') for (const [st, d, w] of BASS) if (st === s) bass(ch.bass + w, tt, d * S16 * 0.9);
        // melodía
        if (part === 'A' || part === 'A2') {
          const ph = inPart === 7 ? HOOK_END : HOOK[inPart % 4];
          for (const [st, m, d] of ph) if (st === s) { bell(m, tt, d * S16); if (part === 'A2') bell(m - 12, tt, d * S16, 0.45); }
        } else if (part === 'B' && s % 2 === 0) {
          const k = ARP[(s / 2) % 8]; bell(ch.notes[k] + 12, tt, 2 * S16, 0.45);
        }
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
    clearInterval(timer); timer = setInterval(tick, 30); tick();
  }
  function stop(fade = 0.35) {
    if (!playing) return; playing = false; clearInterval(timer);
    const c = J.ctx(); if (!c) return;
    master.gain.cancelScheduledValues(c.currentTime); master.gain.setTargetAtTime(0, c.currentTime, fade / 3);
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
