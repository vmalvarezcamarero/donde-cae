// Monedas y tienda de Physle. Lo usan el servidor (cobra, paga y valida) y la web (muestra).
// Para cambiar precios o añadir artículos, edita solo este archivo.

export const WELCOME_COINS = 50;

// Monedas por intento terminado: 1 por cada 10 puntos + 5 por cada ronda perfecta.
export function coinsFor(scores) {
  const total = scores.reduce((a, b) => a + b, 0);
  return Math.floor(total / 10) + 5 * scores.filter(s => s === 100).length;
}

// Skins de la canica (la bola de "Where will it land?" y "Bank shot").
// "look" describe cómo se dibuja; lo interpreta game.js.
export const SKINS = [
  { id: 'classic', name: 'Classic', price: 0, look: { kind: 'solid', base: 'var:coral' } },
  { id: 'ocean', name: 'Ocean', price: 150, look: { kind: 'swirl', base: '#1f6fd6', alt: '#8fd8ff' } },
  { id: 'mint', name: 'Mint', price: 150, look: { kind: 'stripe', base: '#38b98a', alt: '#eafff6' } },
  { id: 'eight', name: 'Eight ball', price: 300, look: { kind: 'eight', base: '#151515', alt: '#ffffff' } },
  { id: 'melon', name: 'Watermelon', price: 300, look: { kind: 'melon', base: '#3aa24c', alt: '#195c27' } },
  { id: 'gold', name: 'Gold', price: 500, look: { kind: 'metal', base: '#d4a017', alt: '#fff2b3', dark: '#7a5a00' } },
  { id: 'galaxy', name: 'Galaxy', price: 600, look: { kind: 'galaxy', base: '#1d1240', alt: '#7b3fbf' } },
  { id: 'disco', name: 'Disco', price: 800, look: { kind: 'disco', base: '#9aa7b4', alt: '#f4f7fa' } },
];

// Colores para tu nombre en los rankings.
export const NAME_COLORS = [
  { id: 'default', name: 'Default', price: 0, css: '' },
  { id: 'coral', name: 'Coral', price: 200, css: 'color:#e2583a' },
  { id: 'ocean', name: 'Ocean', price: 200, css: 'color:#2c7be5' },
  { id: 'mint', name: 'Mint', price: 200, css: 'color:#22a37a' },
  { id: 'violet', name: 'Violet', price: 300, css: 'color:#8b5cd6' },
  { id: 'gold', name: 'Gold', price: 500, css: 'color:#c99212;text-shadow:0 0 6px rgba(227,179,65,.45)' },
  { id: 'rainbow', name: 'Rainbow', price: 1500, css: 'rainbow' },
];

export const findItem = (kind, id) => (kind === 'skin' ? SKINS : kind === 'color' ? NAME_COLORS : []).find(x => x.id === id);
