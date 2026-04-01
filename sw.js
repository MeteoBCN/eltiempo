/* ═══════════════════════════════════════════════════
   SERVICE WORKER — Tiempo Barcelona PWA
   ═══════════════════════════════════════════════════ */

const CACHE_NAME = 'tiempo-bcn-v4';

// Archivos que se guardan en caché para funcionamiento offline
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/weather-icons@1.3.2/css/weather-icons.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

// ── Instalación: precachear recursos esenciales ──────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_ASSETS).catch(err => {
        console.warn('[SW] No se pudieron cachear algunos recursos:', err);
      });
    })
  );
  self.skipWaiting();
});

// ── Activación: limpiar cachés antiguas ──────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// ── Fetch: estrategia Network-first con fallback a caché ─────────
self.addEventListener('fetch', event => {
  // Solo interceptamos peticiones GET
  if (event.request.method !== 'GET') return;

  // Las peticiones a APIs de tiempo siempre van a la red (datos frescos)
  const url = event.request.url;
  const isApiRequest =
    url.includes('open-meteo.com') ||
    url.includes('marine-api.open-meteo.com') ||
    url.includes('aemet') ||
    url.includes('openweathermap');

  if (isApiRequest) {
    // Network-only para las APIs (necesitamos datos actuales)
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ error: 'Sin conexión' }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
    return;
  }

  // Network-first con fallback a caché para el resto
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Guardamos en caché una copia de la respuesta
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Sin red → servir desde caché
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Fallback para páginas HTML: devolver la página principal cacheada
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html');
          }
        });
      })
  );
});

// ── Push Notifications ───────────────────────────────────────────
self.addEventListener('push', event => {
  let data = {
    title: '🌤️ Tiempo Barcelona',
    body: 'Nueva actualización meteorológica disponible.',
    icon: './icon-192.png',
    badge: './icon-192.png',
    tag: 'weather-update',
    renotify: true
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      data = { ...data, ...payload };
    } catch {
      data.body = event.data.text();
    }
  }

  const options = {
    body: data.body,
    icon: data.icon,
    badge: data.badge,
    tag: data.tag,
    renotify: data.renotify,
    vibrate: [200, 100, 200],
    data: {
      url: data.url || './'
    }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── Click en notificación → abrir/enfocar la app ─────────────────
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || './';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
