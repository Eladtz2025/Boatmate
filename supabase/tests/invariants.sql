-- Money invariants, v2.
--
-- v1 used RELEASE SAVEPOINT to end the negative tests, which never fires a
-- DEFERRABLE constraint trigger — those only run at COMMIT. Here each negative
-- test forces the check with SET CONSTRAINTS ALL IMMEDIATE inside a PL/pgSQL
-- block, so we observe the same behaviour a real COMMIT would produce.
\set ON_ERROR_STOP on
\timing off

begin;

insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                        email_confirmed_at, created_at, updated_at)
values ('11111111-1111-1111-1111-111111111111',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'test-a@boatmate.invalid', '', now(), now(), now()),
       ('22222222-2222-2222-2222-222222222222',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'test-b@boatmate.invalid', '', now(), now(), now()),
       ('33333333-3333-3333-3333-333333333333',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
        'test-c@boatmate.invalid', '', now(), now(), now());

insert into public.boats (id, name, created_by)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TEST BOAT',
        '11111111-1111-1111-1111-111111111111');

insert into public.boat_members (boat_id, user_id) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333');

do $$
declare
  v_boat  uuid := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  v_a     uuid := '11111111-1111-1111-1111-111111111111';
  v_b     uuid := '22222222-2222-2222-2222-222222222222';
  v_c     uuid := '33333333-3333-3333-3333-333333333333';
  v_id    uuid;
  v_total bigint;
  v_count int;
begin
  ---------------------------------------------------------------- TEST 1
  begin
    insert into public.expenses (id, boat_id, paid_by, amount_agorot)
    values ('bbbbbbbb-0000-0000-0000-000000000001', v_boat, v_a, 100000);
    insert into public.expense_shares (expense_id, user_id, share_agorot) values
      ('bbbbbbbb-0000-0000-0000-000000000001', v_a, 40000),
      ('bbbbbbbb-0000-0000-0000-000000000001', v_b, 40000);
    set constraints all immediate;
    raise exception 'TEST 1 FAILED — shares totalling 80000 accepted for a 100000 expense';
  exception when check_violation then
    raise notice 'TEST 1 PASS — mismatched shares rejected';
  end;
  set constraints all deferred;

  ---------------------------------------------------------------- TEST 2
  begin
    insert into public.expenses (id, boat_id, paid_by, amount_agorot)
    values ('bbbbbbbb-0000-0000-0000-000000000002', v_boat, v_a, 50000);
    set constraints all immediate;
    raise exception 'TEST 2 FAILED — an expense with no shares was accepted';
  exception when check_violation then
    raise notice 'TEST 2 PASS — expense with no shares rejected';
  end;
  set constraints all deferred;

  ---------------------------------------------------------------- TEST 3
  v_id := public.create_expense(
    v_boat, v_a, 240000,
    format('[{"user_id":"%s","share_agorot":80000},
             {"user_id":"%s","share_agorot":80000},
             {"user_id":"%s","share_agorot":80000}]', v_a, v_b, v_c)::jsonb,
    'marina', 'mooring', current_date, 'equal');
  raise notice 'TEST 3 PASS — create_expense returned %', v_id;

  select balance_agorot into v_total from public.v_member_balances
  where boat_id = v_boat and user_id = v_a;
  if v_total <> 160000 then
    raise exception 'TEST 3 FAILED — payer balance is %, expected 160000', v_total;
  end if;
  raise notice 'TEST 3 PASS — payer balance is +160000, others -80000 each';

  ---------------------------------------------------------------- TEST 4
  begin
    perform public.create_expense(
      v_boat, v_a, 100000,
      format('[{"user_id":"%s","share_agorot":99999}]', v_a)::jsonb);
    raise exception 'TEST 4 FAILED — a 99999 split was accepted for a 100000 expense';
  exception when check_violation then
    raise notice 'TEST 4 PASS — create_expense rejected the mismatched split';
  end;

  ---------------------------------------------------------------- TEST 5
  insert into public.transfers (boat_id, from_user, to_user, amount_agorot)
  values (v_boat, v_b, v_a, 80000);

  select balance_agorot into v_total from public.v_member_balances
  where boat_id = v_boat and user_id = v_b;
  if v_total <> 0 then
    raise exception 'TEST 5 FAILED — settling partner balance is %, expected 0', v_total;
  end if;
  raise notice 'TEST 5 PASS — a full settlement zeroes the debtor';

  select sum(balance_agorot) into v_total from public.v_member_balances where boat_id = v_boat;
  if v_total <> 0 then
    raise exception 'TEST 5 FAILED — balances sum to %, expected 0', v_total;
  end if;
  raise notice 'TEST 5 PASS — balances sum to zero';

  ---------------------------------------------------------------- TEST 6
  insert into public.recurring_payments (id, boat_id, title, amount_agorot, default_paid_by)
  values ('cccccccc-0000-0000-0000-000000000001', v_boat, 'rent', 240000, v_a);

  begin
    insert into public.recurring_occurrences
      (recurring_payment_id, boat_id, due_on, amount_agorot, status)
    values ('cccccccc-0000-0000-0000-000000000001', v_boat, current_date, 240000, 'paid');
    raise exception 'TEST 6 FAILED — a paid occurrence with no expense was accepted';
  exception when check_violation then
    raise notice 'TEST 6 PASS — paid occurrence without an expense rejected';
  end;

  ---------------------------------------------------------------- TEST 7
  insert into public.recurring_occurrences
    (id, recurring_payment_id, boat_id, due_on, amount_agorot)
  values ('dddddddd-0000-0000-0000-000000000001',
          'cccccccc-0000-0000-0000-000000000001', v_boat, current_date, 240000);

  select sum(balance_agorot) into v_total from public.v_member_balances where boat_id = v_boat;
  if v_total <> 0 then
    raise exception 'TEST 7 FAILED — a pending standing order moved balances by %', v_total;
  end if;
  raise notice 'TEST 7 PASS — pending standing order does not touch balances';

  ---------------------------------------------------------------- TEST 8
  v_id := public.confirm_recurring_occurrence(
    'dddddddd-0000-0000-0000-000000000001',
    format('[{"user_id":"%s","share_agorot":80000},
             {"user_id":"%s","share_agorot":80000},
             {"user_id":"%s","share_agorot":80000}]', v_a, v_b, v_c)::jsonb,
    v_a);

  select balance_agorot into v_total from public.v_member_balances
  where boat_id = v_boat and user_id = v_a;
  if v_total <> 240000 then
    raise exception 'TEST 8 FAILED — payer balance is %, expected 240000', v_total;
  end if;
  raise notice 'TEST 8 PASS — confirming generated a real expense and moved balances';

  ---------------------------------------------------------------- TEST 9
  perform public.confirm_recurring_occurrence(
    'dddddddd-0000-0000-0000-000000000001',
    format('[{"user_id":"%s","share_agorot":240000}]', v_a)::jsonb, v_a);

  select count(*) into v_count from public.expenses where boat_id = v_boat;
  if v_count <> 2 then
    raise exception 'TEST 9 FAILED — % expenses exist, expected 2 (double charge!)', v_count;
  end if;
  raise notice 'TEST 9 PASS — re-confirming is idempotent, no double charge';

  ---------------------------------------------------------------- TEST 10
  select count(*) into v_count from pg_tables
  where schemaname = 'public' and rowsecurity = false;
  if v_count <> 0 then
    raise exception 'TEST 10 FAILED — % public tables have RLS disabled', v_count;
  end if;
  raise notice 'TEST 10 PASS — RLS enabled on every public table';

  raise notice '=== ALL INVARIANTS HOLD ===';
end;
$$;

rollback;
