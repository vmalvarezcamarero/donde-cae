// Jugadores de relleno para que el ranking no se vea vacío mientras la comunidad crece.
// Todo es determinista (semilla = fecha + nombre): el mismo día siempre da los mismos
// jugadores y puntuaciones, así que el ranking semanal suma bien y nada cambia al recargar.
// Se retiran solos: cada día hay un objetivo de jugadores y los bots solo rellenan
// lo que falte hasta llegar a él. Con BOTS = "0" en las variables del Worker se apagan.
import { SKINS, NAME_COLORS } from '../public/shop.js';

// Apodos variados como los de la gente real (nombres, motes, números, mayúsculas…), con su país. Uno de cada cuatro (elegido por su nombre)
// es «habitual» y juega casi todos los días; el resto entra y sale.
const NAMES = `
jdog44|US kaylaaa|US Big_Ced|US MikeTran|US pancakeboi|US momof3|US Dre|US tylerrr|US Brookie|US zacharyq|US
TheRealJess|US ohioguy|US noodle|US bryce99|US AshCake|US lilmoe|US Jfresh|US kdub|US marissa|US Chris_P|US
sleepydev|US hoopsfan23|US texasmama|US ellieeee|US Quinn|US Jakester|US LaurenB|US dustyfeet|US kevo|US smitty|US
cass|US BriBri|US notkevin|US sadie_rose|US Tbone|US monkeybars|US Riley|US jamesonh|US Kat|US dkim|US
sprinkles|US WhoaItsMaya|US lemonlime|US bigmike72|US spaghettio|US nina|US Rach|US Patty|US Gus|US hdawg|US
bea_m|US carlosv|US mrsjohnson|US Trev|US gingerr|US Danielle|US j_wash|US Coop|US frankie|US mags|US
mollyy|US theo|US Brayden_|US k8lyn|US AJ_31|US mr_peterson|US dani_rae|US benny|US Salem|US luvbug|US
goob|US Hank|US emmy|US rjr|US coffeeplease|US tired_teacher|US Mcgee|US Leo_v|US scoots|US Jules|US
Iñaki98|ES lauritaa_|ES pakoo|ES eljavi|ES Nuria.G|ES Marcos_10|ES chiqui|ES Begoña_r|ES aleixx|ES Txema|ES
sarita|ES pablete|ES Rocío|ES Dani|ES manolo84|ES Ainhoa|ES kikee|ES Sofi_|ES el_memo|MX Pato_rdz|MX
ximenita|MX Charlyy|MX fer.ochoa|MX Lupita|MX Gera|MX joaozinho|BR Duda_|BR brunoxd|BR Lari|BR gabizinha|BR
Thiaguinho|BR Biazinha|BR Tincho|AR lucho_92|AR Flor.m|AR Juancho|CO Nachito|CL Majo|VE alfie10|GB bethh|GB
Mr_Biscuit|GB CallumR|GB Ciara|IE soph|GB Rhys|GB maisie_|GB moosejaw|CA tay.lynn|CA Gab|CA Owen_|CA
Davo|AU Kirra_|AU Hamish|NZ lukas2001|DE Jojo_|DE MaxHz|DE Pauli|DE Lenny|AT Clem|FR toto_|FR
Juju92|FR Maelle|FR ale_bianchi|IT Fede|IT Giuly|IT Bram|NL Femke_|NL Jesse_vd|NL Wout|BE Kuba_|PL
Ebba|SE emre_k|TR Rahul_s|IN jaydee|PH kenta_|JP minji|KR Rita_s|PT Mads|DK Aino|FI
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
