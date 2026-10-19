// Los cinco experimentos: cada función genera una ronda a partir de una semilla.
// Todo se simula aquí, una vez; el navegador solo reproduce lo grabado.
// Generador de retos diarios para "¿Dónde cae?"
// Simula offline y guarda trayectorias: el navegador solo reproduce.
import Matter from 'matter-js';

export const W = 400, H = 600, FLOOR = 556, R = 10, G = 980;

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const r1 = (x) => Math.round(x * 10) / 10;

/* ---------- Tipo 1: ¿Dónde cae? (canica que rueda, rebota y gira) ---------- */
// Modelo: esfera maciza (I = 2/5 m R²). En cada contacto se resuelve el choque normal
// con restitución y el rozamiento con un impulso tangencial limitado por μ·Jn, que
// hace que la canica pase a rodar sin deslizar. Así acelera a 5/7·g·senθ en una rampa
// y conserva la velocidad al salir del tablón (sin frenazos artificiales).
const PLANK_HALF = 4, MU = 0.5, E_PLANK = 0.42, E_PEG = 0.55, ROLL_RES = 0.12;
const PLANK_KIND = { normal: { e: 0.42, roll: 0.12 }, muelle: { e: 0.95, roll: 0.12 }, esponja: { e: 0, roll: 1.6 } };
function contact(st, nx, ny, e, dt, roll = ROLL_RES) {
  const vn = st.vx * nx + st.vy * ny;
  if (vn >= 0) return 0;
  const imp = -vn;
  const ee = imp > (e > 0.8 ? 25 : 60) ? e : 0;                 // choques lentos: sin rebote (evita temblores)
  const Jn = (1 + ee) * imp;
  st.vx += Jn * nx; st.vy += Jn * ny;
  const tx = -ny, ty = nx;
  const vt = st.vx * tx + st.vy * ty;
  const slip = vt - st.w * R;
  let Jt = -2 * slip / 7;                      // impulso que anula el deslizamiento
  const lim = MU * Jn; if (Jt > lim) Jt = lim; if (Jt < -lim) Jt = -lim;
  st.vx += Jt * tx; st.vy += Jt * ty;
  st.w += -5 * Jt / (2 * R);                   // Δ(ω·R) = -5/2·Jt: tras el impulso, ω·R = vt (rueda sin deslizar)
  // resistencia a la rodadura, muy pequeña
  const k = 1 - roll * dt; const vt2 = st.vx * tx + st.vy * ty;
  st.vx -= (1 - k) * vt2 * tx; st.vy -= (1 - k) * vt2 * ty; st.w *= k;
  return imp;
}
function simulateDrop(scene, sx, svx) {
  const st = { x: sx, y: scene.startY, vx: svx, vy: 0, w: 0, a: 0 };
  const dt = 1 / 1200, sub = 20; // registro a 60 fps
  const frames = [[r1(st.x), r1(st.y), 0]];
  let t = 0, contacts = 0, slowTime = 0, wall = false; const touched = new Set();
  while (t < 7) {
    for (let k = 0; k < sub; k++) {
      st.vy += G * dt; st.x += st.vx * dt; st.y += st.vy * dt; st.a += st.w * dt; t += dt;
      if (st.x < R || st.x > W - R) { wall = true; st.x = Math.max(R, Math.min(W - R, st.x)); st.vx = -st.vx * 0.5; }
      for (const p of scene.planks) {
        const ex = p.x2 - p.x1, ey = p.y2 - p.y1, L2 = ex * ex + ey * ey;
        let u = ((st.x - p.x1) * ex + (st.y - p.y1) * ey) / L2; u = Math.max(0, Math.min(1, u));
        const qx = p.x1 + u * ex, qy = p.y1 + u * ey;
        const dx = st.x - qx, dy = st.y - qy, d = Math.hypot(dx, dy), rr = R + PLANK_HALF;
        if (d < rr && d > 1e-9) {
          const nx = dx / d, ny = dy / d; st.x = qx + nx * rr; st.y = qy + ny * rr;
          const pk = PLANK_KIND[p.kind || 'normal'];
          const imp = contact(st, nx, ny, pk.e, dt, pk.roll);
          if (imp > 60) contacts++;
          if (imp > 0) touched.add(scene.planks.indexOf(p));
        }
      }
      for (const c of scene.pegs) {
        const dx = st.x - c.x, dy = st.y - c.y, d = Math.hypot(dx, dy), rr = R + c.r;
        if (d < rr && d > 1e-9) {
          const nx = dx / d, ny = dy / d; st.x = c.x + nx * rr; st.y = c.y + ny * rr;
          if (contact(st, nx, ny, E_PEG, dt) > 60) contacts++;
        }
      }
      if (st.y + R >= FLOOR) {
        st.y = FLOOR - R; frames.push([r1(st.x), r1(st.y), Math.round(st.a * 100) / 100]);
        return { ok: true, impactX: st.x, time: t, frames, contacts, wall, touched };
      }
    }
    frames.push([r1(st.x), r1(st.y), Math.round(st.a * 100) / 100]);
    if (Math.hypot(st.vx, st.vy) < 25) { slowTime += 1 / 60; if (slowTime > 0.5) return { ok: false }; } else slowTime = 0;
  }
  return { ok: false };
}

function segDist(a, b) {
  const cross = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const A = [a.x1, a.y1], B = [a.x2, a.y2], C2 = [b.x1, b.y1], D = [b.x2, b.y2];
  if (Math.sign(cross(A, B, C2)) !== Math.sign(cross(A, B, D)) && Math.sign(cross(C2, D, A)) !== Math.sign(cross(C2, D, B))) return 0;
  return Math.min(distSeg(b.x1, b.y1, a), distSeg(b.x2, b.y2, a), distSeg(a.x1, a.y1, b), distSeg(a.x2, a.y2, b));
}
function makeDropScene(rand, level) {
  const nPlanks = level === 1 ? 2 : 3;
  const nPegs = level === 1 ? 0 : level === 2 ? 3 : 5;
  const planks = [], pegs = [];
  const bands = nPlanks === 2 ? [[150, 250], [300, 430]] : [[130, 210], [240, 330], [360, 450]];
  for (let i = 0; i < nPlanks; i++) {
    let placed = false;
    for (let tr = 0; tr < 60 && !placed; tr++) {
      const len = 110 + rand() * 80;
      const ang = (14 + rand() * 20) * (Math.PI / 180) * (rand() < 0.5 ? -1 : 1);
      const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2;
      const cx = 30 + Math.abs(dx) + rand() * (340 - 2 * Math.abs(dx));
      const cy = bands[i][0] + rand() * (bands[i][1] - bands[i][0]);
      const pl = { x1: r1(cx - dx), y1: r1(cy - dy), x2: r1(cx + dx), y2: r1(cy + dy), kind: 'normal' };
      if (Math.min(pl.x1, pl.x2) < 28 || Math.max(pl.x1, pl.x2) > 372) continue;  // dentro de la lámina
      if (planks.some(q => segDist(q, pl) < 48)) continue;                        // sin cruces ni roces
      planks.push(pl); placed = true;
    }
    if (!placed) return null;
  }
  let tries = 0;
  while (pegs.length < nPegs && tries++ < 300) {
    const p = { x: r1(36 + rand() * 328), y: r1(130 + rand() * 340), r: 7 };
    const clash = pegs.some(q => Math.hypot(q.x - p.x, q.y - p.y) < 56) ||
      planks.some(k => distSeg(p.x, p.y, k) < 40);
    if (!clash) pegs.push(p);
  }
  if (pegs.length < nPegs) return null;
  // tablones especiales: muelle (rebota fuerte) y esponja (no rebota)
  const nSpecial = level === 1 ? (rand() < 0.6 ? 1 : 0) : level === 2 ? 1 : 1 + (rand() < 0.5 ? 1 : 0);
  const idx = planks.map((_, i) => i).sort(() => rand() - 0.5).slice(0, nSpecial);
  for (const i of idx) planks[i].kind = rand() < 0.5 ? 'muelle' : 'esponja';
  return { startY: 60, planks, pegs };
}
function distSeg(x, y, p) {
  const ex = p.x2 - p.x1, ey = p.y2 - p.y1, L2 = ex * ex + ey * ey;
  let u = ((x - p.x1) * ex + (y - p.y1) * ey) / L2; u = Math.max(0, Math.min(1, u));
  return Math.hypot(x - (p.x1 + u * ex), y - (p.y1 + u * ey));
}

export function genDrop(seed, level) {
  const rand = mulberry32(seed);
  for (let attempt = 0; attempt < 4000; attempt++) {
    const scene = makeDropScene(rand, level);
    if (!scene) continue;
    const sx = r1(70 + rand() * 260), svx = r1((rand() - 0.5) * 80);
    if (scene.planks.some(k => distSeg(sx, scene.startY, k) < 50) || scene.pegs.some(c => Math.hypot(c.x - sx, c.y - scene.startY) < 50)) continue;
    const res = simulateDrop(scene, sx, svx);
    if (!res.ok) continue;
    // Filtros de calidad
    if (res.wall || res.impactX < 50 || res.impactX > W - 50) continue;            // dentro del suelo
    if (res.time < 1.0 || res.time > 4.5) continue;                    // corta
    if (res.contacts < level) continue;                                // que toque obstáculos
    if (scene.planks.some((k, i) => k.kind !== 'normal' && !res.touched.has(i))) continue; // los especiales cuentan
    const minShift = level === 1 ? 60 : level === 2 ? 80 : 100;
    if (Math.abs(res.impactX - sx) < minShift) continue;               // no obvia
    let stable = true;                                                 // no caótica
    for (const [ddx, ddv] of [[0.5, 0], [-0.5, 0], [0, 1], [0, -1], [1, 0.5], [-1, -0.5]]) {
      const alt = simulateDrop(scene, sx + ddx, svx + ddv);
      if (!alt.ok || Math.abs(alt.impactX - res.impactX) > 6) { stable = false; break; }
    }
    if (!stable) continue;
    return {
      type: 'drop', level, startX: sx, startY: scene.startY, startVx: svx,
      planks: scene.planks, pegs: scene.pegs,
      impactX: r1(res.impactX), time: r1(res.time), frames: res.frames,
    };
  }
  throw new Error('No drop scene for seed ' + seed);
}

/* ---------- Tipo 2: ¿Cuál llega antes? (carreras por curvas, sin rozamiento) ---------- */
const COLORS = ['coral', 'azul', 'mostaza', 'violeta'];
function bezier(p0, p1, p2, p3, t) {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
          u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]];
}
function cycloid(A, B) {
  // cicloide que pasa por A y B (y hacia abajo). Resolver theta por bisección.
  const dx = B[0] - A[0], dy = B[1] - A[1];
  const f = (th) => (th - Math.sin(th)) / (1 - Math.cos(th)) - dx / dy;
  let lo = 0.01, hi = 2 * Math.PI - 0.01;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; }
  const th = (lo + hi) / 2, rad = dy / (1 - Math.cos(th));
  const pts = [];
  for (let i = 0; i <= 160; i++) { const t = th * i / 160; pts.push([A[0] + rad * (t - Math.sin(t)), A[1] + rad * (1 - Math.cos(t))]); }
  return pts;
}
function makeCurve(kind, A, B, rand) {
  const pts = [];
  const N = 160;
  if (kind === 'recta') { for (let i = 0; i <= N; i++) { const t = i / N; pts.push([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]); } }
  else if (kind === 'cicloide') return cycloid(A, B);
  else if (kind === 'caida') { // baja casi en vertical y luego recorre en llano
    const k = 0.15 + rand() * 0.15;
    const p1 = [A[0] + 4, A[1] + (B[1] - A[1]) * 1.1], p2 = [A[0] + (B[0] - A[0]) * k, B[1] + 4];
    for (let i = 0; i <= N; i++) pts.push(bezier(A, p1, p2, B, i / N));
  } else if (kind === 'joroba') { // primero suave, luego cae
    const p1 = [A[0] + (B[0] - A[0]) * (0.45 + rand() * 0.2), A[1] + 18 + rand() * 20], p2 = [B[0] - 20, A[1] + (B[1] - A[1]) * 0.55];
    for (let i = 0; i <= N; i++) pts.push(bezier(A, p1, p2, B, i / N));
  } else if (kind === 'valle') { // baja por debajo de B y sube
    const depth = 50 + rand() * 70;
    const p1 = [A[0] + 30, B[1] + depth], p2 = [B[0] - 60 - rand() * 60, B[1] + depth];
    for (let i = 0; i <= N; i++) pts.push(bezier(A, p1, p2, B, i / N));
  } else if (kind === 'olas') { // recta con ondulaciones
    const amp = 18 + rand() * 18, waves = 2 + Math.floor(rand() * 2);
    for (let i = 0; i <= N; i++) {
      const t = i / N; const bx = A[0] + (B[0] - A[0]) * t, by = A[1] + (B[1] - A[1]) * t;
      pts.push([bx, by + amp * Math.sin(Math.PI * waves * t) * Math.sin(Math.PI * t)]);
    }
  }
  return pts;
}
// Tiempo a lo largo de una trayectoria. k = I/(m·r²) del objeto (0 desliza, 0,4 canica, 0,5 rueda, 1 aro).
// mu[i] = rozamiento del tramo que llega al punto i (arena). Devuelve null si el objeto se para.
function pathTimes(pts, k, mu) {
  let v2 = 30 * 30, t = 0; const times = [0];
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const ds = Math.hypot(x1 - x0, y1 - y0), v0 = Math.sqrt(v2);
    const m = mu ? mu[i] : 0;
    v2 += 2 * (G * (y1 - y0) - m * G * ds) / (1 + k);
    if (m > 0) v2 *= Math.exp(-2 * SAND_DRAG * ds);       // la arena además frena más cuanto más rápido vas
    if (v2 <= 4) return null;
    t += ds / ((v0 + Math.sqrt(v2)) / 2);
    times.push(t);
  }
  return times;
}
const SAND_DRAG = 0.006;
const OBJECTS = { canica: 0.4, rueda: 0.5, aro: 1.0, hielo: 0 };
function sortCheck(tracks, gap) {
  const sorted = [...tracks].sort((a, b) => a.total - b.total);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].total - sorted[i - 1].total < gap) return null;
  return sorted.map(t => tracks.indexOf(t));
}
function pack(tracks) { return tracks.map(({ total, ...t }) => ({ ...t, times: t.times.map(x => Math.round(x * 1000) / 1000) })); }

export function genRace(seed, n, format) {
  const rand = mulberry32(seed);
  const kinds = ['recta', 'cicloide', 'caida', 'joroba', 'valle', 'olas'];
  for (let attempt = 0; attempt < 6000; attempt++) {
    if (format === 'objetos') {
      // carriles apilados: cada uno con su objeto y su rampa
      const objs = Object.keys(OBJECTS).sort(() => rand() - 0.5).slice(0, n);
      const band = 400 / n, tracks = [];
      for (let i = 0; i < n; i++) {
        const top = 100 + i * band, h = 40 + rand() * Math.min(110, band - 40);
        const A = [50, r1(top)], B = [340, r1(top + h)];
        const kind = ['recta', 'cicloide', 'caida', 'joroba'][Math.floor(rand() * 4)];
        const pts = makeCurve(kind, A, B, rand).map(([x, y]) => [r1(x), r1(y)]);
        if (pts.some(([x, y], j) => j > 0 && (y < A[1] - 0.05 || y > top + band - 12))) { tracks.length = 0; break; }
        const times = pathTimes(pts, OBJECTS[objs[i]]);
        if (!times) { tracks.length = 0; break; }
        tracks.push({ kind, obj: objs[i], color: COLORS[i], pts, times, total: times.at(-1) });
      }
      if (tracks.length !== n) continue;
      const order = sortCheck(tracks, 0.06); if (!order) continue;
      if (tracks[order[0]].obj === 'hielo' && rand() < 0.6) continue;   // que el hielo no gane siempre
      return { type: 'race', format, finishX: 340, tracks: pack(tracks), order };
    }
    const A = [40, r1(110 + rand() * 40)];
    const B = [r1(330 + rand() * 30), r1(360 + rand() * 90)];
    const base = kinds.filter(k => k !== 'cicloide' || rand() < 0.25);
    const pool = [...base].sort(() => rand() - 0.5).slice(0, n);
    const tracks = pool.map((k, i) => {
      const pts = makeCurve(k, A, B, rand).map(([x, y]) => [r1(x), r1(y)]);
      if (pts.some(([x, y], j) => j > 0 && (y < A[1] - 0.05 || y > 545 || x < 16 || x > 384))) return null;
      let mu = null, sand = [];
      if (format === 'terrenos' && rand() < 0.75) {
        mu = pts.map(() => 0);
        const patches = 1 + (rand() < 0.4 ? 1 : 0);
        for (let q = 0; q < patches; q++) {
          const i0 = Math.floor((0.15 + rand() * 0.55) * pts.length), len = Math.floor((0.12 + rand() * 0.2) * pts.length);
          const i1 = Math.min(pts.length - 2, i0 + len), m = r1(0.35 + rand() * 0.3);
          for (let j = i0; j <= i1; j++) mu[j] = m;
          sand.push([i0, i1, m]);
        }
      }
      const times = pathTimes(pts, 0.4, mu);
      if (!times) return null;
      return { kind: k, color: COLORS[i], pts, times, total: times.at(-1), ...(sand.length ? { sand } : {}) };
    });
    if (tracks.some(t => !t)) continue;
    const order = sortCheck(tracks, 0.06); if (!order) continue;
    if (n >= 3 && tracks[order[0]].kind === 'recta') continue;
    if (format === 'terrenos' && !tracks.some(t => t.sand) ) continue;
    if (format === 'terrenos' && !tracks[order[0]].sand && rand() < 0.5) continue; // a veces gana una con arena
    return { type: 'race', format, A, B, tracks: pack(tracks), order };
  }
  throw new Error('No race for seed ' + seed + ' ' + format);
}

/* ---------- Tipo 3: Equilibrio (balancín) ---------- */
// Barra sin masa apoyada en el centro. Posiciones en unidades de -10 a 10.
export function genBalance(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 5000; a++) {
    const n = level === 1 ? 2 : level === 2 ? 3 : 4;
    const used = new Set(); const weights = [];
    for (let i = 0; i < n; i++) {
      let p, g = 0; do { p = Math.round(rand() * 18 - 9); g++; } while (g < 50 && (Math.abs(p) < 1 || [...used].some(q => Math.abs(q - p) < 3)));
      used.add(p); weights.push({ p, m: 1 + Math.floor(rand() * 5) });
    }
    if (weights.length !== new Set(weights.map(w => w.p)).size || weights.some((w, i) => weights.some((v, j) => i !== j && Math.abs(v.p - w.p) < 3))) continue;
    const M = 2 + Math.floor(rand() * 5);
    const tau = weights.reduce((s, w) => s + w.m * w.p, 0);
    const x = -tau / M;
    if (Math.abs(x) < 2 || Math.abs(x) > 9.5) continue;
    if (weights.every(w => Math.sign(w.p) === Math.sign(x))) continue;      // pesas a ambos lados
    if (level >= 2 && Math.abs(x - Math.round(x)) < 0.15) continue;         // que no sea un número redondo
    if (weights.some(w => Math.abs(w.p - x) < 2.2)) continue;               // que el contrapeso no pise una pesa
    return { type: 'balance', level, weights, M, answer: Math.round(x * 100) / 100 };
  }
  throw new Error('No balance ' + seed);
}

/* ---------- Tipo 4: Carambola (bola de billar con rozamiento) ---------- */
const TABLE = { x0: 40, y0: 96, x1: 360, y1: 516 }, BR = 9, DECEL = 230, E_CUSH = 0.82;
function simulatePool(sx, sy, vx, vy) {
  let x = sx, y = sy, t = 0; const frames = [[r1(x), r1(y)]]; let hits = 0; const hitPts = [];
  const dt = 1 / 600;
  while (t < 8) {
    for (let k = 0; k < 10; k++) {
      const v = Math.hypot(vx, vy);
      if (v < 1) return { x, y, t, frames, hits, hitPts };
      const dv = Math.min(v, DECEL * dt); vx -= vx / v * dv; vy -= vy / v * dv;
      x += vx * dt; y += vy * dt; t += dt;
      if (x < TABLE.x0 + BR) { x = TABLE.x0 + BR; vx = -vx * E_CUSH; hits++; hitPts.push([x, y]); }
      if (x > TABLE.x1 - BR) { x = TABLE.x1 - BR; vx = -vx * E_CUSH; hits++; hitPts.push([x, y]); }
      if (y < TABLE.y0 + BR) { y = TABLE.y0 + BR; vy = -vy * E_CUSH; hits++; hitPts.push([x, y]); }
      if (y > TABLE.y1 - BR) { y = TABLE.y1 - BR; vy = -vy * E_CUSH; hits++; hitPts.push([x, y]); }
    }
    frames.push([r1(x), r1(y)]);
  }
  return null;
}
export function genPool(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 5000; a++) {
    const sx = 90 + rand() * 220, sy = 330 + rand() * 150;
    const ang = rand() * Math.PI * 2, v = 380 + rand() * 300;
    const vx = Math.cos(ang) * v, vy = Math.sin(ang) * v;
    const res = simulatePool(sx, sy, vx, vy);
    if (!res) continue;
    const need = level === 1 ? 1 : 2;
    if (res.hits < need || res.hits > 4) continue;
    const m = 30;                                                     // que pare lejos de las bandas
    if (res.x < TABLE.x0 + m || res.x > TABLE.x1 - m || res.y < TABLE.y0 + m || res.y > TABLE.y1 - m) continue;
    const corners = [[TABLE.x0, TABLE.y0], [TABLE.x1, TABLE.y0], [TABLE.x0, TABLE.y1], [TABLE.x1, TABLE.y1]];
    if (res.hitPts.some(([hx, hy]) => corners.some(([cx, cy]) => Math.hypot(hx - cx, hy - cy) < 45))) continue; // sin esquinas
    if (Math.hypot(res.x - sx, res.y - sy) < 70) continue;            // no obvia
    if (res.t > 4.5) continue;
    return { type: 'pool', level, start: [r1(sx), r1(sy)], v: [r1(vx), r1(vy)], table: TABLE, br: BR,
      stop: [r1(res.x), r1(res.y)], frames: res.frames, hits: res.hits };
  }
  throw new Error('No pool ' + seed);
}

/* ---------- Tipo 5: ¿Aguanta? (torre de bloques sueltos, motor de sólidos rígidos) ---------- */
const TFLOOR = 540, BH = 42;
function simulateTower(blocks, dur = 4) {
  const { Engine, Bodies, Composite } = Matter;
  const engine = Engine.create({ positionIterations: 30, velocityIterations: 20 });
  engine.gravity.y = 1; engine.gravity.scale = 0.00098;
  const floor = Bodies.rectangle(200, TFLOOR + 40, 1200, 80, { isStatic: true, friction: 0.8 });
  const bodies = blocks.map(b => Bodies.rectangle(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h,
    { friction: 0.6, frictionStatic: 1, restitution: 0.05, density: 0.001 * b.d, slop: 0.02 }));
  const walls = [Bodies.rectangle(-22, 300, 60, 900, { isStatic: true, friction: 0.3 }), Bodies.rectangle(422, 300, 60, 900, { isStatic: true, friction: 0.3 })];
  Composite.add(engine.world, [floor, ...walls, ...bodies]);
  const frames = [], touch = blocks.map(() => null);
  const steps = Math.round(dur * 120);
  for (let s = 0; s <= steps; s++) {
    if (s % 2 === 0) frames.push(bodies.map(bd => [r1(bd.position.x), r1(bd.position.y), Math.round(bd.angle * 1000) / 1000]));
    bodies.forEach((bd, i) => { if (i > 0 && touch[i] == null && bd.bounds.max.y >= TFLOOR - 0.8) touch[i] = s / 120; });
    Engine.update(engine, 1000 / 120);
  }
  const moved = bodies.map((bd, i) => Math.hypot(bd.position.x - (blocks[i].x + blocks[i].w / 2), bd.position.y - (blocks[i].y + blocks[i].h / 2)) + Math.abs(bd.angle) * 40);
  return { frames, touch, moved };
}
export function genTower(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 3000; a++) {
    const n = level === 1 ? 5 : 6 + Math.floor(rand() * 2);
    const blocks = []; let cx = 200;
    for (let i = 0; i < n; i++) {
      const w = 70 + Math.round(rand() * 90);
      if (i > 0) { const prev = blocks[i - 1]; cx = prev.x + prev.w / 2 + (rand() - 0.5) * (prev.w * 0.95 + w * 0.3); }
      const heavy = level >= 2 && rand() < 0.3;
      const b = { x: Math.round(cx - w / 2), w, y: TFLOOR - (i + 1) * BH, h: BH, d: heavy ? 3 : 1 };
      if (b.x < 24 || b.x + b.w > 376) break;
      blocks.push(b);
    }
    if (blocks.length !== n) continue;
    if (blocks.some((b, i) => i > 0 && (Math.min(b.x + b.w, blocks[i - 1].x + blocks[i - 1].w) - Math.max(b.x, blocks[i - 1].x)) < 14)) continue;
    // estática: margen del centro de masas en cada apoyo (nada al límite)
    let minMargin = Infinity, unstable = false;
    for (let k = 0; k < n - 1; k++) {
      let m = 0, mx = 0;
      for (let j = k + 1; j < n; j++) { const mm = blocks[j].w * blocks[j].d; m += mm; mx += mm * (blocks[j].x + blocks[j].w / 2); }
      const com = mx / m, L = blocks[k].x, Rr = blocks[k].x + blocks[k].w;
      minMargin = Math.min(minMargin, Math.abs(com - L), Math.abs(com - Rr));
      if (com < L || com > Rr) unstable = true;
    }
    if (minMargin < 8) continue;
    const over = blocks.slice(1).map((b, i) => Math.max(blocks[i].x - b.x, (b.x + b.w) - (blocks[i].x + blocks[i].w)));
    if (Math.max(...over) < 30) continue;
    const wantFall = rand() < 0.7;
    if (wantFall !== unstable) continue;
    const sim = simulateTower(blocks);
    let answer = -1;
    if (!unstable) {
      if (Math.max(...sim.moved) > 3) continue;                        // el motor debe confirmar que aguanta
    } else {
      const hits = sim.touch.map((t, i) => [t, i]).filter(([t]) => t != null).sort((x, y) => x[0] - y[0]);
      if (!hits.length) continue;
      if (hits.length > 1 && hits[1][0] - hits[0][0] < 0.15) continue; // primero claro
      answer = hits[0][1];
      if (answer === n - 1 && rand() < 0.5) continue;                 // que no sea siempre el de arriba
      let robust = true;                                               // pequeños cambios, mismo resultado
      for (const dx of [-1, 1]) {
        const alt = simulateTower(blocks.map((b, i) => i ? { ...b, x: b.x + dx * (i % 2 ? 1 : -1) } : b), 3);
        const h2 = alt.touch.map((t, i) => [t, i]).filter(([t]) => t != null).sort((x, y) => x[0] - y[0]);
        if (!h2.length || h2[0][1] !== answer) { robust = false; break; }
      }
      if (!robust) continue;
    }
    // recortar fotogramas cuando todo se ha quedado quieto
    let end = sim.frames.length - 1;
    while (end > 60 && sim.frames[end].every((f, i) => Math.hypot(f[0] - sim.frames[end - 6][i][0], f[1] - sim.frames[end - 6][i][1]) < 0.3)) end -= 6;
    const frames = unstable ? sim.frames.slice(0, Math.min(sim.frames.length, end + 12)) : null;
    return { type: 'tower', level, blocks, answer, touchTime: answer >= 0 ? r1(sim.touch[answer] * 10) / 10 : null, frames };
  }
  throw new Error('No tower ' + seed);
}

