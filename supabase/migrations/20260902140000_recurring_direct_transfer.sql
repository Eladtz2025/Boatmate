-- ============================================================================
-- Standing orders that are a direct transfer between two partners.
--
-- Until now every standing order meant the same thing: a shared cost, split
-- between the crew. But some of what leaves a partner's account every month is
-- not a boat cost at all — it is one partner paying another back. Splitting
-- that as an expense is wrong twice over: it charges the payer half of their
-- own repayment, and it charges the payee half of money they received.
--
-- So `recurring_payments.kind` now says which of the two a template is:
--
--   'expense'  — the existing behaviour, unchanged. Confirming an occurrence
--                creates an expense + shares via confirm_recurring_occurrence.
--   'transfer' — confirming an occurrence creates a row in public.transfers
--                and nothing else. No expense, no expense_shares.
--
-- There is deliberately no new balance arithmetic here. A confirmed direct
-- transfer lands in the *same* `transfers` table a manually recorded
-- settlement lands in, so it moves balances through exactly the same path:
-- balance = paid − owed − received + sent. A recurring transfer of X from A to
-- B is indistinguishable, in every balance the app computes, from A tapping
-- "רישום העברה" and typing X.
--
-- Existing rows default to kind = 'expense', which is what they have always
-- been — nothing already in the database changes meaning.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- The template gains a kind, and the two parties a transfer needs.
-- ---------------------------------------------------------------------------
alter table public.recurring_payments
  add column if not exists kind      text not null default 'expense',
  add column if not exists from_user uuid references auth.users (id) on delete restrict,
  add column if not exists to_user   uuid references auth.users (id) on delete restrict;

alter table public.recurring_payments
  drop constraint if exists recurring_payments_kind_check;

alter table public.recurring_payments
  add constraint recurring_payments_kind_check
  check (kind in ('expense', 'transfer'));

-- A shared expense has no parties; a direct transfer must have two, and they
-- must differ. `transfers` carries the same from_user <> to_user check, but a
-- template that could name the same partner twice would only fail at the far
-- end, months later, at the moment somebody confirmed a payment.
alter table public.recurring_payments
  drop constraint if exists recurring_payment_transfer_parties;

alter table public.recurring_payments
  add constraint recurring_payment_transfer_parties
  check (
    (kind = 'expense'  and from_user is null and to_user is null)
    or
    (kind = 'transfer' and from_user is not null and to_user is not null
                       and from_user <> to_user)
  );

-- ---------------------------------------------------------------------------
-- An occurrence now resolves to one of two records.
-- ---------------------------------------------------------------------------
alter table public.recurring_occurrences
  add column if not exists transfer_id uuid unique
    references public.transfers (id) on delete set null;

-- The old constraint said "paid ⇔ expense_id". The rule is unchanged in
-- spirit — a paid occurrence must point at the thing it created — but there
-- are two kinds of thing now, and it must point at exactly one of them. The
-- `<>` between two booleans is XOR: never both, never neither.
alter table public.recurring_occurrences
  drop constraint if exists recurring_occurrence_paid_has_expense;

alter table public.recurring_occurrences
  drop constraint if exists recurring_occurrence_paid_has_record;

alter table public.recurring_occurrences
  add constraint recurring_occurrence_paid_has_record
  check (
    (status =  'paid' and ((expense_id is not null) <> (transfer_id is not null)))
    or
    (status <> 'paid' and expense_id is null and transfer_id is null)
  );

-- ---------------------------------------------------------------------------
-- Deleting the transfer un-confirms the occurrence.
--
-- Exactly the problem 20260727200000 fixed for expenses: transfer_id is
-- `on delete set null`, and nulling it under a 'paid' row trips the check
-- above. The transfer IS the payment, so removing it puts the occurrence back
-- in the pending list where it can be confirmed again. BEFORE DELETE, so the
-- foreign key's SET NULL has nothing left to violate.
-- ---------------------------------------------------------------------------
create or replace function public.unconfirm_occurrence_on_transfer_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.recurring_occurrences
     set status      = 'pending',
         transfer_id = null
   where transfer_id = old.id;

  return old;
end;
$$;

drop trigger if exists trg_transfer_delete_unconfirms_occurrence on public.transfers;

create trigger trg_transfer_delete_unconfirms_occurrence
  before delete on public.transfers
  for each row execute function public.unconfirm_occurrence_on_transfer_delete();

-- ---------------------------------------------------------------------------
-- RPC: confirm_recurring_transfer — the transfer twin of
-- confirm_recurring_occurrence. The only path from a 'transfer' standing order
-- to a real settlement, and the only place one starts affecting balances.
--
-- SECURITY INVOKER, so RLS decides whether the caller may write this boat's
-- transfers, exactly as it does for a manually recorded one.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_recurring_transfer(
  p_occurrence_id uuid,
  p_amount_agorot bigint default null,
  p_paid_on       date   default current_date,
  p_note          text   default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_occ         public.recurring_occurrences;
  v_rp          public.recurring_payments;
  v_amount      bigint;
  v_transfer_id uuid;
begin
  -- FOR UPDATE, unlike the expense path, because a double tap on "אשר תשלום"
  -- here would move real money twice and there is no share-sum invariant
  -- downstream to catch it. Postgres serialises the two calls on this row; the
  -- loser reads the 'paid' status the winner wrote and returns its transfer.
  select * into v_occ
    from public.recurring_occurrences
   where id = p_occurrence_id
     for update;

  if v_occ.id is null then
    raise exception 'Occurrence % not found', p_occurrence_id;
  end if;

  -- Idempotent, like confirm_recurring_occurrence: re-confirming returns the
  -- transfer that already exists rather than creating a second one.
  if v_occ.status = 'paid' then
    return v_occ.transfer_id;
  end if;

  select * into v_rp
    from public.recurring_payments
   where id = v_occ.recurring_payment_id;

  if v_rp.kind is distinct from 'transfer' then
    raise exception
      'Occurrence % belongs to a shared-expense standing order', p_occurrence_id;
  end if;

  v_amount := coalesce(p_amount_agorot, v_occ.amount_agorot);

  insert into public.transfers (
    boat_id, from_user, to_user, amount_agorot, transferred_on, note, created_by
  ) values (
    v_occ.boat_id, v_rp.from_user, v_rp.to_user, v_amount, p_paid_on,
    coalesce(nullif(btrim(p_note), ''), v_rp.title), auth.uid()
  )
  returning id into v_transfer_id;

  update public.recurring_occurrences
     set status        = 'paid',
         transfer_id   = v_transfer_id,
         amount_agorot = v_amount,
         confirmed_at  = now(),
         confirmed_by  = auth.uid()
   where id = p_occurrence_id;

  return v_transfer_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The expense path refuses a transfer occurrence.
--
-- Identical to the original apart from that one guard. Without it, a stale
-- client — or a future caller — could route a direct transfer through
-- create_expense and split a repayment between the crew, which is precisely
-- the wrong answer this whole change exists to prevent.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_recurring_occurrence(
  p_occurrence_id uuid,
  p_shares        jsonb,
  p_paid_by       uuid default null,
  p_amount_agorot bigint default null,
  p_paid_on       date default current_date,
  p_receipt_path  text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_occ        public.recurring_occurrences;
  v_rp         public.recurring_payments;
  v_amount     bigint;
  v_paid_by    uuid;
  v_expense_id uuid;
begin
  select * into v_occ from public.recurring_occurrences where id = p_occurrence_id;
  if v_occ.id is null then
    raise exception 'Occurrence % not found', p_occurrence_id;
  end if;

  if v_occ.status = 'paid' then
    return v_occ.expense_id;
  end if;

  select * into v_rp from public.recurring_payments where id = v_occ.recurring_payment_id;

  if v_rp.kind = 'transfer' then
    raise exception
      'Occurrence % is a direct transfer; use confirm_recurring_transfer',
      p_occurrence_id;
  end if;

  v_amount  := coalesce(p_amount_agorot, v_occ.amount_agorot);
  v_paid_by := coalesce(p_paid_by, v_rp.default_paid_by, auth.uid());

  v_expense_id := public.create_expense(
    p_boat_id       => v_occ.boat_id,
    p_paid_by       => v_paid_by,
    p_amount_agorot => v_amount,
    p_shares        => p_shares,
    p_category      => v_rp.category,
    p_description   => v_rp.title,
    p_spent_on      => p_paid_on,
    p_split_mode    => v_rp.split_mode,
    p_receipt_path  => p_receipt_path,
    p_note          => null,
    p_source        => 'recurring'
  );

  update public.recurring_occurrences
     set status       = 'paid',
         expense_id   = v_expense_id,
         amount_agorot = v_amount,
         confirmed_at = now(),
         confirmed_by = auth.uid()
   where id = p_occurrence_id;

  return v_expense_id;
end;
$$;
