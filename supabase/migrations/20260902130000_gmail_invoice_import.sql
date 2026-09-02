-- ============================================================================
-- Boatmate — Gmail invoice import
--
-- Two tables and one widened check constraint. Both tables exist because there
-- was nowhere honest to put their contents: a long-lived Google credential, and
-- the record of which invoice has already become an expense.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- google_credentials
--
-- The boat's single connected Gmail account. One row per boat — the brief is
-- "only one Gmail account needs to be connected", and the unique constraint is
-- what keeps a second connect from quietly shadowing the first.
--
-- This table holds a **refresh token**: a bearer credential that mints Gmail
-- access tokens for as long as it lives. It is therefore the most sensitive row
-- in the schema, more so than a push endpoint and more so than anything about
-- money, because it reaches outside this app entirely.
--
-- RLS is enabled with **no policies at all**. That is not an omission. With RLS
-- on and no policy granting anything, `authenticated` can do nothing here —
-- not select, not insert, not update, not delete — and the only way in is the
-- service role, which bypasses RLS and never leaves the server. Every read in
-- `src/lib/gmail.ts` goes through `createAdminClient()` for exactly this
-- reason. Do not "fix" this by adding a policy.
-- ---------------------------------------------------------------------------
create table public.google_credentials (
  id             uuid primary key default gen_random_uuid(),
  boat_id        uuid not null unique references public.boats (id) on delete cascade,
  -- Long-lived. Google only returns one on the first consent, which is why the
  -- authorize URL asks for `access_type=offline&prompt=consent`.
  refresh_token  text not null,
  -- What was actually granted, kept so a scope change is detectable rather than
  -- discovered as a 403 mid-sync.
  scope          text not null,
  -- Which mailbox this is, for the Settings line. Not used for matching.
  google_email   text,
  connected_by   uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

alter table public.google_credentials enable row level security;

-- ---------------------------------------------------------------------------
-- invoice_imports
--
-- One row per Gmail message that has been dealt with, successfully or not.
-- This is what makes the sync idempotent, and it has to survive two different
-- kinds of repetition:
--
--   * the same message seen again on a later sync — the historical backfill
--     re-reads the whole window from 2026-05-01 every time, on purpose, so a
--     late-arriving email is never skipped by a moving cursor;
--   * the same *invoice* arriving as a second message (a resend, a forward) —
--     a different Gmail id for a document that must still not be paid twice.
--
-- Hence two unique constraints, not one. `gmail_message_id` is unique per boat
-- outright; `invoice_number` is unique per boat only where it is known, because
-- a row recorded before parsing succeeded has none.
--
-- A row is claimed *before* the expense is created and released if creation
-- fails — see `src/lib/invoice-import.ts`. Claiming first is what guarantees
-- "never two expenses" even if two syncs run at once: the second one loses the
-- unique constraint and skips.
-- ---------------------------------------------------------------------------
create table public.invoice_imports (
  id                uuid primary key default gen_random_uuid(),
  boat_id           uuid not null references public.boats (id) on delete cascade,
  gmail_message_id  text not null,
  invoice_number    text,
  -- 'imported' — an expense exists. 'skipped' — deliberately not imported, with
  -- the reason kept so a partner can see why rather than wonder.
  status            text not null default 'imported'
                    check (status in ('imported', 'skipped')),
  reason            text,
  -- Null for a skip, and null again if the expense is later deleted; the import
  -- record survives so the message is not re-imported behind the deletion.
  expense_id        uuid references public.expenses (id) on delete set null,
  customer_name     text,
  net_agorot        bigint,
  total_agorot      bigint,
  invoice_date      date,
  imported_at       timestamptz not null default now(),
  imported_by       uuid references auth.users (id) on delete set null,

  unique (boat_id, gmail_message_id)
);

-- Where the invoice number is known, it is the stronger identity of the two.
create unique index invoice_imports_number_idx
  on public.invoice_imports (boat_id, invoice_number)
  where invoice_number is not null;

create index invoice_imports_boat_idx
  on public.invoice_imports (boat_id, imported_at desc);

alter table public.invoice_imports enable row level security;

-- Ordinary shared boat bookkeeping, unlike the credential above: which invoices
-- were imported is exactly the sort of thing every partner should see.
create policy "members read invoice imports"
  on public.invoice_imports for select to authenticated
  using (public.is_boat_member(boat_id));

create policy "members insert invoice imports"
  on public.invoice_imports for insert to authenticated
  with check (public.is_boat_member(boat_id));

create policy "members update invoice imports"
  on public.invoice_imports for update to authenticated
  using (public.is_boat_member(boat_id))
  with check (public.is_boat_member(boat_id));

-- Deleting is how a failed claim is released so the message can be retried.
create policy "members delete invoice imports"
  on public.invoice_imports for delete to authenticated
  using (public.is_boat_member(boat_id));

-- ---------------------------------------------------------------------------
-- expenses.source gains 'gmail'
--
-- So an imported expense says where it came from instead of impersonating one
-- somebody typed. The column already drives the "קבוע" badge on the expenses
-- list; this adds the mail one beside it.
-- ---------------------------------------------------------------------------
alter table public.expenses
  drop constraint if exists expenses_source_check;

alter table public.expenses
  add constraint expenses_source_check
  check (source in ('manual', 'recurring', 'gmail'));
