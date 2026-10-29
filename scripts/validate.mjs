// Revisa que los retos generados estén completos y bien formados.
// Sale con error (código 1) si algo falla, para que la publicación automática se detenga.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
const dir = join(root, 'public', 'days');
const files = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const TYPES = ['balance', 'drop', 'race', 'pool', 'tower', 'loop', 'laser', 'bridge', 'float', 'gears', 'orbit', 'magnet', 'pour', 'pulley', 'swing', 'spring', 'flip', 'jump', 'clock', 'bounce', 'cut'];
const errors = [];
const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

for (const f of files) {
  const date = f.slice(0, 10);
  let d;
  try { d = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch (e) { errors.push(`${f}: JSON inválido`); continue; }
  const bad = (msg) => errors.push(`${date}: ${msg}`);
  if (d.date !== date) bad('la fecha interna no coincide con el nombre del archivo');
  for (const setId of ['A', 'B']) {
  const rounds = d.sets?.[setId];
  if (!Array.isArray(rounds) || rounds.length !== 5) { bad(`el reto ${setId} no tiene 5 rondas`); continue; }
  if (new Set(rounds.map(r => r.type)).size !== 5) bad(`el reto ${setId} repite experimento`);
  rounds.forEach((r, i) => {
    if (!TYPES.includes(r.type)) bad(`ronda ${i + 1}: tipo desconocido "${r.type}"`);
    if (r.type === 'loop' && !(isNum(r.answer) && r.answer > 50 && r.R > 40)) bad('rizo sin altura mínima válida');
    if (r.type === 'laser' && !(r.path?.length >= 3 && r.end?.every(isNum))) bad('láser sin recorrido');
    if (r.type === 'bridge' && !(isNum(r.lo) && isNum(r.hi) && r.lo < r.answer && r.answer < r.hi && r.hi < r.ya)) bad('puente con medidas imposibles');
    if (r.type === 'float' && !(r.items?.length >= 5 && Array.isArray(r.answer) && r.dens?.length === r.items.length)) bad('flotar sin objetos o respuesta');
    if (r.type === 'orbit' && !(r.planets?.length >= 1 && r.frames?.length > 30 && (r.crash >= 0 || r.end?.every(isNum)))) bad('órbita sin final');
    if (r.type === 'magnet' && !(r.mags?.length >= 2 && r.win >= 0 && r.win < r.mags.length && r.frames?.length > 10)) bad('imanes sin ganador');
    if (r.type === 'pour' && !(r.glasses?.length >= 4 && r.first >= 0 && r.frames?.length > 30)) bad('vasos sin ganador');
    if (r.type === 'flip' && !(r.rows?.length >= 2 && Number.isInteger(r.answer) && r.answer >= 0 && r.answer <= r.rows.length && r.n >= 2)) bad('canicas sin cubo');
    if (r.type === 'jump' && !(Number.isInteger(r.answer) && r.answer >= 0 && r.answer <= 6 && r.frames?.length > 60 && r.answer !== r.testSlot)) bad('salto sin autobús');
    if (r.type === 'pulley' && ![-1, 0, 1].includes(r.answer)) bad('poleas sin respuesta');
    if (r.type === 'swing' && !(isNum(r.impactX) && r.frames?.length > 20)) bad('péndulo sin caída');
    if (r.type === 'spring' && !(isNum(r.answer) && (r.target ? isNum(r.tx) && isNum(r.testX) : r.lo <= r.answer && r.answer <= r.hi))) bad('cañón sin tensión correcta');
    if (r.type === 'gears' && !(r.parts?.length >= 3 && r.w?.length === r.parts.length && [1, -1].includes(r.answer?.dir))) bad('engranajes sin respuesta');
    if (r.type === 'balance' && !(isNum(r.answer) && Math.abs(r.answer) <= 10.5 && r.weights?.length >= 2)) bad('equilibrio sin solución válida');
    if (r.type === 'drop' && !(r.frames?.length > 30 && isNum(r.impactX) && r.impactX > 0 && r.impactX < d.W)) bad('caída sin trayectoria o impacto fuera del suelo');
    if (r.type === 'race') {
      if (!(r.tracks?.length >= 2 && r.order?.length === r.tracks.length)) bad('carrera incompleta');
      for (const t of r.tracks || []) if (!(t.pts?.length === t.times?.length && t.times.every(isNum))) bad('pista con tiempos inválidos');
    }
    if (r.type === 'pool' && !(r.frames?.length > 10 && r.stop?.every(isNum))) bad('carambola sin trayectoria');
    if (r.type === 'clock' && !(isNum(r.answer) && r.answer > 0 && r.answer < r.dial && isNum(r.split) && r.frames?.length > 60 && r.segs?.length >= 2)) bad('cronómetro sin tiempo válido');
    if (r.type === 'cut' && !(isNum(r.answer) && r.answer > r.x0 && r.answer < r.x1 && r.parts?.length >= 1 && r.cum?.length === r.x1 - r.x0 + 1 && Math.abs(r.cum.at(-1) - 1) < 0.001)) bad('corte sin mitad válida');
    if (r.type === 'bounce' && !(isNum(r.answer) && r.answer > 0 && r.answer < r.h0 && r.n >= 2 && r.frames?.length > 30)) bad('bote sin altura válida');
    if (r.type === 'tower') {
      if (!(r.blocks?.length >= 5)) bad('torre con menos de 5 bloques');
      if (r.answer >= 0 && !(r.frames?.length > 30)) bad('torre que cae sin animación');
      if (r.answer >= 0 && !(r.answer >= 1 && r.answer < r.blocks.length)) bad('respuesta de torre fuera de rango');
    }
  });
  }
}

// Días disponibles por delante de hoy
const today = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
const ahead = files.filter(f => f.slice(0, 10) >= today).length;
const index = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8'));
if (index.dates.length !== files.length) errors.push('index.json no coincide con los archivos: ejecuta npm run generate');

if (errors.length) {
  console.error(`✗ ${errors.length} problema(s):\n` + errors.map(e => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ ${files.length} días válidos. Quedan ${ahead} días de reto desde hoy (${today}).`);
if (ahead < 7) console.warn('  Aviso: quedan menos de 7 días generados. Ejecuta npm run generate.');
