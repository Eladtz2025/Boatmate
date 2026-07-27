-- ============================================================================
-- Boatmate — Row Level Security
--
-- Model: "all partners equal". Membership in boat_members is the single gate;
-- any member may read and write everything belonging to that boat.
-- Nothing is readable without membership.
-- ============================================================================

alter table public.profiles              enable row level security;
alter table public.boats                 enable row level security;
alter table public.boat_members          enable row level security;
alter table public.documents             enable row level security;
alter table public.recurring_payments    enable row level security;
alter table public.recurring_occurrences enable row level security;
alter table public.expenses              enable row level security;
alter table public.expense_shares        enable row level security;
alter table public.transfers             enable row level security;
alter table public.events                enable row level security;
alter table public.tasks                 enable row level security;
alter table public.trips                 enable row level security;
alter table public.media                 enable row level security;

-- ---------------------------------------------------------------------------
-- profiles: you can see yourself and anyone who shares a boat with you.
-- ---------------------------------------------------------------------------
create policy "profiles readable by crewmates"
  on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1 from public.boat_members m
      where m.user_id = profiles.id
        and m.boat_id in (select public.my_boat_ids())
    )
  );

create policy "own profile is updatable"
  on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "own profile is insertable"
  on public.profiles for insert to authenticated
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- boats
-- ---------------------------------------------------------------------------
create policy "members read their boat"
  on public.boats for select to authenticated
  using (public.is_boat_member(id));

create policy "authenticated users create boats"
  on public.boats for insert to authenticated
  with check (created_by = auth.uid());

create policy "members update their boat"
  on public.boats for update to authenticated
  using (public.is_boat_member(id)) with check (public.is_boat_member(id));

create policy "creator deletes the boat"
  on public.boats for delete to authenticated
  using (created_by = auth.uid());

-- ---------------------------------------------------------------------------
-- boat_members — uses is_boat_member() (SECURITY DEFINER) to avoid recursing
-- into this same table while evaluating its own policy.
-- ---------------------------------------------------------------------------
create policy "members read the crew list"
  on public.boat_members for select to authenticated
  using (user_id = auth.uid() or public.is_boat_member(boat_id));

create policy "members add crew"
  on public.boat_members for insert to authenticated
  with check (public.is_boat_member(boat_id) or user_id = auth.uid());

create policy "members update crew"
  on public.boat_members for update to authenticated
  using (public.is_boat_member(boat_id)) with check (public.is_boat_member(boat_id));

create policy "members remove crew"
  on public.boat_members for delete to authenticated
  using (public.is_boat_member(boat_id));

-- ---------------------------------------------------------------------------
-- Boat-scoped tables: one uniform policy set, generated below.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'documents', 'recurring_payments', 'recurring_occurrences',
    'expenses', 'transfers', 'events', 'tasks', 'trips', 'media'
  ]
  loop
    execute format($f$
      create policy "members read %1$s"
        on public.%1$I for select to authenticated
        using (public.is_boat_member(boat_id));

      create policy "members insert %1$s"
        on public.%1$I for insert to authenticated
        with check (public.is_boat_member(boat_id));

      create policy "members update %1$s"
        on public.%1$I for update to authenticated
        using (public.is_boat_member(boat_id))
        with check (public.is_boat_member(boat_id));

      create policy "members delete %1$s"
        on public.%1$I for delete to authenticated
        using (public.is_boat_member(boat_id));
    $f$, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- expense_shares has no boat_id of its own — reach through to the expense.
-- ---------------------------------------------------------------------------
create policy "members read expense shares"
  on public.expense_shares for select to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_shares.expense_id and public.is_boat_member(e.boat_id)
  ));

create policy "members insert expense shares"
  on public.expense_shares for insert to authenticated
  with check (exists (
    select 1 from public.expenses e
    where e.id = expense_shares.expense_id and public.is_boat_member(e.boat_id)
  ));

create policy "members update expense shares"
  on public.expense_shares for update to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_shares.expense_id and public.is_boat_member(e.boat_id)
  ))
  with check (exists (
    select 1 from public.expenses e
    where e.id = expense_shares.expense_id and public.is_boat_member(e.boat_id)
  ));

create policy "members delete expense shares"
  on public.expense_shares for delete to authenticated
  using (exists (
    select 1 from public.expenses e
    where e.id = expense_shares.expense_id and public.is_boat_member(e.boat_id)
  ));
