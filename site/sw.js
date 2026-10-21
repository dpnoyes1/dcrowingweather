// DC Rowing Weather service worker: shows push notifications and opens the
// app when one is tapped. No offline caching, so the page is always current.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = {};
  try { msg = event.data ? event.data.json() : {}; }
  catch (e) { msg = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(msg.title || 'DC Rowing Weather', {
    body: msg.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: msg.tag,
    data: { url: msg.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of open) {
      if ('navigate' in client) {
        const c = await client.navigate(url).catch(() => null);
        if (c) return c.focus();
      }
    }
    return self.clients.openWindow(url);
  })());
});
