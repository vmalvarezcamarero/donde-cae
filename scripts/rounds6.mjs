// «Half & Half»: un objeto asimétrico encima de una tabla de cortar. ¿Por dónde lo cortas para que
// las dos mitades pesen lo mismo? (No es el punto de equilibrio: es donde queda la mitad de la masa a cada lado).
// Las piezas son redondas (la masa de un trozo va con el grosor al cuadrado) salvo bloques y discos planos.
import { mulberry32 } from './rounds.mjs';

export const CUT = { y: 196, x0: 42, x1: 358 };
// densidades relativas (g/cm³) y colores
export const MATS = {
  fruit: { name: 'banana', rho: 0.95 }, carrot: { name: 'carrot', rho: 1.0 }, wood: { name: 'wood', rho: 0.7 },
  steel: { name: 'steel', rho: 7.8 }, rubber: { name: 'rubber', rho: 1.2 }, wafer: { name: 'wafer cone', rho: 0.15 },
  icecream: { name: 'ice cream', rho: 0.6 }, candy: { name: 'candy', rho: 1.5 }, paper: { name: 'paper stick', rho: 0.45 },
  meat: { name: 'meat', rho: 1.05 }, pepper: { name: 'pepper', rho: 0.45 }, onion: { name: 'onion', rho: 0.9 },
  tomato: { name: 'tomato', rho: 0.95 }, plastic: { name: 'plastic', rho: 1.2 }, graphite: { name: 'graphite', rho: 1.6 },
  bristle: { name: 'bristles', rho: 0.1 }, pinwood: { name: 'maple', rho: 0.7 },
};
// gramos reales aproximados del objeto entero (para enseñar los pesos al final)
const GRAMS = { banana: 130, carrot: 95, bat: 900, pin: 1500, screwdriver: 140, broom: 650, lollipop: 45, kebab: 230, golf: 420 };
export const ITEM_NAME = { banana: 'banana', carrot: 'carrot', bat: 'baseball bat', pin: 'bowling pin', screwdriver: 'screwdriver', broom: 'broom', lollipop: 'lollipop', kebab: 'kebab skewer', golf: 'golf club' };
const ITEMS = { 1: ['banana', 'carrot', 'bat', 'pin'], 2: ['screwdriver', 'broom', 'lollipop'], 3: ['kebab', 'screwdriver', 'broom'] };

const r1 = (x) => Math.round(x * 10) / 10;
const lerp = (a, b, t) => a + (b - a) * t;

// tubo: lista de puntos [x, y, radio] a lo largo de su eje
function tube(n, f) { const pts = []; for (let i = 0; i <= n; i++) { const [x, y, r] = f(i / n); pts.push([r1(x), r1(y), r1(Math.max(0.6, r))]); } return pts; }

function build(item, rand, level) {
  const R = (a, b) => a + rand() * (b - a), Y = CUT.y, P = [];
  const flip = rand() < 0.5;                      // extremo pesado a la izquierda o a la derecha
  const X = (u, xa, xb) => (flip ? lerp(xb, xa, u) : lerp(xa, xb, u));
  if (item === 'banana') {
    const L = R(240, 290), xa = 200 - L / 2, xb = 200 + L / 2, sag = R(26, 42), rm = R(17, 23), a = R(0.45, 0.6), b = R(0.95, 1.25);
    const pk = Math.pow(a / (a + b), a) * Math.pow(b / (a + b), b);
    P.push({ k: 'tube', m: 'fruit', deco: 'banana', pts: tube(60, (u) => [X(u, xa, xb), Y - 10 + sag * (4 * u * (1 - u) - 0.5), u < 0.04 ? 4 : rm * Math.pow(u, a) * Math.pow(1 - u, b) / pk + 1.2]) });
  } else if (item === 'carrot') {
    const L = R(220, 280), xa = 200 - L / 2, xb = 200 + L / 2, R0 = R(20, 27), p = R(0.7, 1.1);
    P.push({ k: 'tube', m: 'carrot', deco: 'carrot', pts: tube(50, (u) => [X(u, xa, xb), Y, R0 * Math.pow(1 - u, p) * (u < 0.05 ? 0.85 + u * 3 : 1) + 1.6]) });
  } else if (item === 'bat') {
    const L = R(270, 300), xa = 200 - L / 2, xb = 200 + L / 2, rb = R(16, 21), h = R(0.38, 0.5);
    P.push({ k: 'tube', m: 'wood', deco: 'bat', pts: tube(60, (u) => { const r = u < 0.03 ? 10 : u < 0.06 ? 7 : u < h ? 6.5 : u < 0.86 ? lerp(6.5, rb, Math.pow((u - h) / (0.86 - h), 1.4)) : rb * Math.sqrt(Math.max(0.05, 1 - Math.pow((u - 0.86) / 0.14, 2))) ; return [X(u, xa, xb), Y, r]; }) });
  } else if (item === 'pin') {
    const L = R(230, 260), xa = 200 - L / 2, xb = 200 + L / 2, rb = R(30, 36);
    P.push({ k: 'tube', m: 'pinwood', deco: 'pin', pts: tube(60, (u) => { const prof = u < 0.06 ? lerp(rb * 0.7, rb * 0.92, u / 0.06) : u < 0.3 ? lerp(rb * 0.92, rb, Math.sin((u - 0.06) / 0.24 * Math.PI / 2)) : u < 0.66 ? lerp(rb, rb * 0.34, Math.pow((u - 0.3) / 0.36, 0.9)) : u < 0.86 ? lerp(rb * 0.34, rb * 0.5, Math.sin((u - 0.66) / 0.2 * Math.PI / 2)) : rb * 0.5 * Math.sqrt(Math.max(0.04, 1 - Math.pow((u - 0.86) / 0.14, 2))); return [X(u, xa, xb), Y, prof]; }) });
  } else if (item === 'screwdriver') {
    // mango de plástico gordo y vástago de acero fino: el mango abulta mucho más, pero el acero pesa 6,5×
    const hl = R(95, 120), sl = R(130, 165), rh = R(13, 16), rs = R(3, 4), L = hl + sl, xa = 200 - L / 2, xb = 200 + L / 2, hu = hl / L;
    P.push({ k: 'tube', m: 'plastic', deco: 'sdhandle', pts: tube(30, (u) => [X(u * hu, xa, xb), Y, u < 0.08 ? rh * (0.75 + u * 3) : u > 0.85 ? rh * (1 - (u - 0.85) * 2.4) : rh]) });
    if (level === 3) P.push({ k: 'tube', m: 'rubber', deco: 'grip', pts: tube(16, (u) => [X((0.15 + u * 0.55) * hu, xa, xb), Y, rh + 1.8]) });
    P.push({ k: 'tube', m: 'steel', deco: 'shaft', pts: tube(30, (u) => [X(hu + u * (1 - hu), xa, xb), Y, u > 0.94 ? rs * (1 - (u - 0.94) * 8) + 0.8 : rs]) });
  } else if (item === 'broom') {
    // palo de madera y una cabeza de cerdas enorme… que casi no pesa
    const sl = R(200, 235), bw = R(62, 80), bh = R(84, 104), L = sl + bw, xa = 200 - L / 2, xb = 200 + L / 2, su = sl / L;
    P.push({ k: 'tube', m: 'wood', deco: 'handle', pts: tube(30, (u) => [X(u * su, xa, xb), Y, 8.5]) });
    const fx0 = flip ? xa + bw * 0.62 : xb - bw * 0.62 - 14, fx1 = fx0 + 14;
    P.push({ k: 'block', m: 'plastic', deco: 'ferrule', x0: r1(fx0), x1: r1(fx1), y0: r1(Y - bh * 0.42), y1: r1(Y + bh * 0.42), d: r1(R(3, 5)) });
    const bx0 = flip ? xa : xb - bw * 0.62, bx1 = bx0 + bw * 0.62;
    P.push({ k: 'block', m: 'bristle', deco: 'bristles', x0: r1(bx0), x1: r1(bx1), y0: r1(Y - bh / 2), y1: r1(Y + bh / 2), d: r1(R(26, 34)), dir: flip ? -1 : 1 });
  } else if (item === 'lollipop') {
    const L = R(170, 210), Rd = R(40, 52), total = L + Rd * 1.9, xa = 200 - total / 2;
    const sx0 = flip ? 400 - xa : xa, dir = flip ? -1 : 1;
    P.push({ k: 'tube', m: 'paper', deco: 'stick', pts: tube(20, (u) => [sx0 + dir * u * L, Y, 3.2]) });
    P.push({ k: 'disc', m: 'candy', deco: 'swirl', cx: r1(sx0 + dir * (L + Rd * 0.9)), cy: Y, R: r1(Rd), t: 12 });
  } else if (item === 'kebab') {
    const L = R(290, 310), xa = 200 - L / 2;
    P.push({ k: 'tube', m: 'wood', deco: 'skewer', pts: tube(20, (u) => [xa + u * L, Y, 2.6]) });
    const kinds = ['meat', 'pepper', 'onion', 'tomato', 'meat', 'pepper', 'meat'];
    let x = xa + R(26, 40); const n = 4 + Math.floor(rand() * 2);
    for (let i = 0; i < n && x < xa + L - 40; i++) {
      const m = kinds[Math.floor(rand() * kinds.length)];
      if (m === 'tomato') { const rr = R(14, 18); P.push({ k: 'ball', m, deco: 'tomato', cx: r1(x + rr), cy: Y, R: r1(rr) }); x += 2 * rr + R(3, 10); }
      else { const s = m === 'meat' ? R(26, 38) : m === 'pepper' ? R(28, 40) : R(18, 26), h = m === 'onion' ? s * 1.4 : s * R(0.9, 1.15); P.push({ k: 'block', m, deco: m, x0: r1(x), x1: r1(x + s), y0: r1(Y - h / 2), y1: r1(Y + h / 2), d: m === 'pepper' ? s * 0.9 : m === 'onion' ? 9 : s * 0.9 }); x += s + R(3, 10); }
    }
  } else if (item === 'golf') {
    const L = R(290, 310), xa = 200 - L / 2, xb = 200 + L / 2, gl = R(0.2, 0.26);
    P.push({ k: 'tube', m: 'graphite', deco: 'shaft', pts: tube(40, (u) => [X(u * 0.92, xa, xb), Y, lerp(5, 3, u)]) });
    P.push({ k: 'tube', m: 'rubber', deco: 'grip', pts: tube(16, (u) => [X(u * gl, xa, xb), Y, u < 0.08 ? 8.5 : lerp(8, 6, u)]) });
    const hx0 = flip ? xa : xb - 30, hx1 = hx0 + 30;
    P.push({ k: 'block', m: 'steel', deco: 'clubhead', x0: r1(hx0), x1: r1(hx1), y0: r1(Y - 6), y1: r1(Y + 34), d: r1(R(2.2, 3.6)) });
  }
  return P;
}

// masa por columna de 1 px (cada pieza a su manera)
function columns(P) {
  let lo = Infinity, hi = -Infinity;
  const ext = (p) => p.k === 'tube' ? [Math.min(...p.pts.map(q => q[0] - q[2])), Math.max(...p.pts.map(q => q[0] + q[2]))] : p.k === 'block' ? [p.x0, p.x1] : [p.cx - p.R, p.cx + p.R];
  for (const p of P) { const [a, b] = ext(p); lo = Math.min(lo, a); hi = Math.max(hi, b); }
  const x0 = Math.floor(lo), x1 = Math.ceil(hi), col = new Float64Array(x1 - x0 + 1);
  for (const p of P) {
    const rho = MATS[p.m].rho;
    if (p.k === 'tube') {
      for (let i = 1; i < p.pts.length; i++) {
        const [xa, ya, ra] = p.pts[i - 1], [xb, yb, rb] = p.pts[i], ds = Math.hypot(xb - xa, yb - ya), steps = Math.max(1, Math.ceil(ds * 2));
        for (let s = 0; s < steps; s++) { const t = (s + 0.5) / steps, x = lerp(xa, xb, t), r = lerp(ra, rb, t); col[Math.round(x) - x0] += rho * Math.PI * r * r * ds / steps; }
      }
    } else for (let x = x0; x <= x1; x++) {
      const c = x + 0.5;
      if (p.k === 'block' && c >= p.x0 && c < p.x1) col[x - x0] += rho * (p.y1 - p.y0) * p.d;
      if (p.k === 'ball' && Math.abs(c - p.cx) < p.R) col[x - x0] += rho * Math.PI * (p.R * p.R - (c - p.cx) ** 2);
      if (p.k === 'disc' && Math.abs(c - p.cx) < p.R) col[x - x0] += rho * 2 * Math.sqrt(p.R * p.R - (c - p.cx) ** 2) * p.t;
    }
  }
  return { x0, x1, col };
}

export function genCut(seed, level) {
  const rand = mulberry32(seed), list = ITEMS[level];
  for (let attempt = 0; attempt < 400; attempt++) {
    const item = list[Math.floor(rand() * list.length)];
    const parts = build(item, rand, level);
    const { x0, x1, col } = columns(parts);
    if (x0 < CUT.x0 - 8 || x1 > CUT.x1 + 8) continue;
    const tot = col.reduce((a, b) => a + b, 0), cum = []; let acc = 0;
    for (const c of col) { acc += c / tot; cum.push(Math.round(acc * 10000) / 10000); }
    let k = cum.findIndex(v => v >= 0.5); const prev = k > 0 ? cum[k - 1] : 0;
    const answer = r1(x0 + k + (0.5 - prev) / Math.max(1e-6, cum[k] - prev));
    // que no baste con cortar por el centro del dibujo
    const mid = (x0 + x1) / 2;
    if (Math.abs(answer - mid) < (level === 1 ? 16 : 22)) continue;
    // ni un corte tan sensible que medio píxel lo cambie todo (p. ej. por en medio de la cabeza de acero)
    if (col[Math.min(col.length - 1, k)] / tot > 0.014) continue;
    // …ni tan poco sensible que diez píxeles más allá dé casi igual (un palo fino y ligero)
    if (col[Math.min(col.length - 1, k)] / tot < 0.003) continue;
    const mats = [...new Set(parts.map(p => p.m))];
    return { type: 'cut', v: 2, level, item, parts, mats, grams: GRAMS[item], x0, x1, answer, cum };
  }
  throw new Error('No cut scene for seed ' + seed);
}
