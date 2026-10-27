// Servidor de Physle (Cloudflare Worker).
// - Sirve la web estática de public/.
// - Bloquea la descarga directa de los retos (llevan las respuestas).
// - Puntúa cada ronda: el navegador envía la predicción y recibe el resultado.
// - Limita los intentos por día, guarda cuentas y calcula los rankings.
import { publicRound, validPrediction, scorePoints } from '../public/scoring.js';
import { COUNTRIES } from '../public/countries.js';
import { WELCOME_COINS, coinsFor, findItem } from '../public/shop.js';

const MAX_ATTEMPTS = 2;          // en el futuro: +1 viendo un vídeo
const SETS = ['A', 'B', 'B'];    // reto que toca en cada intento
const COUNTRY_SET = new Set(COUNTRIES);

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/days/')) {     // los retos no se descargan: se ve la página 404
      const page = await env.ASSETS.fetch(new Request(new URL('/404.html', url)));
      return new Response(page.body, { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
    }
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on our side. Please try again in a moment.' }, 500);
    }
  },
  // Limpieza diaria: las partidas sin cuenta se borran a los 12 meses (como dice la política de privacidad).
  async scheduled(event, env) {
    const limit = new Date(Date.now() - 365 * 864e5).toISOString().slice(0, 10);
    await env.DB.prepare('DELETE FROM attempts WHERE uid IS NULL AND date < ?').bind(limit).run();
  },
};

/* ---------------- fechas ---------------- */
const tz = (env) => env.TIMEZONE || 'Europe/Madrid';
function today(env) { return new Intl.DateTimeFormat('en-CA', { timeZone: tz(env) }).format(new Date()); }
function secondsToReset(env) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz(env), hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date()).map(x => [x.type, x.value]));
  return 86400 - (Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second));
}
function weekRange(date) {               // lunes a domingo
  const d = new Date(date + 'T12:00:00Z'), wd = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d.getTime() - wd * 864e5);
  return [mon.toISOString().slice(0, 10), new Date(mon.getTime() + 6 * 864e5).toISOString().slice(0, 10)];
}
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/* ---------------- retos ---------------- */
const dayCache = new Map();
async function loadDay(env, date) {
  if (dayCache.has(date)) return dayCache.get(date);
  const res = await env.ASSETS.fetch(new Request('https://assets.local/days/' + date + '.json'));
  if (!res.ok) throw new HttpError(404, 'There’s no challenge for this day yet.');
  const day = await res.json();
  if (dayCache.size > 8) dayCache.delete(dayCache.keys().next().value);
  dayCache.set(date, day);
  return day;
}
const dayMeta = (d) => ({ n: d.n, date: d.date, level: d.level, W: d.W, H: d.H, FLOOR: d.FLOOR, R: d.R,
  games: { A: d.sets.A.map(r => r.type), B: d.sets.B.map(r => r.type) } });   // qué experimentos tocan hoy

/* ---------------- identidad ---------------- */
async function identify(req, env, { requireUser = false } = {}) {
  const device = req.headers.get('x-device') || '';
  if (!/^[A-Za-z0-9-]{8,64}$/.test(device)) throw new HttpError(400, 'Missing device identifier.');
  let uid = null;
  const auth = req.headers.get('authorization') || '';
  if (auth.startsWith('Bearer ')) uid = await verifyToken(auth.slice(7), env);
  if (requireUser && !uid) throw new HttpError(401, 'You need to sign in.');
  return { device, uid, player: uid ? 'u:' + uid : 'd:' + device };
}

// Verificación de los tokens de Firebase Auth (JWT firmado por Google, RS256).
let jwks = null, jwksExpiry = 0;
async function googleKeys() {
  if (jwks && Date.now() < jwksExpiry) return jwks;
  const res = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  const body = await res.json();
  const maxAge = Number((res.headers.get('cache-control') || '').match(/max-age=(\d+)/)?.[1] || 3600);
  jwks = body.keys; jwksExpiry = Date.now() + maxAge * 1000;
  return jwks;
}
const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function verifyToken(token, env) {
  // Solo para desarrollo local (.dev.vars): nunca se activa en producción.
  if (env.ALLOW_TEST_AUTH === '1' && token.startsWith('test:')) return token.slice(5);
  const project = env.FIREBASE_PROJECT_ID;
  if (!project) throw new HttpError(503, 'Accounts aren’t set up yet.');
  const parts = token.split('.');
  if (parts.length !== 3) throw new HttpError(401, 'Invalid session. Please sign in again.');
  const header = JSON.parse(new TextDecoder().decode(b64url(parts[0])));
  const claims = JSON.parse(new TextDecoder().decode(b64url(parts[1])));
  const jwk = (await googleKeys()).find(k => k.kid === header.kid);
  if (header.alg !== 'RS256' || !jwk) throw new HttpError(401, 'Invalid session. Please sign in again.');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(parts[2]), new TextEncoder().encode(parts[0] + '.' + parts[1]));
  const now = Date.now() / 1000;
  if (!ok || claims.aud !== project || claims.iss !== 'https://securetoken.google.com/' + project ||
      !claims.sub || claims.exp < now || claims.iat > now + 300) throw new HttpError(401, 'Your session expired. Please sign in again.');
  return claims.sub;
}

/* ---------------- rutas ---------------- */
async function route(req, env, url) {
  const path = url.pathname, method = req.method;
  if (path === '/api/today' && method === 'GET') return getToday(req, env);
  if (path === '/api/attempt' && method === 'POST') return startAttempt(req, env);
  let m = path.match(/^\/api\/attempt\/(\d+)\/round$/);
  if (m && method === 'POST') return playRound(req, env, Number(m[1]));
  if (path === '/api/leaderboard' && method === 'GET') return leaderboard(req, env, url);
  if (path === '/api/shop/buy' && method === 'POST') return shopBuy(req, env);
  if (path === '/api/shop/equip' && method === 'POST') return shopEquip(req, env);
  if (path === '/api/me') {
    if (method === 'GET') return getMe(req, env);
    if (method === 'PUT') return putMe(req, env);
    if (method === 'DELETE') return deleteMe(req, env);
  }
  throw new HttpError(404, 'Not found.');
}

async function attemptsToday(env, who, date) {
  // Cuentan los intentos de la cuenta y los del dispositivo: así no se puede
  // practicar sin cuenta y luego jugar con ventaja ya conectado.
  const { results } = await env.DB.prepare(
    `SELECT id, num, set_id, round, scores, total, finished, player, device FROM attempts
     WHERE date = ?1 AND (player = ?2 OR device = ?3 ${who.uid ? 'OR uid = ?4' : ''}
       OR uid IN (SELECT uid FROM attempts WHERE date = ?1 AND device = ?3 AND uid IS NOT NULL)) ORDER BY started_at`
  ).bind(date, who.player, who.device, ...(who.uid ? [who.uid] : [])).all();
  return results.map(a => ({ ...a, scores: JSON.parse(a.scores) }));
}
// Las partidas jugadas hoy en este dispositivo sin haber iniciado sesión pasan a la
// cuenta en cuanto la persona entra con un perfil creado: así cuentan para el ranking
// y dan monedas. Solo las de hoy, para no adoptar partidas antiguas de otra persona.
async function claimDevice(env, who, date) {
  if (!who.uid) return;
  const has = await env.DB.prepare('SELECT 1 FROM users WHERE uid = ?').bind(who.uid).first();
  if (!has) return;
  // Nunca más de MAX_ATTEMPTS por cuenta y día: si la cuenta ya jugó sus intentos en
  // otro dispositivo, las partidas de invitado se quedan fuera del ranking.
  const used = await env.DB.prepare('SELECT COUNT(*) AS n FROM attempts WHERE uid = ? AND date = ?').bind(who.uid, date).first();
  const room = MAX_ATTEMPTS - used.n;
  if (room <= 0) return;
  const { results } = await env.DB.prepare(
    `UPDATE attempts SET uid = ?1 WHERE id IN (SELECT id FROM attempts WHERE device = ?2 AND date = ?3 AND uid IS NULL ORDER BY started_at LIMIT ?4)
     RETURNING id, scores, finished`
  ).bind(who.uid, who.device, date, room).all();
  for (const a of results || []) {
    if (!a.finished) continue;
    const earned = coinsFor(JSON.parse(a.scores));
    if (!earned) continue;
    await env.DB.batch([
      env.DB.prepare('UPDATE users SET coins = coins + ? WHERE uid = ?').bind(earned, who.uid),
      env.DB.prepare('UPDATE attempts SET coins = ? WHERE id = ?').bind(earned, a.id),
    ]);
  }
}
const profileOf = async (env, uid) => {
  if (!uid) return null;
  const p = await env.DB.prepare('SELECT nickname, country, coins, skin, name_color, owned FROM users WHERE uid = ?').bind(uid).first();
  return p && { ...p, owned: JSON.parse(p.owned) };
};

async function getToday(req, env) {
  const who = await identify(req, env);
  const date = today(env), day = await loadDay(env, date);
  await claimDevice(env, who, date);
  const list = await attemptsToday(env, who, date);
  return json({
    day: dayMeta(day), max: MAX_ATTEMPTS, resetIn: secondsToReset(env),
    attempts: list.map(a => ({ id: a.id, num: a.num, set: a.set_id, round: a.round, scores: a.scores, total: a.total, finished: !!a.finished, mine: a.player === who.player })),
    user: who.uid ? { uid: who.uid, profile: await profileOf(env, who.uid) } : null,
  });
}

async function startAttempt(req, env) {
  const who = await identify(req, env);
  const date = today(env), day = await loadDay(env, date);
  await claimDevice(env, who, date);
  const list = await attemptsToday(env, who, date);
  // Se retoma el intento a medias de esta cuenta o de este mismo dispositivo.
  let a = list.find(x => !x.finished && (x.player === who.player || x.device === who.device));
  if (!a) {
    if (list.some(x => !x.finished)) throw new HttpError(409, 'You have an attempt in progress on another device. Finish it there or wait until tomorrow.');
    if (list.length >= MAX_ATTEMPTS) throw new HttpError(403, 'You’ve used your ' + MAX_ATTEMPTS + ' attempts for today. New challenge tomorrow!');
    // Toca el reto que aún no has jugado hoy: primero el común (A), después el B.
    const used = new Set(list.map(x => x.set_id));
    const set = !used.has('A') ? 'A' : !used.has('B') ? 'B' : SETS[Math.min(list.length, SETS.length - 1)];
    // El número interno solo tiene que ser único para este jugador y día; no se calcula
    // contando, porque la lista puede incluir partidas de otro dispositivo o sin cuenta.
    const insert = async () => {
      const m = await env.DB.prepare('SELECT COALESCE(MAX(num), 0) AS m FROM attempts WHERE player = ? AND date = ?').bind(who.player, date).first();
      const num = m.m + 1;
      const res = await env.DB.prepare(
        'INSERT INTO attempts (player, uid, device, date, num, set_id, started_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id'
      ).bind(who.player, who.uid, who.device, date, num, set, Date.now()).first();
      return { id: res.id, num };
    };
    let row;
    try { row = await insert(); } catch (e) { row = await insert(); }   // si dos pestañas pulsan a la vez
    a = { id: row.id, num: row.num, set_id: set, round: 0, scores: [], total: 0 };
    list.push(a);
  }
  const rounds = day.sets[a.set_id];
  return json({
    day: dayMeta(day),
    attempt: { id: a.id, num: a.num, index: list.indexOf(list.find(x => x.id === a.id)) + 1 || list.length, set: a.set_id, round: a.round, scores: a.scores, total: a.total },
    rounds: rounds.map(publicRound),
    ranked: !!(who.uid && await profileOf(env, who.uid)),
  });
}

async function playRound(req, env, id) {
  const who = await identify(req, env);
  const body = await req.json().catch(() => ({}));
  let a = await env.DB.prepare('SELECT * FROM attempts WHERE id = ?').bind(id).first();
  if (!a || (a.player !== who.player && a.device !== who.device)) throw new HttpError(404, 'Attempt not found.');
  const day = await loadDay(env, a.date);
  // Si esta ronda ya se jugó (se perdió la respuesta, doble toque u otra pestaña),
  // se devuelve el resultado guardado en vez de un error: la web lo muestra como si nada.
  const replay = async (att) => {
    const scores = JSON.parse(att.scores);
    let coins = null;
    if (att.finished && att.uid) {
      const u = await env.DB.prepare('SELECT coins FROM users WHERE uid = ?').bind(att.uid).first();
      if (u) coins = { earned: att.coins, balance: u.coins };
    }
    return json({ pts: scores[body.round], round: day.sets[att.set_id][body.round], total: att.total, finished: !!att.finished, coins, replay: true });
  };
  if (Number.isInteger(body.round) && body.round >= 0 && body.round < a.round) return replay(a);
  if (a.finished) throw new HttpError(409, 'This attempt is already finished.');
  if (body.round !== a.round) throw new HttpError(409, 'That round was already played. Please reload the page.');
  const r = day.sets[a.set_id][a.round];
  if (!validPrediction(r, body.prediction, day.W)) throw new HttpError(400, 'Invalid prediction.');
  const pts = scorePoints(r, body.prediction);
  const scores = [...JSON.parse(a.scores), pts], preds = [...JSON.parse(a.predictions), body.prediction];
  const total = scores.reduce((s, x) => s + x, 0), finished = scores.length === 5 ? 1 : 0;
  const upd = await env.DB.prepare(
    `UPDATE attempts SET round = round + 1, scores = ?, predictions = ?, total = ?, finished = ?, finished_at = ?
     WHERE id = ? AND round = ?`
  ).bind(JSON.stringify(scores), JSON.stringify(preds), total, finished, finished ? Date.now() : null, id, a.round).run();
  if (!upd.meta.changes) {
    // Otra petición ganó la carrera: devolvemos lo que quedó guardado.
    a = await env.DB.prepare('SELECT * FROM attempts WHERE id = ?').bind(id).first();
    if (a && body.round < a.round) return replay(a);
    throw new HttpError(409, 'That round was already played. Please reload the page.');
  }
  // Al terminar, las cuentas con perfil ganan monedas.
  let coins = null;
  if (finished && a.uid) {
    const earned = coinsFor(scores);
    const res = await env.DB.prepare('UPDATE users SET coins = coins + ? WHERE uid = ? RETURNING coins').bind(earned, a.uid).first();
    if (res) {
      await env.DB.prepare('UPDATE attempts SET coins = ? WHERE id = ?').bind(earned, id).run();
      coins = { earned, balance: res.coins };
    }
  }
  // Lo que hizo la gente en esta ronda y, al terminar, tu puesto del día. Si algo falla
  // aquí no se rompe la partida: simplemente no se muestra.
  let crowd = null, rank = null;
  try { crowd = await crowdStats(env, a, body.round, pts, body.prediction, r.type); } catch (e) { console.error('crowd', e); }
  if (finished) try { rank = await rankStats(env, who, a, id, total); } catch (e) { console.error('rank', e); }
  return json({ pts, round: r, total, finished: !!finished, coins, crowd, rank });
}

/* ---------------- lo que hizo la gente ---------------- */
// Clave de la opción elegida en los experimentos de elegir (null en los de posición libre).
function choiceKey(type, p) {
  if (['magnet', 'pour', 'pulley', 'flip', 'jump', 'tower', 'domino', 'gears'].includes(type)) return String(p);
  if (type === 'race') return Array.isArray(p) ? String(p[0]) : null;          // el ganador que elegiste
  if (type === 'orbit') return Array.isArray(p) ? (p.length === 1 ? 'k' + p[0] : 'escape') : null;
  return null;
}
const MIN_CROWD = 3;
// Compara tu ronda con la misma ronda del mismo reto (mismo día y mismo set) de los demás.
async function crowdStats(env, a, idx, pts, pred, type) {
  const path = '$[' + idx + ']';
  const { results } = await env.DB.prepare(
    'SELECT json_extract(predictions, ?1) AS p, json_extract(scores, ?1) AS s FROM attempts WHERE date = ?2 AND set_id = ?3 AND round > ?4 AND id != ?5 AND player != ?6'
  ).bind(path, a.date, a.set_id, idx, a.id, a.player).all();
  const rows = results.filter(x => typeof x.s === 'number');
  const n = rows.length;
  if (n < MIN_CROWD) return { n };
  const pct = (k) => Math.round(100 * k / n);
  const below = rows.filter(x => x.s < pts).length, ties = rows.filter(x => x.s === pts).length;
  const out = { n, nailed: pct(rows.filter(x => x.s >= 80).length), beat: pct(below + ties / 2) };
  const mine = choiceKey(type, pred);
  if (mine != null) {
    const same = rows.filter(x => { let p = x.p; if (typeof p === 'string') try { p = JSON.parse(p); } catch (e) {} return choiceKey(type, p) === mine; }).length;
    out.same = pct(same);
  }
  return out;
}
// Al terminar: percentil del día entre todos los jugadores (con y sin cuenta, su mejor
// intento) y, para cuentas con perfil, puesto en el ranking y a cuántos has adelantado.
async function rankStats(env, who, a, id, total) {
  const all = await env.DB.prepare(
    `SELECT COUNT(*) AS n, SUM(best < ?2) AS below, SUM(best = ?2) AS ties
     FROM (SELECT player, MAX(total) AS best FROM attempts WHERE date = ?1 AND finished = 1 GROUP BY player) WHERE player != ?3`
  ).bind(a.date, total, a.player).first();
  const n = all.n || 0;
  const out = { players: n + 1, top: n >= MIN_CROWD ? Math.max(1, Math.round(100 * (n - (all.below || 0) - (all.ties || 0) / 2) / (n + 1))) : null };
  if (!a.uid || !(await profileOf(env, a.uid))) return out;
  // Tu mejor marca de hoy antes de este intento y ahora.
  const prev = await env.DB.prepare('SELECT MAX(total) AS best FROM attempts WHERE date = ? AND uid = ? AND finished = 1 AND id != ?').bind(a.date, a.uid, id).first();
  const old = prev && prev.best != null ? prev.best : null, best = Math.max(total, old ?? -1);
  const ranked = `SELECT b.uid, b.best FROM (${BEST_SQL}) b JOIN users u ON u.uid = b.uid WHERE b.uid != ?3`;
  const r = await env.DB.prepare(
    `SELECT COUNT(*) AS n, SUM(best > ?4) AS above, SUM(best < ?4 AND (?5 IS NULL OR best >= ?5)) AS passed FROM (${ranked})`
  ).bind(a.date, a.date, a.uid, best, total > (old ?? -1) ? old : best).first();
  out.pos = (r.above || 0) + 1;
  out.ranked = (r.n || 0) + 1;
  out.passed = total > (old ?? -1) ? (r.passed || 0) : 0;
  out.improved = old != null && total > old;
  return out;
}

/* ---------------- rankings ---------------- */
// Mejor puntuación de cada jugador con perfil en cada día del periodo.
const BEST_SQL = `
  SELECT a.uid, a.date, MAX(a.total) AS best, MIN(a.finished_at) AS t
  FROM attempts a WHERE a.finished = 1 AND a.uid IS NOT NULL AND a.date BETWEEN ?1 AND ?2
  GROUP BY a.uid, a.date`;

async function leaderboard(req, env, url) {
  const who = await identify(req, env).catch(() => ({ uid: null }));
  const scope = url.searchParams.get('scope') || 'day';
  const date = isDate(url.searchParams.get('date')) ? url.searchParams.get('date') : today(env);
  const country = (url.searchParams.get('country') || '').toUpperCase();
  const [from, to] = scope === 'day' ? [date, date] : weekRange(date);
  const period = scope === 'countries' ? (url.searchParams.get('period') === 'week' ? 'week' : 'day') : scope;
  const [f, t] = period === 'day' ? [date, date] : [from, to];

  const totals = `SELECT b.uid, SUM(b.best) AS score, COUNT(*) AS days, MIN(b.t) AS t FROM (${BEST_SQL}) b GROUP BY b.uid`;
  if (scope === 'countries') {
    const { results } = await env.DB.prepare(
      `SELECT u.country, ROUND(AVG(x.score)) AS score, COUNT(*) AS players
       FROM (${totals}) x JOIN users u ON u.uid = x.uid GROUP BY u.country ORDER BY score DESC, players DESC LIMIT 100`
    ).bind(f, t).all();
    return json({ scope, period, from: f, to: t, rows: results });
  }
  if (country && !COUNTRY_SET.has(country)) throw new HttpError(400, 'Invalid country.');
  const filter = country ? 'WHERE u.country = ?3' : '';
  const ranked = `SELECT u.uid, u.nickname, u.country, u.name_color, x.score, x.days,
                  RANK() OVER (ORDER BY x.score DESC) AS pos, x.t
                  FROM (${totals}) x JOIN users u ON u.uid = x.uid ${filter}`;
  const args = country ? [f, t, country] : [f, t];
  const { results } = await env.DB.prepare(`${ranked} ORDER BY pos, t LIMIT 100`).bind(...args).all();
  let me = null;
  if (who.uid) me = await env.DB.prepare(`SELECT * FROM (${ranked}) WHERE uid = ?${args.length + 1}`).bind(...args, who.uid).first();
  const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM (${ranked})`).bind(...args).first();
  const strip = (r) => r && ({ pos: r.pos, nickname: r.nickname, country: r.country, color: r.name_color, score: r.score, days: r.days, me: r.uid === who.uid });
  return json({ scope, from: f, to: t, country: country || null, players: count.n, rows: results.map(strip), me: strip(me) });
}

/* ---------------- cuenta ---------------- */
const BANNED = ['fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'rape', 'nazi', 'hitler', 'puta', 'puto', 'polla', 'coño', 'mierda', 'maric', 'admin', 'physle', 'gravle'];
function checkNickname(n) {
  if (typeof n !== 'string' || !/^[A-Za-z0-9_.\-ÁÉÍÓÚÜÑáéíóúüñ]{3,16}$/.test(n)) throw new HttpError(400, 'Names need 3 to 16 letters, numbers, dots, hyphens or underscores.');
  const low = n.toLowerCase();
  if (BANNED.some(w => low.includes(w))) throw new HttpError(400, 'That name isn’t allowed. Try another one.');
}
async function getMe(req, env) {
  const who = await identify(req, env, { requireUser: true });
  return json({ uid: who.uid, profile: await profileOf(env, who.uid) });
}
async function putMe(req, env) {
  const who = await identify(req, env, { requireUser: true });
  const b = await req.json().catch(() => ({}));
  checkNickname(b.nickname);
  if (!COUNTRY_SET.has(b.country)) throw new HttpError(400, 'Choose a country from the list.');
  const exists = await profileOf(env, who.uid);
  if (!exists && !(b.over14 === true && b.acceptTerms === true)) throw new HttpError(400, 'To create an account, confirm you are 16 or older and accept the privacy policy.');
  const taken = await env.DB.prepare('SELECT uid FROM users WHERE nickname = ? COLLATE NOCASE AND uid <> ?').bind(b.nickname, who.uid).first();
  if (taken) throw new HttpError(409, 'That name is taken. Try another one.');
  await env.DB.prepare(
    `INSERT INTO users (uid, nickname, country, created_at, coins) VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(uid) DO UPDATE SET nickname = ?2, country = ?3`
  ).bind(who.uid, b.nickname, b.country, Date.now(), WELCOME_COINS).run();
  // Los intentos de hoy hechos con esta cuenta antes de tener perfil pasan a contar.
  await claimDevice(env, who, today(env));
  return json({ uid: who.uid, profile: await profileOf(env, who.uid), welcome: exists ? 0 : WELCOME_COINS });
}
async function deleteMe(req, env) {
  const who = await identify(req, env, { requireUser: true });
  await env.DB.batch([
    env.DB.prepare('DELETE FROM attempts WHERE uid = ?').bind(who.uid),
    env.DB.prepare('DELETE FROM users WHERE uid = ?').bind(who.uid),
  ]);
  return json({ deleted: true });
}

/* ---------------- tienda ---------------- */
async function shopUser(req, env) {
  const who = await identify(req, env, { requireUser: true });
  const p = await profileOf(env, who.uid);
  if (!p) throw new HttpError(403, 'Create your player profile first.');
  const b = await req.json().catch(() => ({}));
  const item = findItem(b.kind, b.id);
  if (!item) throw new HttpError(400, 'That item doesn’t exist.');
  return { who, p, item, key: b.kind + ':' + b.id, kind: b.kind };
}
async function shopBuy(req, env) {
  const { who, p, item, key } = await shopUser(req, env);
  if (item.price === 0 || p.owned.includes(key)) throw new HttpError(409, 'You already own this.');
  if (p.coins < item.price) throw new HttpError(402, 'Not enough coins yet. Keep playing!');
  const owned = JSON.stringify([...p.owned, key]);
  // Solo se cobra si el saldo y lo comprado siguen como los leímos (evita compras dobles).
  const res = await env.DB.prepare('UPDATE users SET coins = coins - ?1, owned = ?2 WHERE uid = ?3 AND coins >= ?1 AND owned = ?4')
    .bind(item.price, owned, who.uid, JSON.stringify(p.owned)).run();
  if (!res.meta.changes) throw new HttpError(409, 'Something changed in the meantime. Please try again.');
  return json({ profile: await profileOf(env, who.uid) });
}
async function shopEquip(req, env) {
  const { who, p, item, key, kind } = await shopUser(req, env);
  if (item.price > 0 && !p.owned.includes(key)) throw new HttpError(403, 'Buy it first.');
  await env.DB.prepare(`UPDATE users SET ${kind === 'skin' ? 'skin' : 'name_color'} = ? WHERE uid = ?`).bind(item.id, who.uid).run();
  return json({ profile: await profileOf(env, who.uid) });
}
