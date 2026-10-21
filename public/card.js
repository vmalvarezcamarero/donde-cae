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

// res: { title, sub, total, scores[5], names[5], icons[5] (svg), streak, host }
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
  g.fillStyle = P.ink; g.font = '800 200px ' + DISPLAY; g.fillText(String(res.total), px + 50, py + 320);
  const tw = g.measureText(String(res.total)).width; g.fillStyle = P.ink2; g.font = '700 64px ' + DISPLAY; g.fillText('/ 500', px + 70 + tw, py + 320);
  // rondas
  const icons = await Promise.all(res.icons.map(svgImage));
  res.scores.forEach((s, i) => {
    const y = py + 380 + i * 96;
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
