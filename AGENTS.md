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
| `src/app/login/`, `src/app/auth/` | Magic-link sign-in and the OTP callback |
| `src/app/actions.ts` | Every server action (all mutations live here) |
| `src/components/ui/` | Design-system primitives — Card, Button, Sheet, Field, Chip, Badge, Avatar |
| `src/components/nav/` | Bottom tab bar and page headers |
| `src/lib/balance.ts` | **The balance engine.** Pure, unit-tested, integer-only |
| `src/lib/data.ts` | Server-side reads, all RLS-scoped |
| `src/lib/format.ts` | ILS + Hebrew date formatting |
| `src/lib/constants.ts` | Hebrew labels for every category and enum |
| `supabase/migrations/` | Schema, RLS policies, storage buckets |

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
the fixed bottom nav.
