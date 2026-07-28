"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type EntryResult =
  | { ok: true; tokenHash: string }
  | { ok: false; error: string };

/**
 * Deliberately vague, and the same message whether the address is unknown or
 * known-but-not-a-partner. There is no secret to protect here, but there is no
 * reason to turn the login box into a directory of who owns a boat either.
 */
const REFUSED = "הכתובת הזו לא רשומה כשותפה בסירה.";
const BROKEN = "משהו השתבש בכניסה. נסו שוב.";

/**
 * Email-only sign-in: no password, no emailed code.
 *
 * The address itself is the credential. Anyone who knows a partner's email can
 * sign in as that partner and see the boat's expenses, balances and documents.
 * That is a chosen trade-off for a boat shared by a handful of people who all
 * trust each other, not an oversight — do not "fix" it by silently bolting on
 * a password, but do not weaken it further either.
 *
 * The one gate that remains: the address must already belong to a partner of
 * some boat. Unknown addresses are refused rather than signed up, so the door
 * opens to a known list instead of to the whole internet. `generateLink` would
 * happily create a user for an unknown email, which is exactly why the
 * membership check runs *before* it.
 *
 * No email is ever sent. `generateLink` only returns the token, which is what
 * keeps this clear of Supabase's built-in SMTP rate limit (2/hour, project
 * wide) — the limit that locked everyone out in the first place.
 */
export async function requestEntry(rawEmail: string): Promise<EntryResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!email) return { ok: false, error: "צריך כתובת אימייל" };

  // A missing service-role key throws here rather than returning. Without this
  // catch the action rejects, the form spins forever and the screen says
  // nothing — the worst possible symptom for the most likely misconfiguration.
  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (cause) {
    console.error("[login] service-role client unavailable:", cause);
    return { ok: false, error: "הכניסה לא מוגדרת בשרת. פנו למנהל הסירה." };
  }

  // auth.users is not reachable through PostgREST, so the admin API is the
  // only way to resolve an email to a user. A boat has a handful of partners,
  // so one page holds every account that will ever exist here.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) {
    console.error("[login] listUsers failed:", listError);
    return { ok: false, error: BROKEN };
  }

  const user = list.users.find(
    (candidate) => candidate.email?.trim().toLowerCase() === email,
  );
  if (!user?.email) return { ok: false, error: REFUSED };

  // Service role, so this reads straight through RLS.
  const { data: membership, error: membershipError } = await admin
    .from("boat_members")
    .select("boat_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error("[login] boat_members lookup failed:", membershipError);
    return { ok: false, error: BROKEN };
  }
  if (!membership) return { ok: false, error: REFUSED };

  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: user.email,
  });

  const tokenHash = data?.properties?.hashed_token;
  if (error || !tokenHash) {
    // Three unrelated failures used to land on the same silent BROKEN return,
    // which left production with an opaque message and no trace to follow.
    console.error(
      "[login] generateLink failed:",
      error ?? "no hashed_token in response",
    );
    return { ok: false, error: BROKEN };
  }

  return { ok: true, tokenHash };
}
