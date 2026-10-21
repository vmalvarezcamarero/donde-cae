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
import { W, H, FLOOR, R, hashStr, mulberry32, genBalance, genDrop, genRace, genPool, genTower } from './rounds.mjs';
import { genLoop, genLaser, genBridge, genFloat, genGears } from './rounds2.mjs';

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

const dateAdd = (iso, n) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const dayNumber = (iso) => Math.round((Date.parse(iso + 'T12:00:00Z') - Date.parse(config.launch + 'T12:00:00Z')) / DAY) + 1;

// Dificultad por día de la semana: lunes suave, domingo el más duro.
const LEVEL_BY_WEEKDAY = { 1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 0: 3 };
const RACE_FORMATS = ['curvas', 'objetos', 'terrenos'];

// Los 10 experimentos, agrupados por cómo se responde. Cada día se eligen 5 para
// el reto A (el del primer intento, igual para todos) y el reto B son los otros 5:
// así el segundo intento es de verdad distinto. Como mucho 2 de cada grupo en el
// reto A, para mezclar formas de jugar.
export const GAMES = ['balance', 'drop', 'race', 'pool', 'tower', 'loop', 'laser', 'bridge', 'float', 'gears'];
const GROUP = { drop: 'tap', pool: 'tap', laser: 'tap', balance: 'slide', loop: 'slide', bridge: 'slide', race: 'pick', tower: 'pick', float: 'pick', gears: 'pick' };

// Plan de la semana (de lunes a domingo): reparte los juegos para que cada uno
// salga 3 o 4 veces en el reto A y ninguno desaparezca varios días seguidos.
const DAY = 864e5;
const mondayOf = (iso) => { const d = new Date(iso + 'T12:00:00Z'); return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10); };
const planCache = new Map();
export function weekPlan(monday) {
  if (planCache.has(monday)) return planCache.get(monday);
  const rand = mulberry32(hashStr('gravle:week:' + monday));
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  // Se prueban semanas al azar hasta dar con una que cumpla las reglas:
  //  · cada juego sale 3 o 4 veces en el reto A,
  //  · como mucho 2 juegos de cada grupo por día,
  //  · de un día al siguiente se repiten entre 1 y 3 juegos (ni todo igual ni todo distinto).
  let best = null;
  for (let tryN = 0; tryN < 4000 && !best; tryN++) {
    const count = Object.fromEntries(GAMES.map(g => [g, 0])), days = [];
    let ok = true;
    for (let d = 0; d < 7 && ok; d++) {
      let pick = null;
      for (let k = 0; k < 60 && !pick; k++) {
        const order = shuffle(GAMES).sort((x, y) => count[x] - count[y] + (rand() - 0.5) * 1.2);
        const p = [], per = {};
        for (const g of order) { if (p.length === 5) break; if ((per[GROUP[g]] || 0) >= 2 || count[g] >= 4) continue; p.push(g); per[GROUP[g]] = (per[GROUP[g]] || 0) + 1; }
        if (p.length < 5) continue;
        if (d > 0) { const same = p.filter(g => days[d - 1].includes(g)).length; if (same < 1 || same > 3) continue; }
        pick = p;
      }
      if (!pick) { ok = false; break; }
      pick.forEach(g => count[g]++); days.push(pick);
    }
    if (ok && GAMES.every(g => count[g] >= 3)) best = days;
  }
  if (!best) throw new Error('No se pudo planificar la semana ' + monday);
  const plan = best.map(pick => ({ A: shuffle(pick), B: shuffle(GAMES.filter(g => !pick.includes(g))) }));
  planCache.set(monday, plan);
  return plan;
}
export function gamesOf(date) {
  const monday = mondayOf(date);
  return weekPlan(monday)[Math.round((Date.parse(date + 'T12:00:00Z') - Date.parse(monday + 'T12:00:00Z')) / DAY)];
}

function buildSet(date, setId, n, lvl, games) {
  const seed = hashStr('physle:' + date + ':' + setId);
  const fmt = RACE_FORMATS[(((n + (setId === 'B' ? 1 : 0)) % 3) + 3) % 3];
  const make = {
    balance: () => genBalance(seed + 1, lvl),
    drop: () => genDrop(seed + 2, lvl),
    race: () => genRace(seed + 3, lvl === 3 ? 4 : 3, fmt),
    pool: () => genPool(seed + 4, lvl === 1 ? 1 : 2),
    tower: () => genTower(seed + 5, lvl),
    loop: () => genLoop(seed + 6, lvl),
    laser: () => genLaser(seed + 7, lvl),
    bridge: () => genBridge(seed + 8, lvl),
    float: () => genFloat(seed + 9, lvl),
    gears: () => genGears(seed + 10, lvl),
  };
  return games.map(g => make[g]());
}
export function buildDay(date) {
  const n = dayNumber(date);
  const weekday = new Date(date + 'T12:00:00Z').getUTCDay();
  const lvl = LEVEL_BY_WEEKDAY[weekday];
  const g = gamesOf(date);
  return { n, date, level: lvl, W, H, FLOOR, R, sets: { A: buildSet(date, 'A', n, lvl, g.A), B: buildSet(date, 'B', n, lvl, g.B) } };
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
  console.log(`#${day.n} ${date} (nivel ${day.level}) · A: ${day.sets.A.map(r => r.type).join(', ')} · ${Date.now() - t0} ms`);
}

// Índice con las fechas disponibles (lo usa la web para saber si hay reto).
const dates = readdirSync(outDir).filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).map(f => f.slice(0, 10)).sort();
writeFileSync(join(outDir, 'index.json'), JSON.stringify({ launch: config.launch, timezone: config.timezone, dates }));
console.log(`Listo: ${made} días nuevos, ${kept} ya existían. Último día disponible: ${dates.at(-1)}.`);
