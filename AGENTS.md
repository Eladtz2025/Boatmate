<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Boatmate

Mobile-first PWA for managing a shared, rented boat: expenses and balances
between partners, documents with expiry reminders, a calendar, and a home
dashboard. Hebrew-first, RTL, ILS.

**Next.js 16 + TypeScript + Tailwind v4 + Supabase** (Auth, Postgres, Storage, RLS).

The Next 16 breaking changes that bite most often:

- `middleware.ts` is now **`proxy.ts`**, exporting a function named `proxy`. Node runtime only.
- `cookies()`, `headers()`, `params` and `searchParams` are **async** — always `await` them.
- Turbopack is the default bundler for `dev` and `build`.
- `next lint` is gone; run `eslint` directly.

## Commands

```bash
npm run dev        # dev server (Turbopack)
npm run build      # production build
npm test           # vitest — balance engine unit tests
npm run typecheck  # tsc --noEmit
node scripts/generate-assets.mjs   # regenerate PWA icons + hero image

# SQL suites — run against a live DB, roll back, leave nothing behind
psql "$DATABASE_URL" -f supabase/tests/invariants.sql   # money rules
psql "$DATABASE_URL" -f supabase/tests/rls.sql          # access isolation
```

**Run `supabase/tests/rls.sql` after touching any policy.** It impersonates the
`authenticated` role, which is the only way to actually exercise RLS — the owner
role bypasses it silently. It has already caught one privilege escalation.

Database migrations live in `supabase/migrations/`. Apply with:

```bash
npx supabase db push          # needs SUPABASE_ACCESS_TOKEN + --password
npx supabase gen types typescript --project-id <ref> --schema public
```

## Repo map

| Path | Purpose |
| --- | --- |
| `src/app/(app)/` | The four authenticated tabs: home, finances, documents, calendar |
| `src/app/login/`, `src/app/auth/` | Email-only sign-in and the OTP callback |
| `src/app/actions.ts` | Every server action (all mutations live here) |
| `src/proxy.ts` | The auth gate. Runs on every request that is not a static asset |
| `src/components/ui/` | Design-system primitives — Card, Button, Sheet, Field, Chip, Badge, Avatar |
| `src/components/nav/` | Bottom tab bar and page headers |
| `src/lib/balance.ts` | **The balance engine.** Pure, unit-tested, integer-only |
| `src/lib/data.ts` | Server-side reads, all RLS-scoped |
| `src/lib/format.ts` | ILS + Hebrew date formatting |
| `src/lib/gallery.ts` | Photo shape shared by the server reads and the client viewer |
| `src/lib/constants.ts` | Hebrew labels for every category and enum |
| `src/lib/weather.ts`, `src/lib/weather-data.ts` | Sailing conditions — pure presentation helpers, and the server-side Open-Meteo fetch |
| `supabase/migrations/` | Schema, RLS policies, storage buckets |
| `supabase/scripts/` | One-off operational SQL. Run by hand, never by `db push` |

## Conventions that matter

**Money is integer agorot.** 1/100 ₪, `bigint` in Postgres, `number` in TS.
Never a float, never a currency string in the database. Format for display with
`formatAgorot()`; parse user input with `parseShekelInput()`.

**Balance semantics.** `balance > 0` means the group owes that partner.
`balance = paid − owed − received + sent`. The only implementation is
`src/lib/balance.ts` — the `v_member_balances` SQL view mirrors it for
convenience, but the app reads through the TS engine so there is one source of
truth. Change one, change both, and update `balance.test.ts`.

**Standing orders never move balances.** A `recurring_payment` is a template. It
spawns `recurring_occurrences`; only confirming an occurrence creates a real
`expense` (via the `confirm_recurring_occurrence` RPC) and only that expense
affects balances. A DB check constraint enforces that a `paid` occurrence has an
expense and a pending one does not.

**Expense shares must sum to the expense amount.** Enforced by a deferrable
constraint trigger, which is why expenses are always created through the
`create_expense` RPC — a single transaction — never two REST inserts.

**Sign-in is email-only, by choice.** The login screen takes an address and
nothing else — no password, no emailed code. `requestEntry` (`src/app/login/actions.ts`)
resolves the address through the `partner_for_email` RPC, then calls
`auth.admin.generateLink` and returns only the `hashed_token`; the browser
redeems it with `verifyOtp`. **Anyone who knows a partner's email can sign in as
that partner.** That is an accepted trade-off for a boat shared by a few people
who trust each other, not a bug to quietly patch. The membership check must stay
*before* `generateLink`, which would otherwise create a user for an unknown
address. No email is sent, which is what keeps this clear of Supabase's built-in
SMTP limit — 2 per hour, project-wide, shared by every partner. That limit is
what made the old magic-link screen unusable.

**Never resolve an address with `auth.admin.listUsers`.** It pulls the whole
user table through GoTrue, so a single row GoTrue cannot serialise returns a
bodyless 500 and locks out *every* partner, not just the one with the bad row.
That is not hypothetical — it happened, and it cost an afternoon. Membership is
resolved in SQL by `partner_for_email` (`SECURITY DEFINER`, `EXECUTE` granted to
`service_role` alone, because a function that answers "is this address a
partner?" is exactly the directory the vague refusal message avoids handing
out). Postgres reads NULL columns without complaint; only GoTrue's marshalling
objects, so the SQL path is unaffected by a malformed row.

**Hand-written `auth.users` rows must set the token columns to `''`.**
`confirmation_token`, `recovery_token`, `email_change`,
`email_change_token_new`, `email_change_token_current`, `phone_change`,
`phone_change_token`, `reauthentication_token` — all of them, never NULL. GoTrue
scans them into plain Go strings and dies on NULL with "converting NULL to
string is unsupported". `supabase/scripts/reset-and-add-nir.sql` shows the full
insert, including the matching `auth.identities` row without which the token
will not resolve.

**Read the session with `getClaims()`, not `getUser()`.** `getUser()` sends a
request to the Auth server for every JWT, which put a full network round trip in
front of every page and every server action. This project signs tokens with an
asymmetric key (ES256), so `getClaims()` verifies the signature locally against
a cached JWKS. `sub` and `email` are claims already in the token, which is
everything `getCurrentUser()` exposes. Supabase documents this as the preferred
way to protect pages.

**`setAll` in `proxy.ts` takes a second argument, and it is not optional.**
`@supabase/ssr` passes `Cache-Control: no-store`, `Expires: 0` and `Pragma:
no-cache` alongside any auth cookie it sets. Dropping them lets a CDN cache a
response carrying a session token and serve it to somebody else — and we sit
behind Vercel's edge. Forward them onto the response.

**Sign-in completes in the browser, never on the server.** A Server Component
cannot write cookies — `createClient()` in `server.ts` swallows the failure so
ordinary reads keep working. Calling `exchangeCodeForSession` there therefore
"succeeds" and then throws the session away, which is a silent, total sign-in
failure. `/auth/callback` renders a client component that lets `@supabase/ssr`
consume the URL (`detectSessionInUrl` handles both `?code=` and
`#access_token=`) and then reads `getSession()`. Do not add a second
`exchangeCodeForSession` call — the PKCE verifier is single-use and the manual
call loses the race against the library.

**Read Supabase env vars through `src/lib/supabase/env.ts`.** It strips a BOM and
whitespace. A pasted value carrying an invisible `U+FEFF` broke the production
build (`new URL` threw) and every browser request (headers must be ISO-8859-1).

**Permissions: all partners are equal.** Membership in `boat_members` is the only
gate. Every RLS policy funnels through `is_boat_member(boat_id)`, a
`SECURITY DEFINER` function that exists so policies on `boat_members` don't
recurse into themselves.

**The server runs in UTC; name the timezone on anything clock-derived.** The app
is read by people in Israel, and most of what it renders is server rendered, so
a bare `new Date(...)` on a local-time string is silently hours off. Open-Meteo
returns sunset as `2026-07-28T19:41` with the offset reported separately in
`utc_offset_seconds` — `getConditions()` resolves it to a real instant, and
`TEL_AVIV.timeZone` is what formats it. The sailing card is a Server Component
for the same reason it must be careful: it renders from cache with no client
fetch, so nothing gets a second chance to fix the clock in the browser.

**Never summarise a sailing day as one number.** Tel Aviv runs a sea breeze:
a July day is 1.4 knots at 06:00 and 7.7 knots with 22-knot gusts by 14:00. A
daily maximum describes those four afternoon hours and mislabels the other
twenty, so the card reads the hourly series, ranges wind and gust across
daylight only, and names the calm window (`calmWindow()`). `dailyVerdict()`
therefore asks "is there a stretch of this day I could go out in", not "how bad
does this day get" — only a storm or a heavy sea overrides a window.

Related: **gust *ratio* tests are useless on this coast.** Gusts run a steady
2.8–3× the mean wind at every hour, including 02:00 in a dead calm, so
`gustFactor >= 1.6` is true around the clock and separates nothing. Absolute
gust is the signal; `CALM_GUST_KN` is the one number to move to retune the card.
`isGusty()` still exists for the live "right now" verdict, where the ratio is at
least describing a single moment.

**`next/image` quality is an allowlist now.** Next 16 refuses any `quality` not
named in `images.qualities`; the default list is `[75]` alone. The photo viewer
asks for 90, so `next.config.ts` names it. Adding a new quality anywhere means
adding it there too — the optimiser answers 400, it does not fall back.

**Never read `scrollLeft` in a horizontal carousel.** Under `dir="rtl"` it
counts *down* from zero — the day carousel sits at `-1368` on its last panel —
and browsers have historically disagreed about the sign. Both carousels (the
sailing card's days, the photo viewer's photos) move with
`scrollIntoView({ inline: "nearest" })`, which resolves against the writing
direction, and read the active panel back with an `IntersectionObserver` rooted
on the track, which is direction-agnostic. Native scroll-snap is also what keeps
a swipe feeling native and leaves pinch-to-zoom working in the photo viewer; a
hand-rolled drag handler takes both away.

**Storage is private.** Buckets `receipts`, `documents`, `media`. Object paths
are always `{boat_id}/...` — the first path segment is what the storage policies
authorise against. Files are served through short-lived signed URLs
(`getSignedUrl()`), never public URLs. Uploads go straight from the browser to
Supabase; server actions only receive the resulting path.

## RTL and Hebrew

- The document is `<html lang="he" dir="rtl">`. Assume RTL everywhere.
- **Use logical Tailwind utilities**: `ms-*`/`me-*`, `ps-*`/`pe-*`, `start-*`/`end-*`,
  `text-start`/`text-end`. Never `ml-*`, `pr-*`, `left-*`, `text-left`.
- "Forward" chevrons point **left** (`ChevronLeft`) because that is the reading direction.
- Wrap money, dates and any Latin/digit run in `className="numeric"` — it isolates
  the span as LTR so `₪1,240` doesn't get reordered by the bidi algorithm.
- All user-facing copy is Hebrew. Category and enum labels come from
  `src/lib/constants.ts`, never hardcoded inline.

## Design language

Deep navy hull, teal running-light accent. Tokens are defined once in
`src/app/globals.css` under `@theme` — use the semantic names, never raw hex.

| Token | Use |
| --- | --- |
| `bg-hull-900` | page background |
| `bg-hull-850` | bottom nav, segmented control track |
| `bg-hull-800` | card surface (or just use the `card` class) |
| `bg-hull-750` | raised element inside a card |
| `text-ink` / `text-ink-muted` / `text-ink-subtle` | primary / secondary / tertiary text |
| `text-teal-400`, `bg-teal-400` | accent, active tab, primary button |
| `text-danger`, `text-warning`, `text-success` | expired, expiring soon, healthy |
| `border-[var(--hairline)]` | every border |

Cards use the `card` class (navy surface, hairline border, 20px radius). Tap
targets are at least 44px. Pages are padded `px-4` and leave `pb-24` clear for
the fixed bottom nav — except the three screens carrying a floating `+` button
(finances, documents, calendar), which need
`pb-[calc(var(--nav-height)+5.5rem)]`. `pb-24` is shorter than the button's
reach, which left the last card's actions sitting underneath it, untappable.

**Tailwind v4 dropped the `[--var]` shorthand.** `rounded-[--radius-card]` is v3
syntax and v4 compiles it to *nothing* — no rule is emitted, no warning is
given, and the element silently loses the style. Tokens declared in `@theme`
generate their own utilities, so write `rounded-card`; anywhere else use the
full `[var(--x)]` form, as `border-[var(--hairline)]` already does. This cost
the boat photo its rounded corners for a while, and it was invisible in review.
