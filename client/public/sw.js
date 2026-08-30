/* Minimal runtime cache. Bump CACHE to expire every old entry at once. */
const CACHE = 'dashboard-v1';

self.addEventListener('install', (e) => {
  // The shell only. Hashed assets arrive through the fetch handler as they are
  // requested — precaching them would mean parsing the build manifest here.
  // Just /index.html. `/` is the same document, and addAll is atomic - if
  // either entry fails the whole install rejects and the worker never
  // activates. Only /index.html is ever read back.
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

  // Anything but a plain GET is a write. Never touch it.
  if (request.method !== 'GET') return;

  // Another origin's problem.
  if (url.origin !== self.location.origin) return;

  /**
   * THE API IS NEVER CACHED.
   *
   * v1 could get away with a same-origin rule because its API lived on another
   * host entirely. Here /api is same-origin, so a "cache same-origin GETs" rule
   * would write authenticated JSON — someone's body weight, their sessions —
   * into a store that outlives sign-out and is readable by the next person to
   * open the browser. Offline reads come from the persisted query cache, which
   * is per-user and cleared on sign-out. This must stay the first rule.
   */
  if (url.pathname.startsWith('/api')) return;

  // Hashed build output: the filename changes when the content does, so a hit
  // can never be stale.
  if (url.pathname.startsWith('/api')) return;

  if (url.pathname.startsWith('/static/')) {
    e.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Navigations: network first so a deploy is picked up immediately, falling
  // back to the cached shell when offline. The client router takes over from
  // there, which is why any path can be answered with the shell.
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // Only cache a REAL shell. fetch() resolves on a 500, so without this a
          // mid-deploy error page becomes the offline shell - and the only
          // thing that can replace it is a successful navigation, which is
          // precisely what an offline user cannot produce.
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
