// Puntuación de Physle. Lo usan el servidor (que es quien puntúa de verdad)
// y el navegador (solo para mostrar los textos del resultado).

// Qué parte de cada ronda puede ver el jugador ANTES de responder.
// Nunca incluye la respuesta ni la trayectoria.
export function publicRound(r) {
  switch (r.type) {
    case 'balance': return { type: r.type, level: r.level, weights: r.weights, M: r.M };
    case 'drop': return { type: r.type, level: r.level, startX: r.startX, startY: r.startY, startVx: r.startVx, planks: r.planks, pegs: r.pegs, frames: [r.frames[0]] };
    case 'race': return { type: r.type, format: r.format, A: r.A, B: r.B, finishX: r.finishX,
      tracks: r.tracks.map(t => ({ kind: t.kind, obj: t.obj, color: t.color, pts: t.pts, sand: t.sand })) };
    case 'pool': return { type: r.type, level: r.level, start: r.start, v: r.v, table: r.table, br: r.br, frames: [r.frames[0]] };
    case 'tower': return { type: r.type, level: r.level, blocks: r.blocks };
    case 'loop': return { type: r.type, level: r.level, R: r.R, cx: r.cx, carpet: r.carpet, carpet2: r.carpet2 };
    case 'laser': return { type: r.type, level: r.level, src: r.src, ang: r.ang, mirrors: r.mirrors };
    case 'domino': return { type: r.type, level: r.level, dominoes: r.dominoes, platform: r.platform };
    case 'float': return { type: r.type, level: r.level, items: r.items, water: r.water, salty: r.salty };
    case 'bridge': return { type: r.type, level: r.level, xa: r.xa, ya: r.ya, xb: r.xb, xc: r.xc, yb: r.yb };
    case 'gears': return { type: r.type, level: r.level, parts: r.parts, links: r.links };
  }
  throw new Error('tipo de ronda desconocido');
}

// Comprueba que la predicción tiene la forma correcta para su ronda.
export function validPrediction(r, p, W = 400) {
  const num = (x) => typeof x === 'number' && Number.isFinite(x);
  switch (r.type) {
    case 'balance': return num(p) && Math.abs(p) <= 10.5;
    case 'drop': return num(p) && p >= 0 && p <= W;
    case 'pool': return Array.isArray(p) && p.length === 2 && p.every(num);
    case 'tower': return Number.isInteger(p) && (p === -1 || (p >= 1 && p < r.blocks.length));
    case 'loop': return num(p) && p >= 0 && p <= 400;
    case 'laser': return Array.isArray(p) && p.length === 2 && p.every(num);
    case 'domino': return Number.isInteger(p) && p >= 0 && p < r.dominoes.length;
    case 'float': return Array.isArray(p) && p.length <= r.items.length && new Set(p).size === p.length && p.every(i => Number.isInteger(i) && i >= 0 && i < r.items.length);
    case 'gears': return Number.isInteger(p) && p >= 0 && p <= 3;
    case 'bridge': return num(p) && p >= 0 && p <= 600;
    case 'race': {
      const n = r.tracks.length;
      return Array.isArray(p) && p.length === n && new Set(p).size === n && p.every(i => Number.isInteger(i) && i >= 0 && i < n);
    }
  }
  return false;
}

// Puntos de 0 a 100 de una predicción frente a la ronda completa.
export function scorePoints(r, p) {
  switch (r.type) {
    case 'drop': {
      const err = Math.abs(p / 4 - r.impactX / 4);
      return err <= 2 ? 100 : Math.round(100 * Math.exp(-(err - 2) / 20));
    }
    case 'balance': {
      const err = Math.abs(p - r.answer);
      return err <= 0.3 ? 100 : Math.round(100 * Math.exp(-(err - 0.3) / 3.2));
    }
    case 'pool': {
      const dcm = Math.hypot(p[0] - r.stop[0], p[1] - r.stop[1]) / 2;
      return dcm <= 5 ? 100 : Math.round(100 * Math.exp(-(dcm - 5) / 35));
    }
    case 'race': {
      const n = r.tracks.length, win = p[0] === r.order[0];
      let rest = 0; for (let i = 1; i < n; i++) if (p[i] === r.order[i]) rest++;
      const pts = Math.round((win ? 70 : 0) + 30 * rest / (n - 1));
      return win ? pts : Math.min(pts, 30);
    }
    case 'tower': {
      if (p === r.answer) return 100;
      return r.answer >= 1 && p >= 1 ? 25 : 0;
    }
    case 'loop': {
      const err = Math.abs(p - r.answer) / 2;                     // cm (2 px = 1 cm)
      return err <= 2 ? 100 : Math.round(100 * Math.exp(-(err - 2) / 8));
    }
    case 'laser': {
      let d = Math.abs(perimPos(p, r.room) - perimPos(r.end, r.room));
      d = Math.min(d, perimLen(r.room) - d);
      return d <= 6 ? 100 : Math.round(100 * Math.exp(-(d - 6) / 40));
    }
    case 'domino': return [100, 45, 15][Math.abs(p - r.answer)] ?? 0;
    case 'bridge': {
      if (p >= r.lo && p <= r.hi) {                                // llega: 50–100 según lo cerca del centro
        const off = Math.abs(p - r.answer), half = Math.max(r.answer - r.lo, r.hi - r.answer);
        return off <= 4 ? 100 : Math.max(50, Math.round(100 - 50 * (off - 4) / Math.max(1, half - 4)));
      }
      const miss = p < r.lo ? r.lo - p : p - r.hi;               // se cae: hasta 30 si ha sido por poco
      return Math.round(30 * Math.exp(-miss / 30));
    }
    case 'float': {
      const right = r.items.filter((_, i) => p.includes(i) === r.answer.includes(i)).length;
      return Math.round(100 * (right / r.items.length) ** 2);
    }
    case 'gears': {
      const dir = p < 2 ? 1 : -1, faster = p % 2 === 0;
      const ok = (dir === r.answer.dir ? 1 : 0) + (faster === r.answer.faster ? 1 : 0);
      return [0, 40, 100][ok];
    }
  }
  return 0;
}

// Laser: posición de un punto a lo largo del borde de la sala (para medir distancias
// por el borde, aunque el rayo y tu marca queden a ambos lados de una esquina).
export const ROOM = { x0: 24, y0: 76, x1: 376, y1: 536 };
export function perimLen(room = ROOM) { return 2 * (room.x1 - room.x0) + 2 * (room.y1 - room.y0); }
export function perimPos([x, y], room = ROOM) {
  const { x0, y0, x1, y1 } = room, w = x1 - x0, h = y1 - y0;
  const d = [Math.abs(y - y0), Math.abs(x - x1), Math.abs(y - y1), Math.abs(x - x0)], s = d.indexOf(Math.min(...d));
  return s === 0 ? x - x0 : s === 1 ? w + (y - y0) : s === 2 ? w + h + (x1 - x) : 2 * w + h + (y1 - y);
}
// Gears: las cuatro respuestas posibles, en orden.
export const GEAR_CHOICES = [[1, true], [1, false], [-1, true], [-1, false]];
