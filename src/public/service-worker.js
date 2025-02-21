const CACHE_NAME = "app-cache-v4"; // Cambia el nombre para forzar actualización
const urlsToCache = [
  "/", 
  "/index.html", 
  "/styles.css",
  "/app.js", 
  "/manifest.json",
  "/imagenes/apk192.png"
];

// Instalación del Service Worker
self.addEventListener("install", (event) => {
  console.log("📢 Instalando nuevo Service Worker...");
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        urlsToCache.map((url) => {
          return fetch(url)
            .then((response) => {
              if (!response.ok) throw new Error(`HTTP ${response.status} - ${response.statusText}`);
              return cache.put(url, response);
            })
            .catch((error) => console.error(`❌ Error cacheando ${url}:`, error));
        })
      );
    }).then(() => self.skipWaiting()) // Activa el SW inmediatamente
  );
});

// Activación del Service Worker (Elimina cachés antiguas)
self.addEventListener("activate", (event) => {
  console.log("🔄 Activando nuevo Service Worker...");
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log(`🗑 Eliminando caché antigua: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Toma control inmediato
  );
});

// Interceptor de solicitudes (fetch)
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Devuelve desde caché
      }
      return fetch(event.request)
        .then((networkResponse) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => new Response("No hay conexión y el recurso no está en caché", {
          status: 408,
          statusText: "Request Timeout",
        }));
    })
  );
});

// Escuchar mensajes para actualizar el SW
self.addEventListener("message", (event) => {
  if (event.data.action === "skipWaiting") {
    self.skipWaiting();
  }
});
