// Crea public/warmup.json: las dos rondas de calentamiento que ve quien entra por primera vez
// (fáciles, de dos mecánicas distintas: tocar dónde cae y elegir). No tienen nada que ver con los retos diarios.
// Uso: node scripts/warmup.mjs
import { writeFileSync } from 'node:fs';
import { W, H, FLOOR, R, hashStr, genDrop } from './rounds.mjs';
import { genMagnets } from './rounds3.mjs';

const drop = genDrop(hashStr('gravle-warmup:drop:2'), 1);
const magnet = genMagnets(hashStr('gravle-warmup:magnet:1'), 1);
writeFileSync(new URL('../public/warmup.json', import.meta.url), JSON.stringify({ W, H, FLOOR, R, rounds: [drop, magnet] }));
console.log('warmup.json · caída en x =', Math.round(drop.impactX), '· planchas', drop.planks.map(p => p.kind).join(', '), '· imanes', magnet.mags.map(m => '×' + m.s).join(' '), 'gana', magnet.win);
