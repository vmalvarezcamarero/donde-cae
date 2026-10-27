// App de Physle: cuentas, portada del día, intentos, resultado y ranking.
// El juego en sí (dibujo y animación) está en game.js.
import { firebaseConfig } from './firebase-config.js';
import { COUNTRIES } from './countries.js';
import { SKINS, TRAILS, NAME_COLORS, WELCOME_COINS, rarityOf, dailyDeal, priceOf } from './shop.js?v=20261027i';
import { publicRound, validPrediction, scorePoints } from './scoring.js?v=20261027i';
import { makeCard } from './card.js?v=20261027i';

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
// Cambiar de pantalla como quien pasa la hoja del cuaderno: hacia delante entra por la
// derecha (portada → partida → resultado → ranking) y al volver, por la izquierda.
const PAGE = { home: 0, demoHome: 0, play: 1, end: 2, rank: 3, shop: 3 };
let curPage = 'home', homeEnter = true;
function show(id) {
  const prev = curPage; curPage = id;
  for (const s of ['home', 'demoHome', 'play', 'end', 'rank', 'shop']) $(s).hidden = s !== id;
  window.scrollTo({ top: 0 });
  if (id === 'home') homeEnter = true;
  const J = window.Juice;
  if (!J || J.reduce || prev === id) return;
  const back = PAGE[id] < PAGE[prev], dx = back ? -34 : 34;
  $(id).animate([{ transform: 'translateX(' + dx + 'px) rotate(' + (back ? -0.8 : 0.8) + 'deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 340, easing: 'cubic-bezier(.2,.9,.3,1.1)' });
  J.sfx.page();
}
// Los iconos de los experimentos entran uno a uno al llegar a la portada.
function enterHome() {
  const J = window.Juice; if (!J || J.reduce) return;
  document.querySelectorAll('#homeExps li').forEach((li, i) => li.animate([{ transform: 'translateY(12px) scale(.75)', opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 420, delay: 120 + i * 70, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'backwards' }));
}
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
const trailOf = (id) => (TRAILS.find(x => x.id === id) || TRAILS[0]).look;
function paintName(el, colorId) {
  const c = colorOf(colorId);
  el.classList.remove('rainbow', 'nc-fire', 'nc-ice');
  if (c.css === 'rainbow') el.classList.add('rainbow');
  else if (c.css.startsWith('class:')) el.classList.add(c.css.slice(6));
  el.style.cssText = c.css && c.css !== 'rainbow' && !c.css.startsWith('class:') ? c.css : '';
}
function renderAccount() {
  const p = today?.user?.profile;
  $('coinsBtn').hidden = !p; if (p) $('coinsN').textContent = p.coins;
  window.PhysleGame.setSkin(skinOf(p?.skin)); window.PhysleGame.setTrail(trailOf(p?.trail));
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
  renderHomeStreak();
  if (homeEnter && !$('home').hidden) { homeEnter = false; enterHome(); }
  // La tienda aparece después de la primera partida: al entrar, lo único importante es jugar.
  const hasPlayed = Object.keys(store.get('played', {})).length > 0 || list.some(a => a.finished);
  $('shopBtn').hidden = !hasPlayed;
}
// Cuenta atrás hasta el próximo Gravle: se mueve cada segundo en la portada y en
// la pantalla final (allí con dígitos que giran al cambiar).
const hms = (s) => [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map(v => String(v).padStart(2, '0'));
function tick() {
  if (!resetAt) return;
  const s = Math.max(0, Math.round((resetAt - Date.now()) / 1000));
  if (s === 0) { resetAt = 0; refresh(); return; }
  const p = hms(s);
  $('next').textContent = 'Next challenge in ' + p.join(':');
  if (!$('end').hidden && !$('streakBox').hidden) paintClock(p.join(''));
}
setInterval(tick, 1000);
let clockPrev = '';
function paintClock(str) {
  const el = $('endClock');
  if (el.children.length !== 8) { el.innerHTML = '<i></i><i></i><u>:</u><i></i><i></i><u>:</u><i></i><i></i>'; clockPrev = ''; }
  const ds = el.querySelectorAll('i'), J = window.Juice;
  for (let k = 0; k < 6; k++) if (str[k] !== clockPrev[k]) {
    ds[k].textContent = str[k];
    if (clockPrev && J && !J.reduce) ds[k].animate([{ transform: 'rotateX(90deg)', opacity: 0.3 }, { transform: 'none', opacity: 1 }], { duration: 260, easing: 'ease-out' });
  }
  clockPrev = str;
}

// Racha: días seguidos con al menos un intento terminado (guardada en este dispositivo).
// Si hoy aún no has jugado, cuenta hasta ayer: la racha sigue viva pero en peligro.
function streakCount(date = today.day.date) {
  const played = store.get('played', {});
  let n = 0, t = Date.parse(date + 'T12:00:00Z');
  if (!played[date]) t -= 864e5;
  while (played[new Date(t).toISOString().slice(0, 10)]) { n++; t -= 864e5; }
  return n;
}
function streakText() { const n = streakCount(); return n ? '🔥 ' + n + '-day streak' : ''; }
// Hitos: solo en estos días hay celebración grande, para que no se gaste.
const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];
const nextMilestone = (n) => MILESTONES.find(m => m > n) || (Math.floor(n / 100) + 1) * 100;
// La llama crece con la racha y cambia de color: naranja, más grande a partir de 7, azul-violeta desde 30.
const flameTier = (n) => n >= 30 ? 3 : n >= 7 ? 2 : 1;
function renderHomeStreak() {
  const el = $('streak'), n = streakCount(), atRisk = n > 0 && !store.get('played', {})[today.day.date];
  el.innerHTML = '';
  if (!n) return;
  const f = document.createElement('span'); f.className = 'flame sm' + (atRisk ? ' risk' : ''); f.dataset.tier = flameTier(n); f.setAttribute('aria-hidden', 'true');
  const t = document.createElement('span'); t.textContent = n + '-day streak' + (atRisk ? ' · play today to keep it' : '');
  el.append(f, t);
}
// Estrellas: 1 con el 30 %, 2 con el 60 % y 3 con el 84 % de los puntos (150 / 300 / 420 de 500).
const starsOf = (total, max) => [0.3, 0.6, 0.84].filter(k => total >= k * max).length;
const STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.85 5.95 6.55.85-4.8 4.55 1.2 6.5L12 17.3l-5.8 3.15 1.2-6.5L2.6 9.4l6.55-.85z" stroke-linejoin="round"/></svg>';

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
const starLine = (k) => k ? '  ' + '⭐'.repeat(k) : '';
// Sello de día perfecto: «PERFECT» con la puntuación máxima, «FLAWLESS» si las cinco rondas son verdes (≥80).
function stampOf(r) {
  const max = r.scores.length * 100;
  if (r.total >= max) return { stamp: 'PERFECT', stampSub: max + ' / ' + max };
  if (r.scores.every(s => s >= 80)) return { stamp: 'FLAWLESS', stampSub: 'ALL ' + r.scores.length + ' GREEN' };
  return { stamp: '', stampSub: '' };
}
function placeStamp(st) {
  const el = document.createElement('div'); el.className = 'stamp' + (st.stamp === 'PERFECT' ? ' gold' : '');
  el.setAttribute('role', 'img'); el.setAttribute('aria-label', st.stamp + ' stamp');
  el.innerHTML = '<b></b><small></small>'; el.firstChild.textContent = st.stamp; el.lastChild.textContent = st.stampSub;
  $('end').appendChild(el); return el;
}
// El sello cae sobre la hoja: golpe seco, temblor, salpicadura de tinta y confeti de papel.
function stampFx(st) {
  const J = window.Juice, el = placeStamp(st);
  el.animate([{ transform: 'rotate(-11deg) scale(2.8)', opacity: 0 }, { transform: 'rotate(-11deg) scale(.94)', opacity: 1, offset: 0.6 }, { transform: 'rotate(-11deg) scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.55,0,.75,.2)' });
  setTimeout(() => {
    J.sfx.stamp(); J.buzz(40); J.shake($('end'), 6, 320);
    const b = el.getBoundingClientRect(), ink = getComputedStyle(el).color;
    J.dust(b.left + b.width / 2, b.bottom - 4, { colors: [ink], n: 26, power: 0.8, ring: ink });
    J.confetti(b.left + b.width / 2, b.top + b.height / 2, { n: 60, power: 0.8 });
  }, 230);
}
// Juice de la pantalla final: total que rueda, filas que entran una a una y
// celebración según la nota (fanfarria y confeti triple solo con 500/500).
// Orden: total que rueda → estrellas una a una → celebración según la nota → racha.
let endRun = 0;
function endFx(r, st) {
  const J = window.Juice, run = ++endRun;
  const max = r.scores.length * 100, t = r.total, num = $('totalN'), stars = [...$('stars').children];
  const calm = !J || J.reduce;
  const wait = (ms) => new Promise(res => setTimeout(res, calm ? 0 : ms));
  const alive = () => run === endRun && !$('end').hidden;
  if (calm) { num.textContent = t; stars.forEach((s, i) => s.classList.toggle('on', i < st.stars)); paintStreak(st, st.n); if (st.stamp) placeStamp(st); return; }
  [...$('rows').children].forEach((d, i) => d.animate([{ opacity: 0, transform: 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: 200 + i * 110, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' }));
  J.roll(num, t, { ms: 1100 }).then(async () => {
    for (let i = 0; i < st.stars; i++) {
      await wait(i ? 320 : 150); if (!alive()) return;
      const s = stars[i]; s.classList.add('on'); J.sfx.star(i); J.buzz(12);
      s.animate([{ transform: 'scale(2.6) rotate(-35deg)', opacity: 0 }, { transform: 'scale(.85) rotate(8deg)', opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }], { duration: 460, easing: 'cubic-bezier(.3,1.4,.5,1)' });
      const b = s.getBoundingClientRect();
      J.confetti(b.left + b.width / 2, b.top + b.height / 2, { n: 22, power: 0.5, colors: [J.palette()[2], J.palette()[0]] });
    }
    await wait(st.stars ? 350 : 100); if (!alive()) return;
    const b = num.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2;
    if (t >= max) {
      J.sfx.fanfare(); J.buzz([30, 40, 30, 40, 60]);
      [0, 300, 600].forEach((d, i) => setTimeout(() => J.confetti(innerWidth * (0.2 + 0.3 * i), innerHeight * 0.75, { n: 120, power: 1.25 }), d));
    } else if (st.stars === 3) { J.sfx.good(5, true); J.confetti(x, y, { n: 110 }); }
    else if (st.stars === 2) { J.sfx.ok(); J.confetti(x, y, { n: 40, power: 0.7 }); }
    if (st.stamp) { await wait(t >= max ? 650 : 300); if (!alive()) return; stampFx(st); }
    if (!st.show) return;
    await wait(t >= max ? 1100 : 650); if (!alive()) return;
    streakFx(st);
    if (st.rank && st.rank.passed > 0) { await wait(st.firstToday ? 1300 : 300); if (!alive()) return; passedFx(st.rank); }
  });
}
// Dónde quedas hoy: percentil entre todos los jugadores y, con perfil, tu puesto del ranking.
function renderRank(k) {
  const el = $('rankLine'); el.innerHTML = '';
  if (!k || (k.top == null && k.pos == null)) { el.hidden = true; return; }
  el.hidden = false;
  const chip = (txt, cls) => { const c = document.createElement('span'); c.className = 'rchip ' + (cls || ''); c.textContent = txt; el.appendChild(c); return c; };
  if (k.top != null) chip('Top ' + k.top + '% today', k.top <= 10 ? 'hot' : '');
  if (k.pos != null) chip('#' + k.pos + ' of ' + k.ranked + ' on the leaderboard');
  if (k.passed > 0) chip('↑ passed ' + k.passed, 'up');
}
// Aviso que sube desde abajo: «You passed N players» con el número rodando.
function passedFx(k) {
  const J = window.Juice; if (!J) return;
  document.querySelector('.passup')?.remove();
  const el = document.createElement('div'); el.className = 'passup'; el.setAttribute('role', 'status');
  el.innerHTML = '<span class="arrow" aria-hidden="true">↑</span><span>You passed <b>0</b> players · now <b></b></span>';
  el.querySelectorAll('b')[1].textContent = '#' + k.pos;
  document.body.appendChild(el);
  el.animate([{ transform: 'translate(-50%, 140%)' }, { transform: 'translate(-50%, -8%)', offset: 0.7 }, { transform: 'translate(-50%, 0)' }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  J.roll(el.querySelector('b'), k.passed, { ms: 900 }).then(() => { J.sfx.good(3); J.buzz(20); });
  setTimeout(() => { const a = el.animate([{ transform: 'translate(-50%, 0)' }, { transform: 'translate(-50%, 160%)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' }); a.onfinish = () => el.remove(); }, 3600);
}
// Pinta el bloque de racha con el número indicado (antes y después de sumar el día de hoy).
function paintStreak(st, n) {
  $('streakN').textContent = n;
  const f = $('flame'); f.dataset.tier = flameTier(n); f.classList.toggle('off', n === 0);
  const sub = $('streakSub');
  if (n === 0) sub.textContent = 'Finish today to start one';
  else if (!st.firstToday) sub.textContent = 'Come back tomorrow to keep it going';
  else if (st.milestone) sub.textContent = 'Next goal: ' + nextMilestone(n) + ' days';
  else if (n === 1) sub.textContent = 'Streak started. Come back tomorrow!';
  else sub.textContent = 'Next goal: ' + nextMilestone(n) + ' days';
}
function streakFx(st) {
  const J = window.Juice, box = $('streakBox'), wrap = $('flameWrap');
  if (!st.firstToday) return;
  J.roll($('streakN'), st.n, { from: st.n - 1, ms: 450, ticks: false }).then(() => paintStreak(st, st.n));
  wrap.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.9) translateY(-6px)', offset: 0.35 }, { transform: 'scale(.9)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 700, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  setTimeout(() => { $('flame').dataset.tier = flameTier(st.n); }, 250);
  J.sfx.streak(); J.buzz(st.milestone ? [20, 30, 20, 30, 50] : 20);
  const b = wrap.getBoundingClientRect(), x = b.left + b.width / 2, y = b.top + b.height / 2, pal = J.palette();
  J.confetti(x, y, { n: st.milestone ? 80 : 26, power: st.milestone ? 0.9 : 0.55, colors: st.n >= 30 ? [pal[1], pal[3], pal[2]] : [pal[0], pal[2]] });
  if (st.milestone) {
    setTimeout(() => (st.n >= 7 ? J.sfx.fanfare() : J.sfx.good(3, true)), 250);
    const m = document.createElement('div'); m.className = 'milestone'; m.textContent = st.n + '-DAY MILESTONE';
    box.querySelector('.milestone')?.remove(); box.appendChild(m); box.classList.add('has-milestone');
    m.animate([{ transform: 'translate(-50%, 0) scale(2.4) rotate(-10deg)', opacity: 0 }, { transform: 'translate(-50%, 0) scale(.92) rotate(-3deg)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%, 0) rotate(-4deg)', opacity: 1 }], { duration: 560, easing: 'cubic-bezier(.2,.9,.3,1)', fill: 'both' });
  }
}
async function showEnd(r) {
  show('end'); lastResult = r;
  const isDemo = !!r.attempt.demo;
  const firstToday = !isDemo && !store.get('played', {})[r.day.date];
  if (!isDemo) { const played = store.get('played', {}); played[r.day.date] = Math.max(played[r.day.date] || 0, r.total); store.set('played', played); }
  const max = r.scores.length * 100, nStars = starsOf(r.total, max), sn = isDemo ? 0 : streakCount(r.day.date);
  const st = { show: !isDemo, n: sn, firstToday, stars: nStars, milestone: firstToday && MILESTONES.includes(sn), ...stampOf(r) };
  $('end').querySelector('.stamp')?.remove();
  st.rank = r.rank || null; renderRank(st.rank);
  $('stars').innerHTML = STAR_SVG.repeat(3); $('stars').setAttribute('aria-label', nStars + ' of 3 stars');
  $('streakBox').hidden = isDemo; $('streakBox').querySelector('.milestone')?.remove(); $('streakBox').classList.remove('has-milestone');
  if (!isDemo) { paintStreak({ ...st, milestone: false }, firstToday ? Math.max(0, sn - 1) : sn); clockPrev = ''; tick(); }
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
  endFx(r, st);
  const earned = $('earned');
  if (r.coins) { earned.hidden = false; earned.innerHTML = '<span class="coin" aria-hidden="true"></span><span></span>'; earned.lastChild.textContent = '+' + r.coins.earned + ' coins · you now have ' + r.coins.balance; }
  else earned.hidden = true;
  if ($('endJoin')) $('endJoin').hidden = !(accountsOn && !user);
  lastEndDemo = isDemo;
  if (isDemo) {
    $('endLabel').textContent = 'Demo · ' + LEVEL[r.day.level] + ' · new experiments';
    if ($('endJoin')) $('endJoin').hidden = true;
    $('again').hidden = false; $('again').textContent = 'Play again (new maps)';
    $('share').textContent = 'Gravle · new experiments demo  ' + r.total + '/' + r.scores.length * 100 + starLine(nStars) + '\n' + squares(r.scores) + '\n' + SITE + '/?demo';
    return;
  }
  await refresh();
  const left = today.max - today.attempts.length;
  $('again').hidden = left <= 0;
  $('again').textContent = left > 0 ? 'Second attempt' : '';
  const streak = streakText();
  $('share').textContent = 'Gravle #' + r.day.n + ((r.attempt.index || r.attempt.num) > 1 ? ' (attempt ' + (r.attempt.index || r.attempt.num) + ')' : '') + '  ' + r.total + '/500' + starLine(nStars) + '\n' + squares(r.scores) + (streak ? '\n' + streak : '') + '\n' + SITE;
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
      streak: r.attempt.demo ? '' : streakText(), host, stars: starsOf(r.total, r.scores.length * 100), ...stampOf(r),
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
  // Los tres primeros suben al podio; la lista empieza en el 4.º
  const pod = scope === 'countries'
    ? data.rows.slice(0, 3).map((r, i) => ({ pos: i + 1, country: r.country, nickname: countryName(r.country), score: r.score, sub: r.players + (r.players === 1 ? ' player' : ' players'), isCountry: true }))
    : data.rows.filter(r => r.pos <= 3).slice(0, 3);
  renderPodium(pod);
  if (scope === 'countries') {
    $('rankSub').textContent = range + ' · average of their players';
    data.rows.forEach((r, i) => { if (i >= 3) list.appendChild(rankRow(i + 1, r.country, countryName(r.country), r.players + (r.players === 1 ? ' player' : ' players'), r.score)); });
  } else {
    $('rankSub').textContent = range + ' · ' + data.players + (data.players === 1 ? ' player' : ' players');
    data.rows.forEach(r => { if (!pod.includes(r)) list.appendChild(rankRow(r.pos, r.country, r.nickname, scope === 'week' ? r.days + (r.days === 1 ? ' day' : ' days') : '', r.score, r.me, r.color)); });
    if (data.me && !data.rows.some(r => r.me)) { me.innerHTML = ''; me.appendChild(rankRow(data.me.pos, data.me.country, data.me.nickname, '', data.me.score, true, data.me.color)); me.hidden = false; }
  }
  // el resto de la lista entra escalonada después del podio
  const J = window.Juice;
  if (J && !J.reduce) [...list.children, ...(me.hidden ? [] : me.children)].forEach((li, i) => li.animate([{ opacity: 0, transform: 'translateX(24px)' }, { opacity: 1, transform: 'none' }], { duration: 320, delay: (pod.length ? 1500 : 100) + Math.min(i, 15) * 45, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'backwards' }));
  if (!data.rows.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = scope === 'countries' ? 'No countries have scores for this period yet.' : 'Nobody has finished this challenge yet. You could be first!';
    list.appendChild(li);
  }
}
/* ---------- podio ----------
   Los escalones suben del 3.º al 1.º; en cada uno cae la canica del jugador (su skin de la
   tienda) con goma; al 1.º le cae una corona y sale confeti. Después el campeón da saltitos. */
let podRaf = 0, podState = null;
const CROWN = '<svg viewBox="0 0 40 28" aria-hidden="true"><path d="M3 24 L6 6 L14 15 L20 3 L26 15 L34 6 L37 24 Z" fill="var(--mostaza)" stroke="var(--ink)" stroke-width="2.4" stroke-linejoin="round"/><circle cx="20" cy="17" r="2.6" fill="var(--coral)"/><path d="M5 24 H35" stroke="var(--ink)" stroke-width="2.4"/></svg>';
function renderPodium(rows) {
  const el = $('podium'); el.innerHTML = ''; cancelAnimationFrame(podRaf); podRaf = 0;
  if (!rows.length) { el.hidden = true; podState = null; return; }
  el.hidden = false;
  const J = window.Juice, calm = !J || J.reduce, blocks = [];
  // orden visual: 2.º, 1.º, 3.º — y el que sube antes es el 3.º
  [[1, 0.45], [0, 0.9], [2, 0]].forEach(([k, delay]) => {
    const r = rows[k], col = document.createElement('div');
    col.className = 'pod p' + (k + 1) + (r?.me ? ' me' : '') + (r ? '' : ' none');
    col.innerHTML = '<div class="pav">' + (k === 0 ? '<span class="crown">' + CROWN + '</span>' : '') + '<canvas aria-hidden="true"></canvas></div><div class="pname"></div><div class="pscore"></div><div class="step"><b>' + (k + 1) + '</b></div>';
    if (r) {
      const nm = document.createElement('span'); nm.textContent = r.nickname; if (r.color) paintName(nm, r.color);
      col.querySelector('.pname').append(flag(r.country) + ' ', nm);
      if (r.me) { const y = document.createElement('em'); y.textContent = 'you'; col.querySelector('.pname').appendChild(y); }
      col.querySelector('.pscore').textContent = calm ? r.score : '0';
      col.setAttribute('aria-label', (k + 1) + '. ' + r.nickname + ', ' + r.score + ' points');
    } else col.querySelector('.pname').textContent = '—';
    el.appendChild(col); blocks.push({ col, r, k, delay, cv: col.querySelector('canvas') });
  });
  podState = { t0: performance.now() / 1000 - (calm ? 20 : 0), blocks };
  if (!calm && rows[0]) blocks.find(b => b.k === 0).col.querySelector('.crown').style.opacity = '0';
  if (!calm) blocks.forEach(b => {
    const step = b.col.querySelector('.step'), info = b.col.querySelectorAll('.pname, .pscore');
    step.animate([{ transform: 'scaleY(0)' }, { transform: 'scaleY(1.08)', offset: 0.7 }, { transform: 'scaleY(1)' }], { duration: 420, delay: b.delay * 1000, easing: 'ease-out', fill: 'backwards' });
    info.forEach(n => n.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 300, delay: (b.delay + 0.75) * 1000, fill: 'backwards' }));
    setTimeout(() => { if (!$('rank').hidden) J.sfx.star(2 - b.k); }, b.delay * 1000 + 120);
    if (!b.r) return;
    setTimeout(() => {                                   // la canica toca el escalón
      if ($('rank').hidden) return;
      J.sfx.tock(b.k === 0 ? 1.2 : 0.7);
      J.roll(b.col.querySelector('.pscore'), b.r.score, { ms: 600, ticks: false });
      if (b.k === 0) {
        J.sfx.fanfare(); J.buzz([20, 30, 40]);
        const cr = b.col.querySelector('.crown'); cr.style.opacity = '';
        cr.animate([{ transform: 'translate(-50%, -60px) rotate(-25deg)', opacity: 0 }, { transform: 'translate(-50%, 4px) rotate(8deg)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%, 0) rotate(-6deg)', opacity: 1 }], { duration: 520, delay: 250, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'backwards' });
        const bb = b.col.getBoundingClientRect(); setTimeout(() => J.confetti(bb.left + bb.width / 2, bb.top + 30, { n: 90, power: 0.9 }), 300);
      }
    }, (b.delay + 0.7) * 1000);
  });
  podRaf = requestAnimationFrame(podLoop);
}
function podLoop(now) {
  if ($('rank').hidden || !podState) { podRaf = 0; return; }
  const t = now / 1000 - podState.t0, G = window.PhysleGame;
  for (const b of podState.blocks) {
    if (!b.r) continue;
    const g = fitCanvas(b.cv); if (!g) continue;
    const w = b.cv.clientWidth, h = b.cv.clientHeight, rad = b.k === 0 ? 17 : 14, ground = h - 1 - rad, tl = t - b.delay - 0.35;
    g.clearRect(0, 0, w, h);
    if (tl < 0) continue;
    let y = ground, def = null;
    if (tl < 0.35) { const u = tl / 0.35; y = -rad + (ground + rad) * u * u; def = { ax: Math.PI / 2, sx: 1 + 0.25 * u, sy: 1 - 0.12 * u, push: 0 }; }
    else {
      const a = tl - 0.35, s0 = 0.42 * Math.exp(-a * 7) * Math.cos(a * 22);
      if (Math.abs(s0) > 0.015) def = { ax: -Math.PI / 2, sx: 1 - s0, sy: 1 + s0 * 0.7, push: s0 };
      if (b.k === 0 && a > 1.2) {                         // el campeón da saltitos de vez en cuando
        const ph = (a - 1.2) % 2.8;
        if (ph < 0.5) { const u = ph / 0.5; y = ground - 22 * 4 * u * (1 - u); }
        else if (ph < 0.9) { const c = ph - 0.5, s1 = 0.3 * Math.exp(-c * 9) * Math.cos(c * 24); def = { ax: -Math.PI / 2, sx: 1 - s1, sy: 1 + s1 * 0.7, push: s1 }; }
      }
    }
    if (b.r.isCountry) { g.save(); g.translate(w / 2, y); if (def) { g.scale(def.sx > 1 ? 1 / def.sx : 1 + (1 - def.sx), def.sx); } g.font = (rad * 1.9) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(flag(b.r.country), 0, 2); g.restore(); }
    else G.drawMarble(g, w / 2, y, rad, skinOf(b.r.skin), t * (b.k === 0 ? 2 : 1), def);
    if (b.k === 0) {                                      // la corona va encima de la canica, también al saltar
      const cr = b.col.querySelector('.crown'), top = rad * (def ? def.sx : 1);
      if (cr) cr.style.top = Math.round(b.cv.offsetTop + Math.max(y, 0) - top - 18) + 'px';
    }
  }
  podRaf = requestAnimationFrame(podLoop);
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
  flip: { title: 'Marble run', steps: ['Marbles roll down one after another, starting with #1.', 'Each yellow gate blocks one tube, so the marble takes the open one (green arrow). As it passes, the gate swaps sides for the next marble. Grey gates never move.', 'Tap the cup where the highlighted marble ends up.'], pts: 'Right cup: 100.' },
  jump: { title: 'Bike jump', steps: ['The dotted line is a test jump at a known speed.', 'Speed counts double: twice as fast flies four times as far (half as fast, a quarter as far).', 'Tap the bus where you think the bike lands, or the green ramp if it clears them all.'], pts: 'Right bus: 100. One bus off: 40.' },
  pulley: { title: 'Pulleys', steps: ['Two weights hang from the same rope.', 'Count the ropes holding each weight: the pull of each side is its weight ÷ the number of ropes.', 'Pick which side goes down, or if it stays balanced.'], pts: 'Right answer: 100.' },
  swing: { title: 'Cut the rope', steps: ['The ball swings from where it starts.', 'At the scissors the rope is cut and the ball flies off in the direction it was moving.', 'Tap the floor where you think it lands.'], pts: 'The closer your mark, the more points.' },
  spring: { title: 'Cannon shot', steps: ['Drag the ball back inside the cannon to pull its spring.', 'The dotted line is a test shot with a known pull. Pull twice as far and the ball leaves twice as fast, which carries it much more than twice as far.', 'Find the pull that lands the ball in the middle of the target.'], pts: 'Bullseye: 100. Each ring shows the points: 75, 50 and 25 as you move away from the centre.' },
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
// Arriba, una vista previa animada de lo que eliges (pruébalo antes de comprarlo); debajo,
// la oferta del día y las tarjetas. Al comprar, las monedas vuelan de tu cartera al artículo.
const SHOP = { skin: SKINS, trail: TRAILS, color: NAME_COLORS };
let shopTab = 'skin', shopSel = null, shopRaf = 0, shopCards = [];
$('shopBtn').addEventListener('click', () => openShop('skin'));
$('coinsBtn').addEventListener('click', () => openShop('skin'));
$('shopBack').addEventListener('click', () => { show('home'); refresh(); });
$('tabSkins').addEventListener('click', () => openShop('skin'));
$('tabTrails').addEventListener('click', () => openShop('trail'));
$('tabColors').addEventListener('click', () => openShop('color'));
$('heroBtn').addEventListener('click', () => { if (shopSel) heroAction(); });
$('shopDeal').addEventListener('click', () => { const d = dailyDeal(today.day.date); openShop(d.kind, d.id); });
const equippedId = (kind, p) => kind === 'skin' ? (p?.skin || 'classic') : kind === 'trail' ? (p?.trail || 'classic') : (p?.name_color || 'default');
const ownsIt = (kind, it, p) => it.price === 0 || !!p?.owned.includes(kind + ':' + it.id);
function openShop(tab, selId) {
  shopTab = tab; show('shop');
  [['skin', 'tabSkins'], ['trail', 'tabTrails'], ['color', 'tabColors']].forEach(([k, id]) => $(id).setAttribute('aria-selected', String(k === tab)));
  shopSel = SHOP[tab].find(x => x.id === (selId || equippedId(tab, today?.user?.profile))) || SHOP[tab][0];
  renderShop();
  if (!shopRaf) shopRaf = requestAnimationFrame(shopLoop);
}
// Dibuja cada fotograma la vista grande, las tarjetas y la oferta mientras la tienda está abierta.
function shopLoop(now) {
  if ($('shop').hidden) { shopRaf = 0; return; }
  const t = window.Juice?.reduce ? 1.2 : now / 1000, p = today?.user?.profile, G = window.PhysleGame;
  const look = shopTab === 'skin' && shopSel ? shopSel.look : skinOf(p?.skin), tl = shopTab === 'trail' && shopSel ? shopSel.look : trailOf(p?.trail);
  const hc = $('heroCv'), hg = fitCanvas(hc); if (hg) G.preview(hg, hc.clientWidth, hc.clientHeight, look, tl, t, false);
  for (const c of shopCards) {
    const g = fitCanvas(c.cv); if (!g) continue;
    if (c.kind === 'skin') { g.clearRect(0, 0, 64, 64); G.drawMarble(g, 32, 32, 22, c.it.look, t * 0.8 + c.i); }
    else if (c.kind === 'trail') G.preview(g, 64, 64, skinOf(p?.skin), c.it.look, t + c.i * 0.3, true);
  }
  const d = today?.day && dailyDeal(today.day.date), dc = $('dealCv'), dg = !$('shopDeal').hidden && fitCanvas(dc);
  if (dg && d) {
    const it = SHOP[d.kind].find(x => x.id === d.id);
    if (d.kind === 'skin') { dg.clearRect(0, 0, 44, 44); G.drawMarble(dg, 22, 22, 16, it.look, t); }
    else if (d.kind === 'trail') G.preview(dg, 44, 44, skinOf(p?.skin), it.look, t, true);
    else { dg.clearRect(0, 0, 44, 44); dg.font = '800 22px "Bricolage Grotesque", system-ui, sans-serif'; dg.textAlign = 'center'; dg.fillStyle = '#e3b341'; dg.fillText('Aa', 22, 30); }
  }
  shopRaf = requestAnimationFrame(shopLoop);
}
function fitCanvas(cv) {
  const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return null;
  const dpr = Math.min(devicePixelRatio || 1, 2), W2 = Math.round(w * dpr), H2 = Math.round(h * dpr);
  if (cv.width !== W2 || cv.height !== H2) { cv.width = W2; cv.height = H2; }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return g;
}
function priceNow(kind, it) { return today?.day ? priceOf(kind, it, today.day.date) : it.price; }
function renderShop() {
  const p = today?.user?.profile, note = $('shopNote');
  $('walletN').textContent = p ? p.coins : 0;
  if (!accountsOn) note.textContent = 'The shop opens together with accounts, very soon.';
  else if (!user) note.innerHTML = 'Coins are saved to your account. <button class="link" type="button" id="shopLogin">Sign in or sign up</button> to start earning ' + WELCOME_COINS + ' as a welcome gift.';
  else if (!p) note.innerHTML = 'Finish your profile to unlock the shop. <button class="link" type="button" id="shopProfile">Do it now</button>';
  else note.textContent = { skin: 'Your marble in every marble game. Tap one to try it.', trail: 'The trail your marble leaves behind. Tap one to try it.', color: 'How your name looks on the leaderboards.' }[shopTab];
  $('shopLogin')?.addEventListener('click', openAuth);
  $('shopProfile')?.addEventListener('click', () => openProfile(true));
  // oferta del día
  const d = today?.day && dailyDeal(today.day.date), dealIt = d && SHOP[d.kind].find(x => x.id === d.id);
  $('shopDeal').hidden = !dealIt || ownsIt(d.kind, dealIt, p);
  if (dealIt) { $('dealName').textContent = dealIt.name + ' · ' + ({ skin: 'marble', trail: 'trail', color: 'name color' })[d.kind]; $('dealWas').textContent = d.was; $('dealPrice').textContent = d.price; }
  // tarjetas
  const box = $('items'); box.innerHTML = ''; shopCards = [];
  const eq = equippedId(shopTab, p);
  SHOP[shopTab].forEach((it, i) => {
    const owned = ownsIt(shopTab, it, p), on = eq === it.id, rar = rarityOf(it.price), price = priceNow(shopTab, it);
    const card = document.createElement('button'); card.type = 'button';
    card.className = 'item' + (on ? ' on' : '') + (shopSel === it ? ' sel' : '') + (rar ? ' r-' + rar.id : '') + (owned ? ' owned' : '');
    card.setAttribute('aria-pressed', String(shopSel === it));
    if (shopTab === 'color') {
      const sw = document.createElement('div'); sw.className = 'sw';
      const nm = document.createElement('span'); nm.textContent = p?.nickname || 'Your name'; paintName(nm, it.id); sw.appendChild(nm); card.appendChild(sw);
    } else { const cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); card.appendChild(cv); shopCards.push({ cv, it, kind: shopTab, i }); }
    const name = document.createElement('div'); name.className = 'in'; name.textContent = it.name; card.appendChild(name);
    const st = document.createElement('div'); st.className = 'pr';
    if (on) st.innerHTML = '<span class="tick">✓</span> Equipped';
    else if (owned) st.textContent = 'Owned';
    else {
      st.innerHTML = '<span class="coin" aria-hidden="true"></span>' + (price < it.price ? '<s>' + it.price + '</s> ' : '') + price;
      if (p && p.coins < price) { const bar = document.createElement('span'); bar.className = 'need'; bar.innerHTML = '<i></i>'; bar.firstChild.style.width = Math.round(100 * p.coins / price) + '%'; card.appendChild(st); card.appendChild(bar); }
    }
    if (!card.contains(st)) card.appendChild(st);
    if (rar) { const b = document.createElement('span'); b.className = 'rtag'; b.textContent = rar.name; card.appendChild(b); }
    card.addEventListener('click', () => { shopSel = it; window.Juice?.sfx.tap(); renderShop(); const J = window.Juice; if (J && !J.reduce) $('heroCv').animate([{ transform: 'scale(.96)' }, { transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.3,1.6,.5,1)' }); });
    box.appendChild(card);
  });
  renderHero();
}
function renderHero() {
  const p = today?.user?.profile, it = shopSel, kind = shopTab; if (!it) return;
  const rar = rarityOf(it.price), owned = ownsIt(kind, it, p), on = equippedId(kind, p) === it.id, price = priceNow(kind, it), btn = $('heroBtn');
  $('heroRar').textContent = rar ? rar.name : 'Free'; $('heroRar').className = 'rar' + (rar ? ' r-' + rar.id : '');
  $('heroName').textContent = it.name;
  const nick = $('heroNick'); nick.hidden = kind !== 'color';
  if (kind === 'color') { nick.textContent = p?.nickname || 'Your name'; paintName(nick, it.id); }
  $('shopHero').className = 'hero' + (rar ? ' r-' + rar.id : '');
  btn.disabled = false; btn.classList.remove('ghost');
  if (on) { btn.textContent = 'Equipped ✓'; btn.disabled = true; }
  else if (owned) { btn.textContent = 'Equip'; btn.disabled = !p; }
  else if (!p) { btn.textContent = 'Sign in to buy'; btn.disabled = !accountsOn; }
  else if (p.coins < price) { btn.textContent = 'Need ' + (price - p.coins) + ' more coins'; btn.disabled = true; }
  else btn.innerHTML = 'Buy for <span class="coin" aria-hidden="true"></span> ' + price;
}
async function heroAction() {
  const p = today?.user?.profile, it = shopSel, kind = shopTab;
  if (!p) { openAuth(); return; }
  const owned = ownsIt(kind, it, p);
  $('heroBtn').disabled = true;
  try {
    if (!owned) {
      const before = p.coins, res = await api('/api/shop/buy', { method: 'POST', body: { kind, id: it.id } });
      today.user.profile = res.profile;
      await buyFx(it, before, res.profile.coins);
    }
    const eq = await api('/api/shop/equip', { method: 'POST', body: { kind, id: it.id } });
    today.user.profile = eq.profile;
    if (owned) equipFx(it);
    renderAccount(); renderShop();
  } catch (e) { toast(e.message); renderHero(); }
}
// Compra: las monedas vuelan de la cartera al artículo, el saldo baja rodando y el artículo se desbloquea.
function buyFx(it, from, to) {
  const J = window.Juice;
  if (!J || J.reduce) { $('walletN').textContent = to; toast('Unlocked: ' + it.name + '!'); return Promise.resolve(); }
  const a = $('walletCoin').getBoundingClientRect(), b = $('heroCv').getBoundingClientRect();
  const x0 = a.left + a.width / 2, y0 = a.top + a.height / 2, x1 = b.left + b.width / 2, y1 = b.top + b.height / 2, n = 12;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('span'); c.className = 'coin flycoin'; c.style.left = x0 + 'px'; c.style.top = y0 + 'px'; document.body.appendChild(c);
    const mx = (x0 + x1) / 2 + (Math.random() - 0.5) * 120, my = Math.min(y0, y1) - 40 - Math.random() * 60;
    const an = c.animate([{ transform: 'translate(-50%,-50%) scale(1)' }, { transform: `translate(calc(-50% + ${mx - x0}px), calc(-50% + ${my - y0}px)) scale(1.2)`, offset: 0.5 }, { transform: `translate(calc(-50% + ${x1 - x0}px), calc(-50% + ${y1 - y0}px)) scale(.6)`, opacity: 0.4 }],
      { duration: 520, delay: i * 45, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'backwards' });
    an.onfinish = () => { c.remove(); J.sfx.tick(); };
  }
  J.roll($('walletN'), to, { from, ms: 600 + n * 45, ticks: false });
  return new Promise(res => setTimeout(() => {
    const rar = rarityOf(it.price)?.id, big = rar === 'epic' || rar === 'legendary';
    big ? J.sfx.fanfare() : J.sfx.good(4, true); J.buzz([20, 30, 40]);
    const hero = $('shopHero');
    hero.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.05)', offset: 0.3 }, { transform: 'scale(.98)', offset: 0.6 }, { transform: 'none' }], { duration: 520, easing: 'ease-out' });
    const fl = document.createElement('div'); fl.className = 'hflash'; hero.appendChild(fl);
    fl.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 450, easing: 'ease-out' }).onfinish = () => fl.remove();
    const pal = { common: ['#22a37a', '#e3b341'], rare: ['#2c7be5', '#7fd8ff'], epic: ['#8b5cd6', '#ff4fd8'], legendary: ['#e3b341', '#ff8a1f', '#fff2b0'] }[rar] || undefined;
    J.confetti(x1, y1, { n: big ? 140 : 70, power: big ? 1.1 : 0.8, colors: pal });
    const st = document.createElement('div'); st.className = 'ustamp'; st.textContent = 'UNLOCKED'; hero.appendChild(st);
    st.animate([{ transform: 'translate(-50%,-50%) rotate(-12deg) scale(2.6)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotate(-12deg) scale(.95)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%,-50%) rotate(-12deg) scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.55,0,.75,.2)', fill: 'both' });
    setTimeout(() => st.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 400, fill: 'forwards' }).onfinish = () => st.remove(), 1500);
    res();
  }, 520 + n * 45));
}
function equipFx(it) {
  const J = window.Juice; if (!J) return;
  J.sfx.pick(); J.buzz(12);
  if (!J.reduce) $('shopHero').animate([{ transform: 'translateY(0)' }, { transform: 'translateY(-6px)', offset: 0.35 }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.3,1.6,.5,1)' });
  toast(it.name + ' equipped.');
}
// cuenta atrás de la oferta del día
setInterval(() => { if ($('shop').hidden || $('shopDeal').hidden || !resetAt) return; const s = Math.max(0, Math.round((resetAt - Date.now()) / 1000)); $('dealClock').textContent = 'ends in ' + hms(s).join(':'); }, 1000);

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
