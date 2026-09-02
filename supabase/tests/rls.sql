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

-- One push subscription per crewmate on Alice's boat. Unlike everything above,
-- these are NOT shared crew data: an endpoint is a delivery address for one
-- person's device, so the policies must isolate Bob from Alice, not just
-- Mallory from both.
insert into public.push_subscriptions (boat_id, user_id, endpoint, p256dh, auth)
values ('b0a70001-0000-0000-0000-000000000001',
        'a11ce000-0000-0000-0000-000000000001',
        'https://push.invalid/alice-phone', 'alice-p256dh', 'alice-auth'),
       ('b0a70001-0000-0000-0000-000000000001',
        'b0b00000-0000-0000-0000-000000000002',
        'https://push.invalid/bob-phone', 'bob-p256dh', 'bob-auth');

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

  -- A stranger sees no endpoints at all.
  select count(*) into v_count from public.push_subscriptions;
  if v_count <> 0 then
    raise exception 'RLS 8b FAILED — Mallory sees % push subscriptions', v_count;
  end if;
  raise notice 'RLS 8b PASS — Mallory cannot read anyone''s push endpoints';

  -- Nor can she park her own endpoint against a boat she is not on, which
  -- would enrol her device in that crew's notification fan-out.
  begin
    insert into public.push_subscriptions (boat_id, user_id, endpoint, p256dh, auth)
    values ('b0a70001-0000-0000-0000-000000000001',
            'dead0000-0000-0000-0000-000000000003',
            'https://push.invalid/mallory', 'm-p256dh', 'm-auth');
    raise exception 'RLS 8c FAILED — Mallory subscribed to Alice''s boat';
  exception when insufficient_privilege then
    raise notice 'RLS 8c PASS — Mallory cannot subscribe to a boat she is not on';
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

  -- Push subscriptions are the one thing a crewmate may NOT see. Everything
  -- else on this boat is joint business; which devices Alice owns is not, and
  -- an endpoint is what it takes to make her phone buzz. Bob has one row of
  -- his own on this boat and must see exactly that one.
  select count(*) into v_count from public.push_subscriptions;
  if v_count <> 1 then
    raise exception 'RLS 12 FAILED — Bob sees % push subscriptions, expected only his own', v_count;
  end if;

  select exists (select 1 from public.push_subscriptions
                 where user_id = 'a11ce000-0000-0000-0000-000000000001') into v_ok;
  if v_ok then
    raise exception 'RLS 12 FAILED — Bob can read his crewmate Alice''s push endpoint';
  end if;
  raise notice 'RLS 12 PASS — push endpoints are private to their own device owner';

  -- Nor may he write one for her, which would be the power to notify her at will.
  begin
    insert into public.push_subscriptions (boat_id, user_id, endpoint, p256dh, auth)
    values ('b0a70001-0000-0000-0000-000000000001',
            'a11ce000-0000-0000-0000-000000000001',
            'https://push.invalid/forged', 'f-p256dh', 'f-auth');
    raise exception 'RLS 13 FAILED — Bob inserted a push subscription for Alice';
  exception when insufficient_privilege then
    raise notice 'RLS 13 PASS — Bob cannot subscribe a device on Alice''s behalf';
  end;

  -- ...and he cannot reach hers to change or delete it. RLS makes the row
  -- invisible rather than raising, so the check is that nothing was touched.
  update public.push_subscriptions
     set endpoint = 'https://push.invalid/hijacked'
   where user_id = 'a11ce000-0000-0000-0000-000000000001';
  if found then
    raise exception 'RLS 14 FAILED — Bob updated Alice''s push subscription';
  end if;

  delete from public.push_subscriptions
   where user_id = 'a11ce000-0000-0000-0000-000000000001';
  if found then
    raise exception 'RLS 14 FAILED — Bob deleted Alice''s push subscription';
  end if;
  raise notice 'RLS 14 PASS — Bob cannot modify or remove Alice''s push subscription';

  -- His own row is his to remove, though — otherwise turning notifications off
  -- on a device would be impossible.
  delete from public.push_subscriptions
   where user_id = 'b0b00000-0000-0000-0000-000000000002';
  if not found then
    raise exception 'RLS 15 FAILED — Bob cannot delete his own push subscription';
  end if;
  raise notice 'RLS 15 PASS — Bob can turn his own device off';

  reset role;
  raise notice '=== RLS HOLDS ===';
end;
$$;

rollback;
