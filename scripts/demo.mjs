// Crea public/demo.json: rondas de prueba de los cinco experimentos nuevos,
// para jugarlas en /?demo antes de meterlos en la rotación diaria.
import { writeFileSync } from 'node:fs';
import { W, H, FLOOR, R, hashStr } from './rounds.mjs';
import { genOrbit, genMagnets, genPour, genPulley, genSwing, genSpring } from './rounds3.mjs';
const VARIANTS = 4;
const out = { W, H, FLOOR, R, levels: {} };
for (const lvl of [1, 2, 3]) {
  out.levels[lvl] = [];
  for (let v = 0; v < VARIANTS; v++) {
    const seed = hashStr('demo:' + lvl + ':' + v);
    out.levels[lvl].push([genOrbit(seed + 1, lvl), genMagnets(seed + 2, lvl), genPour(seed + 3, lvl), genPulley(seed + 4, lvl), genSwing(seed + 5, lvl), genSpring(seed + 6, lvl)]);
  }
}
writeFileSync(new URL('../public/demo.json', import.meta.url), JSON.stringify(out));
console.log('demo.json listo');
