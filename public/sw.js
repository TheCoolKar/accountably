// Accountably service worker: shows push notifications and opens the app when
// one is tapped. It does not cache anything, so the app always loads fresh.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  // iOS requires that every push shows a notification.
  event.waitUntil(
    self.registration.showNotification(data.title || "Accountably", {
      body: data.body || "Something happened in your squad.",
      tag: data.tag || undefined,
      // A notification that replaces an older one with the same tag still alerts.
      renotify: Boolean(data.tag),
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { url: data.url || "/squad" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/squad", self.location.origin);
  // Only ever open pages of this app.
  if (target.origin !== self.location.origin) return;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin) {
          await client.focus();
          if ("navigate" in client) await client.navigate(target.href).catch(() => {});
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
