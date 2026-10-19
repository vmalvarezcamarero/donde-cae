// Motor del juego de Physle: dibuja las escenas, recoge la predicción y
// reproduce el resultado que devuelve el servidor. La app (app.js) lo arranca
// con PhysleGame.play(intento, hooks).
(() => {
  // Medidas del mundo; las fija el archivo del día al cargarlo.
  let W = 400, H = 600, FLOOR = 556, R = 10;
  const $ = (id) => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COLOR_NAME = { coral: 'Coral', azul: 'Blue', mostaza: 'Mustard', violeta: 'Violet' };
  const KIND_NAME = { recta: 'straight', cicloide: 'curve', caida: 'drop and flat', joroba: 'gentle, then steep', valle: 'valley', olas: 'waves' };
  const ORD = (k) => ['1st', '2nd', '3rd', '4th'][k];
  const OBJ_NAME = { canica: 'Marble', rueda: 'Solid wheel', aro: 'Hoop', hielo: 'Ice cube' };
  const TYPE_NAME = { balance: 'Balance', drop: 'Where will it land?', race: 'Which finishes first?', pool: 'Bank shot', tower: 'Will it stand?' };
  const num = (x, d = 1) => x.toFixed(d);
  const side = (u) => Math.abs(u) < 0.05 ? 'center' : num(Math.abs(u)) + (u < 0 ? ' left' : ' right');

  /* ---------- colores desde los tokens ---------- */
  let C = {};
  function readColors() {
    const s = getComputedStyle(document.documentElement);
    for (const k of ['paper', 'plate', 'grid', 'grid-major', 'ink', 'ink-2', 'line', 'coral', 'azul', 'mostaza', 'violeta', 'good', 'warn', 'bad', 'felt', 'wood'])
      C[k] = s.getPropertyValue('--' + k).trim();
  }
  readColors();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { readColors(); draw(); });
  new MutationObserver(() => { readColors(); draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---------- estado ---------- */
  // mark: drop → x mundo; balance → posición en unidades; pool → [x,y]; tower → índice de bloque o -1 (aguanta); race → usa order
  let day, roundIdx, phase, scores, details, mark, order, anim;
  let hooks = null, attempt = null, serverPts = 0, sending = false, lastCoins = null;
  const DKEY = (id) => 'physle:detalles:' + id;
  function play(payload, h) {
    hooks = h; attempt = payload.attempt;
    day = { ...payload.day, rounds: payload.rounds };
    ({ W, H, FLOOR, R } = day);
    roundIdx = attempt.round; scores = attempt.scores.slice();
    try { details = JSON.parse(sessionStorage.getItem(DKEY(attempt.id))) || []; } catch (e) { details = []; }
    while (details.length < scores.length) details.push('—');
    $('play').hidden = false;
    startRound(); fit();
  }
  const predictionOf = (r) => r.type === 'race' ? order.slice() : mark;
  const round = () => day.rounds[roundIdx];
  const PROMPTS = {
    balance: (r) => 'Place the blue ' + r.M + ' kg weight so the beam balances.<small>Drag along the beam. The beam itself weighs nothing: only the weights count.</small>',
    drop: (r) => {
      const k = new Set(r.planks.map(p => p.kind));
      const legend = [k.has('muelle') ? '<b style="color:var(--violeta)">Spring</b>: bounces hard.' : '', k.has('esponja') ? '<b style="color:var(--mostaza)">Sponge</b>: soaks up the hit, no bounce.' : ''].filter(Boolean).join(' ');
      return 'Tap the floor where you think the marble will land.<small>' + (legend || 'Drag to fine-tune. Keyboard: arrow keys and Enter.') + '</small>';
    },
    race: (r) => r.format === 'objetos'
      ? 'Each lane carries a different object. In what order do they cross the line?<small>Marble, wheel and hoop roll; the ice cube slides with no friction. Tap the lanes in order.</small>'
      : r.format === 'terrenos'
        ? 'Watch out for the sand: it slows the marbles down. In what order do they finish?<small>Tap the tracks in order, starting with the one you think wins.</small>'
        : 'They all start together, with no friction. In what order do they finish?<small>Tap the tracks in order, starting with the one you think wins.</small>',
    pool: () => 'The ball leaves along the arrow, bounces off the cushions and the cloth slows it down. Where does it stop?<small>Tap the table where you think it will come to rest.</small>',
    tower: () => 'If the tower falls, which block hits the ground first?<small>Tap that block, or choose “It stands” if you think it won’t fall. Dark blocks weigh three times as much.</small>',
  };
  function startRound() {
    cancelAnimationFrame(anim && anim.raf);
    anim = null; phase = 'aim'; mark = null; order = [];
    const r = round();
    $('tag').textContent = 'Round ' + (roundIdx + 1) + ' · ' + TYPE_NAME[r.type];
    $('slowmo').hidden = true; $('result').hidden = true; $('prompt').hidden = false;
    $('go').textContent = 'Release'; $('go').disabled = true;
    $('prompt').innerHTML = PROMPTS[r.type](r);
    $('chips').hidden = true;
    if (r.type === 'race') buildRaceChips();
    if (r.type === 'tower') buildTowerChips();
    renderPips(); draw();
  }
  function renderPips() {
    const p = $('pips'); p.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const d = document.createElement('span'); d.className = 'pip';
      if (i < scores.length) d.classList.add(band(scores[i]));
      else if (i === roundIdx) d.classList.add('now');
      p.appendChild(d);
    }
  }
  const band = (s) => s >= 80 ? 'g' : s >= 40 ? 'y' : 'r';
  function ready() {
    const r = round();
    $('go').disabled = r.type === 'race' ? order.length !== r.tracks.length : mark == null;
  }

  /* ---------- chips ---------- */
  function buildRaceChips() {
    const r = round(), box = $('chips'); box.hidden = false; box.innerHTML = '';
    r.tracks.forEach((t, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.id = 'chip' + i;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span class="dot" style="background:var(--' + t.color + ')"></span>' + (t.obj ? OBJ_NAME[t.obj] : COLOR_NAME[t.color]);
      b.addEventListener('click', () => pickTrack(i));
      box.appendChild(b);
    });
    const clr = document.createElement('button'); clr.type = 'button'; clr.className = 'linkbtn'; clr.textContent = 'Clear order';
    clr.addEventListener('click', () => { if (phase !== 'aim') return; order = []; refreshRaceChips(); draw(); });
    box.appendChild(clr);
  }
  function pickTrack(i) {
    if (phase !== 'aim' || order.includes(i)) return;
    const r = round(); order.push(i);
    if (order.length === r.tracks.length - 1) order.push(r.tracks.findIndex((_, j) => !order.includes(j)));
    refreshRaceChips(); draw();
  }
  function refreshRaceChips() {
    round().tracks.forEach((t, i) => {
      const b = $('chip' + i), pos = order.indexOf(i);
      b.setAttribute('aria-pressed', pos >= 0 ? 'true' : 'false');
      b.querySelector('.dot').textContent = pos >= 0 ? (pos + 1) : '';
    });
    ready();
  }
  function buildTowerChips() {
    const box = $('chips'); box.hidden = false; box.innerHTML = '';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.id = 'chipHold';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<span class="dot" style="background:var(--good)">✓</span>It stands, no fall';
    b.addEventListener('click', () => { if (phase !== 'aim') return; mark = -1; refreshTower(); });
    box.appendChild(b);
  }
  function refreshTower() { const b = $('chipHold'); if (b) b.setAttribute('aria-pressed', mark === -1 ? 'true' : 'false'); ready(); draw(); }

  /* ---------- entrada en el canvas ---------- */
  function toWorld(ev) {
    const b = cv.getBoundingClientRect();
    return [(ev.clientX - b.left) / b.width * W, (ev.clientY - b.top) / b.height * H];
  }
  const BAL = { cx: 200, y: 330, unit: 16, half: 10.5 };
  let dragging = false;
  function aimAt(x, y, isDown) {
    const r = round();
    if (r.type === 'drop') mark = Math.max(R, Math.min(W - R, x));
    else if (r.type === 'balance') mark = Math.round(Math.max(-BAL.half, Math.min(BAL.half, (x - BAL.cx) / BAL.unit)) * 20) / 20;
    else if (r.type === 'pool') { const t = r.table, m = r.br; mark = [Math.max(t.x0 + m, Math.min(t.x1 - m, x)), Math.max(t.y0 + m, Math.min(t.y1 - m, y))]; }
    else if (r.type === 'tower' && isDown) {
      const k = r.blocks.findIndex(b => x >= b.x - 4 && x <= b.x + b.w + 4 && y >= b.y - 2 && y <= b.y + b.h + 2);
      if (k >= 1) { mark = k; refreshTower(); }
      return;
    } else if (r.type === 'race' && isDown) {
      let best = -1, bd = 22;
      r.tracks.forEach((t, i) => { for (const [px, py] of t.pts) { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } } });
      if (best >= 0) pickTrack(best);
      return;
    } else return;
    ready(); draw();
  }
  cv.addEventListener('pointerdown', (ev) => {
    if (phase !== 'aim' || sending) return;
    const [x, y] = toWorld(ev); const t = round().type;
    if (t === 'drop' || t === 'balance' || t === 'pool') { dragging = true; cv.setPointerCapture(ev.pointerId); }
    aimAt(x, y, true);
  });
  cv.addEventListener('pointermove', (ev) => { if (dragging && phase === 'aim') { const [x, y] = toWorld(ev); aimAt(x, y, false); } });
  cv.addEventListener('pointerup', () => { dragging = false; });
  cv.addEventListener('pointercancel', () => { dragging = false; });
  cv.addEventListener('keydown', (ev) => {
    if (phase !== 'aim') return;
    const r = round(), k = ev.key, f = ev.shiftKey ? 5 : 1;
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k]) {
      ev.preventDefault(); const [dx, dy] = arrows[k];
      if (r.type === 'drop') aimAt((mark ?? W / 2) + dx * 4 * f, 0);
      if (r.type === 'balance') aimAt(BAL.cx + ((mark ?? 0) + dx * 0.25 * f) * BAL.unit, 0);
      if (r.type === 'pool') { const p = mark ?? [200, 300]; aimAt(p[0] + dx * 4 * f, p[1] + dy * 4 * f); }
      if (r.type === 'tower') { const n = r.blocks.length; mark = mark == null || mark < 1 ? 1 : Math.max(1, Math.min(n - 1, mark + (dy ? -dy : dx))); refreshTower(); }
    } else if (k === 'Enter' && !$('go').disabled) { ev.preventDefault(); release(); }
  });

  /* ---------- soltar ---------- */
  $('go').addEventListener('click', () => { if (phase === 'aim') release(); else if (phase === 'result') next(); });
  function duration(r) {
    if (r.type === 'drop' || r.type === 'pool') return r.frames.length / 60;
    if (r.type === 'race') return Math.max(...r.tracks.map(t => t.times.at(-1)));
    if (r.type === 'balance') return 2.4;
    if (r.type === 'tower') return r.frames ? r.frames.length / 60 : 1.2;
  }
  async function release() {
    if (phase !== 'aim' || sending) return;
    sending = true; $('go').disabled = true; $('go').classList.add('busy'); $('go').textContent = 'Checking';
    let res;
    try { res = await hooks.submit(roundIdx, predictionOf(round())); }
    catch (e) { sending = false; $('go').classList.remove('busy'); $('go').textContent = 'Release'; ready(); hooks.error(e.message); return; }
    sending = false; $('go').classList.remove('busy'); $('go').textContent = 'Watch…';
    day.rounds[roundIdx] = res.round; serverPts = res.pts; lastCoins = res.coins;   // ahora sí: la ronda completa con su resultado
    const r = round(); phase = 'playing';
    const speed = r.type === 'race' ? 0.5 : 1;
    // Torre que aguanta: no se mueve nada, así que se avisa y se acorta la espera.
    const stands = r.type === 'tower' && r.answer < 0;
    $('slowmo').textContent = stands ? 'Still standing…' : 'Slow motion ×0.5';
    $('slowmo').hidden = !(r.type === 'race' || stands);
    const dur = stands ? Math.min(duration(r), 1.6) : duration(r), t0 = performance.now();
    anim = { t: 0, raf: 0 };
    const step = (now) => {
      anim.t = reduce ? dur : Math.min(dur, (now - t0) / 1000 * speed);
      draw();
      if (anim.t < dur) anim.raf = requestAnimationFrame(step); else finishRound();
    };
    anim.raf = requestAnimationFrame(step);
  }

  /* ---------- puntuación ---------- */
  function scoreRound(r) {
    if (r.type === 'drop') {
      const uM = mark / 4, uR = r.impactX / 4, err = Math.abs(uM - uR);
      return { pts: err <= 2 ? 100 : Math.round(100 * Math.exp(-(err - 2) / 20)), l1: err <= 2 ? 'Spot on!' : err <= 7 ? 'Very close' : err <= 18 ? 'Close' : 'Way off',
        l2: 'Landed at ' + uR.toFixed(0) + ' · your mark ' + uM.toFixed(0) + ' · off by ' + err.toFixed(0), d: 'Landed at ' + uR.toFixed(0) + ', you said ' + uM.toFixed(0) };
    }
    if (r.type === 'race') {
      const n = r.tracks.length, win = order[0] === r.order[0];
      let rest = 0; for (let i = 1; i < n; i++) if (order[i] === r.order[i]) rest++;
      let pts = Math.round((win ? 70 : 0) + 30 * rest / (n - 1)); if (!win) pts = Math.min(pts, 30);
      const w = r.tracks[r.order[0]];
      const wn = w.obj ? OBJ_NAME[w.obj].toLowerCase() : COLOR_NAME[w.color].toLowerCase();
      return { pts, l1: win ? (pts === 100 ? 'Perfect order' : 'You picked the winner') : (w.obj ? 'The ' + wn : 'The ' + wn + ' track') + ' won',
        l2: r.order.map((i, k) => ORD(k) + ' ' + (r.tracks[i].obj ? OBJ_NAME[r.tracks[i].obj] : COLOR_NAME[r.tracks[i].color]) + ' ' + num(r.tracks[i].times.at(-1), 2) + ' s').join(' · '),
        d: (w.obj ? OBJ_NAME[w.obj] : COLOR_NAME[w.color] + ' (' + KIND_NAME[w.kind] + ')') + ' won' };
    }
    if (r.type === 'balance') {
      const err = Math.abs(mark - r.answer);
      const pts = err <= 0.3 ? 100 : Math.round(100 * Math.exp(-(err - 0.3) / 3.2));
      return { pts, l1: err <= 0.3 ? 'Perfectly level' : err <= 1 ? 'Almost level' : err <= 2.5 ? 'Tilts a little' : 'Off balance',
        l2: 'Balance point ' + side(r.answer) + ' · yours ' + side(mark), d: 'Balance ' + side(r.answer) + ', you put ' + side(mark) };
    }
    if (r.type === 'pool') {
      const dcm = Math.hypot(mark[0] - r.stop[0], mark[1] - r.stop[1]) / 2;
      const pts = dcm <= 5 ? 100 : Math.round(100 * Math.exp(-(dcm - 5) / 35));
      return { pts, l1: dcm <= 5 ? 'Spot on!' : dcm <= 15 ? 'Very close' : dcm <= 35 ? 'Close' : 'Way off',
        l2: r.hits + (r.hits === 1 ? ' cushion' : ' cushions') + ' · you were ' + Math.round(dcm) + ' cm away', d: r.hits + (r.hits === 1 ? ' cushion' : ' cushions') + ', ' + Math.round(dcm) + ' cm away' };
    }
    if (r.type === 'tower') {
      const ans = r.answer, pick = mark;
      const pts = pick === ans ? 100 : (ans >= 1 && pick >= 1) ? 25 : 0;
      const name = (k) => k < 0 ? 'it stands' : 'block ' + (k + 1);
      return { pts, l1: pts === 100 ? (ans < 0 ? 'It stands. Well spotted!' : 'Well spotted') : ans < 0 ? 'It stood' : pick < 0 ? 'It falls' : 'It falls, but another block lands first',
        l2: (ans < 0 ? 'No fall' : 'First to hit the ground: block ' + (ans + 1)) + ' · you: ' + name(pick), d: ans < 0 ? 'It stood' : 'Block ' + (ans + 1) + ' landed first' };
    }
  }
  function finishRound() {
    const r = round(); phase = 'result';
    const s = scoreRound(r); s.pts = serverPts;              // los puntos que valen son los del servidor
    scores.push(s.pts); details.push(s.d);
    try { sessionStorage.setItem(DKEY(attempt.id), JSON.stringify(details)); } catch (e) {}
    $('rPts').textContent = '+' + s.pts; $('rPts').className = 'pts ' + band(s.pts);
    $('rL1').textContent = s.l1; $('rL2').textContent = s.l2;
    $('result').hidden = false; $('prompt').hidden = true; $('chips').hidden = true;
    $('go').disabled = false; $('go').textContent = roundIdx < 4 ? 'Next round' : 'See result';
    renderPips(); draw();
    $('go').focus({ preventScroll: true });
    // En pantallas bajas el resultado y el botón pueden quedar fuera: se baja hasta ellos.
    const gb = $('go').getBoundingClientRect();
    if (gb.bottom > innerHeight - 8 || $('result').getBoundingClientRect().top < 0)
      $('go').scrollIntoView({ block: 'end', behavior: reduce ? 'auto' : 'smooth' });
  }
  function next() {
    if (roundIdx < 4) { roundIdx++; startRound(); return; }
    $('play').hidden = true;
    hooks.done({ attempt, day, scores, details, total: scores.reduce((a, b) => a + b, 0), types: day.rounds.map(r => r.type), coins: lastCoins });
  }

  /* ---------- dibujo: utilidades ---------- */
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 3), w = cv.clientWidth;
    if (!w) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(w * 1.5 * dpr);
    draw();
  }
  new ResizeObserver(fit).observe(cv);
  function draw() {
    if (!day || !cv.width || $('play').hidden || !phase) return;
    const s = cv.width / W;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.clearRect(0, 0, W, H);
    paper();
    const r = round(); if (!r) return;
    ({ drop: drawDrop, race: drawRace, balance: drawBalance, pool: drawPool, tower: drawTower })[r.type](r);
  }
  function paper() {
    ctx.fillStyle = C.plate; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 1 / (cv.width / W);
    for (let x = 0; x <= W; x += 10) { ctx.strokeStyle = x % 50 === 0 ? C['grid-major'] : C.grid; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += 10) { ctx.strokeStyle = y % 50 === 0 ? C['grid-major'] : C.grid; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  }
  /* ---------- skins de la canica (las compra el jugador en la tienda) ---------- */
  let skin = { kind: 'solid', base: 'var:coral' };
  const col = (v) => (v || '').startsWith('var:') ? C[v.slice(4)] : v;
  function drawSkin(g, x, y, rad, look, ang) {
    const base = col(look.base), alt = col(look.alt);
    g.save(); g.translate(x, y);
    g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.closePath();
    if (look.kind === 'metal') {
      const gr = g.createRadialGradient(-rad * 0.35, -rad * 0.4, rad * 0.1, 0, 0, rad);
      gr.addColorStop(0, alt); gr.addColorStop(0.55, base); gr.addColorStop(1, look.dark);
      g.fillStyle = gr;
    } else if (look.kind === 'galaxy') {
      const gr = g.createRadialGradient(rad * 0.2, rad * 0.1, 0, 0, 0, rad);
      gr.addColorStop(0, alt); gr.addColorStop(1, base); g.fillStyle = gr;
    } else g.fillStyle = base;
    g.fill();
    g.save(); g.clip(); g.rotate(ang || 0);
    if (look.kind === 'solid') {
      g.strokeStyle = C.plate; g.globalAlpha = 0.7; g.lineWidth = rad * 0.22; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, rad * 0.58, -0.5, 1.1); g.stroke();
      g.beginPath(); g.arc(0, 0, rad * 0.58, Math.PI - 0.5, Math.PI + 1.1); g.stroke();
    } else if (look.kind === 'swirl') {
      g.strokeStyle = alt; g.lineWidth = rad * 0.32; g.lineCap = 'round';
      g.beginPath(); g.arc(-rad * 0.35, 0, rad * 0.45, -Math.PI, 0); g.arc(rad * 0.35, 0, rad * 0.45, Math.PI, 0, true); g.stroke();
    } else if (look.kind === 'stripe') {
      g.fillStyle = alt; g.fillRect(-rad, -rad * 0.3, rad * 2, rad * 0.6);
    } else if (look.kind === 'eight') {
      g.fillStyle = alt; g.beginPath(); g.arc(rad * 0.15, -rad * 0.1, rad * 0.48, 0, Math.PI * 2); g.fill();
      g.fillStyle = base; g.font = '800 ' + (rad * 0.62) + 'px "Bricolage Grotesque", system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('8', rad * 0.15, -rad * 0.06);
    } else if (look.kind === 'melon') {
      g.strokeStyle = alt; g.lineWidth = rad * 0.16;
      for (const k of [-0.66, -0.22, 0.22, 0.66]) { g.beginPath(); g.ellipse(k * rad * 1.4, 0, rad * 0.25, rad * 1.1, 0, 0, Math.PI * 2); g.stroke(); }
    } else if (look.kind === 'metal') {
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = rad * 0.14; g.beginPath(); g.arc(0, 0, rad * 0.7, -0.3, 0.5); g.stroke();
    } else if (look.kind === 'galaxy') {
      g.fillStyle = '#fff';
      for (const [sx, sy, sr] of [[-0.5, -0.3, 0.08], [0.3, -0.55, 0.06], [0.55, 0.2, 0.09], [-0.2, 0.5, 0.06], [0.05, 0.05, 0.05], [-0.62, 0.25, 0.05]]) { g.beginPath(); g.arc(sx * rad, sy * rad, sr * rad, 0, Math.PI * 2); g.fill(); }
    } else if (look.kind === 'disco') {
      const t = rad / 2.6;
      for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { g.fillStyle = (i + j) % 2 ? alt : base; g.fillRect(i * t - t / 2 + 0.4, j * t - t / 2 + 0.4, t - 0.8, t - 0.8); }
    }
    g.restore();
    g.globalAlpha = 0.45; g.fillStyle = '#fff'; g.beginPath(); g.arc(-rad * 0.35, -rad * 0.35, rad * 0.3, 0, Math.PI * 2); g.fill();
    g.globalAlpha = 1; g.strokeStyle = C.ink; g.lineWidth = Math.max(1.2, rad * 0.11); g.beginPath(); g.arc(0, 0, rad, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  function marble(x, y, rad, col, ang) {
    ctx.save();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
    ctx.strokeStyle = C.plate; ctx.globalAlpha = 0.7; ctx.lineWidth = rad * 0.22; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.58, -0.5, 1.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, rad * 0.58, Math.PI - 0.5, Math.PI + 1.1); ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 0.45; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - rad * 0.35, y - rad * 0.35, rad * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
  const mono = (size, weight) => (weight || 600) + ' ' + size + 'px "IBM Plex Mono", ui-monospace, monospace';
  function label(x, y, text, col) {
    ctx.font = mono(11); const w = ctx.measureText(text).width + 12;
    const lx = Math.max(4, Math.min(W - 4 - w, x - w / 2));
    ctx.fillStyle = col; roundRect(lx, y - 12, w, 17, 4); ctx.fill();
    ctx.fillStyle = C.plate; ctx.textAlign = 'left'; ctx.fillText(text, lx + 6, y + 0.5);
  }
  function roundRect(x, y, w, h, rr) { ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath(); }
  function arrow(x0, y0, x1, y1, col, wdt) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.strokeStyle = col; ctx.lineWidth = wdt || 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * 6, y1 - Math.sin(a) * 6); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - Math.cos(a - 0.45) * 12, y1 - Math.sin(a - 0.45) * 12); ctx.lineTo(x1 - Math.cos(a + 0.45) * 12, y1 - Math.sin(a + 0.45) * 12); ctx.closePath(); ctx.fill();
  }

  /* ---------- ¿Dónde cae? ---------- */
  function drawDrop(r) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, FLOOR); ctx.lineTo(W, FLOOR); ctx.stroke();
    ctx.lineWidth = 1; ctx.fillStyle = C['ink-2']; ctx.font = mono(10); ctx.textAlign = 'center';
    for (let u = 0; u <= 100; u += 2.5) {
      const x = u * 4, big = u % 10 === 0, mid = u % 5 === 0;
      ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(x, FLOOR + (big ? 12 : mid ? 8 : 4)); ctx.stroke();
      if (big && u > 0 && u < 100) ctx.fillText(String(u), x, FLOOR + 25);
    }
    ctx.lineCap = 'round';
    for (const p of r.planks) plank(p);
    for (const c of r.pegs) {
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = C.plate; ctx.beginPath(); ctx.arc(c.x, c.y, 2.2, 0, Math.PI * 2); ctx.fill();
    }
    { const x = r.startX, y1 = r.startY - 4;
      ctx.fillStyle = C.paper; ctx.fillRect(x - 15, 16, 30, y1 - 16);
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x - 15, y1); ctx.lineTo(x - 15, 16); ctx.lineTo(x + 15, 16); ctx.lineTo(x + 15, y1); ctx.stroke(); }
    if (Math.abs(r.startVx) > 8 && phase === 'aim') {
      const dir = Math.sign(r.startVx), len = 10 + Math.abs(r.startVx) * 0.4, y = r.startY, x0 = r.startX + dir * (R + 5);
      arrow(x0, y, x0 + dir * (len + 6), y, C.coral, 2);
    }
    if (mark != null) {
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = C.azul; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(mark, 70); ctx.lineTo(mark, FLOOR); ctx.stroke(); ctx.restore();
      ctx.fillStyle = C.azul; ctx.beginPath(); ctx.moveTo(mark, FLOOR - 1); ctx.lineTo(mark - 7, FLOOR - 13); ctx.lineTo(mark + 7, FLOOR - 13); ctx.closePath(); ctx.fill();
      label(mark, FLOOR - 22, 'you ' + (mark / 4).toFixed(0), C.azul);
    }
    let fi = anim ? Math.min(r.frames.length - 1, Math.floor(anim.t * 60)) : 0;
    if (phase === 'result') fi = r.frames.length - 1;
    trail(r.frames, fi, C.coral);
    if (phase === 'result') {
      const x = r.impactX;
      ctx.strokeStyle = C.coral; ctx.lineWidth = 2;
      for (const rr of [16, 26]) { ctx.globalAlpha = rr === 16 ? 0.6 : 0.3; ctx.beginPath(); ctx.ellipse(x, FLOOR, rr, rr * 0.3, 0, Math.PI, 0); ctx.stroke(); }
      ctx.globalAlpha = 1;
      label(x, FLOOR + 40, 'landed ' + (x / 4).toFixed(0), C.coral);
    }
    drawSkin(ctx, r.frames[fi][0], r.frames[fi][1], R, skin, r.frames[fi][2]);
  }
  function plank(p) {
    const dx = p.x2 - p.x1, dy = p.y2 - p.y1, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    ctx.lineCap = 'round';
    if (p.kind === 'muelle') {
      ctx.strokeStyle = C.violeta; ctx.globalAlpha = 0.25; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.strokeStyle = C.violeta; ctx.lineWidth = 2.4; ctx.lineJoin = 'round'; ctx.beginPath();
      const steps = Math.max(6, Math.round(L / 9));
      for (let i = 0; i <= steps; i++) { const t = i / steps, o = i === 0 || i === steps ? 0 : (i % 2 ? 4 : -4); const x = p.x1 + dx * t + nx * o, y = p.y1 + dy * t + ny * o; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = C.violeta; for (const [x, y] of [[p.x1, p.y1], [p.x2, p.y2]]) { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); }
    } else if (p.kind === 'esponja') {
      ctx.strokeStyle = C.mostaza; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
      ctx.fillStyle = C.plate; ctx.globalAlpha = 0.75;
      for (let d = 8; d < L - 4; d += 9) { const o = (Math.round(d / 9) % 2 ? 1.8 : -1.8); ctx.beginPath(); ctx.arc(p.x1 + ux * d + nx * o, p.y1 + uy * d + ny * o, 1.4, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalAlpha = 1;
    } else {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke();
    }
  }
  function trail(frames, fi, col) {
    if (fi < 1) return;
    ctx.save();
    for (let k = Math.max(1, fi - 40); k <= fi; k++) {
      ctx.globalAlpha = (k - (fi - 40)) / 40 * 0.35; ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(frames[k - 1][0], frames[k - 1][1]); ctx.lineTo(frames[k][0], frames[k][1]); ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- ¿Cuál llega antes? ---------- */
  function posAt(t, time) {
    const T = t.times; if (!T) return [...t.pts[0], 0];       // antes de jugar no hay tiempos
    if (time >= T.at(-1)) return [...t.pts.at(-1), t.pts.length - 2];
    let lo = 0, hi = T.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] <= time) lo = m; else hi = m; }
    const f = (time - T[lo]) / (T[hi] - T[lo] || 1);
    return [t.pts[lo][0] + (t.pts[hi][0] - t.pts[lo][0]) * f, t.pts[lo][1] + (t.pts[hi][1] - t.pts[lo][1]) * f, lo];
  }
  const OBJ_R = { canica: 8.5, rueda: 9.5, aro: 10, hielo: 9 };
  function drawObject(t, x, y, nx, ny, ang, slope) {
    const kind = t.obj || 'canica', rad = OBJ_R[kind], cx = x + nx * (rad + 1.5), cy = y + ny * (rad + 1.5), col = C[t.color];
    if (kind === 'canica') return marble(cx, cy, rad, col, ang);
    ctx.save(); ctx.translate(cx, cy);
    if (kind === 'rueda') {
      ctx.rotate(ang); ctx.fillStyle = col; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C.plate; ctx.lineWidth = 1.6; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(k * 2.09) * rad * 0.75, Math.sin(k * 2.09) * rad * 0.75); ctx.stroke(); }
      ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'aro') {
      ctx.rotate(ang); ctx.strokeStyle = C.ink; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.arc(0, 0, rad - 2.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, rad - 2.5, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = C.plate; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rad - 4.5, 0); ctx.lineTo(rad - 0.5, 0); ctx.stroke();
    } else {
      ctx.rotate(slope); ctx.fillStyle = col; ctx.globalAlpha = 0.45; roundRect(-rad, -rad, rad * 2, rad * 2, 3); ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = col; ctx.lineWidth = 2; roundRect(-rad, -rad, rad * 2, rad * 2, 3); ctx.stroke();
      ctx.strokeStyle = C.plate; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-rad + 4, -rad + 9); ctx.lineTo(-rad + 9, -rad + 4); ctx.stroke();
    }
    ctx.restore();
  }
  function drawRace(r) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.font = mono(10); ctx.fillStyle = C['ink-2'];
    if (r.format === 'objetos') {
      const fx = r.finishX + 12;
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fx, 88); ctx.lineTo(fx, 520); ctx.stroke(); ctx.restore();
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? C.ink : C.plate; ctx.fillRect(fx + 2 + j * 8, 88 + i * 8, 8, 8); }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(fx + 2, 88, 16, 32);
      ctx.fillStyle = C['ink-2']; ctx.textAlign = 'right'; ctx.fillText('FINISH', fx - 4, 100);
      r.tracks.forEach(t => { ctx.fillStyle = C.ink; ctx.fillRect(t.pts[0][0] - 30, t.pts[0][1] - 2, 32, 5); });
    } else {
      const [ax, ay] = r.A, [bx, by] = r.B;
      ctx.fillStyle = C.ink; ctx.fillRect(bx + 10, by - 70, 3, 90);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { ctx.fillStyle = (i + j) % 2 ? C.ink : C.plate; ctx.fillRect(bx + 13 + j * 8, by - 70 + i * 8, 8, 8); }
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(bx + 13, by - 70, 16, 32);
      ctx.fillStyle = C['ink-2']; ctx.textAlign = 'right'; ctx.fillText('FINISH', bx + 29, by + 34);
      ctx.fillStyle = C.ink; ctx.fillRect(ax - 30, ay - 3, 34, 6);
      ctx.textAlign = 'left'; ctx.fillText('START', ax - 30, ay - 22);
    }
    // arena
    let sandLabel = false;
    r.tracks.forEach(t => (t.sand || []).forEach(([i0, i1]) => {
      ctx.strokeStyle = C.wood; ctx.lineWidth = 15; ctx.beginPath();
      for (let j = i0; j <= i1; j++) j === i0 ? ctx.moveTo(...t.pts[j]) : ctx.lineTo(...t.pts[j]); ctx.stroke();
      ctx.fillStyle = C.ink; ctx.globalAlpha = 0.35;
      for (let j = i0; j <= i1; j += 2) { const [x, y] = t.pts[j]; ctx.fillRect(x + ((j * 7) % 9) - 4, y + ((j * 5) % 9) - 4, 1.6, 1.6); }
      ctx.globalAlpha = 1;
      if (!sandLabel) { sandLabel = true; const [x, y] = t.pts[Math.round((i0 + i1) / 2)]; label(x, y + 24, 'sand', C['ink-2']); }
    }));
    r.tracks.forEach((t, i) => {
      ctx.strokeStyle = C[t.color]; ctx.lineWidth = 5; ctx.globalAlpha = phase === 'aim' && order.length && !order.includes(i) ? 0.55 : 1;
      ctx.beginPath(); t.pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
    });
    ctx.globalAlpha = 1;
    r.tracks.forEach((t, i) => {
      const pos = order.indexOf(i), [x, y] = t.pts[Math.floor(t.pts.length * (r.format === 'objetos' ? 0.5 : 0.55))];
      ctx.fillStyle = C[t.color]; ctx.beginPath(); ctx.arc(x, y + (r.format === 'objetos' ? 18 : 0), 11, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.plate; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.font = mono(11, 600); ctx.textAlign = 'center';
      ctx.fillText(pos >= 0 ? String(pos + 1) : (t.obj ? OBJ_NAME[t.obj] : COLOR_NAME[t.color])[0], x, y + (r.format === 'objetos' ? 18 : 0) + 4);
    });
    const time = phase === 'result' ? Infinity : anim ? anim.t : 0;
    const arrived = [];
    r.tracks.forEach((t, i) => {
      const [x, y, k] = posAt(t, time);
      const a = t.pts[k], b = t.pts[k + 1];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      if (ny > 0) { nx = -nx; ny = -ny; }
      if (!t.cum) { t.cum = [0]; for (let j = 1; j < t.pts.length; j++) t.cum.push(t.cum[j - 1] + Math.hypot(t.pts[j][0] - t.pts[j - 1][0], t.pts[j][1] - t.pts[j - 1][1])); }
      const sd = t.cum[k] + Math.hypot(x - t.pts[k][0], y - t.pts[k][1]);
      drawObject(t, x, y, nx, ny, sd / (OBJ_R[t.obj || 'canica']), Math.atan2(b[1] - a[1], b[0] - a[0]));
      if (t.times && time >= t.times.at(-1)) arrived.push(i);
    });
    if (anim || phase === 'result') {
      r.order.filter(i => arrived.includes(i)).forEach((i, k) => {
        const t = r.tracks[i], txt = ORD(k) + ' ' + (t.obj ? OBJ_NAME[t.obj] : COLOR_NAME[t.color]) + ' ' + num(t.times.at(-1), 2) + ' s';
        if (r.format === 'objetos') label(110, 30 + k * 22, txt, C[t.color]);
        else label(r.B[0] - 40, r.B[1] + 60 + k * 22, txt, C[t.color]);
      });
    }
  }

  /* ---------- Equilibrio ---------- */
  const boxSize = (m) => 28 + m * 4;
  function balanceAngle(r, t) {
    const tau = r.weights.reduce((s, w) => s + w.m * w.p, 0) + r.M * mark;
    const target = Math.abs(tau) <= r.M * 0.2 ? 0 : Math.max(-0.2, Math.min(0.2, tau * 0.006));
    if (target === 0) return Math.sin(t * 9) * 0.01 * Math.exp(-t * 2.5);
    return target * (1 - Math.exp(-4 * t) * (Math.cos(8 * t) + 0.5 * Math.sin(8 * t)));
  }
  function drawBalance(r) {
    const { cx, y, unit, half } = BAL, floorY = 420;
    ctx.fillStyle = C.paper; ctx.fillRect(0, floorY, W, H - floorY);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(cx, y + 5); ctx.lineTo(cx - 34, floorY); ctx.lineTo(cx + 34, floorY); ctx.closePath(); ctx.fill();
    const ang = phase === 'aim' ? 0 : balanceAngle(r, phase === 'result' ? 9 : anim.t);
    ctx.save(); ctx.translate(cx, y); ctx.rotate(ang);
    // barra con escala
    ctx.fillStyle = C.wood; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    roundRect(-half * unit - 6, -4, (half * 2) * unit + 12, 10, 3); ctx.fill(); ctx.stroke();
    ctx.font = mono(9, 500); ctx.textAlign = 'center';
    for (let u = -10; u <= 10; u++) {
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(u * unit, 6); ctx.lineTo(u * unit, u % 2 ? 11 : 15); ctx.stroke();
      if (u % 2 === 0 && u !== 0) { ctx.fillStyle = C['ink-2']; ctx.fillText(String(Math.abs(u)), u * unit, 26); }
    }
    for (const w of r.weights) weightBox(w.p * unit, w.m, C.ink, C.plate);
    if (mark != null) weightBox(mark * unit, r.M, C.azul, '#fff');
    if (phase === 'result') {
      ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.coral; ctx.lineWidth = 2;
      const s = boxSize(r.M); ctx.strokeRect(r.answer * unit - s / 2, -4 - s, s, s); ctx.restore();
    }
    ctx.restore();
    if (mark == null && phase === 'aim') {
      // la pesa espera en la bandeja
      const s = boxSize(r.M);
      ctx.save(); ctx.translate(cx, 150); weightBox(0, r.M, C.azul, '#fff'); ctx.restore();
      ctx.font = mono(11); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'center'; ctx.fillText('drag it onto the beam', cx, 150 + 18);
      void s;
    }
    if (phase === 'result') {
      label(cx + r.answer * unit, y - 70, 'balance ' + side(r.answer), C.coral);
      if (mark != null) label(cx + mark * unit, y + 60, 'you ' + side(mark), C.azul);
    }
  }
  function weightBox(x, m, fill, text) {
    const s = boxSize(m);
    ctx.fillStyle = fill; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
    roundRect(x - s / 2, -4 - s, s, s, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = text; ctx.textAlign = 'center';
    ctx.font = '800 ' + (13 + m) + 'px "Bricolage Grotesque", system-ui, sans-serif';
    ctx.fillText(String(m), x, -4 - s / 2 + 3);
    ctx.font = mono(9, 600); ctx.fillText('kg', x, -4 - s / 2 + 14);
  }

  /* ---------- Carambola ---------- */
  function drawPool(r) {
    const t = r.table, b = 12;
    ctx.fillStyle = C.ink; roundRect(t.x0 - b, t.y0 - b, t.x1 - t.x0 + 2 * b, t.y1 - t.y0 + 2 * b, 10); ctx.fill();
    ctx.fillStyle = C.felt; ctx.fillRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0);
    ctx.fillStyle = C.plate;
    for (const [dx, dy] of [[0.25, 0], [0.5, 0], [0.75, 0], [0.25, 1], [0.5, 1], [0.75, 1]]) { ctx.beginPath(); ctx.arc(t.x0 + (t.x1 - t.x0) * dx, dy ? t.y1 + b / 2 : t.y0 - b / 2, 2, 0, Math.PI * 2); ctx.fill(); }
    ctx.font = mono(10); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'center';
    ctx.fillText('160 × 210 cm table · the cloth slows the ball', W / 2, t.y1 + b + 22);
    // fuerza
    const v = Math.hypot(r.v[0], r.v[1]), f = Math.min(1, v / 700);
    ctx.textAlign = 'left'; ctx.fillText('POWER', t.x0 - b, 46);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(t.x0 + 50, 37, 200, 12);
    ctx.fillStyle = C.coral; ctx.fillRect(t.x0 + 51.5, 38.5, 197 * f, 9);
    const [sx, sy] = r.start;
    if (phase === 'aim') arrow(sx, sy, sx + r.v[0] / v * (24 + 70 * f), sy + r.v[1] / v * (24 + 70 * f), C.coral, 3);
    if (mark) {
      const [mx, my] = mark;
      ctx.strokeStyle = C.azul; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, r.br + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx - 16, my); ctx.lineTo(mx - 8, my); ctx.moveTo(mx + 8, my); ctx.lineTo(mx + 16, my);
      ctx.moveTo(mx, my - 16); ctx.lineTo(mx, my - 8); ctx.moveTo(mx, my + 8); ctx.lineTo(mx, my + 16); ctx.stroke();
    }
    let fi = anim ? Math.min(r.frames.length - 1, Math.floor(anim.t * 60)) : 0;
    if (phase === 'result') fi = r.frames.length - 1;
    if (phase !== 'aim') {
      ctx.save(); ctx.setLineDash([2, 5]); ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.35; ctx.lineWidth = 1.5;
      ctx.beginPath(); r.frames.slice(0, fi + 1).forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke(); ctx.restore();
    }
    if (phase === 'result') {
      if (mark) { ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C['ink-2']; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(mark[0], mark[1]); ctx.lineTo(r.stop[0], r.stop[1]); ctx.stroke(); ctx.restore(); }
      label(r.stop[0], r.stop[1] - 22, 'stopped here', C.coral);
    }
    let dist = 0; for (let k = 1; k <= fi; k++) dist += Math.hypot(r.frames[k][0] - r.frames[k - 1][0], r.frames[k][1] - r.frames[k - 1][1]);
    drawSkin(ctx, r.frames[fi][0], r.frames[fi][1], r.br, skin, dist / r.br);
  }

  /* ---------- ¿Aguanta? ---------- */
  function drawTower(r) {
    const floorY = 540;
    ctx.fillStyle = C.paper; ctx.fillRect(0, floorY, W, H - floorY);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, floorY); ctx.lineTo(W, floorY); ctx.stroke();
    ctx.fillStyle = C.ink; ctx.globalAlpha = 0.85; ctx.fillRect(0, 230, 8, floorY - 230); ctx.fillRect(W - 8, 230, 8, floorY - 230); ctx.globalAlpha = 1;
    let fr = null;
    if (r.frames && phase !== 'aim') fr = r.frames[phase === 'result' ? r.frames.length - 1 : Math.min(r.frames.length - 1, Math.floor(anim.t * 60))];
    const wob = !r.frames && anim && phase === 'playing' ? Math.sin(anim.t * 14) * 0.012 * Math.exp(-anim.t * 3) : 0;
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, floorY); ctx.clip();
    r.blocks.forEach((b, i) => {
      ctx.save();
      const [cx, cy, a] = fr ? fr[i] : [b.x + b.w / 2, b.y + b.h / 2, 0];
      if (wob && i > 0) { ctx.translate(200, floorY); ctx.rotate(wob * i / r.blocks.length); ctx.translate(-200, -floorY); }
      ctx.translate(cx, cy); ctx.rotate(a);
      const heavy = b.d > 1, w = b.w - 3, h = b.h - 3;
      ctx.fillStyle = heavy ? C['ink-2'] : C.wood; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
      roundRect(-w / 2, -h / 2, w, h, 4); ctx.fill(); ctx.stroke();
      if (!heavy) { ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.15; ctx.lineWidth = 1; for (const f of [-0.2, 0.2]) { ctx.beginPath(); ctx.moveTo(-w / 2 + 6, h * f); ctx.lineTo(w / 2 - 6, h * f + 2); ctx.stroke(); } ctx.globalAlpha = 1; }
      ctx.fillStyle = heavy ? C.plate : C.ink; ctx.textAlign = 'center';
      ctx.font = '800 16px "Bricolage Grotesque", system-ui, sans-serif'; ctx.fillText(String(i + 1), heavy ? -8 : 0, 6);
      if (heavy) { ctx.font = mono(10); ctx.fillText('×3', 12, 5); }
      if (mark === i && phase !== 'playing') { ctx.strokeStyle = C.azul; ctx.lineWidth = 3.5; roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 6); ctx.stroke(); }
      if (phase === 'result' && r.answer === i) { ctx.strokeStyle = C.coral; ctx.lineWidth = 3.5; roundRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 8, 6); ctx.stroke(); }
      ctx.restore();
    });
    ctx.restore();
    if (phase === 'result') {
      if (r.answer >= 0) { const [cx, cy] = fr ? fr[r.answer] : [0, 0]; label(cx, Math.min(cy - 34, floorY - 50), 'lands first: ' + (r.answer + 1), C.coral); }
      else label(200, r.blocks.at(-1).y - 22, 'it stands!', C.good);
    }
  }

  window.PhysleGame = { play, redraw: () => draw(), TYPE_NAME, setSkin: (look) => { skin = look || skin; draw(); }, drawMarble: (g, x, y, r, look, ang) => { readColors(); drawSkin(g, x, y, r, look, ang); } };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
})();
