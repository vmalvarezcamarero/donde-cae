// App de Physle: cuentas, portada del día, intentos, resultado y ranking.
// El juego en sí (dibujo y animación) está en game.js.
import { firebaseConfig } from './firebase-config.js';
import { COUNTRIES } from './countries.js';
import { SKINS, NAME_COLORS, WELCOME_COINS } from './shop.js';
import { publicRound, validPrediction, scorePoints } from './scoring.js';
import { makeCard } from './card.js';

const $ = (id) => document.getElementById(id);
const FB = 'https://www.gstatic.com/firebasejs/12.18.0/';
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const flag = (cc) => cc ? String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0))) : '';
const countryName = (cc) => { try { return regionName.of(cc); } catch (e) { return cc; } };
const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const LEVEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
const SITE = 'gravle.app';   // dirección que aparece al compartir
const band = (s) => s >= 80 ? 'g' : s >= 40 ? 'y' : 'r';
const squares = (sc) => sc.map(s => s >= 80 ? '🟩' : s >= 40 ? '🟨' : '🟥').join('');

/* ---------- utilidades ---------- */
const store = {
  get(k, d) { try { const v = localStorage.getItem('physle:' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('physle:' + k, JSON.stringify(v)); } catch (e) {} },
};
const device = store.get('device') || (() => { const id = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); store.set('device', id); return id; })();
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3800);
}
function show(id) { for (const s of ['home', 'demoHome', 'play', 'end', 'rank', 'shop']) $(s).hidden = s !== id; window.scrollTo({ top: 0 }); }
document.querySelectorAll('dialog [data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

/* ---------- cuentas (Firebase Auth) ---------- */
let fbAuth = null, A = null, user = null;
const testUser = ['localhost', '127.0.0.1'].includes(location.hostname) && new URLSearchParams(location.search).get('testuser');
const accountsOn = !!(firebaseConfig.apiKey || testUser);

async function initAuth() {
  if (testUser) { user = { uid: testUser, email: testUser + '@prueba', getIdToken: async () => 'test:' + testUser, test: true }; return; }
  if (!firebaseConfig.apiKey) return;
  const { initializeApp } = await import(FB + 'firebase-app.js');
  A = await import(FB + 'firebase-auth.js');
  fbAuth = A.getAuth(initializeApp(firebaseConfig));
  fbAuth.languageCode = 'en';
  await new Promise(res => {
    let first = true;
    A.onAuthStateChanged(fbAuth, (u) => { user = u; if (first) { first = false; res(); } else refresh(); });
  });
}
const AUTH_ERRORS = {
  'auth/invalid-email': 'That email address isn’t valid.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Your password needs at least 6 characters.',
  'auth/email-already-in-use': 'There’s already an account with that email. Sign in instead.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/user-not-found': 'There’s no account with that email.',
  'auth/wrong-password': 'Wrong password.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
  'auth/popup-closed-by-user': 'The Google window was closed before you finished.',
  'auth/unauthorized-domain': 'Sign-in isn’t enabled for this web address yet. Add it to Firebase’s authorized domains.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
};
const authMsg = (e) => AUTH_ERRORS[e.code] || 'That didn’t work. Please try again.';

/* ---------- API ---------- */
// Ninguna petición espera para siempre: a los `timeout` ms se corta y se avisa.
// Los fallos de red llevan `retry = true` para poder reintentar sin riesgo.
const NET_MSG = 'Connection problem. Tap again to retry.';
async function api(path, { method = 'GET', body, timeout = 10000 } = {}) {
  const ctrl = new AbortController(), timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const headers = { 'x-device': device };
    if (body) headers['content-type'] = 'application/json';
    if (user) headers.authorization = 'Bearer ' + await Promise.race([
      user.getIdToken(),
      new Promise((_, rej) => ctrl.signal.addEventListener('abort', () => rej(new Error('timeout')))),
    ]);
    let res;
    try { res = await fetch(path, { method, headers, body: body && JSON.stringify(body), signal: ctrl.signal }); }
    catch (e) { const err = new Error(NET_MSG); err.retry = true; throw err; }
    const data = await res.json().catch(() => null);
    if (!data) { const err = new Error(NET_MSG); err.retry = true; throw err; }
    if (!res.ok) { const err = new Error(data.error || NET_MSG); err.retry = res.status >= 500; throw err; }
    return data;
  } catch (e) {
    if (e.message === 'timeout' || e.name === 'AbortError') { const err = new Error(NET_MSG); err.retry = true; throw err; }
    throw e;
  } finally { clearTimeout(timer); }
}

/* ---------- portada ---------- */
let today = null, resetAt = 0;
async function refresh() {
  try {
    today = await api('/api/today');
  } catch (e) {
    $('dayLabel').textContent = 'Offline';
    $('homeNote').textContent = e.message;
    return;
  }
  resetAt = Date.now() + today.resetIn * 1000;
  renderAccount(); renderHome(); tick();
  if (user && today.user && !today.user.profile && !$('profileDlg').open && !store.get('skipProfile:' + user.uid)) openProfile(true);
}
const skinOf = (id) => (SKINS.find(x => x.id === id) || SKINS[0]).look;
const colorOf = (id) => NAME_COLORS.find(x => x.id === id) || NAME_COLORS[0];
function paintName(el, colorId) {
  const c = colorOf(colorId);
  el.classList.toggle('rainbow', c.css === 'rainbow');
  el.style.cssText = c.css && c.css !== 'rainbow' ? c.css : '';
}
function renderAccount() {
  const p = today?.user?.profile;
  $('coinsBtn').hidden = !p; if (p) $('coinsN').textContent = p.coins;
  window.PhysleGame.setSkin(skinOf(p?.skin));
  $('acctAv').textContent = p ? flag(p.country) || p.nickname[0] : user ? (user.email || '?')[0].toUpperCase() : '?';
  $('acctName').textContent = p ? p.nickname : user ? 'Finish your profile' : accountsOn ? 'Sign up' : 'Sign in';
  const guest = accountsOn && !user;
  $('acctBtn').classList.toggle('cta', guest);
  if ($('joinCard')) $('joinCard').hidden = !guest;
  if (!guest && $('endJoin')) $('endJoin').hidden = true;
}
function renderHome() {
  const d = today.day, list = today.attempts, done = list.filter(a => a.finished);
  $('dayLabel').textContent = 'Gravle #' + d.n + ' · ' + fmtDay.format(new Date(d.date + 'T12:00:00'));
  const lv = $('levelLabel'); lv.hidden = false; lv.textContent = LEVEL[d.level]; lv.className = 'badge l' + d.level;
  const best = done.length ? Math.max(...done.map(a => a.total)) : null;
  $('homeTitle').textContent = !list.length ? 'Today’s challenge' : best != null ? 'Your best today: ' + best : 'You have an attempt in progress';
  const tries = $('tries'); tries.innerHTML = '';
  // Los intentos se muestran en el orden en que se jugaron; el reto A es el común.
  const usedA = list.some(x => x.set === 'A');
  for (let i = 1; i <= Math.max(today.max, list.length); i++) {
    const a = list[i - 1], row = document.createElement('div');
    row.className = 'try' + (a && a.finished && a.total === best ? ' best' : '');
    const shared = a ? a.set === 'A' : (!usedA && i === list.length + 1);
    const label = 'Attempt ' + i + ' · ' + (shared ? 'shared' : 'new games');
    const state = !a ? 'Available' : a.finished ? squares(a.scores) : 'In progress (' + a.round + '/5)';
    row.innerHTML = '<span class="k"></span><span></span><b></b>';
    row.children[0].textContent = label; row.children[1].textContent = state; row.children[2].textContent = a && a.finished ? a.total : '—';
    tries.appendChild(row);
  }
  const open = list.find(a => !a.finished), btn = $('playBtn');
  // los iconos muestran los experimentos del intento que toca (el A es el común; el B, los otros cinco)
  const nextSet = open ? open.set : !usedA ? 'A' : 'B';
  renderExps(d.games?.[nextSet] || d.games?.A);
  btn.disabled = false;
  if (open) btn.textContent = 'Continue attempt ' + (list.indexOf(open) + 1);
  else if (list.length >= today.max) { btn.textContent = 'No attempts left until tomorrow'; btn.disabled = true; }
  else btn.textContent = list.length ? 'Play your second attempt' : 'Play';
  const note = $('homeNote');
  const p = today.user?.profile;
  if (!accountsOn) note.textContent = 'Leaderboards are coming very soon.';
  else if (!user) note.textContent = 'Without an account you can play, but your scores won’t count on the leaderboard.';
  else if (!p) note.innerHTML = 'Finish your profile to appear on the leaderboard. <button class="link" type="button" id="noteProfile">Do it now</button>';
  else note.innerHTML = 'Playing as <b></b> ' + flag(p.country) + '. Your best attempt of the day counts.';
  if (p && note.querySelector('b')) note.querySelector('b').textContent = p.nickname;
  $('noteLogin')?.addEventListener('click', openAuth);
  $('noteProfile')?.addEventListener('click', () => openProfile(true));
  $('streak').textContent = streakText();
  // La tienda aparece después de la primera partida: al entrar, lo único importante es jugar.
  const hasPlayed = Object.keys(store.get('played', {})).length > 0 || list.some(a => a.finished);
  $('shopBtn').hidden = !hasPlayed;
}
function tick() {
  if (!resetAt) return;
  const s = Math.max(0, Math.round((resetAt - Date.now()) / 1000));
  if (s === 0) { resetAt = 0; refresh(); return; }
  const h = Math.floor(s / 3600), m = Math.ceil((s % 3600) / 60);
  $('next').textContent = 'Next challenge in ' + (h ? h + ' h ' : '') + m + ' min';
}
setInterval(tick, 20000);

// Racha: días seguidos con al menos un intento terminado (guardada en este dispositivo).
function streakText() {
  const played = store.get('played', {});
  let n = 0, t = Date.parse(today.day.date + 'T12:00:00Z');
  if (!played[today.day.date]) t -= 864e5;
  while (played[new Date(t).toISOString().slice(0, 10)]) { n++; t -= 864e5; }
  return n ? '🔥 ' + n + '-day streak' : '';
}

/* ---------- jugar ---------- */
$('playBtn').addEventListener('click', maybeGate);
$('again').addEventListener('click', maybeGate);
// Antes de empezar un intento sin cuenta se ofrece registrarse (una vez al día).
let lastEndDemo = false;
function maybeGate() {
  if (lastEndDemo && !$('end').hidden) { startDemo(); return; }
  const open = today?.attempts?.some(a => !a.finished);
  const key = 'guestOk:' + (today?.day?.date || '');
  if (accountsOn && !user && !open && !store.get(key) && $('guestDlg')) { $('guestDlg').showModal(); return; }
  startAttempt();
}
$('guestPlay')?.addEventListener('click', () => { store.set('guestOk:' + (today?.day?.date || ''), 1); $('guestDlg').close(); startAttempt(); });
async function startAttempt() {
  let st;
  try { st = await api('/api/attempt', { method: 'POST' }); } catch (e) { toast(e.message); refresh(); return; }
  $('playLabel').textContent = 'Gravle #' + st.day.n + ' · attempt ' + (st.attempt.index || st.attempt.num) + (st.ranked ? ' · counts for the leaderboard' : '');
  show('play');
  window.PhysleGame.play(st, {
    // Si falla la red se reintenta una vez sola: el servidor no puntúa dos veces la misma ronda.
    submit: async (round, prediction) => {
      const send = () => api('/api/attempt/' + st.attempt.id + '/round', { method: 'POST', body: { round, prediction } });
      try { return await send(); }
      catch (e) { if (!e.retry) throw e; await new Promise(r => setTimeout(r, 800)); return send(); }
    },
    error: (msg) => toast(msg),
    done: showEnd,
  });
}
let lastResult = null;
async function showEnd(r) {
  show('end'); lastResult = r;
  const isDemo = !!r.attempt.demo;
  if (!isDemo) { const played = store.get('played', {}); played[r.day.date] = Math.max(played[r.day.date] || 0, r.total); store.set('played', played); }
  $('endLabel').textContent = 'Gravle #' + r.day.n + ' · attempt ' + (r.attempt.index || r.attempt.num);
  $('total').firstChild.textContent = r.total; $('total').lastChild.textContent = ' / ' + r.scores.length * 100;
  $('endNote').textContent = r.total >= 420 ? 'You think like a physicist.' : r.total >= 300 ? 'Good eye. Can you beat it?' : 'Physics shows no mercy. Time for a rematch.';
  const rows = $('rows'); rows.innerHTML = '';
  r.scores.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'row';
    d.innerHTML = '<span class="sq" style="background:var(--' + ({ g: 'good', y: 'warn', r: 'bad' })[band(s)] + ')"></span><span></span><b>' + s + '</b>';
    d.children[1].textContent = (i + 1) + '. ' + window.PhysleGame.TYPE_NAME[r.types[i]] + (r.details[i] ? ' · ' + r.details[i] : '');
    rows.appendChild(d);
  });
  const earned = $('earned');
  if (r.coins) { earned.hidden = false; earned.innerHTML = '<span class="coin" aria-hidden="true"></span><span></span>'; earned.lastChild.textContent = '+' + r.coins.earned + ' coins · you now have ' + r.coins.balance; }
  else earned.hidden = true;
  if ($('endJoin')) $('endJoin').hidden = !(accountsOn && !user);
  lastEndDemo = isDemo;
  if (isDemo) {
    $('endLabel').textContent = 'Demo · ' + LEVEL[r.day.level] + ' · new experiments';
    if ($('endJoin')) $('endJoin').hidden = true;
    $('again').hidden = false; $('again').textContent = 'Play again (new maps)';
    $('share').textContent = 'Gravle · new experiments demo  ' + r.total + '/' + r.scores.length * 100 + '\n' + squares(r.scores) + '\n' + SITE + '/?demo';
    return;
  }
  await refresh();
  const left = today.max - today.attempts.length;
  $('again').hidden = left <= 0;
  $('again').textContent = left > 0 ? 'Second attempt' : '';
  const streak = streakText();
  $('share').textContent = 'Gravle #' + r.day.n + ((r.attempt.index || r.attempt.num) > 1 ? ' (attempt ' + (r.attempt.index || r.attempt.num) + ')' : '') + '  ' + r.total + '/500\n' + squares(r.scores) + (streak ? '\n' + streak : '') + '\n' + SITE;
}
$('copy').addEventListener('click', () => {
  const txt = $('share').textContent, btn = $('copy');
  const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy result'; }, 1600); };
  const fallback = () => { const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents($('share')); sel.removeAllRanges(); sel.addRange(rg); btn.textContent = 'Text selected: copy it'; };
  try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
});
// Compartir la tarjeta como imagen: en el móvil abre el menú de compartir
// (WhatsApp, Instagram, TikTok…); en el ordenador la descarga.
$('shareImg').addEventListener('click', async () => {
  const r = lastResult, btn = $('shareImg'); if (!r) return;
  btn.disabled = true; btn.textContent = 'Making image…';
  try {
    const host = SITE;
    const blob = await makeCard({
      title: r.attempt.demo ? 'Gravle · demo' : 'Gravle #' + r.day.n + ((r.attempt.index || r.attempt.num) > 1 ? ' · attempt ' + (r.attempt.index || r.attempt.num) : ''),
      sub: fmtDay.format(new Date(r.day.date + 'T12:00:00')) + ' · ' + LEVEL[r.day.level],
      total: r.total, scores: r.scores, names: r.types.map(t => window.PhysleGame.TYPE_NAME[t]),
      icons: r.types.map(t => (ICONS[t] || '').replace(/<\/svg>[\s\S]*$/, '</svg>')),
      streak: r.attempt.demo ? '' : streakText(), host,
    });
    const file = new File([blob], 'gravle-' + (r.day.n || 'demo') + '.png', { type: 'image/png' });
    const text = $('share').textContent;
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], text }); } catch (e) { if (e.name !== 'AbortError') throw e; }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Image saved. Share it wherever you like!');
    }
  } catch (e) { console.error(e); toast('Couldn’t create the image. Try “Copy result” instead.'); }
  btn.disabled = false; btn.textContent = 'Share image';
});
$('endHome').addEventListener('click', () => { if (lastEndDemo) { show('demoHome'); return; } show('home'); refresh(); });

/* ---------- ranking ---------- */
let rankScope = 'day';
const rankFilter = $('rankFilter');
function fillCountrySelect(sel, first) {
  sel.innerHTML = '';
  if (first) { const o = document.createElement('option'); o.value = ''; o.textContent = first; sel.appendChild(o); }
  COUNTRIES.map(c => [c, countryName(c)]).sort((a, b) => a[1].localeCompare(b[1], 'en')).forEach(([c, n]) => {
    const o = document.createElement('option'); o.value = c; o.textContent = flag(c) + ' ' + n; sel.appendChild(o);
  });
}
fillCountrySelect(rankFilter, '🌍 All countries');
$('rankBtn').addEventListener('click', () => openRank('day'));
$('endRank').addEventListener('click', () => openRank('day'));
$('rankBack').addEventListener('click', () => { show('home'); refresh(); });
$('tabDay').addEventListener('click', () => openRank('day'));
$('tabWeek').addEventListener('click', () => openRank('week'));
$('tabCountries').addEventListener('click', () => openRank('countries'));
rankFilter.addEventListener('change', () => openRank(rankScope));

// Mientras haya pocos jugadores, solo se enseña el ranking de hoy: tres rankings
// medio vacíos se ven peor que uno lleno. Las pestañas Semana y Países y el filtro
// por país aparecen solos cuando un día supera esta cifra de jugadores.
const FULL_RANKINGS_FROM = 200;
let fullRankings = store.get('fullRankings', false);
function syncRankTabs() {
  document.querySelector('#rank .tabs').hidden = !fullRankings;
  $('rankFilterWrap').hidden = !fullRankings;
}
async function openRank(scope) {
  if (!fullRankings) scope = 'day';
  syncRankTabs();
  rankScope = scope; show('rank');
  for (const [id, s] of [['tabDay', 'day'], ['tabWeek', 'week'], ['tabCountries', 'countries']]) $(id).setAttribute('aria-selected', String(s === scope));
  if (scope === 'countries' && rankFilter.dataset.mode !== 'period') {
    rankFilter.dataset.mode = 'period'; rankFilter.innerHTML = '<option value="day">Today</option><option value="week">This week</option>';
  } else if (scope !== 'countries' && rankFilter.dataset.mode === 'period') {
    rankFilter.dataset.mode = ''; fillCountrySelect(rankFilter, '🌍 All countries');
  }
  const list = $('rankList'), me = $('rankMe');
  list.innerHTML = '<li class="empty">Loading…</li>'; me.hidden = true;
  const q = scope === 'countries' ? 'scope=countries&period=' + (rankFilter.value || 'day') : 'scope=' + scope + (rankFilter.value ? '&country=' + rankFilter.value : '');
  let data;
  try { data = await api('/api/leaderboard?' + q); } catch (e) { list.innerHTML = ''; const li = document.createElement('li'); li.className = 'empty'; li.textContent = e.message; list.appendChild(li); return; }
  if (scope === 'day' && !data.country && data.players >= FULL_RANKINGS_FROM && !fullRankings) { fullRankings = true; store.set('fullRankings', true); syncRankTabs(); }
  const d0 = new Date(data.from + 'T12:00:00'), d1 = new Date(data.to + 'T12:00:00');
  const range = data.from === data.to ? fmtDay.format(d0) : fmtShort.format(d0) + ' – ' + fmtShort.format(d1);
  list.innerHTML = '';
  if (scope === 'countries') {
    $('rankSub').textContent = range + ' · average of their players';
    data.rows.forEach((r, i) => list.appendChild(rankRow(i + 1, r.country, countryName(r.country), r.players + (r.players === 1 ? ' player' : ' players'), r.score)));
  } else {
    $('rankSub').textContent = range + ' · ' + data.players + (data.players === 1 ? ' player' : ' players');
    data.rows.forEach(r => list.appendChild(rankRow(r.pos, r.country, r.nickname, scope === 'week' ? r.days + (r.days === 1 ? ' day' : ' days') : '', r.score, r.me, r.color)));
    if (data.me && !data.rows.some(r => r.me)) { me.innerHTML = ''; me.appendChild(rankRow(data.me.pos, data.me.country, data.me.nickname, '', data.me.score, true, data.me.color)); me.hidden = false; }
  }
  if (!data.rows.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = scope === 'countries' ? 'No countries have scores for this period yet.' : 'Nobody has finished this challenge yet. You could be first!';
    list.appendChild(li);
  }
}
const MEDALS = { 1: ['🥇', 'gold', '1st place'], 2: ['🥈', 'silver', '2nd place'], 3: ['🥉', 'bronze', '3rd place'] };
function rankRow(pos, cc, name, sub, score, isMe, color) {
  const li = document.createElement('li'), medal = MEDALS[pos];
  li.className = [isMe ? 'me' : '', medal ? medal[1] : ''].join(' ').trim();
  li.innerHTML = '<span class="pos"></span><span class="fl"></span><span class="nm"></span><span class="sc"></span>';
  if (medal) { li.children[0].textContent = medal[0]; li.children[0].classList.add('medal'); li.children[0].setAttribute('aria-label', medal[2]); }
  else li.children[0].textContent = pos + '.';
  li.children[1].textContent = flag(cc); li.children[1].title = countryName(cc);
  const nm = document.createElement('span'); nm.textContent = name; if (color) paintName(nm, color);
  li.children[2].appendChild(nm);
  if (sub) { const s = document.createElement('small'); s.textContent = sub; li.children[2].appendChild(s); }
  li.children[3].textContent = score;
  return li;
}

/* ---------- cómo se juega cada experimento ---------- */
const HOW = {
  balance: { title: 'Balance', steps: ['Drag the blue weight onto the beam.', 'Weights pull harder the further they are from the middle: weight × distance must match on both sides.', 'Tap Release and watch the beam.'], pts: 'The closer to perfectly level, the more points.' },
  drop: { title: 'Where will it land?', steps: ['Look at the ramps and pegs. Purple springs bounce hard, yellow sponges don’t bounce.', 'Tap the floor where you think the marble will land.', 'Tap Release and watch it fall.'], pts: 'The closer your mark, the more points.' },
  race: { title: 'Which finishes first?', steps: ['Tap the tracks (or objects) in the order you think they’ll finish.', 'Tip: dropping early builds speed, sand slows marbles down, and ice slides with no friction.', 'Tap Release and watch the race in slow motion.'], pts: 'Picking the winner is worth the most; the full order gets you 100.' },
  pool: { title: 'Bank shot', steps: ['The arrow shows the direction and the bar shows the power.', 'The ball bounces off the cushions and the cloth slows it down.', 'Tap where you think it stops, then tap Release.'], pts: 'The closer to where it stops, the more points.' },
  loop: { title: 'Loop the loop', steps: ['Drag the marble up or down the ramp to choose its starting height.', 'It must keep enough speed to stay on the track upside down at the top of the loop. Carpet slows it down.', 'Find the lowest height that still makes it, then tap Release.'], pts: 'The closer to the minimum height, the more points. Too low and it falls; too high wastes points too.' },
  laser: { title: 'Laser', steps: ['The laser fires along the dotted line.', 'Every mirror reflects it like a pool ball off a cushion: the angle in equals the angle out. Dark blocks absorb it.', 'Tap the wall where you think the beam ends, then tap Release.'], pts: 'The closer to where it hits the wall, the more points.' },
  orbit: { title: 'Orbit', steps: ['A comet flies in along the yellow arrow.', 'Every planet pulls it: bigger planets pull harder, and the pull is much stronger up close.', 'Tap the planet you think it crashes into, or the edge where it flies out.'], pts: 'Right planet: 100. If it escapes, the closer your mark to where it leaves, the more points.' },
  magnet: { title: 'Magnets', steps: ['A steel ball sits still on the table.', 'Every magnet pulls it: ×3 magnets are stronger, but the pull drops fast with distance (strength ÷ distance²).', 'Tap the magnet you think grabs it.'], pts: 'Right magnet: 100.' },
  pour: { title: 'Which glass fills first?', steps: ['The tap pours into glass A.', 'Water rises until it reaches the lowest open pipe, then everything flows down that pipe. Two pipes at the same height share the water. Pipes with ✕ are blocked.', 'Tap the glass you think is full first.'], pts: 'Right glass: 100.' },
  pulley: { title: 'Pulleys', steps: ['Two weights hang from the same rope.', 'Count the ropes holding each weight: the pull of each side is its weight ÷ the number of ropes.', 'Pick which side goes down, or if it stays balanced.'], pts: 'Right answer: 100.' },
  swing: { title: 'Cut the rope', steps: ['The ball swings from where it starts.', 'At the scissors the rope is cut and the ball flies off in the direction it was moving.', 'Tap the floor where you think it lands.'], pts: 'The closer your mark, the more points.' },
  spring: { title: 'Spring shot', steps: ['Drag the ball back to pull the spring.', 'The dotted line is a test shot with a known pull. Pulling twice as far launches twice as fast, and it flies much more than twice as far.', 'Find the pull that lands the ball in the bucket.'], pts: 'Bucket centre: 100. In the bucket: 50 or more. A miss: up to 30 if it was close.' },
  bridge: { title: 'Bridge', steps: ['Drag up to grow the plank standing on the edge.', 'When you release, it tips over onto the other side and the marble rolls to the end of it. If the far side is lower, the plank needs to reach diagonally.', 'If the tip lands on the far platform the marble makes it. The red mark is the perfect spot.'], pts: 'Landing on the red mark: 100. Anywhere on the platform: 50 or more. Falling: up to 30 if it was close.' },
  domino: { title: 'Dominoes', steps: ['The first domino gets a push.', 'A falling domino only knocks the next one if it can reach it, and a light domino struggles to topple a heavy one (dark = 3× heavier).', 'Tap the last domino you think will fall, then tap Release.'], pts: 'Exactly right: 100. One off: 45. Two off: 15.' },
  float: { title: 'Float or sink?', steps: ['Look at each object and the water: fresh or very salty.', 'Things lighter than water for their size float; denser ones sink. Salty water is denser, so it holds more up.', 'Tap the ones that float, then tap Release to drop them all in.'], pts: 'Points for every object you get right; all of them gets 100.' },
  gears: { title: 'Gears', steps: ['The blue gear turns clockwise. Meshing gears turn the opposite way; gears on the same axle turn together.', 'A belt keeps the direction, a crossed belt flips it. Small gears spin faster than big ones.', 'Pick how the flagged gear turns, then tap Release.'], pts: 'Direction and speed right: 100. One of the two: 40.' },
  tower: { title: 'Will it stand?', steps: ['Check how each block rests on the one below. Dark blocks weigh 3×.', 'Tap the block that will hit the ground first, or choose “It stands”.', 'Tap Release and watch.'], pts: 'Right answer: 100 points. Right that it falls but wrong block: 25.' },
};
// Iconos de los 10 experimentos (vienen dibujados en index.html) y guía al tocarlos.
const ICONS = {};
document.querySelectorAll('.exp[data-how]').forEach(b => { ICONS[b.dataset.how] = b.innerHTML; });
function renderExps(games) {
  const ul = $('homeExps'); if (!ul || !games) return;
  ul.innerHTML = '';
  for (const g of games) { if (!ICONS[g]) continue; const li = document.createElement('li'); li.innerHTML = '<button class="exp" type="button" data-how="' + g + '">' + ICONS[g] + '</button>'; ul.appendChild(li); }
}
document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-how]'); if (!btn) return;
  const h = HOW[btn.dataset.how]; if (!h) return;
  $('howTitle').textContent = h.title;
  $('howIcon').innerHTML = btn.querySelector('svg').outerHTML;
  const ol = $('howSteps'); ol.innerHTML = '';
  for (const t of h.steps) { const li = document.createElement('li'); li.textContent = t; ol.appendChild(li); }
  $('howPts').innerHTML = '<b>Points:</b> '; $('howPts').append(h.pts);
  $('howDlg').showModal();
});

/* ---------- ventanas de cuenta ---------- */
$('acctBtn').addEventListener('click', () => {
  if (!accountsOn) { toast('Accounts are coming very soon.'); return; }
  if (!user) openAuth(true); else if (!today?.user?.profile) openProfile(true); else openAccount();
});
let signUp = false;
function openAuth(mode = false) {
  if (!accountsOn) { toast('Accounts are coming very soon.'); return; }
  signUp = mode === true; syncAuthMode(); $('authErr').textContent = ''; $('authDlg').showModal();
}
function syncAuthMode() {
  $('authTitle').textContent = signUp ? 'Create your account' : 'Sign in to compete';
  $('emailSubmit').textContent = signUp ? 'Create account' : 'Sign in';
  $('authMode').textContent = signUp ? 'Already have an account? Sign in' : 'No account? Create one';
  $('password').autocomplete = signUp ? 'new-password' : 'current-password';
}
$('authMode').addEventListener('click', () => { signUp = !signUp; syncAuthMode(); });
async function googleSignIn() {
  if (!accountsOn) { toast('Accounts are coming very soon.'); return; }
  $('authErr').textContent = '';
  try {
    const provider = new A.GoogleAuthProvider();
    try { await A.signInWithPopup(fbAuth, provider); }
    catch (e) { if (e.code === 'auth/popup-blocked') await A.signInWithRedirect(fbAuth, provider); else throw e; }
    for (const d of ['authDlg', 'guestDlg']) if ($(d)?.open) $(d).close();
    await refresh();
  } catch (e) { console.warn('Google sign-in:', e.code, e.message); if ($('authDlg').open) $('authErr').textContent = authMsg(e); else toast(authMsg(e)); }
}
$('googleBtn').addEventListener('click', googleSignIn);
// Botones de registro repartidos por la web (portada, final del intento, aviso antes de jugar).
const G_ICON = $('googleBtn').querySelector('svg').outerHTML;
document.querySelectorAll('[data-google]').forEach(b => { b.insertAdjacentHTML('afterbegin', G_ICON); b.addEventListener('click', googleSignIn); });
const fromGate = (fn) => () => { if ($('guestDlg')?.open) $('guestDlg').close(); fn(); };
document.querySelectorAll('[data-signup]').forEach(b => b.addEventListener('click', fromGate(() => openAuth(true))));
document.querySelectorAll('[data-signin]').forEach(b => b.addEventListener('click', fromGate(() => openAuth(false))));
$('emailForm').addEventListener('submit', async (ev) => {
  ev.preventDefault(); $('authErr').textContent = '';
  const email = $('email').value.trim(), pass = $('password').value;
  try {
    if (signUp) await A.createUserWithEmailAndPassword(fbAuth, email, pass);
    else await A.signInWithEmailAndPassword(fbAuth, email, pass);
    $('authDlg').close(); await refresh();
  } catch (e) { $('authErr').textContent = authMsg(e); }
});
$('forgot').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!email) { $('authErr').textContent = 'Type your email above, then tap this again.'; return; }
  try { await A.sendPasswordResetEmail(fbAuth, email); $('authErr').textContent = 'We’ve sent you an email to reset your password.'; }
  catch (e) { $('authErr').textContent = authMsg(e); }
});

fillCountrySelect($('country'), 'Choose your country');
function openProfile(isNew) {
  const p = today?.user?.profile;
  $('profileTitle').textContent = p ? 'Edit profile' : 'Your player profile';
  $('nick').value = p?.nickname || '';
  const guess = (navigator.language || '').split('-')[1]?.toUpperCase();
  $('country').value = p?.country || (COUNTRIES.includes(guess) ? guess : '');
  $('consent').hidden = !!p; $('profileErr').textContent = '';
  $('profileLater').textContent = p ? 'Cancel' : 'Not now';
  if (!$('profileDlg').open) $('profileDlg').showModal();
}
$('profileLater').addEventListener('click', () => { if (user && !today?.user?.profile) store.set('skipProfile:' + user.uid, true); });
$('profileForm').addEventListener('submit', async (ev) => {
  ev.preventDefault(); $('profileErr').textContent = '';
  try {
    const saved = await api('/api/me', { method: 'PUT', body: { nickname: $('nick').value.trim(), country: $('country').value, over14: $('over14').checked, acceptTerms: $('accept').checked } });
    $('profileDlg').close(); toast(saved.welcome ? 'Profile saved. Here are ' + saved.welcome + ' coins to get you started!' : 'Profile saved.'); await refresh();
  } catch (e) { $('profileErr').textContent = e.message; }
});
function openAccount() {
  const p = today.user.profile;
  $('accountInfo').textContent = p.nickname + ' · ' + flag(p.country) + ' ' + countryName(p.country) + (user.email ? ' · ' + user.email : '');
  $('deleteBox').hidden = true; $('accountDlg').showModal();
}
$('editProfile').addEventListener('click', () => { $('accountDlg').close(); openProfile(false); });
$('logout').addEventListener('click', async () => {
  $('accountDlg').close();
  if (user?.test) user = null; else await A.signOut(fbAuth);
  user = null; await refresh(); toast('You’ve signed out.');
});
$('deleteAsk').addEventListener('click', () => { $('deleteBox').hidden = false; });
$('deleteYes').addEventListener('click', async () => {
  try {
    await api('/api/me', { method: 'DELETE' });
    if (!user.test) {
      try { await A.deleteUser(fbAuth.currentUser); }
      catch (e) { await A.signOut(fbAuth); toast('Your Gravle data is deleted. To remove your sign-in too, sign in again and repeat this.'); }
    }
    user = null; $('accountDlg').close(); await refresh();
    toast('Account deleted.');
  } catch (e) { toast(e.message); }
});

/* ---------- tienda ---------- */
let shopTab = 'skin';
$('shopBtn').addEventListener('click', () => openShop('skin'));
$('coinsBtn').addEventListener('click', () => openShop('skin'));
$('shopBack').addEventListener('click', () => { show('home'); refresh(); });
$('tabSkins').addEventListener('click', () => openShop('skin'));
$('tabColors').addEventListener('click', () => openShop('color'));
function openShop(tab) {
  shopTab = tab; show('shop');
  $('tabSkins').setAttribute('aria-selected', String(tab === 'skin')); $('tabColors').setAttribute('aria-selected', String(tab === 'color'));
  renderShop();
}
function renderShop() {
  const p = today?.user?.profile, note = $('shopNote');
  $('walletN').textContent = p ? p.coins : 0;
  if (!accountsOn) note.textContent = 'The shop opens together with accounts, very soon.';
  else if (!user) note.innerHTML = 'Coins are saved to your account. <button class="link" type="button" id="shopLogin">Sign in or sign up</button> to start earning ' + WELCOME_COINS + ' as a welcome gift.';
  else if (!p) note.innerHTML = 'Finish your profile to unlock the shop. <button class="link" type="button" id="shopProfile">Do it now</button>';
  else note.textContent = shopTab === 'skin' ? 'Your marble in Landing, Bank shot, Loop and Bridge.' : 'How your name looks on the leaderboards.';
  $('shopLogin')?.addEventListener('click', openAuth);
  $('shopProfile')?.addEventListener('click', () => openProfile(true));
  const box = $('items'); box.innerHTML = '';
  const list = shopTab === 'skin' ? SKINS : NAME_COLORS;
  const equipped = shopTab === 'skin' ? (p?.skin || 'classic') : (p?.name_color || 'default');
  for (const it of list) {
    const key = shopTab + ':' + it.id, owned = it.price === 0 || p?.owned.includes(key), on = equipped === it.id;
    const card = document.createElement('div'); card.className = 'item' + (on ? ' on' : '');
    if (shopTab === 'skin') {
      const c = document.createElement('canvas'), dpr = Math.min(devicePixelRatio || 1, 3);
      c.width = c.height = 64 * dpr; card.appendChild(c);
      const g = c.getContext('2d'); g.scale(dpr, dpr); window.PhysleGame.drawMarble(g, 32, 32, 26, it.look, 0.5);
    } else {
      const sw = document.createElement('div'); sw.className = 'sw';
      const nm = document.createElement('span'); nm.textContent = p?.nickname || 'Your name'; paintName(nm, it.id); sw.appendChild(nm); card.appendChild(sw);
    }
    const name = document.createElement('div'); name.className = 'in'; name.textContent = it.name; card.appendChild(name);
    const pr = document.createElement('div'); pr.className = 'pr';
    pr.innerHTML = it.price ? '<span class="coin" aria-hidden="true"></span>' + it.price : 'Free'; card.appendChild(pr);
    const b = document.createElement('button'); b.type = 'button';
    if (on) { b.textContent = 'Equipped'; b.disabled = true; }
    else if (owned) { b.textContent = 'Equip'; b.className = 'sec'; b.disabled = !p; b.addEventListener('click', () => shopAction('equip', it)); }
    else { b.textContent = p && p.coins < it.price ? 'Need ' + (it.price - p.coins) + ' more' : 'Buy'; b.disabled = !p || p.coins < it.price; b.addEventListener('click', () => shopAction('buy', it)); }
    card.appendChild(b); box.appendChild(card);
  }
}
async function shopAction(action, it) {
  try {
    const res = await api('/api/shop/' + action, { method: 'POST', body: { kind: shopTab, id: it.id } });
    today.user.profile = res.profile;
    if (action === 'buy') {   // al comprar, se equipa directamente
      const eq = await api('/api/shop/equip', { method: 'POST', body: { kind: shopTab, id: it.id } });
      today.user.profile = eq.profile; toast('Unlocked: ' + it.name + '!');
    } else toast(it.name + ' equipped.');
    renderAccount(); renderShop();
  } catch (e) { toast(e.message); }
}

/* ---------- demo de experimentos nuevos (/?demo) ---------- */
const DEMO = new URLSearchParams(location.search).has('demo');
let demoData = null, demoLevel = 2, demoRun = 0;
document.querySelectorAll('#demoLevels [data-level]').forEach(b => b.addEventListener('click', () => {
  demoLevel = Number(b.dataset.level);
  document.querySelectorAll('#demoLevels [data-level]').forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
}));
async function startDemo() {
  try { demoData = demoData || await (await fetch('demo.json?v=' + Date.now())).json(); } catch (e) { toast('Couldn’t load the demo.'); return; }
  const variants = demoData.levels[demoLevel], full = variants[demoRun++ % variants.length].map(r => JSON.parse(JSON.stringify(r)));
  const dayMeta = { n: 0, date: new Date().toISOString().slice(0, 10), level: demoLevel, W: demoData.W, H: demoData.H, FLOOR: demoData.FLOOR, R: demoData.R };
  const st = { day: dayMeta, attempt: { id: 'demo' + Date.now(), num: 1, index: 1, round: 0, scores: [], demo: true }, rounds: full.map(publicRound) };
  $('playLabel').textContent = 'Demo · ' + LEVEL[demoLevel] + ' · doesn’t count';
  show('play');
  let total = 0;
  window.PhysleGame.play(st, {
    submit: async (i, pred) => {
      if (!validPrediction(full[i], pred, demoData.W)) throw new Error('Invalid prediction.');
      const pts = scorePoints(full[i], pred); total += pts;
      return { pts, round: JSON.parse(JSON.stringify(full[i])), total, finished: i === full.length - 1, coins: null };
    },
    error: (msg) => toast(msg),
    done: showEnd,
  });
}
$('demoPlay').addEventListener('click', startDemo);

/* ---------- arranque ---------- */
(async () => {
  try { await initAuth(); } catch (e) { console.error(e); }
  await refresh();
  if (DEMO) show('demoHome');
})();
