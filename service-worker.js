const CACHE_NAME = "aa-fitness-coaching-shell-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./tokens.css",
  "./app.css",
  "./main.js",
  "./auth.js",
  "./install.js",
  "./supabase.js",
  "./data.js",
  "./dashboard.js",
  "./aa-logo.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("aa-fitness-coaching-") && key !== CACHE_NAME).map((key) => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      const cacheKey = request.mode === "navigate" ? "./index.html" : request;
      caches.open(CACHE_NAME).then((cache) => cache.put(cacheKey, copy));
    }
    return response;
  }).catch(async () => {
    if (request.mode === "navigate") return (await caches.match("./index.html")) || caches.match("./");
    return caches.match(request);
  }));
});
