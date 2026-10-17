/* اعلان‌های دارینو — دریافت Web Push و باز کردن همان بخش اپ با لمس اعلان.
   این فایل با importScripts وارد سرویس‌ورکر Workbox می‌شود (vite.config.ts). هیچ داده‌ای کش نمی‌کند. */
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'دارینو', body: event.data ? event.data.text() : '' }; }
  const title = typeof data.title === 'string' && data.title ? data.title : 'دارینو';
  const url = typeof data.url === 'string' && data.url.startsWith('/') ? data.url : '/';
  event.waitUntil(self.registration.showNotification(title, {
    body: typeof data.body === 'string' ? data.body : '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    dir: 'rtl',
    lang: 'fa',
    tag: typeof data.tag === 'string' ? data.tag : undefined,
    renotify: !!data.tag,
    data: { url }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = (event.notification.data && event.notification.data.url) || '/';
  // اپ با HashRouter کار می‌کند
  const target = new URL('/#' + path, self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate(target); }
    }
    return self.clients.openWindow(target);
  })());
});
