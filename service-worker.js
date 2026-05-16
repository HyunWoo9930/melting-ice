const cacheVersion = "20260516-canvas-1";
const appCacheName = `melting-ice-app-${cacheVersion}`;
const frameCacheName = `melting-ice-frames-${cacheVersion}`;

const appShell = [
  "/",
  "/index.html",
  "/styles.css?v=20260516-canvas-1",
  "/script.js?v=20260516-canvas-1",
  "/manifest.json?v=20260516-canvas-1",
  "/assets/icons/favicon-32.png?v=20260516-canvas-1",
  "/assets/icons/apple-touch-icon.png?v=20260516-canvas-1",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/icons/maskable-512.png",
  "/assets/frames/ice-000.webp?v=20260516-canvas-1",
  "/assets/frames/ice-001.webp?v=20260516-canvas-1"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(appCacheName).then((cache) => cache.addAll(appShell)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("melting-ice-") && ![appCacheName, frameCacheName].includes(name))
            .map((name) => caches.delete(name))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, appCacheName, "/index.html"));
    return;
  }

  if (url.pathname.startsWith("/assets/frames/")) {
    event.respondWith(cacheFirst(request, frameCacheName));
    return;
  }

  event.respondWith(cacheFirst(request, appCacheName));
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return (await cache.match(request)) || cache.match(fallbackUrl);
  }
}
