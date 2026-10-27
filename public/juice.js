// Juice de Gravle: sonido sintetizado (Web Audio, sin archivos), confeti y polvo,
// temblor, destellos, textos "slam", contadores que ruedan y cortinillas.
// Se carga antes de game.js y deja todo en window.Juice.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const store = {
    get(k, d) { try { const v = localStorage.getItem('gravle:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('gravle:' + k, JSON.stringify(v)); } catch (e) {} },
  };
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim();
  const palette = () => ['coral', 'azul', 'mostaza', 'violeta', 'good'].map(css);

  /* ---------- sonido ---------- */
  let soundOn = store.get('sound', true);
  let ac = null, noise = null;
  function audio() {
    if (!soundOn) return null;
    try {
      if (!ac) {
        const A = window.AudioContext || window.webkitAudioContext; if (!A) return null;
        ac = new A();
        const n = Math.floor(ac.sampleRate * 0.5), b = ac.createBuffer(1, n, ac.sampleRate), d = b.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        noise = b;
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    } catch (e) { return null; }
  }
  function tone(f, dur, type = 'sine', vol = 0.15, delay = 0, f2 = 0) {
    const c = audio(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + dur + 0.03);
  }
  function hiss(dur, vol, freq, delay = 0) {
    const c = audio(); if (!c || !noise) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noise; f.type = 'lowpass'; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(c.destination); s.start(t); s.stop(t + dur);
  }
  const semi = (n) => Math.pow(2, n / 12);
  let lastTick = 0;
  const sfx = {
    tap() { tone(700, 0.05, 'square', 0.035); },
    pick() { tone(520, 0.08, 'triangle', 0.1); tone(780, 0.09, 'triangle', 0.07, 0.05); },
    release() { hiss(0.3, 0.06, 2400); tone(260, 0.25, 'sine', 0.05, 0, 760); },
    slow() { tone(220, 0.9, 'sine', 0.05, 0, 110); hiss(0.6, 0.025, 500); },
    impact(power = 1) { tone(170, 0.26, 'sine', 0.42 * power, 0, 46); hiss(0.14, 0.26 * power, 650); },
    good(streak = 1, perfect = false) {
      const b = 523.25 * semi(Math.min(streak, 5) - 1);
      (perfect ? [0, 4, 7, 12, 16] : [0, 4, 7, 12]).forEach((n, i) => tone(b * semi(n), 0.24, 'triangle', 0.13, 0.03 + i * 0.07));
    },
    ok() { tone(440, 0.14, 'triangle', 0.1); tone(554, 0.2, 'triangle', 0.09, 0.09); },
    bad() { tone(330, 0.16, 'square', 0.05, 0, 300); tone(233, 0.32, 'square', 0.05, 0.15, 170); },
    tick() { const now = performance.now(); if (now - lastTick < 45) return; lastTick = now; tone(1350 + Math.random() * 250, 0.025, 'square', 0.02); },
    star(i) { tone(659 * semi(i * 5), 0.22, 'triangle', 0.12); tone(1318 * semi(i * 5), 0.12, 'sine', 0.04, 0.02); },
    fanfare() { [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => tone(392 * semi(n), 0.3, 'triangle', 0.1, i * 0.085)); },
    wipe() { hiss(0.32, 0.05, 1700); },
    boom() { tone(95, 0.4, 'sine', 0.45, 0, 38); hiss(0.45, 0.3, 900); tone(190, 0.12, 'square', 0.05); },
    streak() { hiss(0.45, 0.07, 3200); tone(240, 0.35, 'triangle', 0.08, 0, 720); tone(960, 0.18, 'triangle', 0.08, 0.3); tone(1280, 0.22, 'triangle', 0.07, 0.38); },
  };
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  /* ---------- botón de silencio ---------- */
  const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';
  const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13L7.5 14.5H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  function paintSoundBtn() {
    const b = document.getElementById('sndBtn'); if (!b) return;
    b.innerHTML = soundOn ? ICON_ON : ICON_OFF;
    b.setAttribute('aria-pressed', String(soundOn));
    b.setAttribute('aria-label', soundOn ? 'Sound on' : 'Sound off');
  }
  function setSound(v) { soundOn = v; store.set('sound', v); paintSoundBtn(); if (v) sfx.pick(); }
  document.addEventListener('DOMContentLoaded', () => {
    paintSoundBtn();
    const b = document.getElementById('sndBtn');
    if (b) b.addEventListener('click', () => setSound(!soundOn));
  });
  // Un clic suave en los botones principales: el primer toque ya suena.
  document.addEventListener('click', (ev) => {
    const t = ev.target.closest && ev.target.closest('.btn, .chip, .exp, .tabs [role="tab"]');
    if (t && !t.disabled && t.id !== 'go') sfx.tap();
  }, true);

  /* ---------- partículas (capa encima de todo) ---------- */
  const fx = document.createElement('canvas');
  fx.setAttribute('aria-hidden', 'true');
  fx.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:40';
  const fctx = fx.getContext('2d');
  let parts = [], rings = [], running = false, fd = 1, last = 0;
  function sizeFx() { fd = Math.min(2, window.devicePixelRatio || 1); fx.width = Math.round(innerWidth * fd); fx.height = Math.round(innerHeight * fd); }
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(fx); sizeFx(); });
  addEventListener('resize', sizeFx);
  function kick() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(loop); } }
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    fctx.setTransform(fd, 0, 0, fd, 0, 0); fctx.clearRect(0, 0, innerWidth, innerHeight);
    const drag = Math.pow(0.18, dt);
    parts = parts.filter(p => {
      p.life += dt;
      if (p.kind === 'dust') { p.vy += 700 * dt; p.vx *= Math.pow(0.3, dt); }
      else { p.vx *= drag; p.vy = p.vy * drag + 1500 * dt; p.r += p.vr * dt; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = p.life > p.max - 0.5 ? Math.max(0, (p.max - p.life) / 0.5) : 1;
      if (a <= 0 || p.y > innerHeight + 40) return false;
      fctx.save(); fctx.globalAlpha = a; fctx.fillStyle = p.c; fctx.translate(p.x, p.y);
      if (p.kind === 'dust') { fctx.beginPath(); fctx.arc(0, 0, p.w, 0, Math.PI * 2); fctx.fill(); }
      else {
        fctx.rotate(p.r); fctx.scale(1, Math.cos(p.life * 9 + p.ph));
        if (p.round) { fctx.beginPath(); fctx.arc(0, 0, p.w * 0.45, 0, Math.PI * 2); fctx.fill(); }
        else fctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      }
      fctx.restore(); return true;
    });
    rings = rings.filter(r => {
      r.t += dt; const k = r.t / 0.45; if (k >= 1) return false;
      fctx.save(); fctx.globalAlpha = 1 - k; fctx.strokeStyle = r.c; fctx.lineWidth = 3 * (1 - k) + 0.6;
      fctx.beginPath(); fctx.ellipse(r.x, r.y, 8 + k * r.size, 3 + k * r.size * 0.28, 0, 0, Math.PI * 2); fctx.stroke();
      fctx.restore(); return true;
    });
    if (parts.length || rings.length) requestAnimationFrame(loop); else { running = false; fctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  function confetti(x, y, opts = {}) {
    const colors = opts.colors || palette(); let n = opts.n || 90; const power = opts.power || 1;
    if (reduce) n = Math.round(n * 0.3);
    const spread = opts.spread || 1.7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * spread, sp = (380 + Math.random() * 520) * power;
      parts.push({ kind: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 5 + Math.random() * 6, h: 8 + Math.random() * 8,
        r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, c: colors[i % colors.length], life: 0, max: 3.2, ph: Math.random() * 6, round: Math.random() < 0.25 });
    }
    kick();
  }
  function dust(x, y, opts = {}) {
    if (reduce) return;
    const colors = opts.colors || [css('ink'), css('ink-2'), css('coral')]; const n = opts.n || 22, power = opts.power || 1;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = (60 + Math.random() * 200) * power;
      parts.push({ kind: 'dust', x: x + (Math.random() - 0.5) * 10, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, w: 1.2 + Math.random() * 2.4, c: colors[i % colors.length], life: 0, max: 0.55 + Math.random() * 0.4 });
    }
    rings.push({ x, y, t: 0, c: opts.ring || css('ink'), size: 46 * power });
    kick();
  }

  /* ---------- temblor, destello, slam, contador, cortinilla ---------- */
  function shake(el, amp = 6, ms = 380) {
    if (reduce || !el || !el.animate) return;
    const kf = [], steps = 9;
    for (let i = 0; i <= steps; i++) {
      const d = amp * (1 - i / steps) * (i % 2 ? -1 : 1);
      kf.push({ transform: i === steps ? 'none' : `translate(${d * (0.6 + Math.random() * 0.4)}px, ${d * 0.5 * (Math.random() - 0.5)}px) rotate(${d * 0.08}deg)` });
    }
    el.animate(kf, { duration: ms, easing: 'linear' });
  }
  function flash(el, strength = 0.55) {
    if (!el) return;
    const f = document.createElement('div');
    f.style.cssText = 'position:absolute;inset:0;background:#fff;pointer-events:none;border-radius:inherit;z-index:3';
    el.appendChild(f);
    const a = f.animate([{ opacity: strength }, { opacity: 0 }], { duration: 180, easing: 'ease-out' });
    a.onfinish = () => f.remove();
  }
  function slam(host, text, cls = '', sub = '') {
    if (!host) return null;
    host.querySelectorAll('.slam').forEach(s => s.remove());
    const el = document.createElement('div');
    el.className = 'slam ' + cls;
    el.innerHTML = '<span></span>' + (sub ? '<small></small>' : '');
    el.firstChild.textContent = text; if (sub) el.lastChild.textContent = sub;
    host.appendChild(el);
    if (reduce) return el;
    const good = cls.includes('g');
    el.animate(good ? [
      { transform: 'translate(-50%,-50%) scale(3) rotate(-14deg)', opacity: 0 },
      { transform: 'translate(-50%,-50%) scale(.9) rotate(-3deg)', opacity: 1, offset: 0.5 },
      { transform: 'translate(-50%,-50%) scale(1.06) rotate(-7deg)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%,-50%) scale(1) rotate(-6deg)', opacity: 1 },
    ] : [
      { transform: 'translate(-50%,-50%) translateY(-24px)', opacity: 0 },
      { transform: 'translate(-50%,-50%) translateX(-9px) rotate(-3deg)', opacity: 1, offset: 0.35 },
      { transform: 'translate(-50%,-50%) translateX(8px) rotate(3deg)', opacity: 1, offset: 0.55 },
      { transform: 'translate(-50%,-50%) translateX(-4px) rotate(-1deg)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%,-50%)', opacity: 1 },
    ], { duration: good ? 620 : 540, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'both' });
    // Se aparta a los 1,5 s para dejar ver las etiquetas del resultado.
    setTimeout(() => {
      if (!el.isConnected) return;
      const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, easing: 'ease-in', fill: 'forwards' });
      out.onfinish = () => el.remove();
    }, 1500);
    return el;
  }
  function clearSlam(host) { if (host) host.querySelectorAll('.slam').forEach(s => s.remove()); }
  function roll(el, to, opts = {}) {
    const from = opts.from || 0, ms = reduce ? 0 : (opts.ms || 700), prefix = opts.prefix || '';
    if (!ms) { el.textContent = prefix + to; return Promise.resolve(); }
    return new Promise(res => {
      const t0 = performance.now();
      const f = (now) => {
        const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
        el.textContent = prefix + Math.round(from + (to - from) * e);
        if (k < 1) { if (opts.ticks !== false) sfx.tick(); requestAnimationFrame(f); }
        else { el.animate([{ transform: 'scale(1.45)' }, { transform: 'scale(1)' }], { duration: 320, easing: 'cubic-bezier(.3,1.7,.5,1)' }); res(); }
      };
      requestAnimationFrame(f);
    });
  }
  function pop(el, s = 1.6) { if (!reduce && el && el.animate) el.animate([{ transform: `scale(${s})` }, { transform: 'scale(1)' }], { duration: 360, easing: 'cubic-bezier(.3,1.7,.5,1)' }); }
  function wipe(host, text, sub, cb) {
    if (reduce || !host) { cb(); return; }
    const w = document.createElement('div'); w.className = 'wipe';
    w.innerHTML = '<b></b><small></small>'; w.firstChild.textContent = text; w.lastChild.textContent = sub || '';
    host.appendChild(w); sfx.wipe();
    const a = w.animate([{ clipPath: 'circle(0% at 50% 100%)' }, { clipPath: 'circle(150% at 50% 100%)' }], { duration: 320, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' });
    a.onfinish = () => {
      try { cb(); } catch (e) { console.error(e); }
      setTimeout(() => {
        const b = w.animate([{ clipPath: 'circle(150% at 50% 50%)' }, { clipPath: 'circle(0% at 50% 50%)' }], { duration: 340, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' });
        b.onfinish = () => w.remove();
      }, 260);
    };
  }

  window.Juice = { reduce, sfx, buzz, confetti, dust, shake, flash, slam, clearSlam, roll, pop, wipe, palette, get sound() { return soundOn; } };
})();
