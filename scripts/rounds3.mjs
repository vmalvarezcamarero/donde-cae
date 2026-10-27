// Seis experimentos más: Orbit, Magnets, Pour, Pulleys, Swing y Spring.
// Mismo esquema que rounds.mjs y rounds2.mjs: cada función crea una ronda a partir
// de una semilla, comprueba que sea justa (que un pequeño cambio no cambie el
// resultado) y guarda la respuesta. 2 px = 1 cm en todo el juego.
import { mulberry32 } from './rounds.mjs';
import { cannonLand } from '../public/scoring.js';

const r1 = (x) => Math.round(x * 10) / 10;
const G = 980;

/* ---------- Orbit: ¿dónde acaba el cometa? ---------- */
export const SPACE = { x0: 24, y0: 76, x1: 376, y1: 536 };
const GK = 1700;                                     // gravedad de cada planeta: GK · r² / d²
export function simulateOrbit(planets, start, vel, dur = 9, keep = true) {
  let [x, y] = start, [vx, vy] = vel; const dt = 1 / 480, frames = [[r1(x), r1(y)]];
  for (let s = 1; s <= dur / dt; s++) {
    let ax = 0, ay = 0;
    for (const p of planets) { const dx = p.x - x, dy = p.y - y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2); const a = GK * p.r * p.r / Math.max(d2, 64); ax += a * dx / d; ay += a * dy / d; }
    vx += ax * dt; vy += ay * dt; x += vx * dt; y += vy * dt;
    if (keep && s % 8 === 0) frames.push([r1(x), r1(y)]);
    const hit = planets.findIndex(p => Math.hypot(p.x - x, p.y - y) < p.r + 4);
    if (hit >= 0) { frames.push([r1(x), r1(y)]); return { crash: hit, frames, t: s * dt, end: [x, y] }; }
    if (x < SPACE.x0 || x > SPACE.x1 || y < SPACE.y0 || y > SPACE.y1) {
      x = Math.max(SPACE.x0, Math.min(SPACE.x1, x)); y = Math.max(SPACE.y0, Math.min(SPACE.y1, y)); frames.push([r1(x), r1(y)]);
      return { crash: -1, end: [x, y], frames, t: s * dt, vel: [vx, vy] };
    }
  }
  return null;
}
export function spacePerim([x, y]) {
  const { x0, y0, x1, y1 } = SPACE, w = x1 - x0, h = y1 - y0;
  const d = [Math.abs(y - y0), Math.abs(x - x1), Math.abs(y - y1), Math.abs(x - x0)], s = d.indexOf(Math.min(...d));
  return s === 0 ? x - x0 : s === 1 ? w + (y - y0) : s === 2 ? w + h + (x1 - x) : 2 * w + h + (y1 - y);
}
export function genOrbit(seed, level) {
  const rand = mulberry32(seed);
  const wantCrash = rand() < 0.45;
  const per = 2 * (SPACE.x1 - SPACE.x0) + 2 * (SPACE.y1 - SPACE.y0);
  for (let a = 0; a < 20000; a++) {
    const n = level === 1 ? 1 + Math.floor(rand() * 2) : level === 2 ? 2 + Math.floor(rand() * 2) : 3 + Math.floor(rand() * 2);
    const planets = [];
    for (let k = 0; k < n + 20 && planets.length < n; k++) {
      const r = Math.round(14 + rand() * 22), x = Math.round(SPACE.x0 + 60 + rand() * (SPACE.x1 - SPACE.x0 - 120)), y = Math.round(SPACE.y0 + 70 + rand() * (SPACE.y1 - SPACE.y0 - 140));
      if (planets.some(p => Math.hypot(p.x - x, p.y - y) < p.r + r + 50)) continue;
      planets.push({ x, y, r, c: ['coral', 'azul', 'mostaza', 'violeta', 'good'][planets.length] });
    }
    if (planets.length < n) continue;
    // el cometa entra por la izquierda o por abajo
    const side = rand() < 0.5 ? 0 : 1;
    const start = side === 0 ? [SPACE.x0 + 2, Math.round(SPACE.y0 + 80 + rand() * 300)] : [Math.round(SPACE.x0 + 60 + rand() * 230), SPACE.y1 - 2];
    const base = side === 0 ? 0 : -Math.PI / 2, ang = base + (rand() - 0.5) * 1.1, sp = 170 + rand() * 90;
    const vel = [Math.cos(ang) * sp, Math.sin(ang) * sp];
    if (planets.some(p => Math.hypot(p.x - start[0], p.y - start[1]) < p.r + 70)) continue;
    const res = simulateOrbit(planets, start, vel);
    if (!res || res.t < 1.2 || res.t > 6) continue;
    if (wantCrash !== res.crash >= 0) continue;
    if (res.crash < 0) {
      const turn = Math.abs(Math.atan2(vel[0] * res.vel[1] - vel[1] * res.vel[0], vel[0] * res.vel[0] + vel[1] * res.vel[1]));
      if (turn < (level === 1 ? 0.45 : 0.7)) continue;               // que la gravedad se note
      const corner = Math.min(...[[SPACE.x0, SPACE.y0], [SPACE.x1, SPACE.y0], [SPACE.x1, SPACE.y1], [SPACE.x0, SPACE.y1]].map(([cx, cy]) => Math.hypot(res.end[0] - cx, res.end[1] - cy)));
      if (corner < 40) continue;
    } else {
      // que no sea el planeta al que apunta en línea recta desde el principio
      const straight = planets.findIndex(p => { const t = ((p.x - start[0]) * vel[0] + (p.y - start[1]) * vel[1]) / (sp * sp); if (t < 0) return false; return Math.hypot(start[0] + vel[0] * t - p.x, start[1] + vel[1] * t - p.y) < p.r + 6; });
      if (straight === res.crash && rand() < 0.75) continue;
    }
    // robustez: pequeños cambios de dirección o velocidad, mismo final
    let robust = true;
    for (const [da, ds] of [[0.012, 1], [-0.012, 1], [0, 1.015], [0, 0.985]]) {
      const v2 = [Math.cos(ang + da) * sp * ds, Math.sin(ang + da) * sp * ds];
      const alt = simulateOrbit(planets, start, v2, 9, false);
      if (!alt || alt.crash !== res.crash) { robust = false; break; }
      if (res.crash < 0) { let d = Math.abs(spacePerim(alt.end) - spacePerim(res.end)); d = Math.min(d, per - d); if (d > 30) { robust = false; break; } }
    }
    if (!robust) continue;
    return { type: 'orbit', level, planets, start, vel: vel.map(r1), crash: res.crash, end: res.end.map(r1), frames: res.frames };
  }
  throw new Error('No orbit ' + seed);
}

/* ---------- Magnets: ¿qué imán se queda la bola? ----------
   La bola de acero parte quieta; cada imán tira con fuerza ∝ potencia / distancia².
   Sobre una mesa con mucho rozamiento, la bola sigue la dirección de la fuerza total. */
export const MAG = { x0: 30, y0: 90, x1: 370, y1: 520, ball: 9 };
const MK = 2.2e5;
function simulateMagnets(mags, start, keep = true) {
  let [x, y] = start; const frames = [[r1(x), r1(y)]], dt = 1 / 240;
  for (let s = 1; s < 240 * 8; s++) {
    let fx = 0, fy = 0;
    for (const m of mags) { const dx = m.x - x, dy = m.y - y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2); const f = MK * m.s / Math.max(d2, 100); fx += f * dx / d; fy += f * dy / d; }
    const F = Math.hypot(fx, fy); if (F < 1e-6) return null;
    const v = Math.min(420, 20 + F * 0.9);                              // arranca despacio y acelera al acercarse
    x += fx / F * v * dt; y += fy / F * v * dt;
    if (keep && s % 4 === 0) frames.push([r1(x), r1(y)]);
    const hit = mags.findIndex(m => Math.hypot(m.x - x, m.y - y) < m.r + MAG.ball);
    if (hit >= 0) { frames.push([r1(x), r1(y)]); return { win: hit, frames, t: s * dt }; }
  }
  return null;
}
export function genMagnets(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 20000; a++) {
    const n = level === 1 ? 2 : level === 2 ? 3 : 3 + Math.floor(rand() * 2);
    const mags = [];
    for (let k = 0; k < 40 && mags.length < n; k++) {
      const s = 1 + Math.floor(rand() * 3), r = 12 + s * 5;
      const x = Math.round(MAG.x0 + 40 + rand() * (MAG.x1 - MAG.x0 - 80)), y = Math.round(MAG.y0 + 40 + rand() * (MAG.y1 - MAG.y0 - 80));
      if (mags.some(m => Math.hypot(m.x - x, m.y - y) < 120)) continue;
      mags.push({ x, y, s, r });
    }
    if (mags.length < n || new Set(mags.map(m => m.s)).size < 2) continue;
    const start = [Math.round(MAG.x0 + 60 + rand() * (MAG.x1 - MAG.x0 - 120)), Math.round(MAG.y0 + 60 + rand() * (MAG.y1 - MAG.y0 - 120))];
    if (mags.some(m => Math.hypot(m.x - start[0], m.y - start[1]) < m.r + 55)) continue;
    const res = simulateMagnets(mags, start);
    if (!res || res.t > 5) continue;
    // que no sea siempre lo obvio: ni siempre el más cercano ni siempre el más fuerte
    const near = mags.map((m, i) => [Math.hypot(m.x - start[0], m.y - start[1]), i]).sort((p, q) => p[0] - q[0])[0][1];
    const strong = mags.map((m, i) => [m.s, i]).sort((p, q) => q[0] - p[0])[0][1];
    if (level >= 2 && res.win === near && res.win === strong) continue;
    if (level === 3 && res.win === near && rand() < 0.6) continue;
    let robust = true;
    for (const [dx, dy] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) { const alt = simulateMagnets(mags, [start[0] + dx, start[1] + dy], false); if (!alt || alt.win !== res.win) { robust = false; break; } }
    if (!robust) continue;
    return { type: 'magnet', level, mags, start, win: res.win, frames: res.frames };
  }
  throw new Error('No magnets ' + seed);
}

/* ---------- Pour: ¿qué vaso se llena primero? ----------
   El grifo llena el vaso de arriba. Cuando el agua llega a la altura de una tubería,
   todo lo que entra sale por ella (si hay dos a la misma altura, se reparte a medias).
   Las tuberías con ✕ están cerradas. Gana el primer vaso que se llena hasta el borde. */
export function simulatePour(glasses, pipes, Q = 900, keep = true) {
  const L = glasses.map(() => 0), full = glasses.map(() => null), dt = 1 / 120, frames = [];
  let first = -1, firstT = null;
  for (let s = 0; s < 120 * 30; s++) {
    const t = s * dt, inflow = glasses.map(() => 0), flowing = [];
    inflow[0] = Q;
    // orden de arriba a abajo: los vasos están ordenados por nivel
    for (let i = 0; i < glasses.length; i++) {
      const g = glasses[i], q = inflow[i]; if (q <= 0) continue;
      const outs = pipes.filter(p => p.from === i && !p.closed);
      const hMin = outs.length ? Math.min(...outs.map(p => p.h)) : Infinity;
      if (L[i] < Math.min(hMin, g.h)) { L[i] = Math.min(g.h, L[i] + q * dt / g.w); if (L[i] >= g.h && full[i] == null) { full[i] = t; if (first < 0) { first = i; firstT = t; } } }
      else if (hMin < g.h) { const act = outs.filter(p => Math.abs(p.h - hMin) < 0.5); act.forEach(p => { inflow[p.to] += q / act.length; flowing.push(pipes.indexOf(p)); }); }
    }
    if (keep && s % 2 === 0) frames.push([...L.map(r1), flowing]);
    if (firstT != null && t > firstT + 0.9) break;
  }
  return { first, firstT, full, frames };
}
export function genPour(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 20000; a++) {
    const glasses = [], pipes = [];
    const G0 = { x: 200, y: 200, w: 46 + Math.round(rand() * 14), h: 70 };        // y = fondo del vaso
    glasses.push(G0);
    const t1 = [{ x: 105 + Math.round(rand() * 20), y: 360, w: Math.round(34 + rand() * 30), h: Math.round(56 + rand() * 24) }, { x: 295 - Math.round(rand() * 20), y: 360, w: Math.round(34 + rand() * 30), h: Math.round(56 + rand() * 24) }];
    t1.forEach(g => glasses.push(g));
    const nT2 = level === 1 ? 2 : 3;
    const t2x = nT2 === 2 ? [80, 320] : [62, 200, 338];
    t2x.forEach(x => glasses.push({ x: x + Math.round((rand() - 0.5) * 16), y: 520, w: Math.round(30 + rand() * 32), h: Math.round(50 + rand() * 30) }));
    // tuberías del vaso de arriba (alturas distintas o iguales)
    const same = rand() < 0.4;
    const hl = Math.round(G0.h * (0.25 + rand() * 0.5)), hr = same ? hl : Math.round(G0.h * (0.25 + rand() * 0.5));
    pipes.push({ from: 0, to: 1, h: hl, side: -1 }, { from: 0, to: 2, h: hr, side: 1 });
    // tuberías del piso de en medio hacia abajo
    const tiers2 = glasses.slice(3).map((g, k) => k + 3);
    for (const i of [1, 2]) {
      const g = glasses[i], left = i === 1;
      const cands = tiers2.filter(j => left ? glasses[j].x <= g.x + 60 : glasses[j].x >= g.x - 60);
      const outs = (level >= 2 && rand() < 0.6) ? 2 : 1;
      const picks = cands.sort(() => rand() - 0.5).slice(0, outs);
      picks.forEach((j, k) => pipes.push({ from: i, to: j, h: Math.round(g.h * (0.2 + rand() * 0.6)), side: glasses[j].x < g.x ? -1 : 1 }));
    }
    if (pipes.filter(p => p.from > 0).length < 2) continue;
    // tuberías cerradas (Medium y Hard)
    if (level >= 2) { const k = 1 + Math.floor(rand() * (pipes.length - 1)); if (rand() < 0.75) pipes[k].closed = true; }
    if (level === 3 && rand() < 0.5) { const k = Math.floor(rand() * pipes.length); pipes[k].closed = true; }
    if (pipes.filter(p => p.from === 0 && !p.closed).length === 0 && rand() < 0.7) continue;
    // que no se crucen tuberías del mismo lado de forma rara: destino por debajo
    const res = simulatePour(glasses, pipes);
    if (res.first < 0) continue;
    const times = res.full.filter(t => t != null).sort((p, q) => p - q);
    if (times.length >= 2 && times[1] < times[0] * 1.12) continue;      // ganador claro
    if (res.first === 0 && level >= 2) continue;
    if (res.firstT < 3 || res.firstT > 16) continue;
    // escala de tiempo para que la animación dure unos 4–6 s
    const speed = Math.max(1, res.firstT / 5);
    return { type: 'pour', level, glasses, pipes, first: res.first, speed: r1(speed), frames: res.frames };
  }
  throw new Error('No pour ' + seed);
}

/* ---------- Pulleys: ¿hacia qué lado se mueve? ----------
   Cada peso cuelga de un bloque sostenido por N tramos de cuerda: tira con peso / N.
   Gana el lado que tira más; si tiran igual, se queda quieto. */
export function genPulley(seed, level) {
  const rand = mulberry32(seed);
  const want = rand() < (level === 1 ? 0.2 : 0.25) ? 0 : (rand() < 0.5 ? -1 : 1);
  for (let a = 0; a < 5000; a++) {
    const maxA = level === 1 ? 1 : level === 2 ? 2 : 4;
    const aL = 1 + Math.floor(rand() * maxA), aR = 1 + Math.floor(rand() * maxA);
    if (level === 1 && (aL !== 1 || aR !== 1)) continue;
    if (level >= 2 && aL === aR) continue;
    const mL = 2 + Math.floor(rand() * 11), mR = 2 + Math.floor(rand() * 11);
    const pL = mL / aL, pR = mR / aR, ans = Math.abs(pL - pR) < 1e-9 ? 0 : (pL > pR ? -1 : 1);
    if (ans !== want) continue;
    if (ans !== 0 && Math.abs(pL - pR) / Math.max(pL, pR) < 0.12) continue;    // diferencia que se note
    if (level >= 2 && ans !== 0 && (mL > mR) === (ans === -1)) { if (rand() < 0.7) continue; }   // que a menudo gane el que pesa menos
    return { type: 'pulley', level, left: { m: mL, a: aL }, right: { m: mR, a: aR }, answer: ans };
  }
  throw new Error('No pulley ' + seed);
}

/* ---------- Swing: cortamos la cuerda, ¿dónde cae? ---------- */
export const SWING = { floor: 556, R: 10 };
export function simulateSwing(r) {
  const { px, py, L, th0, thc } = r, frames = []; const dt = 1 / 600;
  let th = th0, om = 0, t = 0;
  // péndulo hasta el corte (la bola suelta desde quieta en th0 y se mueve hacia ángulos mayores)
  for (let s = 0; s < 600 * 6; s++) {
    om += -(G / L) * Math.sin(th) * dt; th += om * dt; t += dt;
    if (s % 10 === 0) frames.push([r1(px + L * Math.sin(th)), r1(py + L * Math.cos(th)), 1]);
    if (th >= thc && om > 0) break;
  }
  th = thc;
  const v = Math.sqrt(Math.max(0, 2 * G * L * (Math.cos(thc) - Math.cos(th0))));
  let x = px + L * Math.sin(thc), y = py + L * Math.cos(thc), vx = v * Math.cos(thc), vy = -v * Math.sin(thc);
  const cutIdx = frames.length;
  for (let s = 0; s < 600 * 4; s++) {
    vy += G * dt; x += vx * dt; y += vy * dt;
    const ground = r.step && x >= r.step.x0 && x <= r.step.x1 ? r.step.y : SWING.floor;
    if (s % 10 === 0) frames.push([r1(x), r1(y), 0]);
    if (y + SWING.R >= ground) { frames.push([r1(x), r1(ground - SWING.R), 0]); return { impactX: x, impactY: ground, frames, cutIdx }; }
  }
  return null;
}
export function genSwing(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 5000; a++) {
    const L = Math.round(120 + rand() * 120), px = Math.round(70 + rand() * 170), py = 100;
    const th0 = -(0.4 + rand() * 0.75);
    const thc = level === 1 ? 0 : level === 2 ? 0.15 + rand() * 0.55 : (rand() < 0.4 ? -0.15 - rand() * 0.35 : 0.2 + rand() * 0.6);
    if (thc >= -th0 - 0.12) continue;                                  // tiene que llegar hasta el corte
    let step = null;
    if (level === 3 && rand() < 0.6) { const x0 = Math.round(200 + rand() * 120), w = Math.round(50 + rand() * 50); step = { x0, x1: Math.min(392, x0 + w), y: SWING.floor - Math.round(40 + rand() * 60) }; }
    const r = { px, py, L, th0: Math.round(th0 * 1000) / 1000, thc: Math.round(thc * 1000) / 1000, step };
    const res = simulateSwing(r);
    if (!res || res.impactX < 40 || res.impactX > 362) continue;
    if (py + L + SWING.R > SWING.floor - 30) continue;
    if (step && Math.abs(res.impactX - step.x0) < 12) continue;          // nada de caer justo en el borde
    // robustez: el borde del escalón no debe decidir por poco
    if (step) { const alt = simulateSwing({ ...r, thc: r.thc + 0.01 }); if (!alt || (alt.impactY !== res.impactY)) continue; }
    // la mitad de las veces, en espejo (balanceo de derecha a izquierda)
    if (rand() < 0.5) {
      const M = (x) => r1(400 - x);
      return { type: 'swing', level, px: M(px), py, L, th0: -r.th0, thc: -r.thc, step: step ? { x0: M(step.x1), x1: M(step.x0), y: step.y } : null,
        impactX: M(res.impactX), impactY: res.impactY, frames: res.frames.map(([x, y, k]) => [M(x), y, k]), cutIdx: res.cutIdx };
    }
    return { type: 'swing', level, ...r, impactX: r1(res.impactX), impactY: res.impactY, frames: res.frames, cutIdx: res.cutIdx };
  }
  throw new Error('No swing ' + seed);
}

/* ---------- Spring: ¿cuánto hay que tensar el muelle? ----------
   Velocidad de salida proporcional a lo que tensas. Se ve un tiro de prueba. */
export function springLand(r, pull) {
  const v = r.k * pull, ca = Math.cos(r.ang), sa = Math.sin(r.ang);
  let x = r.lx, y = r.ly, vx = v * ca, vy = -v * sa; const dt = 1 / 600, pts = [];
  for (let s = 0; s < 600 * 5; s++) {
    vy += G * dt; x += vx * dt; y += vy * dt;
    if (s % 10 === 0) pts.push([r1(x), r1(y)]);
    if (vy > 0 && y >= r.ty) return { x, pts };                      // cruza la altura de la boca del cubo bajando
    if (x > 420 || y > 600) return { x: 999, pts };
  }
  return { x: 999, pts };
}
/* ---------- Cañón de muelle con diana (desde el 28 oct 2026) ----------
   La bola sale de la boca del cañón con v = k · tensión y cae en una diana del suelo.
   Tiros bombeados (de mortero) para que la parábola llene la escena. Fácil: 70° y altura fija.
   Medio: otro ángulo y otra altura. Difícil: ángulo cualquiera (más tendido o más
   vertical) y el cañón sobre una torre más alta o más baja. */
export function genSpring(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 5000; a++) {
    const deg = level === 1 ? 70 : level === 2 ? 58 + rand() * 18 : 42 + rand() * 36;
    const ang = Math.round(deg * Math.PI / 180 * 1000) / 1000;
    const ly = level === 1 ? 400 : Math.round(level === 2 ? 340 + rand() * 90 : 260 + rand() * 180);
    const lx = 92, k = Math.round((8 + rand() * 3) * 100) / 100;
    const tx = Math.round(200 + rand() * 130);
    const r = { target: true, lx, ly, ang, k, tx };
    const xAt = (p) => cannonLand(r, p).x;
    if (xAt(70) < tx + 40) continue;                                  // con el máximo hay que poder pasarse
    let lo = 4, hi = 70;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (xAt(m) < tx) lo = m; else hi = m; }
    const best = (lo + hi) / 2;
    if (best < 22 || best > 62) continue;
    // tiro de prueba con otra tensión, que caiga lejos de la diana (para no regalarlo)
    const test = Math.round(best * (0.45 + rand() * 0.25) * 2) / 2, tl = xAt(test);
    if (Math.abs(tl - tx) < 75 || tl < lx + 60) continue;
    return { type: 'spring', level, ...r, test, testX: r1(tl), answer: r1(best) };
  }
  throw new Error('No spring ' + seed);
}
// Versión anterior (cubo sobre un pilar), usada hasta el 27 oct 2026.
export function genSpringBucket(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 5000; a++) {
    const ang = (level === 1 ? 45 : 32 + rand() * 30) * Math.PI / 180;
    const lx = 70, ly = 470, k = Math.round((8.5 + rand() * 2.5) * 100) / 100;
    const ty = level === 1 ? ly : Math.round(ly - 140 + rand() * 200);
    const bw = level === 3 ? 36 + Math.round(rand() * 10) : 50 + Math.round(rand() * 16);
    const tx = Math.round(230 + rand() * 130);
    if (ty > 500 || ty < 260) continue;
    const r = { lx, ly, ang: Math.round(ang * 1000) / 1000, k, tx, ty, bw };
    // pull = tensión en px (máximo 70 px = 35 cm). Buscar el que acierta en el centro del cubo.
    const xAt = (p) => springLand(r, p).x;
    let lo = 5, hi = 70;
    if (xAt(hi) < tx) continue;
    for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (xAt(m) < tx) lo = m; else hi = m; }
    const best = (lo + hi) / 2;
    if (best < 24 || best > 64) continue;
    // ventana de tensiones que meten la bola (borde del cubo menos el radio)
    const inBucket = (p) => Math.abs(xAt(p) - tx) <= bw / 2 - 9;
    let wlo = best, whi = best; while (wlo > 5 && inBucket(wlo - 0.1)) wlo -= 0.1; while (whi < 70 && inBucket(whi + 0.1)) whi += 0.1;
    // tiro de prueba: tensión distinta, que caiga lejos del cubo (para no regalarlo)
    const test = Math.round((best * (0.45 + rand() * 0.2)) * 2) / 2;
    const tl = springLand(r, test);
    if (Math.abs(tl.x - tx) < 60) continue;
    // si el cubo está más bajo, la bola puede cruzar su altura muy a la derecha: comprobar que cabe en pantalla
    if (xAt(best) > 395) continue;
    let platform = null;
    if (ty !== ly) platform = { x0: tx - bw / 2 - 14, x1: tx + bw / 2 + 14 };
    return { type: 'spring', level, ...r, test, testX: r1(tl.x), platform, answer: r1(best), lo: r1(wlo), hi: r1(whi) };
  }
  throw new Error('No spring ' + seed);
}
