const deriveCacheVersion = () => {
  try {
    const swUrl = new URL(self.location.href);
    const version = swUrl.searchParams.get("v");
    if (version && version.trim().length > 0) {
      return version.trim();
    }
  } catch (error) {
    console.warn("Service Worker: Failed to derive cache version", error);
  }
  return "v1";
};

const CACHE_VERSION = deriveCacheVersion();
const PRECACHE = `hotbite-precache-${CACHE_VERSION}`;
const RUNTIME = `hotbite-runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/logo.png",
  "/gclogo.png",
  "/favicon.ico",
];

const isHtmlNavigation = (request) => {
  const acceptHeader = request.headers.get("accept") || "";
  return (
    request.mode === "navigate" ||
    (acceptHeader.includes("text/html") && request.destination === "")
  );
};

const isSameOrigin = (url) => url.origin === self.location.origin;

const shouldBypassCache = (request) => {
  const acceptHeader = request.headers.get("accept") || "";
  return (
    request.method !== "GET" ||
    acceptHeader.includes("application/json") ||
    request.url.includes("/api/")
  );
};

const shouldCacheRuntime = (request) => {
  const cacheableDestinations = [
    "style",
    "script",
    "image",
    "font",
    "worker",
  ];
  return cacheableDestinations.includes(request.destination);
};

const putInCache = async (cacheName, request, response) => {
  const cache = await caches.open(cacheName);
  await cache.put(request, response);
};

const fetchAndCache = async (request) => {
  const networkResponse = await fetch(request);
  if (networkResponse && networkResponse.ok) {
    await putInCache(RUNTIME, request, networkResponse.clone());
  }
  return networkResponse;
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(PRECACHE);
        await cache.addAll(PRECACHE_URLS);
      } catch (error) {
        console.error("Service Worker: Precache failed", error);
      }
    })()
  );
  self.skipWaiting();
});

const notifyClientsOfActivation = async () => {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of clientList) {
    client.postMessage({
      type: "SW_ACTIVATED",
      cacheVersion: CACHE_VERSION,
    });
  }
};

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (![PRECACHE, RUNTIME].includes(cacheName)) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        })
      );
      await self.clients.claim();
      await notifyClientsOfActivation();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (!event.data || typeof event.data !== "object") {
    return;
  }

  const { type } = event.data;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const requestUrl = new URL(request.url);

  if (!isSameOrigin(requestUrl) || shouldBypassCache(request)) {
    return;
  }

  if (isHtmlNavigation(request)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response && response.ok) {
            await putInCache(PRECACHE, "/index.html", response.clone());
          }
          return response;
        })
        .catch(async () => {
          const cachedResponse = await caches.match("/index.html");
          if (cachedResponse) {
            return cachedResponse;
          }
          return Response.error();
        })
    );
    return;
  }

  if (shouldCacheRuntime(request)) {
    event.respondWith(
      fetchAndCache(request).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    fetch(request).catch(() => caches.match(request))
  );
});
