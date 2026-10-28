// Recordatorios con Web Push, sin servicios externos.
// - Las claves VAPID se crean solas la primera vez y se guardan en D1 (tabla config).
// - Los avisos van vacíos (sin cifrar nada): el service worker pide el texto a /api/push/msg.
// - Dos tandas al día (crons cada 5 min dentro de una hora, ~40 avisos por pasada para no
//   pasar del límite de peticiones del plan gratuito):
//     · «new»:  los experimentos de hoy ya están (a quien aún no ha jugado hoy).
//     · «risk»: tu racha se acaba esta noche (racha ≥ 2 y sin jugar hoy).
// Necesita migrations/0005_push.sql; sin ella, la web simplemente no ofrece recordatorios.

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const enc = new TextEncoder();
let vapid = null;

async function getVapid(env) {
  if (vapid) return vapid;
  let row = await env.DB.prepare("SELECT v FROM config WHERE k = 'vapid'").first();
  if (!row) {
    const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
    const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey), pub = b64u(await crypto.subtle.exportKey('raw', kp.publicKey));
    await env.DB.prepare("INSERT OR IGNORE INTO config (k, v) VALUES ('vapid', ?)").bind(JSON.stringify({ jwk, pub })).run();
    row = await env.DB.prepare("SELECT v FROM config WHERE k = 'vapid'").first();      // por si otra petición ganó
  }
  const { jwk, pub } = JSON.parse(row.v);
  vapid = { pub, key: await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']) };
  return vapid;
}
async function vapidAuth(env, endpoint) {
  const { pub, key } = await getVapid(env);
  const head = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'https://gravle.app' })));
  const sig = b64u(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(head + '.' + body)));
  return 'vapid t=' + head + '.' + body + '.' + sig + ', k=' + pub;
}

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const NEW_LINES = [
  ['New experiments are live 🧪', 'Where will the marble land today? Five new physics puzzles are waiting.'],
  ['Today’s Gravle is ready 🧪', 'Five fresh experiments. Same for everyone. How many can you call?'],
  ['Physics check ✅', 'Today’s experiments just dropped. Two minutes, five predictions.'],
  ['Can you predict today’s? 🧪', 'New towers, magnets and marbles are waiting for your guess.'],
];
// Racha que sigue viva hoy: la guardada en la última visita, si jugó ayer o hoy.
const liveStreak = (row, today, yesterday) => (row.last_play === today || row.last_play === yesterday ? row.streak : 0);

export function pushMessage(row, today, yesterday, hoursLeft) {
  const n = liveStreak(row, today, yesterday);
  if (row.kind === 'risk' && n >= 2) return { title: '⏰ Your ' + n + '-day streak ends ' + (hoursLeft <= 1 ? 'within the hour' : 'in ' + hoursLeft + ' hours'), body: 'Play today’s experiments to keep it alive 🔥' };
  if (n >= 2) return { title: '🔥 Keep your ' + n + '-day streak', body: 'Today’s 5 experiments are live. It only takes a couple of minutes.' };
  const [title, body] = NEW_LINES[hash(today) % NEW_LINES.length];
  return { title, body };
}

// Una pasada de envío. kind: 'new' | 'risk'.
export async function sendPushes(env, kind, today, yesterday) {
  const col = kind === 'risk' ? 'last_risk' : 'last_new';
  const extra = kind === 'risk' ? 'AND s.streak >= 2 AND s.last_play = ?2' : 'AND ?2 IS NOT NULL';
  const { results } = await env.DB.prepare(
    `SELECT s.endpoint FROM push_subs s
     WHERE (s.${col} IS NULL OR s.${col} < ?1) ${extra}
       AND (s.last_play IS NULL OR s.last_play < ?1)
       AND NOT EXISTS (SELECT 1 FROM attempts a WHERE a.date = ?1 AND a.finished = 1 AND (a.device = s.device OR (s.uid IS NOT NULL AND a.uid = s.uid)))
     LIMIT 40`).bind(today, yesterday).all();
  if (!results.length) return { sent: 0, gone: 0 };
  const sent = [], gone = [];
  await Promise.all(results.map(async ({ endpoint }) => {
    try {
      const r = await fetch(endpoint, { method: 'POST', headers: { authorization: await vapidAuth(env, endpoint), ttl: '21600', urgency: 'normal', 'content-length': '0' } });
      if (r.status === 404 || r.status === 410) gone.push(endpoint);
      else if (r.ok) sent.push(endpoint);
      else { console.error('push', r.status, await r.text().catch(() => '')); sent.push(endpoint); }   // no reintentar hoy
    } catch (e) { console.error('push', e); }
  }));
  const marks = (list) => list.map((_, i) => '?' + (i + 2)).join(',');
  if (sent.length) await env.DB.prepare(`UPDATE push_subs SET ${col} = ?1, kind = '${kind}' WHERE endpoint IN (${marks(sent)})`).bind(today, ...sent).run();
  if (gone.length) await env.DB.prepare(`DELETE FROM push_subs WHERE endpoint IN (${gone.map((_, i) => '?' + (i + 1)).join(',')})`).bind(...gone).run();
  return { sent: sent.length, gone: gone.length };
}

// Alta o puesta al día de una suscripción (la web la manda en cada visita con la racha actual).
export async function syncSub(env, who, b, today) {
  const ok = typeof b?.endpoint === 'string' && /^https:\/\//.test(b.endpoint) && b.endpoint.length < 1000
    && typeof b.keys?.p256dh === 'string' && typeof b.keys?.auth === 'string';
  if (!ok) return false;
  const streak = Math.max(0, Math.min(10000, Number(b.streak) || 0)), lastPlay = b.played ? today : (typeof b.lastPlay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.lastPlay) ? b.lastPlay : null);
  await env.DB.prepare(
    `INSERT INTO push_subs (endpoint, p256dh, auth, uid, device, streak, last_play, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(endpoint) DO UPDATE SET p256dh = ?2, auth = ?3, uid = COALESCE(?4, uid), device = ?5, streak = ?6, last_play = COALESCE(?7, last_play)`
  ).bind(b.endpoint, b.keys.p256dh, b.keys.auth, who.uid || null, who.device, streak, lastPlay, Date.now()).run();
  return true;
}
export const vapidPublic = async (env) => (await getVapid(env)).pub;
