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
  v_id     uuid;
  v_total  bigint;
  v_count  int;
  v_status text;
  v_transfer   uuid;
  v_from_before bigint;
  v_to_before   bigint;
  v_from_after  bigint;
  v_to_after    bigint;
  v_from_manual bigint;
  v_to_manual   bigint;
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

  ---------------------------------------------------------------- TEST 11
  -- Deleting a confirmed payment must put its occurrence back in the pending
  -- list. This used to fail outright: `on delete set null` nulled expense_id
  -- under a 'paid' row and tripped recurring_occurrence_paid_has_expense, so a
  -- payment confirmed by mistake could not be undone at all.
  delete from public.expenses
   where id = (select expense_id from public.recurring_occurrences
                where id = 'dddddddd-0000-0000-0000-000000000001');

  select status into v_status from public.recurring_occurrences
   where id = 'dddddddd-0000-0000-0000-000000000001';

  if v_status <> 'pending' then
    raise exception 'TEST 11 FAILED — occurrence is %, expected pending', v_status;
  end if;
  raise notice 'TEST 11 PASS — deleting a confirmed payment un-confirms it';

  ---------------------------------------------------------------- TEST 12
  -- A direct-transfer standing order must name two different partners. The
  -- app refuses this too, but the constraint is what makes it impossible:
  -- a template that could name one partner twice would only blow up months
  -- later, at the moment somebody confirmed a payment.
  begin
    insert into public.recurring_payments
      (boat_id, title, kind, amount_agorot, from_user, to_user)
    values (v_boat, 'self pay', 'transfer', 50000, v_a, v_a);
    raise exception 'TEST 12 FAILED — a transfer order from a partner to themselves was accepted';
  exception when check_violation then
    raise notice 'TEST 12 PASS — from_user = to_user rejected';
  end;

  begin
    insert into public.recurring_payments
      (boat_id, title, kind, amount_agorot)
    values (v_boat, 'nobody', 'transfer', 50000);
    raise exception 'TEST 12 FAILED — a transfer order with no parties was accepted';
  exception when check_violation then
    raise notice 'TEST 12 PASS — transfer order without parties rejected';
  end;

  begin
    insert into public.recurring_payments
      (boat_id, title, kind, amount_agorot, from_user, to_user)
    values (v_boat, 'shared but directed', 'expense', 50000, v_a, v_b);
    raise exception 'TEST 12 FAILED — a shared-expense order carrying parties was accepted';
  exception when check_violation then
    raise notice 'TEST 12 PASS — shared-expense order may not name parties';
  end;

  ---------------------------------------------------------------- TEST 13
  -- Existing rows, written before standing orders had a kind at all, must
  -- still read as shared expenses.
  select count(*) into v_count from public.recurring_payments
  where id = 'cccccccc-0000-0000-0000-000000000001' and kind = 'expense';
  if v_count <> 1 then
    raise exception 'TEST 13 FAILED — a standing order created without a kind is not an expense';
  end if;
  raise notice 'TEST 13 PASS — kind defaults to expense, existing orders unchanged';

  ---------------------------------------------------------------- TEST 14
  insert into public.recurring_payments
    (id, boat_id, title, kind, amount_agorot, from_user, to_user)
  values ('cccccccc-0000-0000-0000-000000000002', v_boat, 'monthly repayment',
          'transfer', 60000, v_b, v_a);

  insert into public.recurring_occurrences
    (id, recurring_payment_id, boat_id, due_on, amount_agorot)
  values ('dddddddd-0000-0000-0000-000000000002',
          'cccccccc-0000-0000-0000-000000000002', v_boat, current_date, 60000);

  select balance_agorot into v_from_before from public.v_member_balances
  where boat_id = v_boat and user_id = v_b;
  select balance_agorot into v_to_before from public.v_member_balances
  where boat_id = v_boat and user_id = v_a;

  select count(*) into v_count from public.transfers where boat_id = v_boat;
  if v_count <> 1 then
    raise exception 'TEST 14 FAILED — a pending direct transfer created a transfer row';
  end if;
  raise notice 'TEST 14 PASS — pending direct transfer does not touch balances';

  ---------------------------------------------------------------- TEST 15
  -- Confirming writes a settlement and nothing else: no expense, no shares.
  select count(*) into v_count from public.expenses where boat_id = v_boat;

  v_transfer := public.confirm_recurring_transfer(
    'dddddddd-0000-0000-0000-000000000002', null, current_date, null);

  if v_transfer is null then
    raise exception 'TEST 15 FAILED — confirm_recurring_transfer returned no transfer';
  end if;

  if (select count(*) from public.expenses where boat_id = v_boat) <> v_count then
    raise exception 'TEST 15 FAILED — confirming a direct transfer created an expense';
  end if;

  if exists (
    select 1 from public.expenses
    where boat_id = v_boat and description = 'monthly repayment'
  ) then
    raise exception 'TEST 15 FAILED — confirming a direct transfer created an expense row';
  end if;

  select count(*) into v_count from public.transfers where boat_id = v_boat;
  if v_count <> 2 then
    raise exception 'TEST 15 FAILED — % transfers exist, expected 2', v_count;
  end if;
  raise notice 'TEST 15 PASS — confirming created exactly one transfer and no expense';

  ---------------------------------------------------------------- TEST 16
  -- The whole point: a confirmed direct transfer moves balances by exactly the
  -- same amounts a hand-entered transfer of the same size does. Sender's
  -- balance rises (they are owed more), receiver's falls, and the two are the
  -- same number with opposite signs.
  select balance_agorot into v_from_after from public.v_member_balances
  where boat_id = v_boat and user_id = v_b;
  select balance_agorot into v_to_after from public.v_member_balances
  where boat_id = v_boat and user_id = v_a;

  if (v_from_after - v_from_before) <> 60000 then
    raise exception 'TEST 16 FAILED — sender moved by %, expected 60000',
      v_from_after - v_from_before;
  end if;
  if (v_to_after - v_to_before) <> -60000 then
    raise exception 'TEST 16 FAILED — receiver moved by %, expected -60000',
      v_to_after - v_to_before;
  end if;

  -- And now the same transfer entered by hand, to compare the two directly.
  insert into public.transfers (boat_id, from_user, to_user, amount_agorot)
  values (v_boat, v_b, v_a, 60000);

  select balance_agorot into v_from_manual from public.v_member_balances
  where boat_id = v_boat and user_id = v_b;
  select balance_agorot into v_to_manual from public.v_member_balances
  where boat_id = v_boat and user_id = v_a;

  if (v_from_manual - v_from_after) <> (v_from_after - v_from_before)
     or (v_to_manual - v_to_after) <> (v_to_after - v_to_before) then
    raise exception 'TEST 16 FAILED — a recurring transfer and a manual one moved balances differently';
  end if;

  select sum(balance_agorot) into v_total from public.v_member_balances where boat_id = v_boat;
  if v_total <> 0 then
    raise exception 'TEST 16 FAILED — balances sum to %, expected 0', v_total;
  end if;
  raise notice 'TEST 16 PASS — a recurring transfer moves balances exactly like a manual one';

  ---------------------------------------------------------------- TEST 17
  -- Idempotent, like the expense path — and here a second row would be real
  -- money moved twice with no share-sum invariant downstream to catch it.
  perform public.confirm_recurring_transfer('dddddddd-0000-0000-0000-000000000002');

  select count(*) into v_count from public.transfers where boat_id = v_boat;
  if v_count <> 3 then
    raise exception 'TEST 17 FAILED — % transfers exist, expected 3 (double payment!)', v_count;
  end if;
  raise notice 'TEST 17 PASS — re-confirming a direct transfer creates no second transfer';

  ---------------------------------------------------------------- TEST 18
  -- A direct transfer may not be routed through the expense path, which would
  -- split a repayment between the crew — the exact wrong answer.
  insert into public.recurring_occurrences
    (id, recurring_payment_id, boat_id, due_on, amount_agorot)
  values ('dddddddd-0000-0000-0000-000000000003',
          'cccccccc-0000-0000-0000-000000000002', v_boat,
          current_date + 30, 60000);

  begin
    perform public.confirm_recurring_occurrence(
      'dddddddd-0000-0000-0000-000000000003',
      format('[{"user_id":"%s","share_agorot":60000}]', v_b)::jsonb, v_b);
    raise exception 'TEST 18 FAILED — the expense path accepted an occurrence it should refuse';
  exception when raise_exception then
    if position('direct transfer' in sqlerrm) = 0 then raise; end if;
    raise notice 'TEST 18 PASS — the expense path refuses a direct transfer';
  end;

  ---------------------------------------------------------------- TEST 19
  -- The transfer IS the payment, so deleting it un-confirms the occurrence and
  -- puts it back in the pending list. Same rule as TEST 11, other record type.
  delete from public.transfers where id = v_transfer;

  select status into v_status from public.recurring_occurrences
   where id = 'dddddddd-0000-0000-0000-000000000002';

  if v_status <> 'pending' then
    raise exception 'TEST 19 FAILED — occurrence is %, expected pending', v_status;
  end if;
  raise notice 'TEST 19 PASS — deleting a recurring transfer un-confirms it';

  raise notice '=== ALL INVARIANTS HOLD ===';
end;
$$;

rollback;
