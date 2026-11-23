/**
 * A full page load, for moments when the account or squad changes (sign in,
 * sign out, join, leave). It throws away everything the previous screens held
 * in memory, so nothing from one account can linger into the next.
 */
export function startFresh(path: string): void {
  window.location.replace(path);
}
