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
| `src/lib/attendance.ts` | "Who is coming to the boat, and when" — pure, unit-tested |
| `src/lib/tz.ts` | Israel wall-clock ↔ instant. Everything date-keyed goes through it |
| `src/lib/google-calendar.ts` | Optional attendance sync to one shared Google calendar |
| `src/lib/push.ts` | Web Push — the boat's automatic notifications |
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

**The occurrence horizon must be topped up on read.**
`generate_recurring_occurrences` only materialises to `current_date + 120 days`.
It was once called only when a standing order was *created*, which froze the
horizon at that moment: four months on, the marina order stopped producing
occurrences while the recurring tab still showed it active, and the pending list
went quiet. Quiet reads as "nothing is due" — the one failure here that silently
produces wrong money over time. `topUpOccurrences()` (`src/lib/recurring.ts`) is
therefore called by the finances page *and* the calendar page before they read,
as well as on create. It is `ON CONFLICT DO NOTHING`, so calling it often is
free; it swallows its own errors, because failing to extend the horizon shows
fewer future rows but misreports nothing, and must not take a screen down. The
calendar matters most: its window reaches twelve months forward.

**Attendance is an `events` row, not a table of its own.** `kind = 'arrival'`
with a `user_id`, and the stay type is **derived from the dates** rather than
stored in a flag: a day runs 08:00–20:00 Israel time, an overnight 08:00 to
10:00 the next morning, and anything ending on a later calendar day reads back
as an overnight. That keeps one answer to "somebody is on the boat that day" —
the home tile, the calendar agenda and the attendance strip are all reading the
same rows — and it is why a stay booked through the full event form still shows
up in the strip. `src/lib/attendance.ts` owns the shape; `attendance.test.ts`
covers the round trip through both halves of the DST year.

**There is no unique constraint behind that, so `setAttendance` enforces it.**
The action looks up the caller's existing arrival on that Israel calendar day
and *updates* it, deleting any extra rows it finds on the way. Two rows for one
partner on one day render as two people, which is the one wrong answer this
screen must never give. If a migration ever becomes applicable again, a unique
index on (boat_id, user_id, arrival day) is the right belt to add to these
braces — the DDL for this work could not be applied from the repo.

**Israel wall-clock time goes through `src/lib/tz.ts`.** `zonedTimeToUtc()` and
`zonedDateKey()`. A date a partner tapped is a *local calendar day*; the server
runs in UTC and one partner reads the app from another timezone, so 08:00 on
the 5th is 05:00Z in summer and 06:00Z in winter and neither may be assumed.
Querying a day is `dayRange()`, a half-open UTC window — a naive `date::text`
comparison drops the 08:00 stay it was meant to find.

**Expense shares must sum to the expense amount.** Enforced by a deferrable
constraint trigger, which is why expenses are always created through the
`create_expense` RPC — a single transaction — never two REST inserts.

**Reads throw; presentation degrades.** Every query in `src/lib/data.ts` goes
through `rows()` or `maybeRow()`, which raise a `ReadError` naming what failed in
Hebrew. They used to destructure `{ data }` alone and end in `data ?? []`, which
mapped *failure* onto *empty* — the app had no way to say "I don't know". A
dropped connection during `getExpenses` rendered the home tile as
"כולם מאוזנים": an outage telling three partners they were square. `src/app/(app)/error.tsx`
catches it, `src/app/global-error.tsx` covers a root-layout failure. The
asymmetry is deliberate and documented in both files: signing a storage URL still
degrades silently, because a missing thumbnail is self-evidently missing whereas
an empty expense list is a lie. Mutations in `actions.ts` have always checked
`error` — this was only ever a read-path blind spot.

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

**The same rule governs the day's *condition*, and this one shipped broken.**
Open-Meteo's daily `weather_code` is the day's most severe hour, so one hour of
coastal fog before dawn labelled a clear 32° August day "ערפל" — amber, fog
icon, the headline of the panel. It hit six of twenty-six days sampled, and the
fog had almost always burned off before sunrise, so nobody reading the app could
even see what it was describing. `DailyForecast` therefore carries two codes:
`weatherCode` is what to *print* — `dayCondition()`, the severest condition
holding for at least `CONDITION_SHARE` of the daylight hours, falling back to
the commonest — and `severeCode` is the worst daylight hour, which is what
`dailyVerdict()` reads for the storm override. **Keep them apart.** Softening a
headline must never soften a warning: an afternoon thunderstorm does not get to
name a day that was clear until three, and it absolutely still has to stop you
going out. `dayCondition()` counts hours by the phrase `describeWeather()` would
print rather than by raw code, because 1 and 2 both read "מעונן חלקית" and three
hours of each is a half-cloudy day that neither code alone would claim.
`conditionSpell()` is what keeps the softening honest — it puts "ערפל
07:00–09:00" under a day billed clear, so the fog is dropped as a *headline*
without being dropped as a *fact*.

**One judgement per day, drawn from the windows.** `dayTone()` colours a day's
tab from `periodVerdict()` over that day's own windows — best window wins,
because the question is "is there a stretch of this day I could go out in".
There used to be a separate `dailyVerdict()` reading day-level aggregates (the
daily gust maximum, the daily *longest* wave period) while the panel underneath
read hours, and two verdicts from different inputs drift: a calm dot could sit
above three windows all reading "ים קצוץ". Do not reintroduce a parallel
day-level judgement. For the same reason the live "עכשיו" reading is shown
only while the window the clock is standing in is the selected one — an
instant's numbers beside a summary of different hours reads as a contradiction
even when both are true.

**A day is three windows, and each is read from its own hours.** 08–12, 12–16,
16–20 (`DAY_PERIODS`), summarised by `summarisePeriod()` from the provider's
hourly series and judged by `periodVerdict()`. This is the wind-range rule
taken one step further, and it is what let the card lose half its height
without losing anything: a morning that is glass and an afternoon that blows
were never the same forecast. Two rules hold it honest — a window the provider
has no hours for reports `null` everywhere rather than borrowing a neighbour's
numbers or falling back to a daily figure, and `choppy` is decided **per hour**,
never by pairing the window's tallest wave with its shortest period, which
would manufacture a sea state nobody forecast. The windows are fixed clock
hours and deliberately are **not** clipped to daylight: 16:00–20:00 is a real
question in January, and clipping emptied it every winter.

The card is still a Server Component. `sailing-conditions.tsx` computes every
day × window into plain strings and `conditions-panel.tsx` only chooses which
to show — so paging costs no fetch and nothing gets a second chance to read the
clock in the browser.

Related: **gust *ratio* tests are useless on this coast.** Gusts run a steady
2.8–3× the mean wind at every hour, including 02:00 in a dead calm, so
`gustFactor >= 1.6` is true around the clock and separates nothing. Absolute
gust is the signal; `CALM_GUST_KN` is the one number to move to retune the day
profile, `GUSTY_NOW_KN` the live one. The live verdict used to keep the ratio
on the theory that "right now" is a single moment — it is not: Open-Meteo's
`current` gust is the *past hour's maximum* against a near-instant mean wind,
so a 12:15 reading of 5.5 kn under a 15.9 kn gust (a lovely sail) came back
"משבים חזקים — להיזהר". `isGusty()` is absolute now.

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

**Notifications are Web Push, and the share sheet is not the notification.**
`src/lib/push.ts` sends; `public/sw.js` receives; `push_subscriptions` holds
one row per browser that agreed. Web Push rather than email or a vendor because
it needs no account and no SMTP — sign-in deliberately sends no mail at all,
which is what keeps it clear of Supabase's project-wide limit — just a VAPID
key pair we generate ourselves and the service worker that already shipped.

Three things here are load-bearing:

- **The send goes through the service role.** A partner marking attendance has
  to reach the *other* partners' endpoints. The RLS policy on that table is
  deliberately tighter than every other boat-scoped table: read is crew-wide,
  but **write is your own rows only**. Any partner writing any row is right for
  shared money; it is not right for a delivery address, where inserting
  somebody else's endpoint is the power to make their phone buzz.
- **Nothing here can fail a save.** `notifyBoat()` never throws; every outcome
  is a `NotifyResult` the sheet prints. Missing VAPID keys and a missing table
  both come back `unavailable` **with the reason** — never a silent success.
  The one thing this code must never do is imply a notification that did not
  go out.
- **The payload is thin on purpose** — who, when, day or night. It is rendered
  by the operating system onto a lock screen, which is the one surface in this
  app that is not behind the auth gate. No money, no balances, no document
  titles.

The WhatsApp share (`src/lib/whatsapp.ts`) survives as a *secondary* action on
the saved panel, for putting it in the group chat as well. It is one deliberate
tap because `navigator.share` needs transient activation and would be refused
if fired after the server round trip. It is not the notification channel, and
it should not be presented as one.

**Google Calendar sync is optional, credential-gated, and reports itself.**
`src/lib/google-calendar.ts`. One shared boat calendar reached with a *service
account* — a signed JWT exchanged for an access token — rather than OAuth per
partner, because that needs no consent screen, no refresh-token storage and no
new table. The Google event id is derived from the Boatmate event id
(`bm` + the UUID's hex, which is inside Google's base32hex character set), so
there is no mapping to store and an edit cannot leave two entries behind.

Three things about it are load-bearing:

- **The database write happens first and sync cannot fail it.** Every failure
  comes back as a `SyncResult` value, never a throw. Attendance saving must not
  depend on a third party being up.
- **`off` and `failed` are different.** Unset credentials are `off`, and
  Settings says "לא מחובר" rather than the flow implying a sync that is not
  happening; a *failed* call puts a warning under the saved confirmation, in
  as many words. Silence in either case would be the app claiming a calendar
  entry exists.
- **Both calls carry `AbortSignal.timeout`**, as the Open-Meteo calls now do.
- **An update always states `status: "confirmed"`.** Google keeps a cancelled
  event's id for a while, and a PUT that does not say so leaves it cancelled —
  a 200 response over an event nobody can see, which is the worst possible
  shape for a sync failure. `google-calendar.test.ts` pins this, along with
  "an edit is a PUT to the same id" and "a cancel is a DELETE of it".

**Storage is private.** Buckets `receipts`, `documents`, `media`. Object paths
are always `{boat_id}/...` — the first path segment is what the storage policies
authorise against. Files are served through short-lived signed URLs
(`getSignedUrl()`), never public URLs. Uploads go straight from the browser to
Supabase; server actions only receive the resulting path.

**Deleting a row deletes its object.** `deleteDocument`, `deleteMedia` and
`deleteExpense` all read the path before the row goes and then remove it from the
bucket. `deleteExpense` was the one that did not, which mattered more than it
sounds: deleting is currently the only way to correct a wrong amount, so it is a
routine act and every correction stranded a receipt in the bucket forever.

**The service worker never caches a navigation.** `public/sw.js` is network-first
with `/offline` as the only fallback, and it precaches `/offline` alone — not
`/`. Navigation responses are authenticated server-rendered HTML carrying this
boat's balances, a partner's name and every expense; caching them left a snapshot
of the crew's finances on disk that survived sign-out and served last week's
numbers as this week's. Bumping `VERSION` is what evicts older caches, since
`activate` deletes every key that does not match it — so a change of caching
policy needs a version bump to reach installs that already exist.

**One `safeNext()`, for every entrance.** `src/lib/safe-next.ts`. A bare
`startsWith("/")` test is not enough: browsers read `//evil.com` and
`/\evil.com` as protocol-relative URLs, so it has to reject those too or the
sign-in flow becomes an open redirect. It lived inline in `login/page.tsx`,
correct and commented, while `auth/callback/page.tsx` did its own weaker check
and carried the bug the comment next door described. Covered by
`safe-next.test.ts`.

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
