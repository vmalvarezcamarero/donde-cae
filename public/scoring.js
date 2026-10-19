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
  }
  return 0;
}
