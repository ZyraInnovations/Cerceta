const CACHE_NAME = "app-cache-v1";
const urlsToCache = [
  "/", 
  "/login",
  "/styles.css",
  "/app.js",
  "/manifest.json",
  "/imagenes/apk192.png" 
];

// Instalación del Service Worker
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        // Intentar agregar todos los archivos a la caché
        await cache.addAll(urlsToCache);
        console.log("✅ Archivos cacheados correctamente");
      } catch (error) {
        console.error("❌ Error al almacenar en caché:", error);
      }
    }).then(() => self.skipWaiting()) // Activar inmediatamente el nuevo Service Worker
  );
});

// Activación del Service Worker (limpiar cachés antiguas)
self.addEventListener("activate", function (event) {
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
    }).then(() => self.clients.claim()) // Tomar el control de la aplicación
  );
});

// Interceptor de solicitudes (fetch)
self.addEventListener("fetch", function (event) {
  event.respondWith(
    caches.match(event.request).then(function (response) {
      if (response) {
        return response; // Devolver desde la caché
      }
      return fetch(event.request)
        .then((networkResponse) => {
          // Si la solicitud es exitosa, almacenarla en la caché
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch((error) => {
          console.error("❌ Error al hacer fetch:", error);
          return new Response("No hay conexión y el recurso no está en caché", {
            status: 408,
            statusText: "Request Timeout",
          });
        });
    })
  );
});
