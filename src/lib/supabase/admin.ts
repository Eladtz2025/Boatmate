import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, cleanEnv } from "./env";
import type { Database } from "./database.types";

/**
 * Service-role client. It bypasses RLS completely and can mint sessions, so it
 * is the one credential in this project that must never reach the browser —
 * the `server-only` import turns an accidental client import into a build
 * error instead of a leaked key.
 *
 * The key is read inside the function rather than at module scope on purpose.
 * `env.ts` is imported by `client.ts`, which runs in the browser, and
 * `SUPABASE_SERVICE_ROLE_KEY` is not a `NEXT_PUBLIC_` variable — a top-level
 * read would be `undefined` there and throw on import.
 *
 * `persistSession` is off because there is no session to persist: this client
 * acts as the service role itself, never as a signed-in user.
 */
export function createAdminClient() {
  const serviceRoleKey = cleanEnv(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    "SUPABASE_SERVICE_ROLE_KEY",
  );

  return createSupabaseClient<Database>(SUPABASE_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
