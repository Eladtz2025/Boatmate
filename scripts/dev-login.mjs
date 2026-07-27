/**
 * DEV ONLY — mints a magic link for a throwaway account so you can open the
 * authenticated screens without waiting for an email.
 *
 * Never run this against production, and never commit a service role key.
 *
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   node scripts/dev-login.mjs            # prints a login link
 *   node scripts/dev-login.mjs cleanup    # deletes the throwaway account
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.TEST_EMAIL ?? "boatmate-preview@example.com";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

if (process.argv[2] === "cleanup") {
  const { data } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = data.users.find((u) => u.email === email);
  if (existing) {
    await admin.auth.admin.deleteUser(existing.id);
    console.log("deleted test user");
  } else {
    console.log("no test user to delete");
  }
  process.exit(0);
}

const { data: list } = await admin.auth.admin.listUsers({ perPage: 200 });
let user = list.users.find((u) => u.email === email);

if (!user) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: { full_name: "דני" },
  });
  if (error) throw error;
  user = data.user;
}

const { data: link, error } = await admin.auth.admin.generateLink({
  type: "magiclink",
  email,
  options: { redirectTo: `${siteUrl}/auth/callback` },
});
if (error) throw error;

console.log(link.properties.action_link);
