// Crea public/lab/<nivel>.json: rondas de todos los experimentos para el laboratorio (/?lab),
// donde se pueden jugar todos sin límite. Las semillas no tienen nada que ver con las de los
// retos diarios, así que estas rondas no dan pistas sobre ningún día.
//
// Uso: node scripts/lab.mjs            (3 mapas de cada experimento por nivel)
//      node scripts/lab.mjs --variants 5
import { writeFileSync, mkdirSync } from 'node:fs';
import { W, H, FLOOR, R, hashStr, genBalance, genDrop, genRace, genPool, genTower } from './rounds.mjs';
import { genLoop, genLaser, genBridge, genFloat, genGears } from './rounds2.mjs';
import { genOrbit, genMagnets, genPour, genPulley, genSwing, genSpring } from './rounds3.mjs';
import { genFlip, genJump } from './rounds4.mjs';

const args = process.argv.slice(2);
const VARIANTS = Number(args[args.indexOf('--variants') + 1]) || 3;
const RACE_FORMATS = ['curvas', 'objetos', 'terrenos'];
const make = {
  balance: (s, l) => genBalance(s, l),
  drop: (s, l) => genDrop(s, l),
  race: (s, l, v) => genRace(s, l === 3 ? 4 : 3, RACE_FORMATS[v % 3]),
  pool: (s, l) => genPool(s, l === 1 ? 1 : 2),
  tower: (s, l) => genTower(s, l),
  loop: (s, l) => genLoop(s, l),
  laser: (s, l) => genLaser(s, l),
  bridge: (s, l) => genBridge(s, l),
  gears: (s, l) => genGears(s, l),
  magnet: (s, l) => genMagnets(s, l),
  flip: (s, l) => genFlip(s, l),
  pulley: (s, l) => genPulley(s, l),
  swing: (s, l) => genSwing(s, l),
  spring: (s, l) => genSpring(s, l),
  // fuera de la rotación diaria, pero siguen funcionando
  float: (s, l) => genFloat(s, l),
  orbit: (s, l) => genOrbit(s, l),
  pour: (s, l) => genPour(s, l),
  jump: (s, l) => genJump(s, l),
};
const dir = new URL('../public/lab/', import.meta.url);
mkdirSync(dir, { recursive: true });
for (const lvl of [1, 2, 3]) {
  const t0 = Date.now(), games = {};
  for (const [g, fn] of Object.entries(make)) {
    games[g] = [];
    for (let v = 0; v < VARIANTS; v++) games[g].push(fn(hashStr('gravle-lab:' + g + ':' + lvl + ':' + v), lvl, v));
  }
  const body = JSON.stringify({ level: lvl, W, H, FLOOR, R, games });
  writeFileSync(new URL(lvl + '.json', dir), body);
  console.log(`lab/${lvl}.json · ${Object.keys(games).length} experimentos × ${VARIANTS} · ${(body.length / 1024).toFixed(0)} KB · ${Date.now() - t0} ms`);
}
