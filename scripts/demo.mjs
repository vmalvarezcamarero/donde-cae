// Crea public/demo.json: rondas de prueba de los cinco experimentos nuevos,
// para jugarlas en /?demo antes de meterlos en la rotación diaria.
import { writeFileSync } from 'node:fs';
import { W, H, FLOOR, R, hashStr } from './rounds.mjs';
import { genLoop, genLaser, genDomino, genFloat, genGears } from './rounds2.mjs';
const VARIANTS = 4;
const out = { W, H, FLOOR, R, levels: {} };
for (const lvl of [1, 2, 3]) {
  out.levels[lvl] = [];
  for (let v = 0; v < VARIANTS; v++) {
    const seed = hashStr('demo:' + lvl + ':' + v);
    out.levels[lvl].push([genLoop(seed + 1, lvl), genLaser(seed + 2, lvl), genDomino(seed + 3, lvl), genFloat(seed + 4, lvl), genGears(seed + 5, lvl)]);
  }
}
writeFileSync(new URL('../public/demo.json', import.meta.url), JSON.stringify(out));
console.log('demo.json listo');
