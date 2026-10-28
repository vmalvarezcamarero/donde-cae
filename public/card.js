// Tarjeta del resultado (imagen 1080×1350) para compartir en stories, TikTok o WhatsApp.
// Siempre con la paleta clara, para que se vea igual en cualquier móvil.
const P = { paper: '#e9efeb', plate: '#f6f9f7', ink: '#18263a', ink2: '#536274', coral: '#e2583a', azul: '#2c68d0', mostaza: '#c99312', violeta: '#8350c4',
  felt: '#cfe2d4', wood: '#e9cf9a', good: '#2f9e5b', warn: '#d39b14', bad: '#d4513b' };
const VARS = { '--paper': P.paper, '--plate': P.plate, '--ink': P.ink, '--ink-2': P.ink2, '--coral': P.coral, '--azul': P.azul, '--mostaza': P.mostaza, '--violeta': P.violeta, '--felt': P.felt, '--wood': P.wood };
const band = (s) => s >= 80 ? P.good : s >= 40 ? P.warn : P.bad;
const DISPLAY = '"Bricolage Grotesque", "Arial Narrow", system-ui, sans-serif', BODY = '"Figtree", "Segoe UI", system-ui, sans-serif', MONO = '"IBM Plex Mono", ui-monospace, monospace';

function svgImage(svg) {
  const s = svg.replace(/var\((--[a-z0-9-]+)\)/g, (_, v) => VARS[v] || P.ink).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" ');
  return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); });
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

// res: { title, sub, total, scores[5], names[5], icons[5] (svg), streak, host, stars (0-3) }
function star(g, cx, cy, R, on) {
  g.beginPath();
  for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? R * 0.48 : R; g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
  g.closePath(); g.lineJoin = 'round';
  g.fillStyle = on ? P.mostaza : 'rgba(24,38,58,.08)'; g.fill();
  g.strokeStyle = on ? P.ink : 'rgba(24,38,58,.25)'; g.lineWidth = 5; g.stroke();
}
export async function makeCard(res) {
  if (document.fonts?.ready) await document.fonts.ready;
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // papel milimetrado
  g.fillStyle = P.paper; g.fillRect(0, 0, W, H);
  for (let x = 0; x <= W; x += 30) { g.strokeStyle = x % 150 === 0 ? 'rgba(24,38,58,.12)' : 'rgba(24,38,58,.06)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 30) { g.strokeStyle = y % 150 === 0 ? 'rgba(24,38,58,.12)' : 'rgba(24,38,58,.06)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // logo
  const lx = 90, ly = 92;
  g.strokeStyle = P.coral; g.globalAlpha = 0.55; g.lineWidth = 9; g.lineCap = 'round';
  for (const [x, y0] of [[lx + 22, 6], [lx + 40, 0], [lx + 58, 6]]) { g.beginPath(); g.moveTo(x, ly + y0); g.lineTo(x, ly + y0 + 20); g.stroke(); }
  g.globalAlpha = 1; g.fillStyle = P.coral; g.beginPath(); g.arc(lx + 40, ly + 62, 24, 0, Math.PI * 2); g.fill(); g.strokeStyle = P.ink; g.lineWidth = 4; g.stroke();
  g.strokeStyle = P.ink; g.lineWidth = 12; g.beginPath(); g.moveTo(lx + 4, ly + 104); g.lineTo(lx + 76, ly + 104); g.stroke();
  g.font = '800 104px ' + DISPLAY; g.textBaseline = 'alphabetic'; g.fillStyle = P.ink; g.fillText('Grav', lx + 104, ly + 100);
  const gw = g.measureText('Grav').width; g.fillStyle = P.coral; g.fillText('le', lx + 104 + gw, ly + 100);
  // panel
  const px = 70, py = 260, pw = W - 140, ph = 900;
  g.fillStyle = P.coral; rr(g, px + 12, py + 12, pw, ph, 28); g.fill();
  g.fillStyle = P.plate; rr(g, px, py, pw, ph, 28); g.fill(); g.strokeStyle = P.ink; g.lineWidth = 5; g.stroke();
  g.fillStyle = P.ink2; g.font = '600 34px ' + MONO; g.fillText(res.title.toUpperCase(), px + 56, py + 82);
  if (res.sub) { g.font = '500 30px ' + MONO; g.fillText(res.sub.toUpperCase(), px + 56, py + 126); }
  if (res.stars != null) for (let k = 0; k < 3; k++) star(g, px + pw - 266 + k * 90, py + 92, 38, k < res.stars);
  if (res.stamp) {                                          // sello de día perfecto
    const col = res.stamp === 'PERFECT' ? P.mostaza : P.coral;
    g.save(); g.translate(px + pw - 150, py + 282); g.scale(0.8, 0.8); g.rotate(-0.19); g.strokeStyle = col; g.fillStyle = col; g.globalAlpha = 0.92;
    g.lineWidth = 7; rr(g, -150, -62, 300, 124, 14); g.stroke(); g.lineWidth = 3; rr(g, -137, -49, 274, 98, 9); g.stroke();
    g.font = '800 60px ' + DISPLAY; const fs = Math.min(60, 60 * 250 / g.measureText(res.stamp).width);
    g.font = '800 ' + fs + 'px ' + DISPLAY; g.textAlign = 'center'; g.fillText(res.stamp, 0, 14);
    g.font = '700 22px ' + MONO; g.fillText(res.stampSub || '', 0, 42); g.restore(); g.textAlign = 'left';
  }
  g.fillStyle = P.ink; g.font = '800 200px ' + DISPLAY; g.fillText(String(res.total), px + 50, py + 320);
  const tw = g.measureText(String(res.total)).width; g.fillStyle = P.ink2; g.font = '700 64px ' + DISPLAY; g.fillText('/ ' + res.scores.length * 100, px + 70 + tw, py + 320);
  // rondas
  const icons = await Promise.all(res.icons.map(svgImage));
  res.scores.forEach((s, i) => {
    const y = py + 380 + i * Math.min(96, 500 / res.scores.length);
    g.fillStyle = band(s); rr(g, px + 56, y + 14, 56, 56, 12); g.fill();
    if (icons[i]) g.drawImage(icons[i], px + 136, y - 2, 88, 88);
    g.fillStyle = P.ink; g.font = '600 44px ' + BODY; g.fillText(res.names[i], px + 246, y + 58);
    g.font = '800 54px ' + DISPLAY; g.textAlign = 'right'; g.fillText(String(s), px + pw - 56, y + 60); g.textAlign = 'left';
  });
  // pie
  g.fillStyle = P.ink; g.font = '800 54px ' + DISPLAY; g.fillText('Can you beat me?', 90, 1252);
  if (res.streak) { g.fillStyle = P.coral; g.font = '600 34px ' + MONO; g.textAlign = 'right'; g.fillText(res.streak, W - 90, 1250); g.textAlign = 'left'; }
  g.fillStyle = P.coral; g.font = '700 46px ' + MONO; g.fillText(res.host, 90, 1310);
  return new Promise(r => c.toBlob(r, 'image/png'));
}

// Tarjeta de estadísticas (1080×1350): nombre, 4 cifras, tus 3 mejores experimentos y las últimas 4 semanas.
// d: { name, flag, tiles: [[label, value]×4], top: [{ name, avg, icon }], calendar: [{ date, best, frozen }×28], host }
export async function makeStatsCard(d) {
  if (document.fonts?.ready) await document.fonts.ready;
  const W = 1080, H = 1350, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = P.paper; g.fillRect(0, 0, W, H);
  for (let x = 0; x <= W; x += 30) { g.strokeStyle = x % 150 === 0 ? 'rgba(24,38,58,.12)' : 'rgba(24,38,58,.06)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y <= H; y += 30) { g.strokeStyle = y % 150 === 0 ? 'rgba(24,38,58,.12)' : 'rgba(24,38,58,.06)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // hoja
  g.fillStyle = P.ink; rr(g, 72, 72, W - 132, H - 132, 28); g.fill();
  g.fillStyle = P.plate; rr(g, 60, 60, W - 132, H - 132, 28); g.fill();
  g.strokeStyle = P.ink; g.lineWidth = 5; g.stroke();
  g.fillStyle = P.ink2; g.font = '600 30px ' + MONO; g.textBaseline = 'alphabetic'; g.fillText('MY GRAVLE STATS', 120, 160);
  g.fillStyle = P.ink; g.font = '800 82px ' + DISPLAY; g.fillText((d.flag ? d.flag + ' ' : '') + d.name, 116, 252);
  // cifras
  const tw = (W - 240 - 3 * 24) / 4;
  d.tiles.forEach(([k, v], i) => {
    const x = 120 + i * (tw + 24), y = 300;
    g.fillStyle = P.paper; rr(g, x, y, tw, 170, 18); g.fill(); g.strokeStyle = P.ink; g.lineWidth = 4; g.stroke();
    g.fillStyle = i === 3 ? P.coral : P.ink; g.font = '800 74px ' + DISPLAY; g.textAlign = 'center'; g.fillText(String(v), x + tw / 2, y + 102);
    g.fillStyle = P.ink2; g.font = '600 24px ' + MONO; g.fillText(k.toUpperCase(), x + tw / 2, y + 146); g.textAlign = 'left';
  });
  // mejores experimentos
  g.fillStyle = P.ink; g.font = '800 44px ' + DISPLAY; g.fillText('My best experiments', 120, 560);
  const icons = await Promise.all(d.top.map(t => svgImage(t.icon)));
  d.top.forEach((t, i) => {
    const y = 600 + i * 110;
    if (icons[i]) g.drawImage(icons[i], 120, y, 84, 84);
    g.fillStyle = P.ink; g.font = '700 38px ' + BODY; g.fillText(t.name, 230, y + 40);
    g.fillStyle = 'rgba(24,38,58,.08)'; rr(g, 230, y + 56, 600, 22, 11); g.fill();
    g.fillStyle = band(t.avg); rr(g, 230, y + 56, Math.max(22, 6 * t.avg), 22, 11); g.fill();
    g.fillStyle = P.ink; g.font = '800 52px ' + DISPLAY; g.textAlign = 'right'; g.fillText(String(t.avg), W - 120, y + 72); g.textAlign = 'left';
  });
  // últimas 4 semanas
  g.fillStyle = P.ink; g.font = '800 44px ' + DISPLAY; g.fillText('Last 4 weeks', 120, 980);
  const cs = 98, gap = 14;
  d.calendar.forEach((day, i) => {
    const x = 120 + (i % 7) * (cs + gap), y = 1010 + Math.floor(i / 7) * (44 + 10);
    g.fillStyle = day.best == null ? (day.frozen ? '#bfe9ff' : 'rgba(24,38,58,.07)') : day.best >= 420 ? P.good : day.best >= 300 ? P.warn : P.bad;
    rr(g, x, y, cs, 44, 10); g.fill();
  });
  g.fillStyle = P.coral; g.font = '800 40px ' + DISPLAY; g.textAlign = 'right'; g.fillText(d.host, W - 120, 160); g.textAlign = 'left';
  return new Promise(res => c.toBlob(res, 'image/png'));
}
