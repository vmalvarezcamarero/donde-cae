// Genera los retos diarios en public/days/AAAA-MM-DD.json
// (el servidor impide que se descarguen directamente: llevan las respuestas)
//
// Uso:
//   node scripts/generate.mjs                 → desde hoy, 30 días
//   node scripts/generate.mjs --days 60       → desde hoy, 60 días
//   node scripts/generate.mjs --from 2026-11-01 --days 7
//   node scripts/generate.mjs --force         → rehace también los días que ya existen
//
// El reto de una fecha depende solo de esa fecha (semilla), así que regenerar
// produce exactamente el mismo resultado. Por defecto no se tocan los días ya
// publicados, para que nadie vea cambiar un reto que ya jugó.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { W, H, FLOOR, R, hashStr, genBalance, genDrop, genRace, genPool, genTower } from './rounds.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(readFileSync(join(root, 'config.json'), 'utf8'));
const outDir = join(root, 'public', 'days');
mkdirSync(outDir, { recursive: true });

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const force = args.includes('--force');
const todayLocal = new Intl.DateTimeFormat('en-CA', { timeZone: config.timezone }).format(new Date());
const from = arg('from', todayLocal);
const days = Number(arg('days', 30));

const DAY = 864e5;
const dateAdd = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const dayNumber = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(config.launch + 'T12:00:00Z')) / DAY) + 1;

// Dificultad por día de la semana: lunes suave, domingo el más duro.
const LEVEL_BY_WEEKDAY = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 0: 3 };
const RACE_FORMATS = ['curvas', 'objetos', 'terrenos'];

// Cada día tiene dos retos de la misma dificultad: A (el del primer intento,
// igual para todos) y B (el del segundo intento). Así el segundo intento no
// consiste en repetir respuestas ya vistas.
function buildSet(date, setId, n, lvl) {
  const seed = hashStr('physle:' + date + ':' + setId);
  const fmt = RACE_FORMATS[(((n + (setId === 'B' ? 1 : 0)) % 3) + 3) % 3];
  return [
    genBalance(seed + 1, lvl),
    genDrop(seed + 2, lvl),
    genRace(seed + 3, lvl === 3 ? 4 : 3, fmt),
    genPool(seed + 4, lvl === 1 ? 1 : 2),
    genTower(seed + 5, lvl),
  ];
}
export function buildDay(date) {
  const n = dayNumber(date);
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const lvl = LEVEL_BY_WEEKDAY[weekday];
  return { n, date, level: lvl, W, H, FLOOR, R, sets: { A: buildSet(date, 'A', n, lvl), B: buildSet(date, 'B', n, lvl) } };
}

let made = 0, kept = 0;
for (let i = 0; i < days; i++) {
  const date = dateAdd(from, i);
  if (dayNumber(date) < 1) continue;
  const file = join(outDir, date + '.json');
  if (existsSync(file) && !force) { kept++; continue; }
  const t0 = Date.now();
  const day = buildDay(date);
  writeFileSync(file, JSON.stringify(day));
  made++;
  console.log(`#${day.n} ${date} (nivel ${day.level}) · carreras ${day.sets.A[2].format}/${day.sets.B[2].format} · ${Date.now() - t0} ms`);
}

// Índice con las fechas disponibles (lo usa la web para saber si hay reto).
const dates = readdirSync(outDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort();
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ launch: config.launch, timezone: config.timezone, dates }));
console.log(`Listo: ${made} días nuevos, ${kept} ya existían. Último día disponible: ${dates.at(-1)}.`);
