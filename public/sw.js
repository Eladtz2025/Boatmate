/**
 * Boatmate service worker.
 *
 * Deliberately conservative: it makes the app installable and keeps the shell
 * usable when the connection drops, but it never caches Supabase API traffic —
 * stale balances or documents would be worse than an honest error.
 */

/**
 * Bumping this is what evicts the previous caches — `activate` deletes every key
 * that does not start with the current VERSION. v1 cached authenticated
 * navigation HTML, so installs from that version are holding a rendered snapshot
 * of the boat's finances; v2 is how they let go of it.
 */
const VERSION = "boatmate-v2";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

// "/" is deliberately absent: it is the authenticated home screen, and
// precaching it stores this boat's balances on disk. Only the offline notice,
// which is the same for everyone and says nothing, is worth keeping.
const SHELL_ASSETS = ["/offline"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never touch cross-origin traffic (Supabase REST, storage, auth).
  if (url.origin !== self.location.origin) return;

  // Never cache API routes or auth callbacks.
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) {
    return;
  }

  // Navigations: network first, and the offline page when there is no network.
  //
  // Successful navigations are deliberately NOT cached. They are authenticated,
  // server-rendered HTML — a page carrying this boat's balances, a partner's
  // name and every expense. Storing it put a snapshot of the crew's finances on
  // disk that survived sign-out, and served last week's numbers as if they were
  // this week's. That is precisely the "stale balances are worse than an honest
  // error" this file opens by promising, so the only offline answer is /offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        async () => (await caches.match("/offline")) || Response.error(),
      ),
    );
    return;
  }

  // Static assets: cache first, they are content-hashed by Next.
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/")
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(ASSET_CACHE).then((cache) => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
