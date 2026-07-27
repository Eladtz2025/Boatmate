/**
 * Supabase connection values, sanitised at the single point where we read them.
 *
 * Env values get copy-pasted, piped through shells and stored by dashboards, and
 * any of those can prepend a UTF-8 BOM (U+FEFF) or leave stray whitespace. It is
 * invisible everywhere you would look for it, and it fails far from the cause:
 *
 *   - `new URL()` on a BOM-prefixed URL throws, which kills `next build`.
 *   - the anon key travels in the `apikey` header, and headers must be
 *     ISO-8859-1, so the browser rejects *every* Supabase request with
 *     "String contains non ISO-8859-1 code point" — a message that says nothing
 *     about env vars.
 *
 * Both happened to this project, from one bad paste into the Vercel dashboard.
 * Trimming here is cheap insurance: no legitimate value has leading or trailing
 * whitespace, and none contains a BOM.
 *
 * NOTE: keep the `process.env.NEXT_PUBLIC_*` reads as literal property accesses.
 * That is the form the bundler statically replaces for client code; a dynamic
 * lookup would come back undefined in the browser.
 */

/**
 * Strips a byte-order mark and surrounding whitespace.
 *
 * U+FEFF is written as an escape on purpose: the literal character is invisible
 * in an editor, which is the very problem this function exists to solve.
 */
export function cleanEnv(value: string | undefined, name: string): string {
  const cleaned = value?.replace(/^\uFEFF/, "").trim();
  if (!cleaned) {
    throw new Error(
      `${name} is missing. Set it in .env.local (or in the Vercel project settings) and restart.`,
    );
  }
  return cleaned;
}

export const SUPABASE_URL = cleanEnv(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  "NEXT_PUBLIC_SUPABASE_URL",
);

export const SUPABASE_ANON_KEY = cleanEnv(
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
);
