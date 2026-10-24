// Dos experimentos que sustituyen a Orbit y Pour: Marble run (palancas) y Bike jump.
import { mulberry32 } from './rounds.mjs';

const r1 = (x) => Math.round(x * 10) / 10;
const G = 980;

/* ---------- Marble run: ¿en qué cubo cae la canica nº N? ----------
   Tablero en triángulo: la fila k tiene k+1 piezas. Desde la pieza (k, j) la canica
   baja a (k+1, j) si va a la izquierda o a (k+1, j+1) si va a la derecha.
   Palanca amarilla ('f'): manda la canica hacia donde apunta y después se gira.
   Rampa gris ('r'): siempre manda hacia el mismo lado. */
export function simulateFlip(rows, n) {
  const st = rows.map(row => row.map(p => p.d)), paths = [];
  for (let m = 0; m < n; m++) {
    let j = 0; const path = [0];
    for (let k = 0; k < rows.length; k++) {
      const d = st[k][j];
      if (rows[k][j].t === 'f') st[k][j] = -d;
      if (d > 0) j++;
      path.push(j);
    }
    paths.push(path);
  }
  return paths;                                    // paths[m][k] = columna en la fila k; la última es el cubo
}
export function genFlip(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 5000; a++) {
    const D = level === 1 ? 2 : level === 2 ? 3 : (rand() < 0.5 ? 3 : 4);
    const n = level === 1 ? 2 + Math.floor(rand() * 2) : level === 2 ? 3 + Math.floor(rand() * 2) : 4 + Math.floor(rand() * 2);
    const rows = [];
    for (let k = 0; k < D; k++) { const row = []; for (let j = 0; j <= k; j++) row.push({ t: 'f', d: rand() < 0.5 ? -1 : 1 }); rows.push(row); }
    const ramps = level === 1 ? 0 : level === 2 ? Math.floor(rand() * 2) : 1 + Math.floor(rand() * 2);
    for (let q = 0; q < ramps; q++) { const k = 1 + Math.floor(rand() * (D - 1)), j = Math.floor(rand() * (k + 1)); rows[k][j].t = 'r'; }
    const paths = simulateFlip(rows, n), cup = paths[n - 1][D];
    // que no valga con seguir la primera canica ni con ignorar las palancas
    if (paths[0][D] === cup && rand() < 0.8) continue;
    if (level >= 2 && paths[n - 2][D] === cup && rand() < 0.5) continue;
    // que se usen las palancas: al menos una pieza visitada que no sea la de arriba
    const used = new Set(paths.flatMap(p => p.slice(1, D).map((j, k) => (k + 1) + ':' + j)));
    if (used.size < Math.min(D, 3)) continue;
    return { type: 'flip', level, rows, n, answer: cup, paths };
  }
  throw new Error('No flip ' + seed);
}

/* ---------- Bike jump: ¿en qué autobús aterriza? ----------
   La moto sale de la rampa a cierta velocidad. Se ve un salto de prueba a otra velocidad.
   Si el doble de velocidad, el salto llega cuatro veces más lejos (alcance ∝ v²). */
export const JUMP = { ground: 520, roof: 476, lx: 96, bus0: 112, busW: 38, gap: 4, nBus: 6, land0: 364, kpx: 6.4 };
export const busSpan = (i) => [JUMP.bus0 + i * (JUMP.busW + JUMP.gap), JUMP.bus0 + i * (JUMP.busW + JUMP.gap) + JUMP.busW];
export function jumpLand(lipY, ang, kmh) {
  const v = kmh * JUMP.kpx, vx = v * Math.cos(ang), vy = -v * Math.sin(ang), h = JUMP.roof - lipY;
  // y(t) = lipY + vy t + G t²/2 = roof  →  t > 0 bajando
  const t = (-vy + Math.sqrt(vy * vy + 2 * G * h)) / G;
  return { x: JUMP.lx + vx * t, t, vx, vy };
}
export function jumpSlot(x, margin = 0) {
  for (let i = 0; i < JUMP.nBus; i++) { const [a, b] = busSpan(i); if (x >= a + margin && x <= b - margin) return i; }
  if (x >= JUMP.land0 + margin && x <= 396 - margin) return JUMP.nBus;
  return -1;
}
export function genJump(seed, level) {
  const rand = mulberry32(seed);
  for (let a = 0; a < 20000; a++) {
    const deg = level === 1 ? 25 : 20 + Math.round(rand() * 15), ang = deg * Math.PI / 180;
    const lipY = level === 3 ? JUMP.roof - 20 - Math.round(rand() * 50) : JUMP.roof;
    const test = 25 + Math.round(rand() * 14) * 5;
    let kmh;
    if (level === 1) kmh = Math.round(test * [0.5, 1.5, 2][Math.floor(rand() * 3)]);
    else kmh = 25 + Math.round(rand() * 17) * 5;
    if (Math.abs(kmh - test) / test < 0.25) continue;
    const T = jumpLand(lipY, ang, test), A = jumpLand(lipY, ang, kmh);
    const ts = jumpSlot(T.x, 7), ans = jumpSlot(A.x, 7);
    if (ts < 0 || ts >= JUMP.nBus || ans < 0) continue;
    if (ts === ans) continue;
    // la trampa: pensar que el doble de velocidad da el doble de distancia
    const lin = jumpSlot(JUMP.lx + (T.x - JUMP.lx) * kmh / test, 0);
    if (lin === ans && rand() < 0.85) continue;
    if (level === 1 && ans === JUMP.nBus && rand() < 0.6) continue;
    // fotogramas: aproximación, vuelo a cámara lenta y frenada
    const frames = [], hw = Math.min(JUMP.roof + 44 - lipY, 36), footX = JUMP.lx - hw / Math.tan(ang), baseY = lipY + hw;
    for (let k = 0; k <= 30; k++) {
      const s = k / 30, flatEnd = 0.45;
      if (s < flatEnd) frames.push([r1(-30 + (footX + 30) * s / flatEnd), baseY, 0]);
      else { const u = (s - flatEnd) / (1 - flatEnd); frames.push([r1(footX + (JUMP.lx - footX) * u), r1(baseY - hw * u), -Math.round(ang * 100) / 100]); }
    }
    const NF = 80;
    for (let k = 1; k <= NF; k++) { const t = A.t * k / NF, x = JUMP.lx + A.vx * t, vyt = A.vy + G * t, y = lipY + A.vy * t + G * t * t / 2; frames.push([r1(x), r1(y), Math.round(Math.atan2(vyt, A.vx) * 100) / 100]); }
    for (let k = 1; k <= 24; k++) {
      const e = 1 - (1 - k / 24) ** 2, x = A.x + 22 * e;
      const y = x > JUMP.land0 ? JUMP.roof + (x - JUMP.land0) * 0.9 : JUMP.roof;
      frames.push([r1(Math.min(x, 398)), r1(Math.min(y, JUMP.ground)), x > JUMP.land0 ? 0.73 : 0]);
    }
    return { type: 'jump', level, lipY, ang: Math.round(ang * 1000) / 1000, deg, kmh, test, testX: r1(T.x), testSlot: ts, landX: r1(A.x), answer: ans, frames };
  }
  throw new Error('No jump ' + seed);
}
