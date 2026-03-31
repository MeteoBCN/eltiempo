/* ═══════════════════════════════════════════════════
   SERVICE WORKER — Tiempo Barcelona
   Con soporte Firebase Cloud Messaging (FCM)
   ═══════════════════════════════════════════════════ */

importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCACCy2SA-1JDH3DO1WyjDRPcqG7or5ZmY",
  authDomain: "tiempo-barcelona.firebaseapp.com",
  projectId: "tiempo-barcelona",
  storageBucket: "tiempo-barcelona.firebasestorage.app",
  messagingSenderId: "1001480227705",
  appId: "1:1001480227705:web:d2158e16f4993f522efda8"
});

const messaging = firebase.messaging();

/* ── Notificaciones en background (app cerrada/minimizada) ── */
messaging.onBackgroundMessage(payload => {
  console.log('[SW] Notificación recibida en background:', payload);

  const { title, body, icon } = payload.notification || {};

  self.registration.showNotification(title || '🌤️ Tiempo Barcelona', {
    body: body || '',
    icon: icon || './icon-192.png',
    badge: './icon-192.png',
    vibrate: [200, 100, 200],
    tag: 'tiempo-bcn-' + Date.now()
  });
});

/* ── Clic en la notificación → abrir la app ── */
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow('/');
    })
  );
});

/* ── Cache básico para PWA offline ── */
const CACHE = 'tiempo-bcn-v1';
const PRECACHE = ['./', './index.html', './icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
