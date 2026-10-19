// Revisa que los retos generados estén completos y bien formados.
// Sale con error (código 1) si algo falla, para que la publicación automática se detenga.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
const dir = join(root, 'public', 'days');
const files = readdirSync(dir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const ORDER = ['balance', 'drop', 'race', 'pool', 'tower'];
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
  rounds.forEach((r, i) => {
    if (r.type !== ORDER[i]) bad(`ronda ${i + 1} es "${r.type}", se esperaba "${ORDER[i]}"`);
    if (r.type === 'balance' && !(isNum(r.answer) && Math.abs(r.answer) <= 10.5 && r.weights?.length >= 2)) bad('equilibrio sin solución válida');
    if (r.type === 'drop' && !(r.frames?.length > 30 && isNum(r.impactX) && r.impactX > 0 && r.impactX < d.W)) bad('caída sin trayectoria o impacto fuera del suelo');
    if (r.type === 'race') {
      if (!(r.tracks?.length >= 2 && r.order?.length === r.tracks.length)) bad('carrera incompleta');
      for (const t of r.tracks || []) if (!(t.pts?.length === t.times?.length && t.times.every(isNum))) bad('pista con tiempos inválidos');
    }
    if (r.type === 'pool' && !(r.frames?.length > 10 && r.stop?.every(isNum))) bad('carambola sin trayectoria');
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
