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
 * of the boat's finances; v2 is how they let go of it. v3 adds push handling,
 * and the bump is what gets this file onto installs that already exist.
 */
const VERSION = "boatmate-v3";
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

/* ==========================================================================
   Push notifications
   --------------------------------------------------------------------------
   The boat's real notification channel: when a partner marks, changes or
   cancels attendance, the server pushes to every other partner's subscribed
   device. See src/lib/push.ts for the sending half.

   The payload is small and deliberately carries no money, no balances and no
   document titles — a notification is rendered by the operating system and
   lands on a lock screen, which is the one place in this app that is not
   behind the auth gate. It says who is coming and when, and nothing else.
   ========================================================================== */

self.addEventListener("push", (event) => {
  /** @type {{title?: string, body?: string, url?: string, tag?: string}} */
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    // A push we cannot parse still deserves to surface, rather than being
    // silently swallowed — a silent drop looks exactly like "not subscribed".
    payload = {};
  }

  const title = payload.title || "Boatmate";
  const options = {
    body: payload.body || "",
    // `tag` collapses repeats: three edits to the same Saturday replace one
    // another instead of stacking three notifications about one fact.
    tag: payload.tag || "boatmate",
    renotify: Boolean(payload.tag),
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "he",
    data: { url: payload.url || "/calendar" },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = (event.notification.data && event.notification.data.url) || "/calendar";

  // Focus an open Boatmate tab rather than piling up new ones; only open a
  // window when there is nothing to focus.
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        for (const client of clients) {
          if (new URL(client.url).origin !== self.location.origin) continue;
          if ("focus" in client) {
            client.navigate(target).catch(() => undefined);
            return client.focus();
          }
        }
        return self.clients.openWindow(target);
      }),
  );
});

// A browser can rotate a subscription on its own. When it does, the old
// endpoint stops working, so the page is told to re-subscribe next time it is
// opened; there is no credential here the worker could re-register by itself.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) client.postMessage({ type: "push-subscription-changed" });
    }),
  );
});
