const CACHE_NAME = "app-cache-v4"; // Cambia la versión para forzar la actualización
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
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const url of urlsToCache) {
        try {
          console.log(`📂 Intentando cachear: ${url}`);
          const response = await fetch(url, { mode: "no-cors" }); // Evita problemas de CORS
          if (!response || !response.ok) {
            throw new Error(`HTTP ${response.status} - ${response.statusText}`);
          }
          await cache.put(url, response.clone());
          console.log(`✅ Cacheado correctamente: ${url}`);
        } catch (error) {
          console.error(`❌ Error cacheando ${url}:`, error);
        }
      }
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
    }).then(() => self.clients.claim()) // Forzar control inmediato del SW
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
