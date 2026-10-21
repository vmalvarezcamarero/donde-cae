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
  const TYPE_NAME = { balance: 'Balance', drop: 'Where will it land?', race: 'Which finishes first?', pool: 'Bank shot', tower: 'Will it stand?',
    loop: 'Loop the loop', laser: 'Laser', domino: 'Dominoes', bridge: 'Bridge', float: 'Float or sink?', gears: 'Gears' };
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
    loop: (r) => 'What’s the lowest height that gets the marble all the way round the loop?<small>Drag the marble up or down the ramp. Too low and it falls off the loop.' + (r.carpet ? ' The carpet slows it down.' : '') + '</small>',
    laser: () => 'The laser bounces off every mirror it hits. Where does the beam end?<small>Tap the wall where you think it lands. Dark blocks absorb light.</small>',
    bridge: (r) => 'How long must the plank be to bridge the gap?<small>Drag up to grow the plank. It tips over onto the other side and the marble rolls to its tip: too short or too long and it falls.' + (r.yb > r.ya ? ' The far side is lower.' : r.yb < r.ya ? ' The far side is higher: the plank will rest on its edge and the marble drops from the tip.' : '') + '</small>',
    domino: () => 'Someone pushes the first domino. Which is the last one to fall?<small>Tap that domino. Dark dominoes weigh three times as much.</small>',
    float: (r) => 'Which of these float' + (r.salty ? ' in very salty water' : ' in water') + '?<small>Tap the ones that float; the rest will sink.' + (r.salty ? ' Salt water is denser than fresh water, so it pushes harder.' : '') + '</small>',
    gears: () => 'The first gear turns clockwise. How does the gear with the flag turn?<small>Pick its direction and whether it spins faster or slower than the first one.</small>',
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
    if (r.type === 'float') { mark = []; buildFloatChips(); }
    if (r.type === 'gears') buildGearChips();
    if (r.type === 'loop') prepLoop(r);
    renderPips(); ready(); draw();
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
    $('go').disabled = r.type === 'race' ? order.length !== r.tracks.length : r.type === 'float' ? false : mark == null;
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
    else if (r.type === 'loop') { if (!aimLoop(r, x, y)) return; }
    else if (r.type === 'laser') mark = snapWall(x, y);
    else if (r.type === 'bridge') { if (!aimBridge(r, x, y)) return; }
    else if (r.type === 'domino' && isDown) { const k = pickDomino(r, x, y); if (k < 0) return; mark = k; }
    else if (r.type === 'float' && isDown) { const k = pickFloat(r, x, y); if (k < 0) return; toggleFloat(k); return; }
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
    if (t === 'drop' || t === 'balance' || t === 'pool' || t === 'loop' || t === 'laser' || t === 'bridge') { dragging = true; cv.setPointerCapture(ev.pointerId); }
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
      if (r.type === 'bridge') { mark = Math.max(10, Math.min(r.ya - 20, (mark ?? 100) - dy * 2 * f + dx * 2 * f)); ready(); draw(); }
      if (r.type === 'loop') { mark = Math.max(LOOPC.minH, Math.min(LOOPC.maxH, (mark ?? 150) - dy * 2 * f + dx * 2 * f)); ready(); draw(); }
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
    if (r.type === 'loop') { if (!r.sim) r.sim = loopFrames(r, mark); return r.sim.length / 60; }
    if (r.type === 'laser') return r.len / LASER_SPEED + 0.5;
    if (r.type === 'domino') return r.frames.length / 60;
    if (r.type === 'bridge') { if (!r.sim) r.sim = bridgeFrames(r, mark); return r.sim.frames.length / 60; }
    if (r.type === 'float') return 3.4;
    if (r.type === 'gears') return 3.2;
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
    // Pase lo que pase con la animación, el resultado siempre se muestra: si algo
    // falla al dibujar o tarda demasiado, se salta al final en vez de quedarse en "Watch…".
    anim = { t: 0, raf: 0 };
    let dur = 0;
    try { dur = stands ? Math.min(duration(r), 1.6) : duration(r); } catch (e) { console.error('Gravle animation:', e); }
    if (!(dur > 0) || !Number.isFinite(dur)) dur = 0.05;
    const t0 = performance.now();
    let ended = false;
    const end = () => { if (ended) return; ended = true; cancelAnimationFrame(anim.raf); clearTimeout(watchdog); anim.t = dur; try { finishRound(); } catch (e) { console.error('Gravle result:', e); } };
    const watchdog = setTimeout(end, (dur / speed + 4) * 1000);
    const step = (now) => {
      if (ended) return;
      anim.t = reduce ? dur : Math.min(dur, Math.max(0, (now - t0) / 1000 * speed));
      try { draw(); } catch (e) { console.error('Gravle draw:', e); end(); return; }
      if (anim.t < dur) anim.raf = requestAnimationFrame(step); else end();
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
  function scoreNew(r) {
    if (r.type === 'loop') {
      const err = Math.abs(mark - r.answer) / 2, made = mark >= r.answer;
      return { pts: 0, l1: err <= 2 ? 'Perfect height!' : made ? (err <= 8 ? 'Made it, with a little to spare' : 'Made it, but you could start lower') : (err <= 8 ? 'So close: it just fell off' : 'Too low: it fell off'),
        l2: 'Needed at least ' + cm(r.answer) + ' cm · you ' + cm(mark) + ' cm', d: 'Needed ' + cm(r.answer) + ' cm, you said ' + cm(mark) };
    }
    if (r.type === 'laser') {
      let dpx = Math.abs(perimPos(mark) - perimPos(r.end)); dpx = Math.min(dpx, PERIM - dpx); const d = Math.round(dpx / 2);
      return { pts: 0, l1: dpx <= 6 ? 'Bullseye!' : dpx <= 30 ? 'Very close' : dpx <= 80 ? 'Close' : 'Way off', l2: (r.path.length - 2) + ' reflections · you were ' + d + ' cm away along the wall', d: (r.path.length - 2) + ' reflections, ' + d + ' cm away' };
    }
    if (r.type === 'bridge') {
      const ok = mark >= r.lo && mark <= r.hi, off = Math.abs(mark - r.answer) / 2;
      return { pts: 0, l1: ok ? (off <= 2 ? 'Perfect plank!' : 'Made it across') : mark < r.lo ? 'Too short: into the void' : 'Too long: it rolled off the end',
        l2: 'Safe from ' + cm(r.lo) + ' to ' + cm(r.hi) + ' cm · perfect ' + cm(r.answer) + ' · you ' + cm(mark), d: 'Perfect ' + cm(r.answer) + ' cm, you said ' + cm(mark) };
    }
    if (r.type === 'domino') {
      const off = Math.abs(mark - r.answer), all = r.answer === r.dominoes.length - 1;
      return { pts: 0, l1: off === 0 ? (all ? 'They all fall. Well spotted!' : 'Exactly right') : off === 1 ? 'So close: one off' : 'Not quite',
        l2: (all ? 'All ' + r.dominoes.length + ' fell' : 'Last to fall: #' + (r.answer + 1)) + ' · you: #' + (mark + 1), d: all ? 'All fell' : 'Stopped at #' + (r.answer + 1) };
    }
    if (r.type === 'float') {
      const right = r.items.filter((_, i) => mark.includes(i) === r.answer.includes(i)).length;
      const fl = r.answer.map(i => FLOAT_NAME[r.items[i]]).join(', ');
      return { pts: 0, l1: right === r.items.length ? 'All correct!' : right + ' of ' + r.items.length + ' right', l2: 'Floats: ' + fl, d: right + '/' + r.items.length + ' right' };
    }
    if (r.type === 'gears') {
      const wl = r.w[r.parts.length - 1], dir = wl > 0 ? 'clockwise' : 'counter-clockwise', sp = Math.abs(wl);
      const pd = mark < 2 ? 1 : -1, pf = mark % 2 === 0, okd = pd === Math.sign(wl), oks = pf === sp > 1;
      return { pts: 0, l1: okd && oks ? 'Spot on' : okd ? 'Right direction, wrong speed' : oks ? 'Right speed, wrong direction' : 'It went the other way',
        l2: 'It turns ' + dir + ' at ' + sp.toFixed(2) + '× the speed of the first gear', d: dir[0].toUpperCase() + dir.slice(1) + ', ' + sp.toFixed(2) + '×' };
    }
  }
  function finishRound() {
    const r = round(); phase = 'result';
    const s = scoreRound(r) || scoreNew(r); s.pts = serverPts;              // los puntos que valen son los del servidor
    scores.push(s.pts); details.push(s.d);
    try { sessionStorage.setItem(DKEY(attempt.id), JSON.stringify(details)); } catch (e) {}
    $('rPts').textContent = '+' + s.pts; $('rPts').className = 'pts ' + band(s.pts);
    $('rL1').textContent = s.l1; $('rL2').textContent = s.l2;
    $('result').hidden = false; $('prompt').hidden = true; $('chips').hidden = true;
    $('go').disabled = false; $('go').textContent = roundIdx < 4 ? 'Next round' : 'See result';
    renderPips(); try { draw(); } catch (e) { console.error('Gravle draw:', e); }
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
    if (phase === 'playing' && !anim) return;
    ({ drop: drawDrop, race: drawRace, balance: drawBalance, pool: drawPool, tower: drawTower, loop: drawLoop, laser: drawLaser, domino: drawDomino, float: drawFloat, gears: drawGears, bridge: drawBridge })[r.type](r);
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


  /* =================== Juegos nuevos =================== */

  /* ---------- Loop the loop ---------- */
  const LOOPC = { floorY: 470, x0: 34, x1: 150, topY: 92, rb: 9, minH: 24, maxH: 340, g: 980 };
  const cm = (px) => Math.round(px / 2);                 // 2 px = 1 cm
  function loopPath(r) {
    if (r._path) return r._path;
    const { floorY, x0, x1, topY, rb } = LOOPC, R = r.R, cx = r.cx, cy = floorY - R, rho = R - rb;
    const pts = [];
    const push = (x, y, seg, a) => pts.push({ x, y, seg, a });
    // rampa: cuarto de elipse, vertical arriba y horizontal abajo
    const N = 160;
    for (let i = 0; i <= N; i++) {
      const t = i / N, tx = x0 + (x1 - x0) * (1 - Math.cos(t * Math.PI / 2)), ty = topY + (floorY - topY) * Math.sin(t * Math.PI / 2);
      const dx = (x1 - x0) * Math.sin(t * Math.PI / 2), dy = (floorY - topY) * Math.cos(t * Math.PI / 2), L = Math.hypot(dx, dy) || 1;
      push(tx + dy / L * rb, ty - dx / L * rb, 'ramp');
    }
    for (let x = x1 + 2; x < cx; x += 2) push(x, floorY - rb, 'flat');
    for (let i = 0; i <= 240; i++) { const a = i / 240 * Math.PI * 2; push(cx + rho * Math.sin(a), cy + rho * Math.cos(a), 'loop', a); }
    for (let x = cx + 2; x <= 440; x += 2) push(x, floorY - rb, 'exit');
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const h = (p) => (floorY - rb) - p.y;
    let maxH = 0; for (const p of pts) if (p.seg === 'ramp') maxH = Math.max(maxH, h(p));
    LOOPC.maxH = Math.floor(maxH - 6);
    r._path = { pts, cum, cx, cy, rho, h };
    return r._path;
  }
  function prepLoop(r) { loopPath(r); }
  function aimLoop(r, x, y) { mark = Math.max(LOOPC.minH, Math.min(LOOPC.maxH, (LOOPC.floorY - LOOPC.rb) - y)); return true; }
  function rampIndex(P, h0) { let k = 0; for (let i = 0; i < P.pts.length && P.pts[i].seg === 'ramp'; i++) if (P.h(P.pts[i]) >= h0) k = i; return k; }
  function atS(P, s) {
    const c = P.cum; s = Math.max(0, Math.min(c.at(-1), s));
    let lo = 0, hi = c.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] <= s) lo = m; else hi = m; }
    const f = (s - c[lo]) / (c[hi] - c[lo] || 1), a = P.pts[lo], b = P.pts[hi];
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, seg: a.seg, a: a.a, i: lo, dy: (b.y - a.y) / (c[hi] - c[lo] || 1), dx: (b.x - a.x) / (c[hi] - c[lo] || 1) };
  }
  // Simula la canica desde la altura elegida (misma física que la respuesta del servidor).
  function loopFrames(r, h0) {
    const P = loopPath(r), g = LOOPC.g, out = [], dt = 1 / 240;
    let s = P.cum[Math.min(P.pts.length - 1, rampIndex(P, h0) + 1)], mode = 'track', v = 0, carpetDist = 0, t = 0, failT = null, fx = 0, fy = 0, fvx = 0, fvy = 0, spin = 0, lastX = null;
    const inCarpet = (p) => r.carpet && p.seg === 'flat' && p.x >= r.carpet.x0 && p.x <= r.carpet.x1;
    const inCarpet2 = (p) => r.carpet2 && p.seg === 'exit' && p.x >= r.carpet2.x0 && p.x <= r.carpet2.x1;
    let carpet2Dist = 0;
    for (let step = 0; step < 240 * 9; step++, t += dt) {
      let pos;
      if (mode === 'track') {
        const p = atS(P, s);
        const K = g * (h0 - P.h(p)) - g * (r.carpet ? r.carpet.mu : 0) * carpetDist - g * (r.carpet2 ? r.carpet2.mu : 0) * carpet2Dist;
        if (K <= 0) { mode = 'damped'; v = 0; failT = t; }
        else {
          v = Math.sqrt(Math.max(0, K) / 0.7);
          if (p.seg === 'loop' && v * v / P.rho + g * Math.cos(p.a) < -1e-6) {   // se despega del rizo
            mode = 'fly'; failT = t; fx = p.x; fy = p.y; fvx = p.dx * v; fvy = p.dy * v;
          } else { const ds = v * dt; s += ds; if (inCarpet(p)) carpetDist += ds; if (inCarpet2(p)) carpet2Dist += ds; }
        }
        pos = atS(P, s);
        if (pos.x > 430) break;
      }
      if (mode === 'fly') {
        fvy += g * dt; fx += fvx * dt; fy += fvy * dt;
        const d = Math.hypot(fx - P.cx, fy - P.cy);
        if (d >= P.rho || fy >= LOOPC.floorY - LOOPC.rb) {
          // vuelve a tocar el rizo: sigue rodando por él, ya sin fuerza para subir
          let best = 0, bd = Infinity;
          P.pts.forEach((q, i) => { if (q.seg !== 'loop') return; const e = Math.hypot(q.x - fx, q.y - fy); if (e < bd) { bd = e; best = i; } });
          s = P.cum[best]; v = 0; mode = 'damped';
        }
        pos = { x: fx, y: fy };
      }
      if (mode === 'damped') {
        const p = atS(P, s);
        const acc = (5 / 7) * g * p.dy - 2.2 * v - (r.carpet && inCarpet(p) ? Math.sign(v) * g * r.carpet.mu * 5 / 7 : 0);
        v += acc * dt; s += v * dt; s = Math.max(0, Math.min(P.cum.at(-1), s));
        pos = atS(P, s);
        if (t - failT > 3) break;
      }
      if (lastX != null) spin += Math.hypot(pos.x - lastX[0], pos.y - lastX[1]) / LOOPC.rb * (mode === 'damped' ? Math.sign(v) || 1 : 1);
      lastX = [pos.x, pos.y];
      if (step % 4 === 0) out.push([pos.x, pos.y, spin]);
    }
    for (let k = 0; k < 18; k++) out.push(out.at(-1));
    return out;
  }
  function drawLoop(r) {
    const P = loopPath(r), { floorY, rb } = LOOPC;
    ctx.fillStyle = C.paper; ctx.fillRect(0, floorY, W, H - floorY);
    // regla de alturas
    const rx = 14;
    ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx, floorY - rb); ctx.lineTo(rx, LOOPC.topY - 10); ctx.stroke();
    ctx.font = mono(9, 500); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'left';
    for (let c = 0; c * 2 <= LOOPC.maxH + 4; c += 10) {
      const y = floorY - rb - c * 2, big = c % 50 === 0;
      ctx.beginPath(); ctx.moveTo(rx, y); ctx.lineTo(rx + (big ? 9 : 5), y); ctx.stroke();
      if (big && c) ctx.fillText(String(c), rx + 10, y + 3);
    }
    ctx.save(); ctx.translate(rx - 4, 300); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText('HEIGHT (cm)', 0, 0); ctx.restore();
    // pista
    const track = (pred) => { ctx.beginPath(); let on = false; for (const p of P.pts) { if (!pred(p)) { on = false; continue; }
      const k = p.seg === 'loop' ? 1 + rb / P.rho : 1;
      const x = p.seg === 'loop' ? P.cx + (p.x - P.cx) * k : p.seg === 'ramp' ? p.x - (p.x - p.x) : p.x, y = p.seg === 'loop' ? P.cy + (p.y - P.cy) * k : p.y + rb;
      on ? ctx.lineTo(x, y) : ctx.moveTo(x, y); on = true; } ctx.stroke(); };
    // la rampa: la pista real está desplazada rb hacia fuera de la trayectoria del centro
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) { const t = i / 80, x = LOOPC.x0 + (LOOPC.x1 - LOOPC.x0) * (1 - Math.cos(t * Math.PI / 2)), y = LOOPC.topY + (floorY - LOOPC.topY) * Math.sin(t * Math.PI / 2); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.lineTo(W + 10, floorY); ctx.stroke();
    ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(P.cx, P.cy, r.R, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.plate; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.5; ctx.beginPath(); ctx.arc(P.cx, P.cy, r.R, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
    void track;
    // soporte de la rampa
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.globalAlpha = 0.35;
    for (const xx of [LOOPC.x0 + 6, LOOPC.x0 + 40]) { ctx.beginPath(); ctx.moveTo(xx, floorY); ctx.lineTo(xx, LOOPC.topY + 40); ctx.stroke(); }
    ctx.globalAlpha = 1;
    if (r.carpet) {
      const { x0, x1 } = r.carpet;
      ctx.fillStyle = C.violeta; roundRect(x0, floorY - 4, x1 - x0, 8, 2); ctx.fill();
      ctx.fillStyle = C.plate; ctx.globalAlpha = 0.6; for (let x = x0 + 3; x < x1 - 2; x += 5) ctx.fillRect(x, floorY - 2, 2, 4); ctx.globalAlpha = 1;
      label((x0 + x1) / 2, floorY + 26, 'carpet', C.violeta);
    }
    if (r.carpet2) {
      const { x0, x1 } = r.carpet2;
      ctx.fillStyle = C.violeta; roundRect(x0, floorY - 4, x1 - x0, 8, 2); ctx.fill();
      ctx.fillStyle = C.plate; ctx.globalAlpha = 0.6; for (let x = x0 + 3; x < x1 - 2; x += 5) ctx.fillRect(x, floorY - 2, 2, 4); ctx.globalAlpha = 1;
      label((x0 + x1) / 2, floorY + 26, 'carpet', C.violeta);
    }
    label(P.cx, P.cy + 4, 'loop ' + cm(r.R * 2) + ' cm', C['ink-2']);
    // líneas de altura
    const hy = (h) => floorY - rb - h;
    if (phase === 'result') {
      ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = C.coral; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx, hy(r.answer)); ctx.lineTo(LOOPC.x1 + 40, hy(r.answer)); ctx.stroke(); ctx.restore();
      label(LOOPC.x1 + 70, hy(r.answer) + 4, 'needed ' + cm(r.answer) + ' cm', C.coral);
    }
    if (mark != null) {
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = C.azul; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(rx, hy(mark)); ctx.lineTo(LOOPC.x1, hy(mark)); ctx.stroke(); ctx.restore();
      if (phase !== 'result' || Math.abs(mark - r.answer) > 14) label(LOOPC.x1 + 56, hy(mark) + 4, 'you ' + cm(mark) + ' cm', C.azul);
    }
    // canica
    if (phase === 'aim') {
      const k = rampIndex(P, mark ?? LOOPC.maxH * 0.6), p = P.pts[k];
      ctx.globalAlpha = mark == null ? 0.55 : 1; drawSkin(ctx, p.x, p.y, rb, skin, 0); ctx.globalAlpha = 1;
      if (mark == null) { ctx.font = mono(11); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'left'; ctx.fillText('drag the marble', p.x + 16, p.y + 4); }
    } else {
      const F = r.sim || (r.sim = loopFrames(r, mark));
      const fi = phase === 'result' || !anim ? F.length - 1 : Math.max(0, Math.min(F.length - 1, Math.floor(anim.t * 60) || 0));
      trail(F, fi, C.coral);
      const f = F[fi]; drawSkin(ctx, Math.min(f[0], W - rb), f[1], rb, skin, f[2]);
    }
  }

  /* ---------- Laser ---------- */
  const LROOM = { x0: 24, y0: 76, x1: 376, y1: 536 }, LASER_SPEED = 520;
  function snapWall(x, y) {
    const { x0, y0, x1, y1 } = LROOM;
    const d = [Math.abs(y - y0), Math.abs(x - x1), Math.abs(y - y1), Math.abs(x - x0)], s = d.indexOf(Math.min(...d));
    const cx = Math.max(x0 + 2, Math.min(x1 - 2, x)), cy = Math.max(y0 + 2, Math.min(y1 - 2, y));
    return s === 0 ? [cx, y0] : s === 1 ? [x1, cy] : s === 2 ? [cx, y1] : [x0, cy];
  }
  function perimPos([x, y]) {
    const { x0, y0, x1, y1 } = LROOM, w = x1 - x0, h = y1 - y0;
    const d = [Math.abs(y - y0), Math.abs(x - x1), Math.abs(y - y1), Math.abs(x - x0)], s = d.indexOf(Math.min(...d));
    return s === 0 ? x - x0 : s === 1 ? w + (y - y0) : s === 2 ? w + h + (x1 - x) : 2 * w + h + (y1 - y);
  }
  const PERIM = 2 * (LROOM.x1 - LROOM.x0) + 2 * (LROOM.y1 - LROOM.y0);
  const ROOMBG = '#0e1620';
  function beam(pts, upto) {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const path = () => { ctx.beginPath(); let left = upto, tip = null; ctx.moveTo(...pts[0]);
      for (let k = 1; k < pts.length; k++) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k], L = Math.hypot(bx - ax, by - ay);
        if (left >= L) { ctx.lineTo(bx, by); left -= L; tip = [bx, by]; } else { tip = [ax + (bx - ax) * left / L, ay + (by - ay) * left / L]; ctx.lineTo(...tip); break; } }
      return tip; };
    ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 14; ctx.strokeStyle = 'rgba(255,70,55,.55)'; ctx.lineWidth = 7; path(); ctx.stroke();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ff6a55'; ctx.lineWidth = 3; path(); ctx.stroke();
    ctx.strokeStyle = '#fff2ee'; ctx.lineWidth = 1.2; const tip = path(); ctx.stroke();
    ctx.restore();
    return tip;
  }
  function drawLaser(r) {
    const { x0, y0, x1, y1 } = LROOM;
    ctx.fillStyle = ROOMBG; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = 1;
    for (let x = x0 + 20; x < x1; x += 20) { ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke(); }
    for (let y = y0 + 20; y < y1; y += 20) { ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 6; ctx.strokeRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
    ctx.font = mono(10); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'center'; ctx.fillText('mirrors reflect on both sides', W / 2, y1 + 28);
    for (const m of r.mirrors) {
      if (m.kind === 'block') {
        ctx.save(); ctx.translate((m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2); ctx.rotate(Math.atan2(m.y2 - m.y1, m.x2 - m.x1));
        const L = Math.hypot(m.x2 - m.x1, m.y2 - m.y1); ctx.fillStyle = '#2b3440'; ctx.strokeStyle = '#4b5866'; ctx.lineWidth = 1.5;
        roundRect(-L / 2, -6, L, 12, 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,.12)'; for (let x = -L / 2 + 4; x < L / 2; x += 6) { ctx.beginPath(); ctx.moveTo(x, -6); ctx.lineTo(x + 6, 6); ctx.stroke(); }
        ctx.restore(); continue;
      }
      ctx.lineCap = 'round';
      ctx.strokeStyle = '#7d8b99'; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke();
      ctx.strokeStyle = '#e8f1f8'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(m.x1, m.y1); ctx.lineTo(m.x2, m.y2); ctx.stroke();
    }
    // emisor
    const [sx, sy] = r.src;
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(r.ang);
    ctx.fillStyle = '#d7dde3'; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; roundRect(-14, -9, 24, 18, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff3b30'; ctx.beginPath(); ctx.arc(10, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    if (phase === 'aim') {
      ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(255,90,74,.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(sx + Math.cos(r.ang) * 12, sy + Math.sin(r.ang) * 12); ctx.lineTo(sx + Math.cos(r.ang) * 44, sy + Math.sin(r.ang) * 44); ctx.stroke(); ctx.restore();
    } else {
      const tip = beam(r.path, phase === 'result' ? Infinity : anim.t * LASER_SPEED);
      if (tip && (phase === 'result' || anim.t * LASER_SPEED >= r.len)) {
        const [ex, ey] = r.end;
        ctx.save(); ctx.shadowColor = '#ff3b30'; ctx.shadowBlur = 18; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
        ctx.strokeStyle = '#ff6a55'; ctx.lineWidth = 2; for (const rr of [10, 16]) { ctx.globalAlpha = rr === 10 ? 0.7 : 0.35; ctx.beginPath(); ctx.arc(ex, ey, rr, 0, Math.PI * 2); ctx.stroke(); } ctx.globalAlpha = 1;
      }
    }
    if (mark) {
      const [mx, my] = mark;
      ctx.strokeStyle = C.azul; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(mx, my, 9, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = C.azul; ctx.beginPath(); ctx.arc(mx, my, 3, 0, Math.PI * 2); ctx.fill();
      const ly = my < y0 + 5 ? my - 16 : my > y1 - 5 ? my + 30 : my + 4;
      if (phase !== 'result') label(mx < x0 + 5 ? mx + 34 : mx > x1 - 5 ? mx - 34 : mx, ly, 'you', C.azul);
    }
    if (phase === 'result') {
      const [ex, ey] = r.end, ly = ey < y0 + 5 ? ey - 16 : ey > y1 - 5 ? ey + 30 : ey - 18;
      label(ex < x0 + 5 ? ex + 50 : ex > x1 - 5 ? ex - 50 : ex, ly, 'beam ends here', '#e2412f');
    }
  }

  /* ---------- Dominoes ---------- */
  const DFLOOR = 470, DZ = 1.35;                         // la escena del dominó se ve ampliada
  function pickDomino(r, x, y) {
    x = x / DZ; y = DFLOOR + (y - DFLOOR) / DZ;
    let best = -1, bd = 22;
    r.dominoes.forEach((d, i) => { const dd = Math.abs(x - d.x); if (dd < bd && y > d.base - d.h - 60 && y < DFLOOR + 40) { bd = dd; best = i; } });
    return best;
  }
  function drawDomino(r) {
    ctx.fillStyle = C.paper; ctx.fillRect(0, DFLOOR, W, H - DFLOOR);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, DFLOOR); ctx.lineTo(W, DFLOOR); ctx.stroke();
    ctx.save(); ctx.translate(0, DFLOOR); ctx.scale(DZ, DZ); ctx.translate(0, -DFLOOR);
    if (r.platform) {
      const ds = r.dominoes.filter(d => d.base < DFLOOR), a = ds[0], b = ds.at(-1);
      const x0 = a.x - a.w / 2 - 13, x1 = b.x + b.w / 2 + 13, top = a.base;
      ctx.fillStyle = C.wood; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillRect(x0, top, x1 - x0, DFLOOR - top); ctx.strokeRect(x0, top, x1 - x0, DFLOOR - top);
    }
    const fr = r.frames && phase !== 'aim' ? r.frames[phase === 'result' ? r.frames.length - 1 : Math.min(r.frames.length - 1, Math.floor(anim.t * 60))] : null;
    r.dominoes.forEach((d, i) => {
      const th = fr ? fr[i] : 0;
      ctx.save(); ctx.translate(d.x + d.w / 2, d.base); ctx.rotate(th);
      const heavy = d.d > 1;
      ctx.fillStyle = heavy ? C['ink-2'] : C.plate; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8;
      roundRect(-d.w, -d.h, d.w, d.h, Math.min(3, d.w / 3)); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = heavy ? C.plate : C.ink; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-d.w + 2, -d.h / 2); ctx.lineTo(-2, -d.h / 2); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.fillStyle = heavy ? C.plate : C.ink;
      for (const f of [0.22, 0.75]) { ctx.beginPath(); ctx.arc(-d.w / 2, -d.h * f, Math.max(1, d.w * 0.14), 0, Math.PI * 2); ctx.fill(); }
      if (mark === i && phase !== 'playing') { ctx.strokeStyle = C.azul; ctx.lineWidth = 3; roundRect(-d.w - 4, -d.h - 4, d.w + 8, d.h + 8, 4); ctx.stroke(); }
      if (phase === 'result' && r.answer === i) { ctx.strokeStyle = C.coral; ctx.lineWidth = 3; roundRect(-d.w - 7, -d.h - 7, d.w + 14, d.h + 14, 5); ctx.stroke(); }
      ctx.restore();
    });
    if (phase === 'aim') { const d = r.dominoes[0]; arrow(d.x - 20, d.base - d.h + 6, d.x - d.w / 2 - 3, d.base - d.h + 6, C.coral, 2.2); }
    ctx.restore();
    r.dominoes.forEach((d, i) => {
      if (phase !== 'aim' && phase !== 'result') return;
      ctx.font = mono(10, 600); ctx.textAlign = 'center'; ctx.fillStyle = mark === i ? C.azul : phase === 'result' && r.answer === i ? C.coral : C['ink-2'];
      ctx.fillText(String(i + 1), d.x * DZ, DFLOOR + 18);
    });
    if (phase === 'result') {
      const d = r.dominoes[r.answer];
      label(Math.max(60, Math.min(W - 60, d.x * DZ)), DFLOOR - (DFLOOR - d.base + d.h) * DZ - 26, r.answer === r.dominoes.length - 1 ? 'they all fall!' : 'last to fall: #' + (r.answer + 1), C.coral);
    }
  }

  /* ---------- Float or sink? ---------- */
  const FLOAT_NAME = { apple: 'Apple', egg: 'Egg', ice: 'Ice cube', golf: 'Golf ball', pingpong: 'Ping-pong ball', cork: 'Cork', lemon: 'Lemon', lime: 'Lime',
    potato: 'Potato', cola: 'Cola can', diet: 'Diet cola can', candle: 'Candle', pine: 'Pine block', ebony: 'Ebony block', coin: 'Coin', grape: 'Grape',
    orange: 'Orange', peeled: 'Peeled orange', eraser: 'Eraser', cap: 'Bottle cap' };
  const FL = { shelf: 200, surface: 330, bottom: 532, x0: 22, x1: 378 };
  const fx = (r, i) => FL.x0 + 30 + i * ((FL.x1 - FL.x0 - 60) / (r.items.length - 1));
  function pickFloat(r, x, y) {
    if (y < FL.shelf - 50 || y > FL.shelf + 50) return -1;
    let best = -1, bd = 30; r.items.forEach((_, i) => { const d = Math.abs(x - fx(r, i)); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function toggleFloat(k) {
    if (phase !== 'aim') return;
    mark = mark.includes(k) ? mark.filter(i => i !== k) : [...mark, k].sort((a, b) => a - b);
    refreshFloatChips(); draw();
  }
  function buildFloatChips() {
    const r = round(), box = $('chips'); box.hidden = false; box.innerHTML = '';
    r.items.forEach((k, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.id = 'chipF' + i; b.setAttribute('aria-pressed', 'false');
      b.innerHTML = '<span class="dot" style="background:var(--azul)"></span>' + FLOAT_NAME[k];
      b.addEventListener('click', () => toggleFloat(i)); box.appendChild(b);
    });
    refreshFloatChips();
  }
  function refreshFloatChips() { round().items.forEach((_, i) => { const b = $('chipF' + i); if (!b) return; const on = mark.includes(i); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.querySelector('.dot').textContent = on ? '↑' : ''; }); ready(); }
  function drawItem(kind, x, y, s, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang || 0);
    const ink = C.ink; ctx.lineWidth = 1.6; ctx.strokeStyle = ink;
    const circ = (rr, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.arc(0, 0, rr, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
    const ell = (rx, ry, fill) => { ctx.fillStyle = fill; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); };
    const box = (w, h, fill, rr = 3) => { ctx.fillStyle = fill; roundRect(-w / 2, -h / 2, w, h, rr); ctx.fill(); ctx.stroke(); };
    const shine = (rx, ry, rr) => { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill(); };
    const h = s / 2;
    switch (kind) {
      case 'apple': circ(h * 0.9, '#d93a32'); ctx.strokeStyle = '#6b3b1d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, -h * 0.8); ctx.lineTo(2, -h * 1.15); ctx.stroke(); ctx.fillStyle = '#4caf50'; ctx.beginPath(); ctx.ellipse(6, -h * 1.0, 5, 2.5, -0.5, 0, Math.PI * 2); ctx.fill(); shine(-h * 0.35, -h * 0.3, h * 0.2); break;
      case 'egg': ell(h * 0.7, h * 0.92, '#f6ead2'); shine(-h * 0.25, -h * 0.4, h * 0.16); break;
      case 'ice': ctx.globalAlpha = 0.85; box(s * 0.85, s * 0.85, '#bfe6f5', 5); ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-h * 0.5, -h * 0.2); ctx.lineTo(-h * 0.2, -h * 0.5); ctx.stroke(); break;
      case 'golf': circ(h * 0.75, '#fbfbf7'); ctx.fillStyle = 'rgba(0,0,0,.18)'; for (const [a, b] of [[-4, -3], [3, -5], [5, 2], [-2, 4], [-6, 2], [1, -1]]) { ctx.beginPath(); ctx.arc(a * h / 12, b * h / 12, 1.3, 0, Math.PI * 2); ctx.fill(); } break;
      case 'pingpong': circ(h * 0.62, '#ff9f43'); shine(-h * 0.2, -h * 0.25, h * 0.15); break;
      case 'cork': ctx.fillStyle = '#c99a63'; ctx.beginPath(); ctx.moveTo(-h * 0.45, -h * 0.7); ctx.lineTo(h * 0.45, -h * 0.7); ctx.lineTo(h * 0.35, h * 0.7); ctx.lineTo(-h * 0.35, h * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(80,40,0,.35)'; for (const [a, b] of [[-3, -4], [2, 0], [-1, 5], [3, -6]]) ctx.fillRect(a * h / 10, b * h / 10, 1.8, 1.8); break;
      case 'lemon': ctx.fillStyle = '#f5d33b'; ctx.beginPath(); ctx.ellipse(0, 0, h * 0.95, h * 0.68, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(h * 0.9, 0); ctx.lineTo(h * 1.12, 0); ctx.stroke(); shine(-h * 0.3, -h * 0.25, h * 0.15); break;
      case 'lime': ell(h * 0.78, h * 0.66, '#6fba3a'); shine(-h * 0.25, -h * 0.25, h * 0.14); break;
      case 'potato': ctx.fillStyle = '#b58a54'; ctx.beginPath(); ctx.ellipse(0, 0, h * 0.95, h * 0.62, 0.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.fillStyle = 'rgba(70,40,10,.45)'; for (const [a, b] of [[-4, -1], [3, 2], [5, -3], [-1, 3]]) { ctx.beginPath(); ctx.arc(a * h / 10, b * h / 10, 1.2, 0, Math.PI * 2); ctx.fill(); } break;
      case 'cola': case 'diet': {
        const fill = kind === 'cola' ? '#d62828' : '#c9ced4', band = kind === 'cola' ? '#ffffff' : '#d62828';
        box(s * 0.62, s * 1.0, fill, 4); ctx.fillStyle = band; ctx.beginPath(); ctx.moveTo(-s * 0.31, 2); ctx.quadraticCurveTo(0, -6, s * 0.31, 1); ctx.lineTo(s * 0.31, 5); ctx.quadraticCurveTo(0, -2, -s * 0.31, 6); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#9aa3ab'; ctx.fillRect(-s * 0.24, -s * 0.5 - 2, s * 0.48, 3); break; }
      case 'candle': box(s * 0.42, s * 0.95, '#fff5d6', 2); ctx.strokeStyle = ink; ctx.beginPath(); ctx.moveTo(0, -h * 0.95); ctx.lineTo(0, -h * 1.2); ctx.stroke(); break;
      case 'pine': case 'ebony': box(s * 0.95, s * 0.6, kind === 'pine' ? '#e7c48a' : '#3a2a20', 2); ctx.strokeStyle = kind === 'pine' ? 'rgba(120,70,20,.4)' : 'rgba(255,255,255,.15)'; ctx.lineWidth = 1; for (const f of [-0.12, 0.08]) { ctx.beginPath(); ctx.moveTo(-h * 0.8, f * s); ctx.quadraticCurveTo(0, f * s - 3, h * 0.8, f * s + 1); ctx.stroke(); } break;
      case 'coin': ell(h * 0.62, h * 0.62, '#d9a23b'); ctx.strokeStyle = '#8a5d10'; ctx.beginPath(); ctx.arc(0, 0, h * 0.42, 0, Math.PI * 2); ctx.stroke(); break;
      case 'grape': circ(h * 0.45, '#7b3fbf'); shine(-h * 0.14, -h * 0.15, h * 0.1); break;
      case 'orange': circ(h * 0.85, '#f28c1e'); ctx.fillStyle = 'rgba(255,255,255,.25)'; for (const [a, b] of [[-3, -2], [2, -4], [4, 3], [-2, 4]]) ctx.fillRect(a * h / 10, b * h / 10, 1.5, 1.5); break;
      case 'peeled': circ(h * 0.75, '#ffb257'); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 1; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(k * 1.047) * h * 0.72, Math.sin(k * 1.047) * h * 0.72); ctx.stroke(); } break;
      case 'eraser': box(s * 0.9, s * 0.45, '#f4a6b8', 3); ctx.fillStyle = '#3d6fd6'; ctx.fillRect(0, -s * 0.225 + 1, s * 0.44, s * 0.45 - 2); break;
      case 'cap': box(s * 0.6, s * 0.36, '#2c7be5', 2); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * s * 0.1, -s * 0.16); ctx.lineTo(k * s * 0.1, s * 0.16); ctx.stroke(); } break;
    }
    ctx.restore();
  }
  function floatPos(r, i, t) {
    const x = fx(r, i), s = 40, y0 = FL.shelf, d = r.dens[i], wd = r.water, delay = i * 0.12, gg = 1400;
    const tt = Math.max(0, t - delay), fallT = Math.sqrt(2 * (FL.surface - y0) / gg);
    if (tt <= fallT) return [x, y0 + 0.5 * gg * tt * tt, 0, false];
    const u = tt - fallT;
    if (d < wd) {
      const yEq = FL.surface + s * (d / wd - 0.5) * 0.9;
      const A = FL.surface - yEq + 26;
      return [x, yEq + A * Math.exp(-3.2 * u) * Math.cos(7 * u), Math.sin(u * 3) * 0.08 * Math.exp(-u), true];
    }
    const vs = 70 + 260 * Math.min(1, (d - wd) / 0.6), yEnd = FL.bottom - s * 0.38;
    const y = FL.surface + Math.min(yEnd - FL.surface, vs * u * (1 - Math.exp(-u * 4)) + 18 * (1 - Math.exp(-u * 6)));
    return [x, y, Math.min(0.5, u * 0.3) * (i % 2 ? 1 : -1), true];
  }
  function drawFloat(r) {
    // estante
    ctx.fillStyle = C.wood; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillRect(FL.x0 + 8, FL.shelf + 24, FL.x1 - FL.x0 - 16, 8); ctx.strokeRect(FL.x0 + 8, FL.shelf + 24, FL.x1 - FL.x0 - 16, 8);
    // tanque
    const t = phase === 'result' ? 99 : anim ? anim.t : 0;
    ctx.fillStyle = r.salty ? 'rgba(80,190,170,.28)' : 'rgba(60,140,230,.22)'; ctx.fillRect(FL.x0, FL.surface, FL.x1 - FL.x0, FL.bottom - FL.surface);
    ctx.strokeStyle = r.salty ? 'rgba(40,150,130,.7)' : 'rgba(40,110,210,.7)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let x = FL.x0; x <= FL.x1; x += 4) { const y = FL.surface + Math.sin(x / 14 + t * 4) * 1.6; x === FL.x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(FL.x0, FL.surface - 50); ctx.lineTo(FL.x0, FL.bottom); ctx.lineTo(FL.x1, FL.bottom); ctx.lineTo(FL.x1, FL.surface - 50); ctx.stroke();
    ctx.font = mono(10); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'center';
    ctx.fillText(r.salty ? 'VERY SALTY WATER (like the Dead Sea)' : 'FRESH WATER', W / 2, FL.bottom + 22);
    r.items.forEach((k, i) => {
      const [x, y, a, wet] = phase === 'aim' ? [fx(r, i), FL.shelf, 0, false] : floatPos(r, i, t);
      if (wet && anim && phase === 'playing') {                     // salpicadura al entrar
        const te = t - i * 0.12 - Math.sqrt(2 * (FL.surface - FL.shelf) / 1400);
        if (te > 0 && te < 0.6) { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1.5; ctx.globalAlpha = 1 - te / 0.6; ctx.beginPath(); ctx.ellipse(x, FL.surface, 12 + te * 50, 3 + te * 6, 0, 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1; }
      }
      drawItem(k, x, y, 40, a);
      const on = mark && mark.includes(i);
      if (phase === 'aim') {
        if (on) { ctx.strokeStyle = C.azul; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI * 2); ctx.stroke(); label(x, y - 32, 'floats', C.azul); }
        ctx.font = mono(9, 600); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'center';
        const words = FLOAT_NAME[k].split(' '), l1 = words.length > 1 ? words.slice(0, -1).join(' ') : words[0], l2 = words.length > 1 ? words.at(-1) : '';
        ctx.fillText(l1, x, FL.shelf + 46); if (l2) ctx.fillText(l2, x, FL.shelf + 57);
      }
      if (phase === 'result') {
        const ok = on === r.answer.includes(i);
        ctx.font = mono(9, 600); ctx.textAlign = 'center'; ctx.fillStyle = C.ink;
        const ly = r.answer.includes(i) ? FL.surface - 30 : FL.bottom - 46;
        ctx.fillStyle = ok ? C.good : C.bad; ctx.fillText((ok ? '✓ ' : '✗ ') + String(r.dens[i]).replace(/^0/, '0'), x, ly);
      }
    });
    if (phase === 'result') { ctx.font = mono(9); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'center'; ctx.fillText('density in g/cm³ · water ' + r.water.toFixed(2), W / 2, FL.bottom + 36); }
  }

  /* ---------- Gears ---------- */
  const GEAR_LABEL = ['↻ Clockwise · faster', '↻ Clockwise · slower', '↺ Counter-clockwise · faster', '↺ Counter-clockwise · slower'];
  function buildGearChips() {
    const box = $('chips'); box.hidden = false; box.innerHTML = '';
    GEAR_LABEL.forEach((t, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.id = 'chipG' + i; b.setAttribute('aria-pressed', 'false');
      b.textContent = t; b.addEventListener('click', () => { if (phase !== 'aim') return; mark = i; GEAR_LABEL.forEach((_, j) => $('chipG' + j).setAttribute('aria-pressed', j === i ? 'true' : 'false')); ready(); draw(); });
      box.appendChild(b);
    });
  }
  function gearPhases(r) {
    if (r._ph) return r._ph;
    const ph = r.parts.map(() => null); ph[0] = 0.1;
    for (let it = 0; it < r.parts.length; it++) for (const l of r.links) for (const [i, j] of [[l.a, l.b], [l.b, l.a]]) {
      if (ph[i] == null || ph[j] != null) continue;
      if (l.kind === 'mesh') {
        const A = r.parts[i], B = r.parts[j], al = Math.atan2(B.y - A.y, B.x - A.x);
        ph[j] = (al + Math.PI) - Math.PI / B.t + (al - ph[i]) * A.t / B.t;
      } else ph[j] = ph[i] * 0.37 + j;
    }
    return (r._ph = ph);
  }
  function gearShape(p, ang, fill) {
    ctx.save(); ctx.translate(p.x, p.y);
    if (p.kind === 'pulley') {
      ctx.fillStyle = C['ink-2']; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.plate; ctx.beginPath(); ctx.arc(0, 0, p.r * 0.72, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.rotate(ang); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(k * 2.094) * p.r * 0.7, Math.sin(k * 2.094) * p.r * 0.7); ctx.stroke(); }
    } else {
      const n = p.t, pitch = Math.PI * 2 / n, ro = p.r + 2.6, ri = p.r - 2.8;
      ctx.rotate(ang); ctx.fillStyle = fill; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let k = 0; k < n; k++) { const a0 = k * pitch;
        for (const [rr, da] of [[ri, -0.32], [ro, -0.17], [ro, 0.17], [ri, 0.32]]) { const a = a0 + da * pitch; (k || da > -0.3) ? ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.12)'; if (p.r > 22) for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.arc(Math.cos(k * Math.PI / 2 + 0.785) * p.r * 0.5, Math.sin(k * Math.PI / 2 + 0.785) * p.r * 0.5, p.r * 0.16, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  function belt(A, B, crossed, offset) {
    const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy), th = Math.atan2(dy, dx);
    const be = Math.acos(Math.max(-1, Math.min(1, crossed ? (A.r + B.r) / d : (A.r - B.r) / d)));
    ctx.save(); ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.85; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.setLineDash([10, 5]); ctx.lineDashOffset = -offset;
    for (const sg of [1, -1]) {
      const a = th + sg * be, pa = [A.x + A.r * Math.cos(a), A.y + A.r * Math.sin(a)];
      const b = crossed ? a + Math.PI : a, pb = [B.x + B.r * Math.cos(b), B.y + B.r * Math.sin(b)];
      ctx.beginPath(); ctx.moveTo(...pa); ctx.lineTo(...pb); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineWidth = 4; for (const P of [A, B]) { ctx.beginPath(); ctx.arc(P.x, P.y, P.r, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore();
  }
  function drawGears(r) {
    const ph = gearPhases(r), t = phase === 'result' ? 3.2 : anim ? anim.t : 0;
    const w = r.w || r.parts.map(() => 0), om = Math.PI;      // el primero: media vuelta por segundo
    const angOf = (i) => ph[i] + (phase === 'aim' ? 0 : w[i] * om * t);
    const last = r.parts.length - 1;
    // centrar y ampliar el mecanismo para que llene la escena
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    r.parts.forEach(p => { bx0 = Math.min(bx0, p.x - p.r - 14); bx1 = Math.max(bx1, p.x + p.r + 14); by0 = Math.min(by0, p.y - p.r - 44); by1 = Math.max(by1, p.y + p.r + 40); });
    const Z = Math.min(1.45, 380 / (bx1 - bx0), 520 / (by1 - by0));
    const mx = (bx0 + bx1) / 2, my = (by0 + by1) / 2, scr = (x, y) => [W / 2 + (x - mx) * Z, H / 2 + 6 + (y - my) * Z];
    ctx.save(); ctx.translate(W / 2, H / 2 + 6); ctx.scale(Z, Z); ctx.translate(-mx, -my);
    const order = r.parts.map((p, i) => i).sort((a, b) => (r.parts[a].front ? 1 : 0) - (r.parts[b].front ? 1 : 0) || r.parts[b].r - r.parts[a].r);
    const fillOf = (i) => i === 0 ? C.azul : i === last ? C.coral : r.parts[i].front ? C.violeta : C.mostaza;
    // primero los de atrás, luego las correas, luego los de delante
    order.filter(i => !r.parts[i].front).forEach(i => gearShape(r.parts[i], angOf(i), fillOf(i)));
    r.links.filter(l => l.kind === 'belt').forEach(l => belt(r.parts[l.a], r.parts[l.b], l.crossed, angOf(l.a) * r.parts[l.a].r));
    r.links.filter(l => l.kind === 'belt').forEach(l => { gearShape(r.parts[l.a], angOf(l.a)); gearShape(r.parts[l.b], angOf(l.b)); });
    order.filter(i => r.parts[i].front).forEach(i => gearShape(r.parts[i], angOf(i), fillOf(i)));
    // flecha del primero
    const p0 = r.parts[0];
    ctx.strokeStyle = C.azul; ctx.lineWidth = 3; ctx.lineCap = 'round'; const R0 = p0.r + 12;
    ctx.beginPath(); ctx.arc(p0.x, p0.y, R0, -2.4, -0.9); ctx.stroke();
    const ea = -0.9; ctx.fillStyle = C.azul; ctx.beginPath(); ctx.moveTo(p0.x + Math.cos(ea) * R0 + 6, p0.y + Math.sin(ea) * R0 + 3); ctx.lineTo(p0.x + Math.cos(ea) * R0 - 5, p0.y + Math.sin(ea) * R0 - 6); ctx.lineTo(p0.x + Math.cos(ea) * R0 - 4, p0.y + Math.sin(ea) * R0 + 7); ctx.closePath(); ctx.fill();
    const startAt = [p0.x, p0.y - R0 - 12];
    // bandera del último
    const pl = r.parts[last];
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(pl.x, pl.y); ctx.lineTo(pl.x, pl.y - pl.r - 26); ctx.stroke();
    ctx.fillStyle = C.coral; ctx.beginPath(); ctx.moveTo(pl.x, pl.y - pl.r - 26); ctx.lineTo(pl.x + 20, pl.y - pl.r - 20); ctx.lineTo(pl.x, pl.y - pl.r - 14); ctx.closePath(); ctx.fill();
    // marca giratoria en el último para ver el sentido
    ctx.save(); ctx.translate(pl.x, pl.y); ctx.rotate(angOf(last)); ctx.fillStyle = '#fff'; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pl.r * 0.55, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.restore();
    // dientes de cada engranaje
    ctx.font = mono(9, 600); ctx.textAlign = 'center';
    r.parts.forEach((p, i) => { if (p.kind !== 'gear' || i === 0) return; const yy = p.front ? p.y + 4 : p.y + p.r * 0.5 + 4; ctx.fillStyle = p.front ? '#fff' : C.ink; if (p.r > 20 || p.front) ctx.fillText(String(p.t), p.x, yy); });
    ctx.restore();
    label(...scr(...startAt), 'START · ' + p0.t + ' teeth', C.azul);
    const [lx, ly] = scr(pl.x, pl.y + pl.r + 4);
    if (phase === 'result') {
      const wl = r.w[last];
      label(lx, Math.min(H - 14, ly + 20), (wl > 0 ? '↻ clockwise' : '↺ counter-clockwise') + ' · ' + Math.abs(wl).toFixed(2) + '× speed', C.coral);
    } else if (mark != null) label(lx, Math.min(H - 14, ly + 20), GEAR_LABEL[mark].replace('Counter-clockwise', 'CCW').replace('Clockwise', 'CW'), C.azul);
  }


  /* ---------- Bridge ---------- */
  const BR = { rb: 9, v: 210, g: 980 };
  function bridgeAngle(r, L) {
    const dy = r.yb - r.ya, ang = (px, py) => Math.atan2(px - r.xa, r.ya - py);
    if (dy < 0) {                                                                 // destino más alto
      const gap = r.xb - r.xa, thB = ang(r.xb, r.yb);
      if (L >= Math.hypot(gap, -dy) - 0.01) return { th: thB, ok: L >= r.lo - 0.01 && L <= r.hi + 0.01 };   // apoyada en la esquina
      if (L >= gap) return { th: Math.asin(gap / L), ok: false, wall: true };      // apoyada en la pared
      return { th: Math.PI, ok: false };
    }
    if (L >= r.lo - 0.01 && L <= r.hi + 0.01) return { th: Math.acos(Math.max(-1, Math.min(1, -dy / L))), ok: true };
    if (L > r.hi) return { th: ang(r.xc, r.yb), ok: false };                       // se apoya en la esquina lejana
    // corta: como el destino nunca está más alto, la punta no llega a tocar nada y la tabla cuelga en el vacío
    return { th: Math.PI, ok: false };
  }
  function bridgeFrames(r, L) {
    const { th: thL, ok, wall } = bridgeAngle(r, L), rb = BR.rb, out = [];
    const Tf = 0.45 + 0.2 * thL / Math.PI, dt = 1 / 60;
    const dir = [Math.sin(thL), -Math.cos(thL)], nrm = [-Math.cos(thL), -Math.sin(thL)];
    const hx = r.xa, hy = r.ya, steep = thL > 2.2;
    // recorrido de la canica: plataforma → tabla → (destino o caída)
    let bx = r.xa - 34, by = r.ya - rb, spin = 0, mode = 'wait', u = 0, vx = 0, vy = 0, t = 0, stop = null;
    for (let k = 0; k < 60 * 9; k++, t += dt) {
      const th = t < Tf ? thL * (t / Tf) ** 2 : thL;
      if (mode === 'wait' && t >= Tf + 0.25) mode = 'top';
      if (mode === 'top') {
        bx += BR.v * dt; spin += BR.v * dt / rb;
        if (bx >= hx) { bx = hx; if (steep) { mode = 'fall'; vx = BR.v * 0.6; vy = 0; } else { mode = 'plank'; u = 0; } }
      } else if (mode === 'plank') {
        const sp = BR.v + Math.max(0, -Math.cos(thL)) * 180;           // cuesta abajo va algo más rápida
        u += sp * dt; spin += sp * dt / rb;
        if (u >= L) {
          u = L;
          if (ok) { mode = 'land'; stop = (r.xb + r.xc) / 2; vy = 0; }
          else { mode = 'fall'; vx = wall ? -15 : dir[0] * sp; vy = wall ? 0 : dir[1] * sp; }
        }
        bx = hx + dir[0] * u + nrm[0] * rb; by = hy + dir[1] * u + nrm[1] * rb;
      } else if (mode === 'land') {
        if (by < r.yb - rb - 0.5) { vy += BR.g * dt; by = Math.min(r.yb - rb, by + vy * dt); out.push([th, bx, by, spin]); continue; }   // cae desde la punta
        by = r.yb - rb; const step = Math.sign(stop - bx) * Math.min(Math.abs(stop - bx), BR.v * 0.7 * dt); bx += step; spin += step / rb;
        if (Math.abs(stop - bx) < 0.5) { mode = 'done'; stop = t; }
      } else if (mode === 'fall') {
        vy += BR.g * dt; bx += vx * dt; by += vy * dt; spin += 0.25;
        if (by > 660) { mode = 'done'; stop = t; }
      } else if (mode === 'done' && t - stop > 0.5) break;
      out.push([th, bx, by, spin]);
    }
    return { frames: out, ok, th: thL };
  }
  function aimBridge(r, x, y) { mark = Math.max(10, Math.min(r.ya - 20, r.ya - y)); return true; }
  function drawBridge(r) {
    const rb = BR.rb;
    // vacío
    const grd = ctx.createLinearGradient(0, 380, 0, H); grd.addColorStop(0, 'rgba(0,0,0,0)'); grd.addColorStop(1, 'rgba(0,0,0,.28)');
    ctx.fillStyle = grd; ctx.fillRect(0, 380, W, H - 380);
    // plataformas
    const pillar = (x0, x1, y) => { ctx.fillStyle = C.ink; ctx.fillRect(x0, y, x1 - x0, H - y + 2); ctx.fillStyle = C.wood; ctx.fillRect(x0, y, x1 - x0, 6); };
    pillar(-2, r.xa, r.ya); pillar(r.xb, r.xc, r.yb);
    ctx.fillStyle = C.coral; ctx.fillRect((r.xb + r.xc) / 2 - 4, r.yb - 1, 8, 4);
    const S = phase === 'aim' ? null : (r.sim || (r.sim = bridgeFrames(r, mark)));
    const fi = !S ? 0 : phase === 'result' || !anim ? S.frames.length - 1 : Math.max(0, Math.min(S.frames.length - 1, Math.floor(anim.t * 60) || 0));
    const f = S ? S.frames[fi] : null;
    // tabla ideal (resultado)
    if (phase === 'result') {
      const cx = (r.xb + r.xc) / 2, ti = bridgeAngle(r, r.answer).th;
      ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = C.coral; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r.xa, r.ya); ctx.lineTo(r.xa + r.answer * Math.sin(ti), r.ya - r.answer * Math.cos(ti)); ctx.stroke(); ctx.restore();
      label(Math.min(W - 70, cx + 10), r.yb + 40, 'perfect ' + cm(r.answer) + ' cm', C.coral);
    }
    // tabla
    const L = mark ?? 0;
    if (L > 0 || phase !== 'aim') {
      const th = f ? f[0] : 0;
      ctx.save(); ctx.translate(r.xa, r.ya); ctx.rotate(th);
      ctx.fillStyle = C.wood; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; roundRect(-6, -L, 6, L, 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-3, -L + 4); ctx.lineTo(-3, -4); ctx.stroke(); ctx.globalAlpha = 1;
      ctx.restore();
    }
    if (phase === 'aim') {
      if (mark == null) {
        ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = C['ink-2']; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(r.xa - 3, r.ya); ctx.lineTo(r.xa - 3, r.ya - 70); ctx.stroke(); ctx.restore();
        arrow(r.xa - 3, r.ya - 40, r.xa - 3, r.ya - 90, C.azul, 2.5);
        ctx.font = mono(11); ctx.fillStyle = C['ink-2']; ctx.textAlign = 'left'; ctx.fillText('drag up to grow the plank', Math.max(8, r.xa - 60), r.ya - 104);
      }
      drawSkin(ctx, r.xa - 34, r.ya - rb, rb, skin, 0);
    } else drawSkin(ctx, f[1], f[2], rb, skin, f[3]);
    if (phase === 'result' && mark != null) label(Math.max(60, r.xa - 10), r.ya - 30, 'you ' + cm(mark) + ' cm', C.azul);
  }

  window.PhysleGame = { play, redraw: () => draw(), TYPE_NAME, setSkin: (look) => { skin = look || skin; draw(); }, drawMarble: (g, x, y, r, look, ang) => { readColors(); drawSkin(g, x, y, r, look, ang); } };
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw());
})();
