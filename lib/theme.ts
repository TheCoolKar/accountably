/**
 * Light / dark theme.
 *
 * How it works, in full:
 *   - Every colour in the app is a CSS variable defined in app/globals.css,
 *     once under `:root` (light) and once under `.dark`.
 *   - The theme is the presence of the `dark` class on <html>. Nothing else.
 *   - The choice is remembered in localStorage. With no choice saved, the
 *     device's own light/dark setting decides.
 *   - THEME_INIT_SCRIPT runs before the page paints (see app/layout.tsx) so
 *     there is no flash of the wrong theme.
 *
 * To keep this working as the app grows: never write a literal colour in a
 * component. Use the tokens (bg-background, text-foreground, bg-card,
 * text-muted-foreground, border, bg-primary, text-success, …) and both themes
 * follow automatically.
 */

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "accountably:theme";
/** Browser chrome colour per theme. Matches --background in globals.css. */
export const THEME_COLORS: Record<Theme, string> = { light: "#f7f6f3", dark: "#16171b" };

const CHANGE_EVENT = "accountably:theme-change";

/** Runs in <head> before first paint. Keep it tiny and dependency-free. */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark"){t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}var d=document.documentElement;d.classList.toggle("dark",t==="dark");d.style.colorScheme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="dark"?${JSON.stringify(
  THEME_COLORS.dark,
)}:${JSON.stringify(THEME_COLORS.light)})}catch(e){}})();`;

export function getTheme(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function setTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", THEME_COLORS[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Without storage the choice lasts until the page reloads.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

/** For useSyncExternalStore: tells React when the theme changes. */
export function subscribeToTheme(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => window.removeEventListener(CHANGE_EVENT, onChange);
}
