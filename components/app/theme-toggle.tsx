"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { getTheme, setTheme, subscribeToTheme, type Theme } from "@/lib/theme";

/** The current theme, kept in step with the <html> class. Light on the server. */
export function useTheme(): Theme {
  return useSyncExternalStore(subscribeToTheme, getTheme, () => "light");
}

/** Switches between light and dark. Sits at the top right of every screen. */
export function ThemeToggle() {
  const theme = useTheme();
  const next: Theme = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} mode`}
      className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {/* Both icons are rendered and CSS picks one, so the right icon shows
          before React has loaded. */}
      <SunIcon className="hidden size-5 dark:block" />
      <MoonIcon className="size-5 dark:hidden" />
    </button>
  );
}
