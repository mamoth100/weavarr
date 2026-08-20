// Weavarr service worker: receives web push and opens the right page on tap.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  event.waitUntil(
    self.registration.showNotification(data.title || 'Weavarr', {
      body: data.message || '',
      icon: '/favicon-32.png',
      badge: '/favicon-32.png',
      data: { url: data.url || '/' },
    })
  );
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow((event.notification.data && event.notification.data.url) || '/'));
});
