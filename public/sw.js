// The service worker, and the only reason there is one.
//
// It exists to receive push notifications. It deliberately does not cache
// anything: an offline cache for a shop whose whole job is telling you where
// your order is right now would mostly serve you a stale answer confidently,
// and every "why is the app showing yesterday's menu" bug starts here. Adding
// caching later is a decision to make on purpose, not something to inherit
// from a template.
//
// Plain JavaScript in public/ rather than anything compiled: a service worker
// has to be served from the origin root to control the whole scope, and this
// file is short enough that a build step would be the more complicated half.

// Take over as soon as a new version is installed rather than waiting for
// every tab to close. Otherwise a fix to this file reaches somebody's phone
// whenever they next happen to quit the app, which for an installed PWA can
// be never.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  // No payload means something sent an empty push. Showing a generic
  // notification would be worse than showing nothing: a phone buzzing to say
  // nothing at all is exactly how a customer turns notifications off.
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    return;
  }
  if (!payload || !payload.title) return;

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body ?? "",
      icon: "/icon-192.png",
      // The small monochrome mark Android puts in the status bar. iOS ignores
      // it and uses the installed app's own icon.
      badge: "/icon-192.png",
      // One story per order: a later update replaces the earlier one instead
      // of stacking four notifications about the same bagels.
      tag: payload.tag ?? "corner-bagel",
      renotify: true,
      data: { url: payload.url ?? "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";

  // Focus a tab that is already open on the right page rather than opening a
  // second one. Somebody who has the tracker open and taps the notification
  // about it should land on the tracker they already had, not on a duplicate.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      for (const client of windows) {
        const path = new URL(client.url).pathname;
        if (path === target && "focus" in client) return client.focus();
      }
      for (const client of windows) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(target).then((c) => (c ? c.focus() : undefined));
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// The push service can retire a subscription on its own — key rotation at the
// browser vendor, or a long idle period. The page re-subscribes and re-posts
// the new endpoint the next time it is opened; this is here so the event is
// not simply unhandled, and so the reason shows up in a log rather than as a
// customer who quietly stopped hearing from us.
self.addEventListener("pushsubscriptionchange", () => {
  console.warn("[sw] the push subscription was replaced; it re-registers on next open");
});
