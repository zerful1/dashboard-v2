/* Minimal runtime cache. Bump CACHE to expire every old entry at once. */
const CACHE = 'dashboard-v2';

self.addEventListener('install', (e) => {
  // Shell only; hashed assets are cached as requested. addAll is atomic: one failure rejects the install.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['/index.html'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // Anything but a plain GET is a write: never touch it.
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  /** Never cache /api (same-origin: one user's JSON would outlive sign-out); must stay the first rule. */
  if (url.pathname.startsWith('/api')) return;

  // Hashed build output: the filename changes with the content, so a hit is never stale.
  if (url.pathname.startsWith('/static/')) {
    e.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            // Never save the shell under an asset's name (a host's 200 for a missing file).
            const html = (res.headers.get('content-type') || '').includes('text/html');
            if (res.ok && !html) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: network first so a deploy lands at once, the cached shell when offline.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // Only a REAL shell: fetch() resolves on a 500, and offline cannot replace a bad one.
          if (res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put('/index.html', copy));
          }
          return res;
        })
        .catch(() => caches.match('/index.html').then((hit) => hit || Response.error())),
    );
  }
});
