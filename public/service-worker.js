/*
  A SERVICE WORKER THAT CANNOT SERVE STALE GOLDIE.

  The point of this one is a home-screen app that opens instantly and does not
  show a browser error when the phone is on a bad connection. What it must
  never do is cache an answer: every figure in Goldie is a claim about what is
  happening on Etsy right now, and Etsy's own rules require displayed data to
  be under six hours old. A cached board would break that quietly and look
  perfectly fine doing it.

  So: the shell is cached, the data never is.
*/
const SHELL = "goldie-shell-v1";
const SHELL_FILES = [
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
  "/manifest.webmanifest",
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL).then(cache => cache.addAll(SHELL_FILES)));
  /* A new build should take over rather than wait for every tab to close. */
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(names =>
      Promise.all(names.filter(name => name !== SHELL).map(name => caches.delete(name))))
      .then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  /* Never an API response, never a page. Those are answers about now. */
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") return;

  /* Static assets only: icons, fonts, the built CSS and JS, which are
     content-hashed by the build and safe to keep. */
  const cacheable = /\.(?:png|jpg|jpeg|webp|svg|ico|woff2?|css|js)$/.test(url.pathname);
  if (!cacheable) return;

  event.respondWith(
    caches.match(request).then(hit =>
      hit || fetch(request).then(response => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(SHELL).then(cache => cache.put(request, copy));
        }
        return response;
      }).catch(() => hit)));
});
