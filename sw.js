/**
 * CubeTrack Service Worker
 *
 * Strategy:
 *   • App shell (index.html, fonts) → Cache-first, update in background
 *   • Google Sheets API calls       → Network-first, fall back to last response
 *   • Everything else               → Network with offline fallback
 *
 * This lets trainers mark attendance and view cached data even with no internet.
 */

const CACHE_NAME     = "cubetrack-v1";
const SHEET_CACHE    = "cubetrack-sheet-v1";
const OFFLINE_PAGE   = "/";

// Files to pre-cache on install (app shell)
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./manifest.json",
  "https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Space+Mono:wght@400;700&family=DM+Sans:wght@300;400;500&display=swap"
];

// ── Install ───────────────────────────────────────────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Cache what we can — don't fail install if fonts are blocked
      return Promise.allSettled(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(e => console.warn("SW: could not cache", url, e))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate ──────────────────────────────────────────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_NAME && k !== SHEET_CACHE)
          .map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // ── Google Sheets / Apps Script requests: Network-first ───────────────────
  // These are the live data calls (pull/push). Always try network.
  // Cache the last successful pull response so offline users see their data.
  if (url.hostname.includes("script.google.com") ||
      url.hostname.includes("googleapis.com")) {

    if (url.searchParams.get("action") === "pull") {
      event.respondWith(networkFirstWithCache(event.request, SHEET_CACHE));
    } else {
      // push/ping — network only, no caching writes
      event.respondWith(fetch(event.request).catch(() =>
        new Response(JSON.stringify({ok:false,error:"Offline"}),
          {status:503, headers:{"Content-Type":"application/json"}})
      ));
    }
    return;
  }

  // ── Google Fonts: Cache-first (they rarely change) ────────────────────────
  if (url.hostname.includes("fonts.gstatic.com") ||
      url.hostname.includes("fonts.googleapis.com")) {
    event.respondWith(cacheFirstWithNetwork(event.request, CACHE_NAME));
    return;
  }

  // ── App shell (index.html, manifest): Stale-while-revalidate ─────────────
  // Serve from cache immediately, update cache in background
  if (url.pathname.endsWith(".html") ||
      url.pathname.endsWith(".json") ||
      url.pathname === "/" ||
      url.pathname.endsWith("/")) {
    event.respondWith(staleWhileRevalidate(event.request, CACHE_NAME));
    return;
  }

  // ── Everything else: Network with cache fallback ───────────────────────────
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        // Return offline page for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        return new Response("Offline", {status: 503});
      })
    )
  );
});

// ── Cache strategies ──────────────────────────────────────────────────────────

async function networkFirstWithCache(request, cacheName) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (e) {
    const cached = await caches.match(request);
    if (cached) return cached;
    return new Response(
      JSON.stringify({ok: false, error: "Offline — showing cached data"}),
      {status: 503, headers: {"Content-Type": "application/json"}}
    );
  }
}

async function cacheFirstWithNetwork(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (e) {
    return new Response("Resource unavailable offline", {status: 503});
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  const networkFetch = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);

  return cached || networkFetch;
}

// ── Background sync (optional enhancement) ────────────────────────────────────
// If a push failed while offline, retry when connection returns
self.addEventListener("sync", event => {
  if (event.tag === "sync-sheet") {
    event.waitUntil(
      // Notify all open clients to retry the push
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({type: "SYNC_NOW"}));
      })
    );
  }
});

// ── Push notifications (future) ───────────────────────────────────────────────
self.addEventListener("push", event => {
  if (!event.data) return;
  try {
    const data = event.data.json();
    event.waitUntil(
      self.registration.showNotification(data.title || "CubeTrack", {
        body:    data.body  || "",
        icon:    data.icon  || "./",
        badge:   data.badge || "./",
        tag:     data.tag   || "cubetrack",
        data:    data.url   || "./",
        vibrate: [200, 100, 200]
      })
    );
  } catch(e) {}
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type:"window"}).then(clientList => {
      for (const client of clientList) {
        if (client.url && "focus" in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(event.notification.data || "./");
    })
  );
});
