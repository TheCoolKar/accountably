import type { Store } from "@/lib/data";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

export type PushState =
  /** Can be turned on with one tap. */
  | "off"
  | "on"
  /** iPhone or iPad in Safari: notifications only work from the home-screen app. */
  | "needs-install"
  /** The person said no in the browser; only they can undo that in settings. */
  | "blocked"
  | "unsupported";

function isIos(): boolean {
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac.
    (navigator.userAgent.includes("Mac") && navigator.maxTouchPoints > 1)
  );
}

function isInstalled(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function decodeKey(base64url: string): Uint8Array<ArrayBuffer> {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function encodeKey(buffer: ArrayBuffer | null): string {
  if (!buffer) return "";
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function getPushState(): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return "unsupported";
  if (isIos() && !isInstalled()) return "needs-install";
  if (
    !("serviceWorker" in navigator) ||
    !("PushManager" in window) ||
    !("Notification" in window)
  ) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  if (Notification.permission !== "granted") return "off";
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  return subscription ? "on" : "off";
}

/**
 * Asks permission (must be called from a tap), signs this device up with the
 * browser's push service, and saves it to the account. Returns the new state.
 */
export async function enablePush(store: Store): Promise<PushState> {
  if (!VAPID_PUBLIC_KEY) return "unsupported";
  const permission = await Notification.requestPermission();
  if (permission === "denied") return "blocked";
  if (permission !== "granted") return "off";

  const registration = await registerServiceWorker();
  if (!registration) return "unsupported";
  await navigator.serviceWorker.ready;

  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(VAPID_PUBLIC_KEY),
    }));

  try {
    await store.savePushDevice({
      endpoint: subscription.endpoint,
      p256dh: encodeKey(subscription.getKey("p256dh")),
      auth: encodeKey(subscription.getKey("auth")),
      userAgent: navigator.userAgent,
    });
  } catch (error) {
    // Don't leave the browser subscribed to something the account doesn't know about.
    await subscription.unsubscribe().catch(() => {});
    throw error;
  }
  return "on";
}

/** Turns notifications off for this device only. */
export async function disablePush(store: Store): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await store.removePushDevice(subscription.endpoint);
  await subscription.unsubscribe().catch(() => {});
}

/**
 * Browsers occasionally replace a device's push address. If notifications are
 * on, quietly re-save the current one so they keep arriving.
 */
export async function refreshPushDevice(store: Store): Promise<void> {
  if ((await getPushState()) !== "on") return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await store.savePushDevice({
    endpoint: subscription.endpoint,
    p256dh: encodeKey(subscription.getKey("p256dh")),
    auth: encodeKey(subscription.getKey("auth")),
    userAgent: navigator.userAgent,
  });
}
