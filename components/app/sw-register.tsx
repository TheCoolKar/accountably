"use client";

import { useEffect } from "react";
import { getStore } from "@/lib/data";
import { refreshPushDevice, registerServiceWorker } from "@/lib/push";

/** Keeps the service worker installed and this device's push address current. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    void registerServiceWorker().then(() =>
      // Best effort: signed-out or offline just means nothing to refresh.
      refreshPushDevice(getStore()).catch(() => {}),
    );
  }, []);
  return null;
}
