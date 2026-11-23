import type { Store } from "./store";
import { isSupabaseConfigured, supabaseStore } from "./supabase-store";

/** The backend the screens talk to. */
export function getStore(): Store {
  return supabaseStore;
}

export { isSupabaseConfigured };
export * from "./store";
