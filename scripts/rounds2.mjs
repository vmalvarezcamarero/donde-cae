// Los cinco experimentos nuevos: Loop, Laser, Dominó, Float y Gears.
// Igual que en rounds.mjs: cada función crea una ronda a partir de una semilla
// y guarda la respuesta. El navegador solo ve la escena hasta que responde.
import { mulberry32 } from './rounds.mjs';

const r1 = (x) => Math.round(x * 10) / 10;
const r3 = (x) => Math.round(x * 1000) / 1000;

/* ---------- Loop: ¿desde qué altura completa el rizo? ----------
   Canica maciza que rueda sin deslizar: energía cinética = 7/10·m·v².
   En lo alto del rizo necesita v² ≥ g·ρ (ρ = radio por el que pasa su centro).
   Altura mínima del centro: h = 2ρ + 0,7ρ + pérdidas = 2,7ρ + μ·L (alfombra). */
export const LOOP = { floorY: 470, rampX0: 34, rampX1: 150, topY: 92, ball: 9 };
export function genLoop(seed, level) {
  const rand = mulberry32(seed);
  const R = Math.round(level === 1 ? 70 + rand() * 20 : 60 + rand() * 36);   // radio del rizo (pista)
  const cx = Math.round(300 - (R - 60) * 0.4);
  const rho = R - LOOP.ball;
  let carpet = null;
  if (level >= 2) {
    const len = Math.round(40 + rand() * 40), mu = Math.round((level === 3 ? 0.15 + rand() * 0.2 : 0.08 + rand() * 0.12) * 100) / 100;
    const x0 = Math.round(LOOP.rampX1 + 8 + rand() * Math.max(4, cx - LOOP.rampX1 - 30 - len));
    carpet = { x0, x1: x0 + len, mu };
  }
  const answer = 2.7 * rho + (carpet ? carpet.mu * (carpet.x1 - carpet.x0) : 0);   // en px (1 px = 1 cm)
  return { type: 'loop', level, R, cx, carpet, answer: r1(answer) };
}

/* ---------- Laser: ¿dónde acaba el rayo? ---------- */
export const ROOM = { x0: 24, y0: 76, x1: 376, y1: 536 };
function hitSeg(px, py, dx, dy, m) {
  // rayo p + t·d contra el segmento m (a→b). Devuelve t y u (posición en el espejo).
  const ex = m.x2 - m.x1, ey = m.y2 - m.y1, den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((m.x1 - px) * ey - (m.y1 - py) * ex) / den;
  const u = ((m.x1 - px) * dy - (m.y1 - py) * dx) / den;
  if (t <= 1e-6 || u < 0 || u > 1) return null;
  return { t, u };
}
export function tracePath(r) {
  let px = r.src[0], py = r.src[1], dx = Math.cos(r.ang), dy = Math.sin(r.ang);
  const pts = [[px, py]], hits = [];
  for (let k = 0; k < 14; k++) {
    let best = null;
    r.mirrors.forEach((m, i) => { const h = hitSeg(px, py, dx, dy, m); if (h && (!best || h.t < best.t)) best = { ...h, i }; });
    const { x0, y0, x1, y1 } = ROOM;
    const tw = Math.min(dx > 0 ? (x1 - px) / dx : dx < 0 ? (x0 - px) / dx : Infinity, dy > 0 ? (y1 - py) / dy : dy < 0 ? (y0 - py) / dy : Infinity);
    if (!best || best.t > tw) { px += dx * tw; py += dy * tw; pts.push([px, py]); return { pts, hits, end: [px, py], closed: true }; }
    px += dx * best.t; py += dy * best.t; pts.push([px, py]);
    const m = r.mirrors[best.i];
    if (m.kind === 'block') return { pts, hits: [...hits, { i: best.i, u: best.u }], end: [px, py], blocked: true };
    hits.push({ i: best.i, u: best.u });
    let nx = -(m.y2 - m.y1), ny = m.x2 - m.x1; const L = Math.hypot(nx, ny); nx /= L; ny /= L;
    const d = dx * nx + dy * ny; dx -= 2 * d * nx; dy -= 2 * d * ny;
  }
  return { pts, hits, end: [px, py], loop: true };
}
// Posición a lo largo del borde de la sala (para medir distancias aunque doble una esquina)
export function perim([x, y]) {
  const { x0, y0, x1, y1 } = ROOM, w = x1 - x0, h = y1 - y0;
  const d = [Math.abs(y - y0), Math.abs(x - x1), Math.abs(y - y1), Math.abs(x - x0)], s = d.indexOf(Math.min(...d));
  return s === 0 ? x - x0 : s === 1 ? w + (y - y0) : s === 2 ? w + h + (x1 - x) : 2 * w + h + (y1 - y);
}
export const PERIM = 2 * (ROOM.x1 - ROOM.x0) + 2 * (ROOM.y1 - ROOM.y0);
export function genLaser(seed, level) {
  const rand = mulberry32(seed);
  const want = level === 1 ? 2 : level === 2 ? 3 : 4;
  const step = level === 1 ? Math.PI / 4 : Math.PI / 12;
  for (let a = 0; a < 20000; a++) {
    const side = rand() < 0.5 ? 0 : 1;                      // emisor a la izquierda o abajo
    const src = side === 0 ? [ROOM.x0 + 2, Math.round(140 + rand() * 330)] : [Math.round(70 + rand() * 260), ROOM.y1 - 2];
    const base = side === 0 ? 0 : -Math.PI / 2;
    const ang = level === 1 ? base : base + Math.round(((rand() - 0.5) * 1.4) / step) * step;
    const n = want + (level === 1 ? 1 : 1 + Math.floor(rand() * 2));
    const mirrors = [];
    for (let i = 0; i < n + 10 && mirrors.length < n; i++) {
      const cx = 70 + rand() * 260, cy = 120 + rand() * 370, len = 46 + rand() * 40;
      const th = Math.round((rand() * Math.PI) / step) * step;
      const m = { x1: r1(cx - Math.cos(th) * len / 2), y1: r1(cy - Math.sin(th) * len / 2), x2: r1(cx + Math.cos(th) * len / 2), y2: r1(cy + Math.sin(th) * len / 2), kind: 'mirror' };
      if (mirrors.some(o => Math.hypot((o.x1 + o.x2) / 2 - cx, (o.y1 + o.y2) / 2 - cy) < 70)) continue;
      if (Math.hypot(cx - src[0], cy - src[1]) < 60) continue;
      mirrors.push(m);
    }
    if (mirrors.length < n) continue;
    if (level === 3 && rand() < 0.7) {                         // un bloque opaco que no toca el rayo
      const cx = 80 + rand() * 240, cy = 140 + rand() * 340;
      mirrors.push({ x1: r1(cx - 22), y1: r1(cy), x2: r1(cx + 22), y2: r1(cy), kind: 'block' });
    }
    const r = { src, ang, mirrors };
    const p = tracePath(r);
    if (!p.closed || p.hits.length !== want) continue;
    if (new Set(p.hits.map(h => h.i)).size < want) continue;   // cada rebote en un espejo distinto
    if (p.hits.some(h => h.u < 0.08 || h.u > 0.92)) continue;     // nada de rozar los bordes
    const [ex, ey] = p.end;
    const corner = Math.min(...[[ROOM.x0, ROOM.y0], [ROOM.x1, ROOM.y0], [ROOM.x1, ROOM.y1], [ROOM.x0, ROOM.y1]].map(([x, y]) => Math.hypot(ex - x, ey - y)));
    if (corner < 40) continue;
    if (Math.hypot(ex - src[0], ey - src[1]) < 60) continue;
    // que los espejos que no se usan no estén pegados al rayo (para que no parezca un roce)
    let near = false;
    mirrors.forEach((m, i) => {
      if (p.hits.some(h => h.i === i)) return;
      for (let k = 1; k < p.pts.length && !near; k++) {
        for (const [x, y] of [[m.x1, m.y1], [m.x2, m.y2], [(m.x1 + m.x2) / 2, (m.y1 + m.y2) / 2]]) {
          const [ax, ay] = p.pts[k - 1], [bx, by] = p.pts[k], vx = bx - ax, vy = by - ay;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
          if (Math.hypot(x - ax - vx * t, y - ay - vy * t) < 10) near = true;
        }
      }
    });
    if (near) continue;
    let len = 0; for (let k = 1; k < p.pts.length; k++) len += Math.hypot(p.pts[k][0] - p.pts[k - 1][0], p.pts[k][1] - p.pts[k - 1][1]);
    return { type: 'laser', level, src, ang: r3(ang), mirrors, path: p.pts.map(([x, y]) => [r1(x), r1(y)]), end: [r1(ex), r1(ey)], len: Math.round(len) };
  }
  throw new Error('No laser ' + seed);
}

/* ---------- Dominó: ¿cuál es la última ficha que cae? ----------
   Modelo propio (los motores de física genéricos no transmiten bien el golpe):
   cada ficha gira sobre su esquina delantera inferior como un sólido rígido
   (I = m·(h²+w²)/3). Cuando su esquina superior toca la siguiente, le pasa un
   impulso (una parte de su cantidad de movimiento) y se queda apoyada en ella.
   La siguiente cae si ese impulso le basta para pasar su punto de equilibrio. */
export const DOMINO = { floorY: 470, K: 0.85, maxX: 284 };   // la escena se dibuja ampliada ×1,35
export function simulateDominoes(ds, push = 3.2, dur = 7, fps = 240) {
  const g = 980, n = ds.length;
  const st = ds.map(d => ({ th: 0, om: 0, mode: 'stand', on: -1, thc: 0 }));
  st[0].om = push; st[0].mode = 'fall';
  const mass = ds.map(d => d.w * d.h * d.d), I = ds.map((d, i) => mass[i] * (d.h * d.h + d.w * d.w) / 3);
  const tip = ds.map(d => Math.atan2(d.w, d.h));
  const frames = [], fell = ds.map(() => null), dt = 1 / fps;
  for (let s = 0; s <= dur * fps; s++) {
    if (s % (fps / 60) === 0) frames.push(st.map(q => r3(q.th)));
    for (let i = 0; i < n; i++) {
      const q = st[i], d = ds[i];
      if (q.mode !== 'fall') continue;
      const acc = g * (d.h / 2 * Math.sin(q.th) - d.w / 2 * Math.cos(q.th)) / ((d.h * d.h + d.w * d.w) / 3);
      q.om += acc * dt; q.th += q.om * dt;
      if (q.th <= 0) { q.th = 0; q.om = 0; q.mode = 'stand'; continue; }
      if (fell[i] == null && q.th > tip[i] + 0.02) fell[i] = s * dt;
      if (q.th >= Math.PI / 2) { q.th = Math.PI / 2; q.om = 0; q.mode = 'down'; continue; }
      // ¿toca la siguiente?
      const j = i + 1;
      if (j < n && st[j].mode === 'stand' && q.om > 0) {
        const nx = ds[j], px = d.x + d.w / 2;
        const cx = px + d.h * Math.sin(q.th), cy = d.h * Math.cos(q.th) + (DOMINO.floorY - d.base);   // altura de la esquina sobre el suelo
        const face = nx.x - nx.w / 2, jBase = DOMINO.floorY - nx.base;
        if (cx >= face) {
          if (cy < jBase) { q.mode = 'stuck'; q.om = 0; continue; }           // choca contra el escalón
          const yc = Math.min(nx.h, cy - jBase);
          const J = DOMINO.K * mass[i] * q.om * d.h;
          st[j].om = J * yc / I[j]; st[j].mode = 'fall';
          q.mode = 'lean'; q.on = j; q.thc = q.th; q.om = 0;
        }
      }
    }
    // las que están apoyadas siguen a la que tienen delante: su esquina superior
    // se queda tocando la cara trasera de la siguiente mientras esta cae
    for (let i = n - 1; i >= 0; i--) {
      const q = st[i]; if (q.mode !== 'lean') continue;
      q.th = Math.max(q.th, leanAngle(ds[i], ds[q.on], st[q.on].th, q.thc));
    }
  }
  const stand = st.map((q, i) => fell[i] == null);
  return { frames, fell, stand };
}
// Ángulo al que la ficha d (apoyada) toca la cara trasera de la ficha e inclinada un ángulo te.
function leanAngle(d, e, te, from) {
  const px = d.x + d.w / 2, py = d.base, ex = e.x + e.w / 2, ey = e.base;
  // cara trasera de e: de (−w,0) a (−w,−h) en sus coordenadas, girada te sobre su esquina
  const c = Math.cos(te), s = Math.sin(te);
  const ax = ex + (-e.w) * c, ay = ey + (-e.w) * s;                       // pie de la cara trasera
  const bx = ex + (-e.w) * c - (-e.h) * s, by = ey + (-e.w) * s + (-e.h) * c;   // tope de la cara trasera
  const side = (th) => { const cx = px + d.h * Math.sin(th), cy = py - d.h * Math.cos(th); return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax); };
  const s0 = side(from); let lo = from, hi = Math.PI / 2;
  if (Math.sign(side(hi)) === Math.sign(s0)) return from;                   // no llega a tocarla: se queda como estaba
  for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (Math.sign(side(m)) === Math.sign(s0)) lo = m; else hi = m; }
  return lo;
}
export function genDomino(seed, level) {
  const rand = mulberry32(seed);
  const wantAll = rand() < 0.2;   // a veces caen todas (decidido antes, para no sesgar)
  for (let a = 0; a < 4000; a++) {
    const n = level === 1 ? 7 + Math.floor(rand() * 2) : 8 + Math.floor(rand() * 3);
    const ds = []; let x = 22;
    const platform = level >= 2 && rand() < 0.5 ? { from: 2 + Math.floor(rand() * (n - 5)), len: 2 + Math.floor(rand() * 3), up: Math.round(16 + rand() * 24) } : null;
    for (let i = 0; i < n; i++) {
      const h = Math.round(level === 1 ? 46 + rand() * 18 : 30 + rand() * 46);
      const w = Math.round(Math.max(6, h * (0.15 + rand() * 0.07)));
      const heavy = level === 3 && i > 0 && rand() < 0.22 ? 3 : 1;
      const base = platform && i >= platform.from && i < platform.from + platform.len ? DOMINO.floorY - platform.up : DOMINO.floorY;
      if (i > 0) {
        const prev = ds[i - 1];
        const reach = prev.h * (level === 1 ? 0.5 + rand() * 0.65 : 0.4 + rand() * 0.8);
        x += Math.max(prev.w / 2 + w / 2 + 4, reach);
      }
      ds.push({ x: Math.round(x), w, h, d: heavy, base });
    }
    if (ds.at(-1).x > DOMINO.maxX) continue;
    if (platform) ds.platform = platform;
    const sim = simulateDominoes(ds);
    let last = -1; for (let i = 0; i < n; i++) { if (sim.fell[i] != null) last = i; else break; }
    if (last < 1) continue;
    if (wantAll !== (last === n - 1)) continue;
    if (!wantAll && last < 3) continue;
    // robustez: con un empujón algo distinto o fichas movidas 1 px, mismo resultado
    let robust = true;
    for (const [dx, pf] of [[-1, 0.9], [1, 1.1]]) {
      const alt = simulateDominoes(ds.map((d, i) => i ? { ...d, x: d.x + dx * (i % 2 ? 1 : -1) } : d), 3.2 * pf, 6);
      let l2 = -1; for (let i = 0; i < n; i++) { if (alt.fell[i] != null) l2 = i; else break; }
      if (l2 !== last) { robust = false; break; }
    }
    if (!robust) continue;
    const tEnd = Math.min(7, (sim.fell[last] || 0) + 1.4);
    const frames = sim.frames.slice(0, Math.round(tEnd * 60));
    return { type: 'domino', level, dominoes: ds, platform, answer: last, frames };
  }
  throw new Error('No domino ' + seed);
}

/* ---------- Float: ¿flota o se hunde? ----------
   Densidades medias reales (g/cm³). Agua dulce 1,00; agua muy salada 1,20. */
export const FLOAT_ITEMS = {
  apple: { name: 'Apple', d: 0.8 }, egg: { name: 'Egg', d: 1.03 }, ice: { name: 'Ice cube', d: 0.92 },
  golf: { name: 'Golf ball', d: 1.13 }, pingpong: { name: 'Ping-pong ball', d: 0.08 }, cork: { name: 'Cork', d: 0.24 },
  lemon: { name: 'Lemon', d: 0.92 }, lime: { name: 'Lime', d: 1.04 }, potato: { name: 'Potato', d: 1.08 },
  cola: { name: 'Cola can', d: 1.04 }, diet: { name: 'Diet cola can', d: 0.99 }, candle: { name: 'Candle', d: 0.9 },
  pine: { name: 'Pine block', d: 0.5 }, ebony: { name: 'Ebony block', d: 1.2 }, coin: { name: 'Coin', d: 8.9 },
  grape: { name: 'Grape', d: 1.07 }, orange: { name: 'Orange', d: 0.85 }, peeled: { name: 'Peeled orange', d: 1.05 },
  eraser: { name: 'Eraser', d: 1.3 }, cap: { name: 'Bottle cap', d: 0.9 },
};
const FLOAT_POOLS = {
  1: ['apple', 'pingpong', 'cork', 'coin', 'golf', 'ice', 'pine', 'eraser', 'candle', 'potato'],
  2: ['apple', 'egg', 'ice', 'golf', 'lemon', 'lime', 'cola', 'diet', 'candle', 'ebony', 'grape', 'orange', 'peeled', 'potato', 'cap', 'pine'],
  3: ['egg', 'lemon', 'lime', 'cola', 'diet', 'ebony', 'grape', 'orange', 'peeled', 'potato', 'golf', 'eraser', 'candle', 'apple'],
};
export function genFloat(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 500; a++) {
    const n = level === 1 ? 5 : 6;
    const pool = FLOAT_POOLS[level].slice(), items = [];
    while (items.length < n) items.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
    const salty = level === 3 && rand() < 0.5;
    const water = salty ? 1.2 : 1.0;
    const floats = items.map(k => FLOAT_ITEMS[k].d < water);
    const nf = floats.filter(Boolean).length;
    if (nf < 2 || nf > n - 2) continue;
    if (level >= 2 && items.filter(k => Math.abs(FLOAT_ITEMS[k].d - water) < 0.1).length < 2) continue;   // algo de sorpresa
    return { type: 'float', level, items, water, salty, dens: items.map(k => FLOAT_ITEMS[k].d), answer: floats.map((f, i) => f ? i : -1).filter(i => i >= 0) };
  }
  throw new Error('No float ' + seed);
}

/* ---------- Gears: ¿hacia dónde gira el último, y más rápido o más lento? ---------- */
const MOD = 2.3;   // radio por diente (px)
export function gearSpeeds(parts, links) {
  const w = parts.map(() => null); w[0] = 1;                  // + = sentido horario
  for (let it = 0; it < parts.length; it++) for (const l of links) {
    const [i, j] = [l.a, l.b];
    for (const [p, q] of [[i, j], [j, i]]) {
      if (w[p] == null || w[q] != null) continue;
      if (l.kind === 'axle') w[q] = w[p];
      else if (l.kind === 'mesh') w[q] = -w[p] * parts[p].t / parts[q].t;
      else w[q] = (l.crossed ? -1 : 1) * w[p] * parts[p].r / parts[q].r;
    }
  }
  return w;
}
export function genGears(seed, level) {
  const rand = mulberry32(seed);
  const overlaps = (parts, c) => parts.some(p => p !== c.axleOf && Math.hypot(p.x - c.x, p.y - c.y) < p.r + c.r + 8 && !c.meshWith?.includes(p));
  for (let a = 0; a < 20000; a++) {
    const parts = [], links = [];
    const t0 = 10 + Math.floor(rand() * 14);
    parts.push({ x: 70 + Math.round(rand() * 40), y: 150 + Math.round(rand() * 60), t: t0, r: r1(t0 * MOD), kind: 'gear' });
    const n = level === 1 ? 3 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 2);
    let usedBelt = false, usedAxle = false, ok = true;
    for (let k = 1; k < n && ok; k++) {
      const prev = parts[parts.length - 1];
      const roll = rand();
      let placed = false;
      for (let tries = 0; tries < 40 && !placed; tries++) {
        if (level >= 2 && !usedBelt && roll < 0.35 && k > 1) {
          // correa: polea en el eje del anterior → polea lejos
          const ang = (rand() * 1.6 - 0.3) * Math.PI / 2, dist = 120 + rand() * 60;
          const r = 18 + Math.round(rand() * 22);
          const c = { x: Math.round(prev.x + Math.cos(ang) * dist), y: Math.round(prev.y + Math.sin(ang) * dist), r, kind: 'pulley' };
          if (c.x < 30 + r || c.x > 370 - r || c.y < 110 + r || c.y > 510 - r || overlaps(parts, c)) continue;
          const src = { x: prev.x, y: prev.y, r: Math.min(prev.r * 0.6, 26), kind: 'pulley', on: parts.length - 1 };
          parts.push(src); links.push({ a: parts.length - 2, b: parts.length - 1, kind: 'axle' });
          parts.push(c); links.push({ a: parts.length - 2, b: parts.length - 1, kind: 'belt', crossed: rand() < 0.5 });
          const t = 9 + Math.floor(rand() * 10);
          // engranaje pegado a la polea final (mismo eje) para seguir la cadena
          parts.push({ x: c.x, y: c.y, t, r: r1(t * MOD), kind: 'gear', front: true }); links.push({ a: parts.length - 2, b: parts.length - 1, kind: 'axle' });
          usedBelt = true; placed = true;
        } else if (level === 3 && !usedAxle && roll > 0.65 && prev.kind === 'gear') {
          // engranaje doble: uno pequeño encima del grande, en el mismo eje
          const t = Math.max(8, Math.round(prev.t * (0.4 + rand() * 0.25)));
          parts.push({ x: prev.x, y: prev.y, t, r: r1(t * MOD), kind: 'gear', front: true }); links.push({ a: parts.length - 2, b: parts.length - 1, kind: 'axle' });
          usedAxle = true; placed = true; k--;
        } else {
          const t = 8 + Math.floor(rand() * 18), r = r1(t * MOD);
          const ang = (rand() * 1.5 - 0.35) * Math.PI / 2, dist = prev.r + r - MOD * 0.6;
          const c = { x: r1(prev.x + Math.cos(ang) * dist), y: r1(prev.y + Math.sin(ang) * dist), t, r, kind: 'gear', meshWith: [prev] };
          if (c.x < 24 + r || c.x > 376 - r || c.y < 100 + r || c.y > 520 - r) continue;
          if (parts.some(p => p !== prev && !(p.x === prev.x && p.y === prev.y) && Math.hypot(p.x - c.x, p.y - c.y) < p.r + c.r + 6)) continue;
          delete c.meshWith;
          parts.push(c); links.push({ a: parts.length - 2, b: parts.length - 1, kind: 'mesh' });
          placed = true;
        }
      }
      if (!placed) ok = false;
    }
    if (!ok) continue;
    if (level >= 2 && !usedBelt) continue;
    if (level === 3 && !usedAxle) continue;
    const w = gearSpeeds(parts, links);
    const last = parts.length - 1, ratio = Math.abs(w[last]);
    if (parts[last].kind !== 'gear') continue;
    if (Math.abs(ratio - 1) < 0.2) continue;
    // la respuesta: sentido (1 horario, -1 antihorario) y si va más rápido que el primero
    const answer = { dir: Math.sign(w[last]), faster: ratio > 1 };
    return { type: 'gears', level, parts: parts.map(({ meshWith, ...p }) => p), links, w: w.map(r3), answer };
  }
  throw new Error('No gears ' + seed);
}
