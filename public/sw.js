/* Mihu's Corner service worker. Personal records and authenticated responses are never cached. */
const safeUrl = u => typeof u === 'string' && /^\/(\?day=20\d{2}-\d{2}-\d{2})?$/.test(u) ? u : '/';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

// iOS stops delivering pushes to a web app that receives one without showing a notification,
// so every push shows something, even when the payload cannot be read.
self.addEventListener('push', event => {
  let d = {};
  try { const p = event.data ? event.data.json() : {}; d = p.data || p.notification || p || {}; } catch { /* fall back to a generic text */ }
  const title = typeof d.title === 'string' && d.title ? d.title : 'Mihu’s Corner 🌻';
  const options = {
    body: typeof d.body === 'string' && d.body ? d.body : 'Mihu có một lời nhắc mới. Chạm để xem nhé.',
    icon: '/icon-192.png', badge: '/icon-192.png', lang: 'vi', timestamp: Date.now(),
    tag: typeof d.tag === 'string' && d.tag ? d.tag : 'mihu-reminder', renotify: true,
    data: { url: safeUrl(d.url) },
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
    // Number on the home-screen icon (iOS 16.4+ web apps, Chrome desktop).
    try { const shown = await self.registration.getNotifications(); await self.navigator.setAppBadge?.(shown.length); } catch { /* badge not supported */ }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = safeUrl(event.notification.data?.url);
  event.waitUntil((async () => {
    try { const left = await self.registration.getNotifications(); left.length ? await self.navigator.setAppBadge?.(left.length) : await self.navigator.clearAppBadge?.(); } catch { /* ignore */ }
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = windows.find(c => new URL(c.url).origin === self.location.origin);
    if (open) {
      // The open app switches to that day itself; no reload, nothing typed is lost.
      open.postMessage({ type: 'open-url', url });
      return open.focus();
    }
    return self.clients.openWindow(url);
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'logout' || event.data?.type === 'seen') {
    event.waitUntil((async () => {
      if (event.data.type === 'logout') (await self.registration.getNotifications()).forEach(n => n.close());
      try { await self.navigator.clearAppBadge?.(); } catch { /* ignore */ }
    })());
  }
});
