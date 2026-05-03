const CACHE_NAME = "chamada-turma-v1";

const urlsToCache = [
  "/",
  "/index.html",
  "/css/",
  "/js/"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll([
        "/",
        "/index.html"
      ]))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        return response || fetch(event.request);
      })
  );
});