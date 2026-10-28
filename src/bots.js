// Jugadores de relleno para que el ranking no se vea vacío mientras la comunidad crece.
// Todo es determinista (semilla = fecha + nombre): el mismo día siempre da los mismos
// jugadores y puntuaciones, así que el ranking semanal suma bien y nada cambia al recargar.
// Se retiran solos: cada día hay un objetivo de jugadores y los bots solo rellenan
// lo que falte hasta llegar a él. Con BOTS = "0" en las variables del Worker se apagan.
import { SKINS, NAME_COLORS } from '../public/shop.js';

// Apodos con aire de usuario real, con su país. Uno de cada cuatro (elegido por su nombre)
// es «habitual» y juega casi todos los días; el resto entra y sale.
const NAMES = `
jake.r|US emmawalsh|US tyler_b|US maddie.k|US rmiller04|US olivia.p|US chrisdunn|US ashleyy|US kbrooks|US danny_m|US
sarah.h|US mattg|US jenna_l|US nate.s|US hannahbee|US coltonw|US brianna_t|US jmoore22|US katiec|US ethanp|US
lauren.m|US devinj|US mikeyb|US abbyrose|US calebh|US grace.l|US joshk_|US megan.r|US tannerj|US sydney_w|US
aaronz|US bella.c|US kyle.t|US jessie.v|US dylanw|US taylor_s|US noahg|US paige.e|US bwilson|US emilyann|US
ltran|US marcus_d|US kim.n|US zachf|US ellie.g|US jacksonr|US claire.b|US ryan.o|US avery_m|US trevor.h|US
lucia.mtz|ES pablo_g|ES martaa|ES javi.r|ES irene.lp|ES dani_glez|ES carmen.s|ES alvaro.m|ES sergio_r|ES nerea.b|ES
adri.fdz|ES paula.ruiz|ES jorge.ns|ES elena_mt|ES miguelangel|ES laura.cb|ES
tom.hgs|GB lily.w|GB jamie.p|GB sophie.j|GB alfie_r|GB chloe.m|GB harry.d|GB amelia.t|GB
liam.c|CA ava.g|CA owenm|CA zoe.b|CA
jack_aus|AU mia.h|AU coopz|AU
lukas.w|DE lena.k|DE jonas_s|DE marie.b|DE finn.h|DE
lea.m|FR hugo.d|FR camille.r|FR theo_b|FR
sofia.rossi|IT luca_b|IT giulia.m|IT
noah.vd|NL sanne.j|NL daan_b|NL
joao.pedro|BR ana.lima|BR gabriel_s|BR lari.c|BR rafa.costa|BR
camila.hdz|MX diego_r|MX valeria.g|MX santi.m|MX ximena_l|MX
mateo.f|AR mica.p|AR tomi_g|AR
juanes.v|CO vale.r|CO
nico.s|CL
ines.c|PT
ola.n|SE
`.trim().split(/\s+/).map(s => { const [nick, country] = s.split('|'); return { nick, country }; });

function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const rnd = (s) => hash(s) / 4294967296;                                   // 0..1 estable
const gauss = (s) => { const u = Math.max(1e-6, rnd(s + ':u')), v = rnd(s + ':v'); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };

const SKIN_IDS = SKINS.map(s => s.id).filter(id => id !== 'classic');
const COLOR_IDS = NAME_COLORS.map(c => c.id).filter(id => id !== 'default' && id !== 'rainbow');
const LAUNCH = Date.parse('2026-10-26T12:00:00Z');

// Cuántos jugadores «debería» tener el ranking un día: crece poco a poco desde el lanzamiento.
function target(date) {
  const d = Math.max(0, Math.round((Date.parse(date + 'T12:00:00Z') - LAUNCH) / 864e5));
  return Math.min(60, 24 + Math.round(d * 0.8) + Math.round((rnd('t:' + date) - 0.5) * 8));
}

// Bots de un día. real = jugadores con cuenta que ya hay ese día; minute = minutos desde
// medianoche (para hoy: solo aparecen los que «ya han jugado» a esa hora; null = día completo).
export function botsFor(date, real, minute = null) {
  const k = Math.max(0, target(date) - real);
  if (!k) return [];
  const order = NAMES.map((b) => ({ b, w: rnd('p:' + date + ':' + b.nick) + (rnd('r:' + b.nick) < 0.25 ? 0.55 : 0) }))
    .sort((x, y) => y.w - x.w).slice(0, k);
  const out = [];
  for (const { b } of order) {
    const at = Math.round(30 + 1400 * Math.pow(rnd('m:' + date + ':' + b.nick), 0.85));   // minuto en que termina
    if (minute != null && at > minute) continue;
    const skill = 220 + 170 * Math.pow(rnd('s:' + b.nick), 1.4);
    const raw = skill + 55 * gauss('d:' + date + ':' + b.nick);
    const score = Math.round(Math.max(60, raw > 420 ? 420 + 50 * Math.tanh((raw - 420) / 50) : raw));   // techo suave: nunca llegan a 470
    const h = rnd('k:' + b.nick);
    out.push({
      uid: 'bot:' + b.nick, nickname: b.nick, country: b.country, bot: true,
      skin: h < 0.42 ? 'classic' : SKIN_IDS[hash('sk:' + b.nick) % SKIN_IDS.length],
      name_color: rnd('c:' + b.nick) < 0.12 ? COLOR_IDS[hash('co:' + b.nick) % COLOR_IDS.length] : 'default',
      score, minute: at,
    });
  }
  return out;
}
