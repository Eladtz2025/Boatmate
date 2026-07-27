-- ============================================================================
-- Boatmate — core schema
-- Shared-boat management: partners, expenses, transfers, standing orders,
-- documents, calendar, tasks and log.
--
-- Money is stored as BIGINT agorot (1/100 ILS). Never floats.
-- Permission model: "all partners equal" — membership in boat_members grants
-- full read/write on that boat's data. Enforced by RLS (see 0002).
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles (mirrors auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  avatar_url  text,
  phone       text,
  created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- boats + membership
-- ---------------------------------------------------------------------------
create table public.boats (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  tagline      text,
  model        text,
  home_port    text,
  photo_path   text,
  status_text  text,
  latitude     double precision,
  longitude    double precision,
  currency     text not null default 'ILS',
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create table public.boat_members (
  boat_id      uuid not null references public.boats (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text,
  color        text not null default '#2DD4BF',
  is_remote    boolean not null default false, -- e.g. the partner who flies in
  joined_at    timestamptz not null default now(),
  primary key (boat_id, user_id)
);

create index boat_members_user_idx on public.boat_members (user_id);

-- Membership lookup used by every RLS policy. SECURITY DEFINER so that
-- policies on boat_members itself do not recurse into their own table.
create or replace function public.is_boat_member(p_boat_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.boat_members m
    where m.boat_id = p_boat_id
      and m.user_id = auth.uid()
  );
$$;

-- Every boat the current user belongs to (used for profile visibility).
create or replace function public.my_boat_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select boat_id from public.boat_members where user_id = auth.uid();
$$;

-- Creator automatically becomes the first partner, so a fresh boat is never
-- orphaned behind its own RLS policy.
create or replace function public.add_creator_as_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.created_by is not null then
    insert into public.boat_members (boat_id, user_id, display_name)
    select new.id, new.created_by, p.full_name
    from public.profiles p where p.id = new.created_by
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_boat_created
  after insert on public.boats
  for each row execute function public.add_creator_as_member();

-- ---------------------------------------------------------------------------
-- documents
-- ---------------------------------------------------------------------------
create table public.documents (
  id            uuid primary key default gen_random_uuid(),
  boat_id       uuid not null references public.boats (id) on delete cascade,
  title         text not null,
  category      text not null default 'other'
                check (category in ('insurance','license','rental','marina',
                                    'electricity','receipt','standing_order',
                                    'maintenance','other')),
  file_path     text not null,
  original_name text,
  mime_type     text,
  size_bytes    bigint,
  issued_on     date,
  expires_on    date,
  reminder_days integer not null default 30 check (reminder_days between 0 and 365),
  notes         text,
  uploaded_by   uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index documents_boat_idx    on public.documents (boat_id, category);
create index documents_expiry_idx  on public.documents (boat_id, expires_on)
  where expires_on is not null;

-- ---------------------------------------------------------------------------
-- recurring payments (standing orders)
--
-- A recurring payment is a *template*. It never touches balances. It spawns
-- occurrences; only an occurrence that is confirmed paid creates a real
-- expense, and only that expense moves the balance.
-- ---------------------------------------------------------------------------
create table public.recurring_payments (
  id              uuid primary key default gen_random_uuid(),
  boat_id         uuid not null references public.boats (id) on delete cascade,
  title           text not null,
  category        text not null default 'other',
  amount_agorot   bigint not null check (amount_agorot > 0),
  cadence         text not null default 'monthly'
                  check (cadence in ('monthly','quarterly','yearly')),
  day_of_month    integer not null default 1 check (day_of_month between 1 and 31),
  start_on        date not null default current_date,
  end_on          date,
  default_paid_by uuid references auth.users (id) on delete set null,
  split_mode      text not null default 'equal'
                  check (split_mode in ('equal','percent','custom')),
  document_id     uuid references public.documents (id) on delete set null,
  active          boolean not null default true,
  notes           text,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index recurring_payments_boat_idx on public.recurring_payments (boat_id, active);

-- ---------------------------------------------------------------------------
-- expenses + shares
-- ---------------------------------------------------------------------------
create table public.expenses (
  id            uuid primary key default gen_random_uuid(),
  boat_id       uuid not null references public.boats (id) on delete cascade,
  paid_by       uuid not null references auth.users (id) on delete restrict,
  amount_agorot bigint not null check (amount_agorot > 0),
  category      text not null default 'other',
  description   text,
  spent_on      date not null default current_date,
  receipt_path  text,
  split_mode    text not null default 'equal'
                check (split_mode in ('equal','percent','custom')),
  source        text not null default 'manual'
                check (source in ('manual','recurring')),
  note          text,
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index expenses_boat_date_idx on public.expenses (boat_id, spent_on desc);
create index expenses_paid_by_idx   on public.expenses (boat_id, paid_by);

create table public.expense_shares (
  expense_id   uuid not null references public.expenses (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete restrict,
  share_agorot bigint not null check (share_agorot >= 0),
  primary key (expense_id, user_id)
);

create index expense_shares_user_idx on public.expense_shares (user_id);

-- The invariant that makes balances trustworthy: an expense's shares must sum
-- to exactly the expense amount. DEFERRABLE so a single transaction can insert
-- the expense and its shares in either order; verified at COMMIT.
create or replace function public.assert_expense_shares_sum()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_amount     bigint;
  v_sum        bigint;
begin
  if tg_table_name = 'expenses' then
    v_expense_id := new.id;
  else
    v_expense_id := coalesce(new.expense_id, old.expense_id);
  end if;

  select amount_agorot into v_amount
  from public.expenses where id = v_expense_id;

  -- Expense row is gone (cascade delete): nothing left to verify.
  if v_amount is null then
    return null;
  end if;

  select coalesce(sum(share_agorot), 0) into v_sum
  from public.expense_shares where expense_id = v_expense_id;

  if v_sum <> v_amount then
    raise exception
      'Expense % shares total % agorot but the expense is % agorot',
      v_expense_id, v_sum, v_amount
      using errcode = 'check_violation';
  end if;

  return null;
end;
$$;

create constraint trigger trg_expenses_shares_sum
  after insert or update of amount_agorot on public.expenses
  deferrable initially deferred
  for each row execute function public.assert_expense_shares_sum();

create constraint trigger trg_expense_shares_sum
  after insert or update or delete on public.expense_shares
  deferrable initially deferred
  for each row execute function public.assert_expense_shares_sum();

-- ---------------------------------------------------------------------------
-- recurring occurrences
-- ---------------------------------------------------------------------------
create table public.recurring_occurrences (
  id                   uuid primary key default gen_random_uuid(),
  recurring_payment_id uuid not null references public.recurring_payments (id) on delete cascade,
  boat_id              uuid not null references public.boats (id) on delete cascade,
  due_on               date not null,
  amount_agorot        bigint not null check (amount_agorot > 0),
  status               text not null default 'pending'
                       check (status in ('pending','paid','skipped')),
  expense_id           uuid unique references public.expenses (id) on delete set null,
  confirmed_at         timestamptz,
  confirmed_by         uuid references auth.users (id) on delete set null,
  unique (recurring_payment_id, due_on)
);

create index recurring_occurrences_due_idx
  on public.recurring_occurrences (boat_id, status, due_on);

-- A paid occurrence must point at the expense it generated; a pending one
-- must not — this is what keeps "pending never affects balances" honest.
alter table public.recurring_occurrences
  add constraint recurring_occurrence_paid_has_expense
  check (
    (status = 'paid'  and expense_id is not null) or
    (status <> 'paid' and expense_id is null)
  );

-- ---------------------------------------------------------------------------
-- transfers between partners (settlements)
-- ---------------------------------------------------------------------------
create table public.transfers (
  id             uuid primary key default gen_random_uuid(),
  boat_id        uuid not null references public.boats (id) on delete cascade,
  from_user      uuid not null references auth.users (id) on delete restrict,
  to_user        uuid not null references auth.users (id) on delete restrict,
  amount_agorot  bigint not null check (amount_agorot > 0),
  transferred_on date not null default current_date,
  method         text,
  note           text,
  created_by     uuid references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  check (from_user <> to_user)
);

create index transfers_boat_date_idx on public.transfers (boat_id, transferred_on desc);

-- ---------------------------------------------------------------------------
-- calendar events
-- ---------------------------------------------------------------------------
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  boat_id    uuid not null references public.boats (id) on delete cascade,
  kind       text not null default 'usage'
             check (kind in ('usage','arrival','maintenance','payment','other')),
  title      text not null,
  starts_at  timestamptz not null,
  ends_at    timestamptz,
  all_day    boolean not null default false,
  location   text,
  notes      text,
  user_id    uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at >= starts_at)
);

create index events_boat_start_idx on public.events (boat_id, starts_at);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id           uuid primary key default gen_random_uuid(),
  boat_id      uuid not null references public.boats (id) on delete cascade,
  title        text not null,
  done         boolean not null default false,
  due_on       date,
  assigned_to  uuid references auth.users (id) on delete set null,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index tasks_boat_open_idx on public.tasks (boat_id, done, due_on);

-- ---------------------------------------------------------------------------
-- boat log + media
-- ---------------------------------------------------------------------------
create table public.trips (
  id           uuid primary key default gen_random_uuid(),
  boat_id      uuid not null references public.boats (id) on delete cascade,
  kind         text not null default 'sail'
               check (kind in ('sail','maintenance','moment')),
  title        text not null,
  happened_on  date not null default current_date,
  location     text,
  engine_hours numeric(6,1),
  crew_count   integer,
  notes        text,
  cover_path   text,
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now()
);

create index trips_boat_date_idx on public.trips (boat_id, happened_on desc);

create table public.media (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.boats (id) on delete cascade,
  trip_id     uuid references public.trips (id) on delete set null,
  path        text not null,
  caption     text,
  taken_on    date,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index media_boat_idx on public.media (boat_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Balance view — server-side mirror of lib/balance.ts
--
-- balance > 0  => the group owes this partner
-- balance < 0  => this partner owes the group
--
-- paid    : what they laid out
-- owed    : their share of everything
-- sent    : settlements they sent (raises their balance back toward zero)
-- received: settlements they received (lowers it)
-- ---------------------------------------------------------------------------
create or replace view public.v_member_balances
with (security_invoker = true) as
with paid as (
  select boat_id, paid_by as user_id, sum(amount_agorot) as agorot
  from public.expenses group by 1, 2
),
owed as (
  select e.boat_id, s.user_id, sum(s.share_agorot) as agorot
  from public.expense_shares s
  join public.expenses e on e.id = s.expense_id
  group by 1, 2
),
sent as (
  select boat_id, from_user as user_id, sum(amount_agorot) as agorot
  from public.transfers group by 1, 2
),
received as (
  select boat_id, to_user as user_id, sum(amount_agorot) as agorot
  from public.transfers group by 1, 2
)
select
  m.boat_id,
  m.user_id,
  coalesce(p.agorot, 0)                          as paid_agorot,
  coalesce(o.agorot, 0)                          as owed_agorot,
  coalesce(s.agorot, 0)                          as sent_agorot,
  coalesce(r.agorot, 0)                          as received_agorot,
  coalesce(p.agorot, 0) - coalesce(o.agorot, 0)
    - coalesce(r.agorot, 0) + coalesce(s.agorot, 0) as balance_agorot
from public.boat_members m
left join paid     p on p.boat_id = m.boat_id and p.user_id = m.user_id
left join owed     o on o.boat_id = m.boat_id and o.user_id = m.user_id
left join sent     s on s.boat_id = m.boat_id and s.user_id = m.user_id
left join received r on r.boat_id = m.boat_id and r.user_id = m.user_id;

-- ---------------------------------------------------------------------------
-- Unified calendar feed: real events + document expiries + payment due dates
-- ---------------------------------------------------------------------------
create or replace view public.v_calendar_items
with (security_invoker = true) as
  select
    e.id,
    e.boat_id,
    e.kind,
    e.title,
    e.starts_at,
    e.ends_at,
    e.all_day,
    e.location,
    null::bigint as amount_agorot,
    e.id         as source_id
  from public.events e
union all
  select
    d.id,
    d.boat_id,
    'doc_expiry' as kind,
    d.title,
    (d.expires_on::timestamptz) as starts_at,
    null::timestamptz,
    true,
    null,
    null::bigint,
    d.id
  from public.documents d
  where d.expires_on is not null
union all
  select
    o.id,
    o.boat_id,
    'payment' as kind,
    rp.title,
    (o.due_on::timestamptz) as starts_at,
    null::timestamptz,
    true,
    null,
    o.amount_agorot,
    o.id
  from public.recurring_occurrences o
  join public.recurring_payments rp on rp.id = o.recurring_payment_id
  where o.status = 'pending';

-- ---------------------------------------------------------------------------
-- RPC: create_expense — expense + shares atomically, so the deferred
-- sum-check runs inside one transaction. SECURITY INVOKER: RLS still applies.
-- p_shares: [{"user_id": "...", "share_agorot": 80000}, ...]
-- ---------------------------------------------------------------------------
create or replace function public.create_expense(
  p_boat_id       uuid,
  p_paid_by       uuid,
  p_amount_agorot bigint,
  p_shares        jsonb,
  p_category      text default 'other',
  p_description   text default null,
  p_spent_on      date default current_date,
  p_split_mode    text default 'equal',
  p_receipt_path  text default null,
  p_note          text default null,
  p_source        text default 'manual'
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_sum        bigint;
begin
  select coalesce(sum((v ->> 'share_agorot')::bigint), 0)
    into v_sum
  from jsonb_array_elements(p_shares) v;

  if v_sum <> p_amount_agorot then
    raise exception 'Shares total % agorot but the expense is % agorot',
      v_sum, p_amount_agorot using errcode = 'check_violation';
  end if;

  insert into public.expenses (
    boat_id, paid_by, amount_agorot, category, description,
    spent_on, split_mode, receipt_path, note, source, created_by
  ) values (
    p_boat_id, p_paid_by, p_amount_agorot, p_category, p_description,
    p_spent_on, p_split_mode, p_receipt_path, p_note, p_source, auth.uid()
  )
  returning id into v_expense_id;

  insert into public.expense_shares (expense_id, user_id, share_agorot)
  select v_expense_id,
         (v ->> 'user_id')::uuid,
         (v ->> 'share_agorot')::bigint
  from jsonb_array_elements(p_shares) v;

  return v_expense_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- RPC: confirm_recurring_occurrence — the only path from a standing order to
-- a real expense. Idempotent: re-confirming returns the existing expense.
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

-- ---------------------------------------------------------------------------
-- RPC: generate_recurring_occurrences — materialise upcoming due dates.
-- Safe to call repeatedly; ON CONFLICT keeps it idempotent.
-- ---------------------------------------------------------------------------
create or replace function public.generate_recurring_occurrences(
  p_boat_id uuid,
  p_until   date default (current_date + interval '120 days')::date
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_rp      public.recurring_payments;
  v_cursor  date;
  v_step    interval;
  v_created integer := 0;
begin
  for v_rp in
    select * from public.recurring_payments
    where boat_id = p_boat_id and active
  loop
    v_step := case v_rp.cadence
                when 'monthly'   then interval '1 month'
                when 'quarterly' then interval '3 months'
                else                  interval '1 year'
              end;

    -- Anchor on the requested day-of-month, clamped to short months.
    v_cursor := make_date(
      extract(year  from v_rp.start_on)::int,
      extract(month from v_rp.start_on)::int,
      least(
        v_rp.day_of_month,
        extract(day from (date_trunc('month', v_rp.start_on)
                          + interval '1 month - 1 day'))::int
      )
    );

    while v_cursor <= p_until loop
      exit when v_rp.end_on is not null and v_cursor > v_rp.end_on;

      if v_cursor >= v_rp.start_on then
        insert into public.recurring_occurrences
          (recurring_payment_id, boat_id, due_on, amount_agorot)
        values
          (v_rp.id, v_rp.boat_id, v_cursor, v_rp.amount_agorot)
        on conflict (recurring_payment_id, due_on) do nothing;

        if found then
          v_created := v_created + 1;
        end if;
      end if;

      v_cursor := (date_trunc('month', v_cursor + v_step)
                   + (least(
                        v_rp.day_of_month,
                        extract(day from (date_trunc('month', v_cursor + v_step)
                                          + interval '1 month - 1 day'))::int
                      ) - 1) * interval '1 day')::date;
    end loop;
  end loop;

  return v_created;
end;
$$;
