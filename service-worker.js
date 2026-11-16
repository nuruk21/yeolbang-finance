const CACHE_NAME = "yolbang-finance-v4";
const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./imports.css",
  "./ext.css",
  "./app.js",
  "./ext-core.js",
  "./ext-finance.js",
  "./ext-church.js",
  "./firebase-config.js",
  "./firebase-sync.js",
  "./members-loader.js",
  "./manifest.webmanifest",
  "./vendor/xlsx.full.min.js",
  "./assets/yeolbang-church-logo-original.jpg",
  "./assets/yeolbang-church-seal.png",
  "./assets/pwa-icon-192.png",
  "./assets/pwa-icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(LOCAL_ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put("./index.html", copy)); return response; }).catch(() => caches.match("./index.html")));
    return;
  }
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response; }).catch(() => caches.match(event.request)));
    return;
  }
  if (url.hostname === "www.gstatic.com" && url.pathname.includes("/firebasejs/")) {
    event.respondWith(caches.match(event.request).then((cached) => {
      const network = fetch(event.request).then((response) => { const copy = response.clone(); caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)); return response; });
      return cached || network;
    }));
  }
});
