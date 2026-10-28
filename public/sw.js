// Service worker de Gravle: solo avisos (no guarda nada en caché, así la web nunca se queda vieja).
// El servidor manda un aviso vacío y aquí se pide el texto que toca a esta suscripción.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => e.waitUntil((async () => {
  let m = { title: 'New experiments are live 🧪', body: 'Five new physics puzzles are waiting. Can you predict them?' };
  try {
    const s = await self.registration.pushManager.getSubscription();
    if (s) { const r = await fetch('/api/push/msg?e=' + encodeURIComponent(s.endpoint)); if (r.ok) m = { ...m, ...(await r.json()) }; }
  } catch (err) {}
  await self.registration.showNotification(m.title, { body: m.body, icon: '/icon-192.png', badge: '/badge-96.png', tag: 'gravle-daily', renotify: true, data: { url: '/?source=push' } });
})()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    for (const w of ws) if ('focus' in w) { w.navigate?.(url); return w.focus(); }
    return self.clients.openWindow(url);
  }));
});
