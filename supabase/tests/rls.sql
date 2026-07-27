-- ============================================================================
-- RLS isolation tests.
--
-- The invariants test runs as the table owner, which BYPASSES row level
-- security entirely. This one impersonates the `authenticated` role and sets
-- request.jwt.claims the way PostgREST does, so the policies are actually
-- exercised.
--
--   psql "$DATABASE_URL" -f supabase/tests/rls.sql
--
-- Rolls back; the database is left unchanged.
-- ============================================================================
\set ON_ERROR_STOP on
\timing off

begin;

-- Two unrelated boats: Alice's and Mallory's.
insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('a11ce000-0000-0000-0000-000000000001',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'alice@boatmate.invalid', '', now(), now(), now()),
       ('b0b00000-0000-0000-0000-000000000002',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'bob@boatmate.invalid', '', now(), now(), now()),
       ('dead0000-0000-0000-0000-000000000003',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'mallory@boatmate.invalid', '', now(), now(), now());

insert into public.boats (id, name, created_by) values
  ('b0a70001-0000-0000-0000-000000000001', 'Alice Boat',   'a11ce000-0000-0000-0000-000000000001'),
  ('b0a70002-0000-0000-0000-000000000002', 'Mallory Boat', 'dead0000-0000-0000-0000-000000000003');

insert into public.boat_members (boat_id, user_id) values
  ('b0a70001-0000-0000-0000-000000000001', 'b0b00000-0000-0000-0000-000000000002');

select public.create_expense(
  'b0a70001-0000-0000-0000-000000000001',
  'a11ce000-0000-0000-0000-000000000001',
  120000,
  '[{"user_id":"a11ce000-0000-0000-0000-000000000001","share_agorot":60000},
    {"user_id":"b0b00000-0000-0000-0000-000000000002","share_agorot":60000}]'::jsonb,
  'marina', 'Alice mooring', current_date, 'equal');

insert into public.documents (boat_id, title, category, file_path, uploaded_by)
values ('b0a70001-0000-0000-0000-000000000001', 'Alice insurance', 'insurance',
        'b0a70001-0000-0000-0000-000000000001/secret.pdf',
        'a11ce000-0000-0000-0000-000000000001');

do $$
declare
  v_count int;
  v_ok    boolean;
begin
  ------------------------------------------------------------------ as Mallory
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"dead0000-0000-0000-0000-000000000003","role":"authenticated"}', true);

  select count(*) into v_count from public.boats;
  if v_count <> 1 then
    raise exception 'RLS 1 FAILED — Mallory sees % boats, expected only her own', v_count;
  end if;
  raise notice 'RLS 1 PASS — Mallory sees only her own boat';

  select count(*) into v_count from public.expenses;
  if v_count <> 0 then
    raise exception 'RLS 2 FAILED — Mallory sees % of Alice''s expenses', v_count;
  end if;
  raise notice 'RLS 2 PASS — Mallory cannot read Alice''s expenses';

  select count(*) into v_count from public.expense_shares;
  if v_count <> 0 then
    raise exception 'RLS 3 FAILED — Mallory sees % expense shares', v_count;
  end if;
  raise notice 'RLS 3 PASS — Mallory cannot read Alice''s expense shares';

  select count(*) into v_count from public.documents;
  if v_count <> 0 then
    raise exception 'RLS 4 FAILED — Mallory sees % of Alice''s documents', v_count;
  end if;
  raise notice 'RLS 4 PASS — Mallory cannot read Alice''s documents';

  -- Mallory is the sole member of her own boat, so exactly one row is correct.
  -- What matters is that none of them belong to Alice's boat.
  select count(*) into v_count from public.v_member_balances
  where boat_id = 'b0a70001-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'RLS 5 FAILED — Mallory sees % rows of Alice''s balances', v_count;
  end if;

  select count(*) into v_count from public.v_member_balances;
  if v_count <> 1 then
    raise exception 'RLS 5 FAILED — Mallory sees % balance rows, expected 1 (her own)', v_count;
  end if;
  raise notice 'RLS 5 PASS — the balances view respects RLS (security_invoker)';

  select count(*) into v_count from public.v_calendar_items
  where boat_id = 'b0a70001-0000-0000-0000-000000000001';
  if v_count <> 0 then
    raise exception 'RLS 5b FAILED — Mallory sees % of Alice''s calendar items', v_count;
  end if;
  raise notice 'RLS 5b PASS — the calendar view respects RLS';

  -- Writing into someone else's boat must be refused.
  begin
    insert into public.expenses (boat_id, paid_by, amount_agorot)
    values ('b0a70001-0000-0000-0000-000000000001',
            'dead0000-0000-0000-0000-000000000003', 5000);
    raise exception 'RLS 6 FAILED — Mallory inserted an expense into Alice''s boat';
  exception when insufficient_privilege then
    raise notice 'RLS 6 PASS — Mallory cannot write into Alice''s boat';
  end;

  -- Joining a boat uninvited must be refused.
  begin
    insert into public.boat_members (boat_id, user_id)
    values ('b0a70001-0000-0000-0000-000000000001',
            'dead0000-0000-0000-0000-000000000003');
    raise exception 'RLS 7 FAILED — Mallory added herself to Alice''s boat';
  exception when insufficient_privilege then
    raise notice 'RLS 7 PASS — Mallory cannot add herself as crew';
  end;

  -- ...including through the invite RPC, which re-checks membership.
  begin
    perform public.add_partner_by_email(
      'b0a70001-0000-0000-0000-000000000001', 'mallory@boatmate.invalid');
    raise exception 'RLS 8 FAILED — add_partner_by_email let a non-member in';
  exception when insufficient_privilege then
    raise notice 'RLS 8 PASS — add_partner_by_email refuses non-members';
  end;

  ------------------------------------------------------------------ as Bob
  perform set_config('request.jwt.claims',
    '{"sub":"b0b00000-0000-0000-0000-000000000002","role":"authenticated"}', true);

  select count(*) into v_count from public.expenses;
  if v_count <> 1 then
    raise exception 'RLS 9 FAILED — Bob sees % expenses on his own boat, expected 1', v_count;
  end if;
  raise notice 'RLS 9 PASS — Bob reads his own boat''s expenses';

  select count(*) into v_count from public.v_member_balances;
  if v_count <> 2 then
    raise exception 'RLS 10 FAILED — Bob sees % balance rows, expected 2', v_count;
  end if;
  raise notice 'RLS 10 PASS — Bob sees both partners'' balances';

  -- Profile visibility: crewmates yes, strangers no.
  select exists (select 1 from public.profiles
                 where id = 'a11ce000-0000-0000-0000-000000000001') into v_ok;
  if not v_ok then
    raise exception 'RLS 11 FAILED — Bob cannot see his crewmate Alice''s profile';
  end if;
  select exists (select 1 from public.profiles
                 where id = 'dead0000-0000-0000-0000-000000000003') into v_ok;
  if v_ok then
    raise exception 'RLS 11 FAILED — Bob can see the stranger Mallory''s profile';
  end if;
  raise notice 'RLS 11 PASS — profiles visible to crewmates only';

  reset role;
  raise notice '=== RLS HOLDS ===';
end;
$$;

rollback;
