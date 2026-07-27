# ⚓ Boatmate

A mobile-first PWA for a boat owned by several partners. It answers the four
questions that actually come up in the group chat: *who owes who*, *when is the
next payment*, *where is the insurance certificate*, and *who has the boat this
weekend*.

Hebrew-first, RTL, ILS. Dark navy and teal.

| | |
| --- | --- |
| **הבית** | Boat photo, marine weather, next event, partner arrivals, open tasks, balance at a glance |
| **כספים** | Expenses, transfers between partners, standing orders, receipts, balances |
| **מסמכים** | PDFs / images / Word / Excel by category, with expiry dates and reminders |
| **יומן** | Boat usage, arrivals, maintenance, payment dates and document expiries in one calendar |

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Tailwind v4 · Supabase
(Auth, Postgres, Storage, RLS) · PWA (manifest + service worker).

## Getting started

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev
```

Open http://localhost:3000. Sign in with a magic link, create your boat, and
invite your partners from **הגדרות → שותפים** (they need to sign in once first,
so their account exists).

### Environment

```
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Add your deployed origin to **Supabase → Authentication → URL Configuration →
Redirect URLs** as `https://your-domain/auth/callback`, otherwise magic links
will bounce back to localhost.

### Database

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npx supabase gen types typescript --project-id <ref> --schema public \
  > src/lib/supabase/database.types.ts
```

Optional demo data (a boat, three partners, a month of expenses):

```bash
psql "$DATABASE_URL" -f supabase/seed-demo.sql
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Vitest — the balance engine |
| `npm run typecheck` | `tsc --noEmit` |
| `node scripts/generate-assets.mjs` | Regenerate PWA icons and the placeholder hero |

### Database tests

Two SQL suites run against a live database and roll back, leaving nothing behind:

```bash
psql "$DATABASE_URL" -f supabase/tests/invariants.sql   # money rules
psql "$DATABASE_URL" -f supabase/tests/rls.sql          # access isolation
```

`invariants.sql` proves that mismatched splits are rejected, that balances always
sum to zero, that a pending standing order moves nothing, and that confirming one
twice cannot double-charge. `rls.sql` impersonates the `authenticated` role and
proves one boat's partners cannot see or touch another boat's data — it is what
caught a self-insert privilege escalation in `boat_members`
(see `supabase/migrations/20260727150000_fix_boat_members_insert_policy.sql`).

## How the money works

Everything is **integer agorot** (1/100 ₪). No floats, ever.

```
balance = paid − owed − received + sent
```

`balance > 0` means the group owes that partner. The rules the app enforces:

- **Expenses move balances.** The payer is credited the full amount; every
  partner is debited their share. Shares must sum to the expense exactly — a
  deferred constraint trigger rejects anything else, which is why expenses are
  written through the `create_expense` RPC in a single transaction.
- **Transfers reduce balances.** A settlement from A to B raises A's balance and
  lowers B's, moving both toward zero.
- **Standing orders do nothing until confirmed.** A recurring payment is a
  template that spawns dated occurrences. A pending occurrence shows up on the
  calendar and in "תשלומים קרובים" but touches no balance. Confirming it calls
  `confirm_recurring_occurrence`, which creates a real expense — and *that*
  moves the balance. A check constraint makes the two states impossible to mix
  up.
- **Splits** can be equal, by percentage, or fully custom. Indivisible remainders
  are distributed one agora at a time (largest-remainder for percentages), so a
  three-way split of ₪10.00 is 3.34 / 3.33 / 3.33 and never 9.99 or 10.01.

The engine is `src/lib/balance.ts` — pure, dependency-free, and covered by
`src/lib/balance.test.ts`, including a sweep asserting that no amount from 0 to
500 agorot ever loses or invents money across crew sizes 1–7.

## Permissions

All partners are equal. Membership in `boat_members` is the only gate, and every
RLS policy goes through `is_boat_member(boat_id)` — a `SECURITY DEFINER`
function that exists so the policy on `boat_members` doesn't recurse into its own
table. Nothing is readable without membership.

Storage buckets (`receipts`, `documents`, `media`) are private. Object keys are
`{boat_id}/…` and the storage policies authorise on that first path segment.
Files reach the UI through short-lived signed URLs, never public ones.

## Sharing

Balances, expenses, upcoming payments, events and documents each export a
formatted Hebrew summary to WhatsApp — via the native share sheet where the
platform has one, falling back to a `wa.me` link.

## PWA

`app/manifest.ts` plus `public/sw.js`. The service worker is deliberately
conservative: it caches the app shell and static assets so the app opens
offline, but never caches Supabase traffic — a stale balance would be worse than
an honest error. It only registers in production builds.
