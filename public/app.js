// App de Physle: cuentas, portada del día, intentos, resultado y ranking.
// El juego en sí (dibujo y animación) está en game.js.
import { firebaseConfig } from './firebase-config.js';
import { COUNTRIES } from './countries.js';

const $ = (id) => document.getElementById(id);
const FB = 'https://www.gstatic.com/firebasejs/12.18.0/';
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });
const flag = (cc) => cc ? String.fromCodePoint(...[...cc].map(c => 127397 + c.charCodeAt(0))) : '';
const countryName = (cc) => { try { return regionName.of(cc); } catch (e) { return cc; } };
const fmtDay = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const LEVEL = { 1: 'Easy', 2: 'Medium', 3: 'Hard' };
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
function show(id) { for (const s of ['home', 'play', 'end', 'rank']) $(s).hidden = s !== id; window.scrollTo({ top: 0 }); }
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
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
};
const authMsg = (e) => AUTH_ERRORS[e.code] || 'That didn’t work. Please try again.';

/* ---------- API ---------- */
async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'x-device': device };
  if (body) headers['content-type'] = 'application/json';
  if (user) headers.authorization = 'Bearer ' + await user.getIdToken();
  const res = await fetch(path, { method, headers, body: body && JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Couldn’t reach Physle. Check your connection.');
  return data;
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
function renderAccount() {
  const p = today?.user?.profile;
  $('acctAv').textContent = p ? flag(p.country) || p.nickname[0] : user ? (user.email || '?')[0].toUpperCase() : '?';
  $('acctName').textContent = p ? p.nickname : user ? 'Finish your profile' : accountsOn ? 'Sign in' : 'Sign in';
}
function renderHome() {
  const d = today.day, list = today.attempts, done = list.filter(a => a.finished);
  $('dayLabel').textContent = 'Physle #' + d.n + ' · ' + fmtDay.format(new Date(d.date + 'T12:00:00'));
  const lv = $('levelLabel'); lv.hidden = false; lv.textContent = LEVEL[d.level]; lv.className = 'badge l' + d.level;
  const best = done.length ? Math.max(...done.map(a => a.total)) : null;
  $('homeTitle').textContent = !list.length ? 'Today’s challenge' : best != null ? 'Your best today: ' + best : 'You have an attempt in progress';
  const tries = $('tries'); tries.innerHTML = '';
  for (let i = 1; i <= today.max; i++) {
    const a = list.find(x => x.num === i), row = document.createElement('div');
    row.className = 'try' + (a && a.finished && a.total === best ? ' best' : '');
    const label = i === 1 ? 'Attempt 1 · shared challenge' : 'Attempt ' + i + ' · new challenge';
    const state = !a ? 'Available' : a.finished ? squares(a.scores) : 'In progress (' + a.round + '/5)';
    row.innerHTML = '<span class="k"></span><span></span><b></b>';
    row.children[0].textContent = label; row.children[1].textContent = state; row.children[2].textContent = a && a.finished ? a.total : '—';
    tries.appendChild(row);
  }
  const open = list.find(a => !a.finished), btn = $('playBtn');
  btn.disabled = false;
  if (open) btn.textContent = 'Continue attempt ' + open.num;
  else if (list.length >= today.max) { btn.textContent = 'No attempts left until tomorrow'; btn.disabled = true; }
  else btn.textContent = list.length ? 'Play your second attempt' : 'Play';
  const note = $('homeNote');
  const p = today.user?.profile;
  if (!accountsOn) note.textContent = 'Leaderboards are coming very soon.';
  else if (!user) note.innerHTML = 'You’re playing without an account, so your scores don’t count on the leaderboard. <button class="link" type="button" id="noteLogin">Sign in or sign up</button>';
  else if (!p) note.innerHTML = 'Finish your profile to appear on the leaderboard. <button class="link" type="button" id="noteProfile">Do it now</button>';
  else note.innerHTML = 'Playing as <b></b> ' + flag(p.country) + '. Your best attempt of the day counts.';
  if (p && note.querySelector('b')) note.querySelector('b').textContent = p.nickname;
  $('noteLogin')?.addEventListener('click', openAuth);
  $('noteProfile')?.addEventListener('click', () => openProfile(true));
  $('streak').textContent = streakText();
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
$('playBtn').addEventListener('click', startAttempt);
$('again').addEventListener('click', startAttempt);
async function startAttempt() {
  let st;
  try { st = await api('/api/attempt', { method: 'POST' }); } catch (e) { toast(e.message); refresh(); return; }
  $('playLabel').textContent = 'Physle #' + st.day.n + ' · attempt ' + st.attempt.num + (st.ranked ? ' · counts for the leaderboard' : '');
  show('play');
  window.PhysleGame.play(st, {
    submit: (round, prediction) => api('/api/attempt/' + st.attempt.id + '/round', { method: 'POST', body: { round, prediction } }),
    error: (msg) => toast(msg),
    done: showEnd,
  });
}
async function showEnd(r) {
  show('end');
  const played = store.get('played', {}); played[r.day.date] = Math.max(played[r.day.date] || 0, r.total); store.set('played', played);
  $('endLabel').textContent = 'Physle #' + r.day.n + ' · attempt ' + r.attempt.num;
  $('total').firstChild.textContent = r.total;
  $('endNote').textContent = r.total >= 420 ? 'You think like a physicist.' : r.total >= 300 ? 'Good eye. Can you beat it?' : 'Physics shows no mercy. Time for a rematch.';
  const rows = $('rows'); rows.innerHTML = '';
  r.scores.forEach((s, i) => {
    const d = document.createElement('div'); d.className = 'row';
    d.innerHTML = '<span class="sq" style="background:var(--' + ({ g: 'good', y: 'warn', r: 'bad' })[band(s)] + ')"></span><span></span><b>' + s + '</b>';
    d.children[1].textContent = (i + 1) + '. ' + window.PhysleGame.TYPE_NAME[r.types[i]] + (r.details[i] ? ' · ' + r.details[i] : '');
    rows.appendChild(d);
  });
  await refresh();
  const left = today.max - today.attempts.length;
  $('again').hidden = left <= 0;
  $('again').textContent = left > 0 ? 'Second attempt' : '';
  const streak = streakText();
  $('share').textContent = 'Physle #' + r.day.n + (r.attempt.num > 1 ? ' (attempt ' + r.attempt.num + ')' : '') + '  ' + r.total + '/500\n' + squares(r.scores) + (streak ? '\n' + streak : '') + '\n' + location.host;
}
$('copy').addEventListener('click', () => {
  const txt = $('share').textContent, btn = $('copy');
  const done = () => { btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = 'Copy result'; }, 1600); };
  const fallback = () => { const sel = getSelection(), rg = document.createRange(); rg.selectNodeContents($('share')); sel.removeAllRanges(); sel.addRange(rg); btn.textContent = 'Text selected: copy it'; };
  try { navigator.clipboard.writeText(txt).then(done, fallback); } catch (e) { fallback(); }
});
$('endHome').addEventListener('click', () => { show('home'); refresh(); });

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

async function openRank(scope) {
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
  const d0 = new Date(data.from + 'T12:00:00'), d1 = new Date(data.to + 'T12:00:00');
  const range = data.from === data.to ? fmtDay.format(d0) : fmtShort.format(d0) + ' – ' + fmtShort.format(d1);
  list.innerHTML = '';
  if (scope === 'countries') {
    $('rankSub').textContent = range + ' · average of their players';
    data.rows.forEach((r, i) => list.appendChild(rankRow(i + 1, r.country, countryName(r.country), r.players + (r.players === 1 ? ' player' : ' players'), r.score)));
  } else {
    $('rankSub').textContent = range + ' · ' + data.players + (data.players === 1 ? ' player' : ' players');
    data.rows.forEach(r => list.appendChild(rankRow(r.pos, r.country, r.nickname, scope === 'week' ? r.days + (r.days === 1 ? ' day' : ' days') : '', r.score, r.me)));
    if (data.me && !data.rows.some(r => r.me)) { me.innerHTML = ''; me.appendChild(rankRow(data.me.pos, data.me.country, data.me.nickname, '', data.me.score, true)); me.hidden = false; }
  }
  if (!data.rows.length) {
    const li = document.createElement('li'); li.className = 'empty';
    li.textContent = scope === 'countries' ? 'No countries have scores for this period yet.' : 'Nobody has finished this challenge yet. You could be first!';
    list.appendChild(li);
  }
}
function rankRow(pos, cc, name, sub, score, isMe) {
  const li = document.createElement('li'); if (isMe) li.className = 'me';
  li.innerHTML = '<span class="pos"></span><span class="fl"></span><span class="nm"></span><span class="sc"></span>';
  li.children[0].textContent = pos + '.'; li.children[1].textContent = flag(cc); li.children[1].title = countryName(cc);
  li.children[2].textContent = name;
  if (sub) { const s = document.createElement('small'); s.textContent = sub; li.children[2].appendChild(s); }
  li.children[3].textContent = score;
  return li;
}

/* ---------- ventanas de cuenta ---------- */
$('acctBtn').addEventListener('click', () => {
  if (!accountsOn) { toast('Accounts are coming very soon.'); return; }
  if (!user) openAuth(); else if (!today?.user?.profile) openProfile(true); else openAccount();
});
let signUp = false;
function openAuth() {
  if (!accountsOn) { toast('Accounts are coming very soon.'); return; }
  signUp = false; syncAuthMode(); $('authErr').textContent = ''; $('authDlg').showModal();
}
function syncAuthMode() {
  $('authTitle').textContent = signUp ? 'Create your account' : 'Sign in to compete';
  $('emailSubmit').textContent = signUp ? 'Create account' : 'Sign in';
  $('authMode').textContent = signUp ? 'Already have an account? Sign in' : 'No account? Create one';
  $('password').autocomplete = signUp ? 'new-password' : 'current-password';
}
$('authMode').addEventListener('click', () => { signUp = !signUp; syncAuthMode(); });
$('googleBtn').addEventListener('click', async () => {
  $('authErr').textContent = '';
  try {
    const provider = new A.GoogleAuthProvider();
    try { await A.signInWithPopup(fbAuth, provider); }
    catch (e) { if (e.code === 'auth/popup-blocked') await A.signInWithRedirect(fbAuth, provider); else throw e; }
    $('authDlg').close(); await refresh();
  } catch (e) { $('authErr').textContent = authMsg(e); }
});
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
    await api('/api/me', { method: 'PUT', body: { nickname: $('nick').value.trim(), country: $('country').value, over14: $('over14').checked, acceptTerms: $('accept').checked } });
    $('profileDlg').close(); toast('Profile saved. You’re on the leaderboard!'); await refresh();
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
      catch (e) { await A.signOut(fbAuth); toast('Your Physle data is deleted. To remove your sign-in too, sign in again and repeat this.'); }
    }
    user = null; $('accountDlg').close(); await refresh();
    toast('Account deleted.');
  } catch (e) { toast(e.message); }
});

/* ---------- arranque ---------- */
(async () => {
  try { await initAuth(); } catch (e) { console.error(e); }
  await refresh();
})();
