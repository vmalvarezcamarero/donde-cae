// Dos experimentos nuevos:
//  · clock  («Stopwatch»): una canica baja por un circuito en zigzag. ¿Cuánto tarda en llegar a la meta?
//  · bounce («Bounce»): una pelota cae sobre un suelo. ¿A qué altura llega después del bote N?
import { mulberry32, R } from './rounds.mjs';

const G = 980;                      // px/s² (2 px = 1 cm, como en el resto)
const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;

/* ---------- Stopwatch ---------- */
// Tramos rectos unidos por curvas en U (como un circuito de canicas con paredes). Materiales:
//  · normal: la canica rueda (k = 2/5: parte de la energía se va en girar),
//  · hielo: resbala sin girar (k = 0: acelera más),
//  · arena: rozamiento y frenada que crece con la velocidad.
export const CLOCK = { x0: 46, x1: 354, top: 118, finishDrop: 34, dial: { 1: 6, 2: 8, 3: 10 } };
const K_ROLL = 0.4, MU_SAND = 0.16, SAND_DRAG = 0.005;

function timesAlong(pts, kArr, muArr) {
  let v2 = 30 * 30, t = 0; const times = [0];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const ds = Math.hypot(x1 - x0, y1 - y0), v0 = Math.sqrt(v2), m = muArr[i], k = kArr[i];
    v2 += 2 * (G * (y1 - y0) - m * G * ds) / (1 + k);
    if (m > 0) v2 *= Math.exp(-2 * SAND_DRAG * ds);
    if (v2 <= 9) return null;
    t += ds / ((v0 + Math.sqrt(v2)) / 2);
    times.push(t);
  }
  return times;
}

export function genClock(seed, level) {
  const rand = mulberry32(seed), D = CLOCK.dial[level];
  const nSeg = level === 1 ? 2 : level === 2 ? 3 : 4, rb = level === 3 ? 22 : 26;
  for (let attempt = 0; attempt < 4000; attempt++) {
    let y = CLOCK.top, dir = rand() < 0.5 ? 1 : -1;
    const segs = [];
    for (let i = 0; i < nSeg; i++) {
      const drop = Math.round(level === 1 ? 30 + rand() * 80 : 18 + rand() * 66);
      segs.push({ xa: dir > 0 ? CLOCK.x0 : CLOCK.x1, ya: y, xb: dir > 0 ? CLOCK.x1 : CLOCK.x0, yb: y + drop, mat: 'plain' });
      y += drop + 2 * rb; dir = -dir;
    }
    const last = segs[nSeg - 1];
    if (last.yb + CLOCK.finishDrop + 30 > 540) continue;
    // materiales (nunca en el primer tramo: su tiempo es la pista)
    const pool = segs.slice(1);
    const want = level === 1 ? (rand() < 0.5 ? ['ice'] : ['sand']) : level === 2 ? [rand() < 0.5 ? 'ice' : 'sand'] : ['ice', 'sand'];
    const used = new Set();
    for (const m of want) {
      let s; do { s = pool[Math.floor(rand() * pool.length)]; } while (used.has(s) && used.size < pool.length);
      used.add(s); s.mat = m;
      if (m === 'sand') { const a = 0.15 + rand() * 0.3; s.u0 = r2(a); s.u1 = r2(Math.min(0.95, a + 0.35 + rand() * 0.25)); }
      else { s.u0 = 0; s.u1 = 1; }
    }
    // el recorrido, punto a punto
    const pts = [], k = [], mu = [], nrm = [];
    let segEnd = 0;
    segs.forEach((s, i) => {
      const len = Math.hypot(s.xb - s.xa, s.yb - s.ya), n = Math.ceil(len / 2);
      for (let j = i === 0 ? 0 : 1; j <= n; j++) {
        const u = j / n; pts.push([s.xa + (s.xb - s.xa) * u, s.ya + (s.yb - s.ya) * u]);
        { const dx = s.xb - s.xa, dy = s.yb - s.ya, L = Math.hypot(dx, dy); let nx = dy / L, ny = -dx / L; if (ny > 0) { nx = -nx; ny = -ny; } nrm.push([nx, ny]); }
        const on = s.mat !== 'plain' && u >= s.u0 && u <= s.u1;
        k.push(on && s.mat === 'ice' ? 0 : K_ROLL); mu.push(on && s.mat === 'sand' ? MU_SAND : 0);
      }
      if (i === 0) segEnd = pts.length - 1;
      if (i < nSeg - 1) {                                   // curva en U hacia el tramo de abajo
        const sg = s.xb > s.xa ? 1 : -1, cx = s.xb, cy = s.yb + rb, n2 = Math.ceil(Math.PI * rb / 2);
        for (let j = 1; j <= n2; j++) { const th = -Math.PI / 2 + Math.PI * j / n2; pts.push([cx + sg * rb * Math.cos(th), cy + rb * Math.sin(th)]); k.push(K_ROLL); mu.push(0); nrm.push([-sg * Math.cos(th), -Math.sin(th)]); }
      }
    });
    const times = timesAlong(pts, k, mu);
    if (!times) continue;
    const T = times.at(-1), split = times[segEnd];
    if (T < D * 0.32 || T > D * 0.82 || split < 0.45) continue;
    // que no baste con multiplicar el primer tramo por el número de tramos
    if (Math.abs(T - split * nSeg) < 0.12 * T) continue;
    // fotogramas a 60 fps (x, y, giro) y caída final al cubo
    const frames = []; let idx = 0, ang = 0, prevX = pts[0][0], prevY = pts[0][1];
    for (let t = 0; t < T; t += 1 / 60) {
      while (idx < times.length - 2 && times[idx + 1] < t) idx++;
      const f = (t - times[idx]) / Math.max(1e-6, times[idx + 1] - times[idx]);
      const x = pts[idx][0] + (pts[idx + 1][0] - pts[idx][0]) * f, yy = pts[idx][1] + (pts[idx + 1][1] - pts[idx][1]) * f;
      const d = Math.hypot(x - prevX, yy - prevY); if (k[idx + 1] > 0) ang += d / R * (x >= prevX ? 1 : -1);
      const [nx, ny] = nrm[idx + 1], off = R + 3;
      frames.push([r1(x + nx * off), r1(yy + ny * off), r2(ang)]); prevX = x; prevY = yy;
    }
    const vEnd = Math.hypot(pts.at(-1)[0] - pts.at(-2)[0], pts.at(-1)[1] - pts.at(-2)[1]) / Math.max(1e-6, times.at(-1) - times.at(-2));
    const sgn = last.xb > last.xa ? 1 : -1;
    let fx = last.xb, fy = last.yb - R - 3, vx = sgn * vEnd * 0.97, vy = 0;
    const cupX = last.xb + sgn * 18, cupY = last.yb + CLOCK.finishDrop;
    for (let q = 0; q < 40; q++) {                            // sale de la pista y cae al cubo
      vy += G / 60; fx += vx / 60; fy += vy / 60;
      if (Math.abs(fx - cupX) > 16) { fx = cupX + Math.sign(fx - cupX) * 16; vx *= -0.3; }
      if (fy > cupY - R) { fy = cupY - R; vy *= -0.25; vx *= 0.6; }
      ang += vx / 60 / R; frames.push([r1(fx), r1(fy), r2(ang)]);
    }
    return { type: 'clock', level, segs, rb, dial: D, split: r2(split), answer: r2(T), cup: [r1(cupX), r1(cupY)], frames };
  }
  throw new Error('No clock scene for seed ' + seed);
}

/* ---------- Bounce ---------- */
// Cada bote conserva la misma fracción de altura (e²). Pista: la altura del primer bote
// (o, en difícil, un bote de prueba soltado desde otra altura).
export const BOUNCE = { floor: 540 };
export const BALLS = { super: { e: 0.9, r: 12 }, tennis: { e: 0.76, r: 15 }, basket: { e: 0.82, r: 22 }, golf: { e: 0.8, r: 10 } };
export const FLOORS = { mat: 1.0, wood: 0.94, carpet: 0.84, concrete: 1.0, trampoline: 1.07 };

export function genBounce(seed, level) {
  const rand = mulberry32(seed), n = level === 1 ? 2 : level === 2 ? 3 : 4;
  const balls = Object.keys(BALLS), floors = Object.keys(FLOORS);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const ball = balls[Math.floor(rand() * balls.length)], floor = floors[Math.floor(rand() * floors.length)];
    const e = Math.min(0.94, BALLS[ball].e * FLOORS[floor] * (0.96 + rand() * 0.06)), rb = BALLS[ball].r;
    const h0 = Math.round(300 + rand() * 150);              // px de altura de la base de la pelota
    const hs = []; for (let k = 1; k <= n; k++) hs.push(h0 * e ** (2 * k));
    const ans = hs[n - 1];
    if (ans < 26 || ans > h0 * 0.62) continue;
    // pista: en fácil y medio, el primer bote; en difícil, un bote de prueba desde otra altura
    const testFrom = level === 3 ? Math.round(h0 * (0.45 + rand() * 0.25)) : h0, test = testFrom * e * e;
    // fotogramas: caída, botes… hasta un poco después del bote N
    const frames = [], F = BOUNCE.floor;
    let y = h0, v = 0, t = 0, b = 0, apexT = null;
    const dt = 1 / 600;
    for (let step = 0; step < 600 * 12; step++) {
      v -= G * dt; y += v * dt; t += dt;
      if (y <= 0) { y = 0; v = -v * e; b++; if (b > n) break; }
      if (b === n && v <= 0 && apexT == null) apexT = t;
      if (step % 10 === 0) frames.push([200, r1(F - rb - y), 0]);
    }
    if (apexT == null) continue;
    frames.push([200, F - rb, 0]);
    return { type: 'bounce', level, ball, floor, n, h0, testFrom, test: r1(test), answer: r1(ans), apexT: r2(apexT), frames };
  }
  throw new Error('No bounce scene for seed ' + seed);
}
