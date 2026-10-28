// Monedas y tienda de Gravle. Lo usan el servidor (cobra, paga y valida) y la web (muestra).
// Para cambiar precios o añadir artículos, edita solo este archivo.

export const WELCOME_COINS = 50;

// Monedas por intento terminado: 1 por cada 10 puntos + 5 por cada ronda perfecta.
export function coinsFor(scores) {
  const total = scores.reduce((a, b) => a + b, 0);
  return Math.floor(total / 10) + 5 * scores.filter(s => s === 100).length;
}

// Rareza según el precio: marca el color del borde y el brillo de la tarjeta.
export const RARITY = [
  { id: 'common', name: 'Common', upto: 200 },
  { id: 'rare', name: 'Rare', upto: 400 },
  { id: 'epic', name: 'Epic', upto: 800 },
  { id: 'legendary', name: 'Legendary', upto: Infinity },
];
export const rarityOf = (price) => price === 0 ? null : RARITY.find(r => price <= r.upto);

// Skins de la canica (en todos los juegos de canica). "look" describe cómo se dibuja; lo interpreta game.js.
export const SKINS = [
  { id: 'classic', name: 'Classic', price: 0, look: { kind: 'solid', base: 'var:coral' } },
  { id: 'ocean', name: 'Ocean', price: 150, look: { kind: 'swirl', base: '#1f6fd6', alt: '#8fd8ff' } },
  { id: 'mint', name: 'Mint', price: 150, look: { kind: 'stripe', base: '#38b98a', alt: '#eafff6' } },
  { id: 'tennis', name: 'Tennis ball', price: 200, look: { kind: 'tennis', base: '#d4ea3c', alt: '#ffffff' } },
  { id: 'smile', name: 'Smiley', price: 250, look: { kind: 'smile', base: '#ffcf33', alt: '#3a2a00' } },
  { id: 'eight', name: 'Eight ball', price: 300, look: { kind: 'eight', base: '#151515', alt: '#ffffff' } },
  { id: 'melon', name: 'Watermelon', price: 300, look: { kind: 'melon', base: '#3aa24c', alt: '#195c27' } },
  { id: 'football', name: 'Football', price: 350, look: { kind: 'football', base: '#f6f6f2', alt: '#151515' } },
  { id: 'basket', name: 'Basketball', price: 350, look: { kind: 'basket', base: '#e8742c', alt: '#2b1407' } },
  { id: 'ice', name: 'Ice', price: 450, look: { kind: 'ice', base: '#8fd3ff', alt: '#ffffff', dark: '#2f7fc1' } },
  { id: 'gold', name: 'Gold', price: 500, look: { kind: 'metal', base: '#d4a017', alt: '#fff2b3', dark: '#7a5a00' } },
  { id: 'jupiter', name: 'Jupiter', price: 550, look: { kind: 'planet', base: '#e9b26b', alt: '#b5653a' } },
  { id: 'galaxy', name: 'Galaxy', price: 600, look: { kind: 'galaxy', base: '#1d1240', alt: '#7b3fbf' } },
  { id: 'lava', name: 'Lava', price: 700, look: { kind: 'lava', base: '#3b0d06', alt: '#ff9a1f' } },
  { id: 'neon', name: 'Neon', price: 750, look: { kind: 'neon', base: '#141a2e', alt: '#4ce0ff', dark: '#ff4fd8' } },
  { id: 'disco', name: 'Disco', price: 800, look: { kind: 'disco', base: '#9aa7b4', alt: '#f4f7fa' } },
  { id: 'prism', name: 'Prism', price: 1200, look: { kind: 'prism', base: '#ffffff', alt: '#ffffff' } },
  // Exclusivas de racha: no se compran, se ganan jugando N días seguidos (las da el servidor).
  { id: 'ember', name: 'Ember', price: 0, streak: 3, look: { kind: 'ember', base: '#21130d', alt: '#ff7a1a' } },
  { id: 'aurora', name: 'Aurora', price: 0, streak: 10, look: { kind: 'aurora', base: '#0b1b33', alt: '#3cffb0' } },
  { id: 'nova', name: 'Supernova', price: 0, streak: 30, look: { kind: 'nova', base: '#ffe9a8', alt: '#ff4fd8' } },
];
export const STREAK_SKINS = SKINS.filter(s => s.streak);

// Estelas: el rastro que deja la canica al moverse. "look.style" lo interpreta game.js.
export const TRAILS = [
  { id: 'classic', name: 'Classic', price: 0, look: { style: 'line' } },
  { id: 'pencil', name: 'Pencil', price: 150, look: { style: 'pencil' } },
  { id: 'dots', name: 'Morse', price: 200, look: { style: 'dots' } },
  { id: 'comet', name: 'Comet', price: 350, look: { style: 'comet' } },
  { id: 'sparkle', name: 'Sparkle', price: 450, look: { style: 'sparkle' } },
  { id: 'fire', name: 'Fire', price: 650, look: { style: 'fire' } },
  { id: 'rainbow', name: 'Rainbow', price: 900, look: { style: 'rainbow' } },
];

// Colores para tu nombre en los rankings. "class:x" usa una clase animada de styles.css.
export const NAME_COLORS = [
  { id: 'default', name: 'Default', price: 0, css: '' },
  { id: 'coral', name: 'Coral', price: 200, css: 'color:#e2583a' },
  { id: 'ocean', name: 'Ocean', price: 200, css: 'color:#2c7be5' },
  { id: 'mint', name: 'Mint', price: 200, css: 'color:#22a37a' },
  { id: 'violet', name: 'Violet', price: 300, css: 'color:#8b5cd6' },
  { id: 'gold', name: 'Gold', price: 500, css: 'color:#c99212;text-shadow:0 0 6px rgba(227,179,65,.45)' },
  { id: 'ice', name: 'Frost', price: 700, css: 'class:nc-ice' },
  { id: 'fire', name: 'Fire', price: 900, css: 'class:nc-fire' },
  { id: 'rainbow', name: 'Rainbow', price: 1500, css: 'rainbow' },
];

const LISTS = { skin: SKINS, trail: TRAILS, color: NAME_COLORS };
export const findItem = (kind, id) => (LISTS[kind] || []).find(x => x.id === id);

// Oferta del día: un artículo de pago con un 40 % de descuento, el mismo para todos ese día.
export const DEAL_OFF = 0.4;
export function dailyDeal(date) {
  const all = [];
  for (const kind of ['skin', 'trail', 'color']) for (const it of LISTS[kind]) if (it.price >= 250) all.push({ kind, id: it.id, it });
  let h = 2166136261; for (const c of 'deal:' + date) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  const d = all[h % all.length];
  return { kind: d.kind, id: d.id, price: Math.round(d.it.price * (1 - DEAL_OFF) / 10) * 10, was: d.it.price };
}
// Precio de un artículo en una fecha (con la oferta del día aplicada).
export function priceOf(kind, it, date) {
  const d = date && dailyDeal(date);
  return d && d.kind === kind && d.id === it.id ? d.price : it.price;
}
