-- ============================================================================
-- Optional demo data.
--
--   psql "$DATABASE_URL" -f supabase/seed-demo.sql
--
-- Attaches a fully populated boat to the OLDEST existing auth user, so sign in
-- once before running this. Safe to re-run: it removes its own boat first.
--
-- To undo completely, including the two stand-in partner accounts:
--
--   delete from public.boats where name = 'סאונד אוף סי';
--   delete from auth.users where email in ('elad@boatmate.demo', 'lior@boatmate.demo');
-- ============================================================================

do $$
declare
  v_owner   uuid;
  v_boat    uuid;
  v_crew    uuid[];
  v_rent    uuid;
  v_marina  uuid;
  v_expense uuid;
begin
  select id into v_owner from auth.users order by created_at limit 1;
  if v_owner is null then
    raise exception 'Sign in to the app once first — there are no auth users yet.';
  end if;

  delete from public.boats where name = 'סאונד אוף סי';

  insert into public.boats (name, tagline, model, home_port, status_text,
                            latitude, longitude, created_by)
  values ('סאונד אוף סי', 'הבית שלנו על המים', 'Bavaria 46',
          'מרינה הרצליה', 'עוגנת במרינה, מוכנה להפלגה',
          32.1624, 34.7961, v_owner)
  returning id into v_boat;

  -- The creator is added automatically by the on_boat_created trigger.
  update public.boat_members set display_name = 'דני' where boat_id = v_boat;

  -- Two stand-in partners so balances are non-trivial. They have no password
  -- and can never sign in; deleting them removes them from the crew by cascade.
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
                          email_confirmed_at, created_at, updated_at,
                          raw_user_meta_data)
  values
    ('e1ad0000-0000-0000-0000-0000000000e1',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'elad@boatmate.demo', '', now(), now(), now(), '{"full_name":"אלעד"}'),
    ('110a0000-0000-0000-0000-0000000000f0',
     '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'lior@boatmate.demo', '', now(), now(), now(), '{"full_name":"ליאור"}')
  on conflict (id) do nothing;

  insert into public.boat_members (boat_id, user_id, display_name, is_remote)
  values
    (v_boat, 'e1ad0000-0000-0000-0000-0000000000e1', 'אלעד', false),
    (v_boat, '110a0000-0000-0000-0000-0000000000f0', 'ליאור', true)
  on conflict do nothing;

  select array_agg(user_id order by user_id) into v_crew
  from public.boat_members where boat_id = v_boat;

  -- ---- standing orders -----------------------------------------------------
  insert into public.recurring_payments
    (boat_id, title, category, amount_agorot, cadence, day_of_month, start_on,
     default_paid_by, created_by)
  values
    (v_boat, 'שכירות חודשית', 'rental', 240000, 'monthly', 1,
     date_trunc('month', current_date)::date, v_owner, v_owner)
  returning id into v_rent;

  insert into public.recurring_payments
    (boat_id, title, category, amount_agorot, cadence, day_of_month, start_on,
     default_paid_by, created_by)
  values
    (v_boat, 'דמי מרינה', 'marina', 95000, 'monthly', 5,
     date_trunc('month', current_date)::date, v_owner, v_owner)
  returning id into v_marina;

  perform public.generate_recurring_occurrences(v_boat, (current_date + 120)::date);

  -- ---- expenses ------------------------------------------------------------
  -- Shares must sum to the amount exactly (a deferred constraint enforces it),
  -- so plain integer division is not enough: 41000/3 loses 2 agorot. The
  -- remainder goes one agora at a time to the first members, matching
  -- splitEqual() in src/lib/balance.ts.
  declare
    v_n     int := array_length(v_crew, 1);
    v_specs jsonb := jsonb_build_array(
      jsonb_build_object('amount', 48000, 'cat', 'fuel',
                         'desc', 'תדלוק לפני הפלגת סופ״ש',  'ago', 6),
      jsonb_build_object('amount', 41000, 'cat', 'maintenance',
                         'desc', 'החלפת מצבר',              'ago', 18),
      jsonb_build_object('amount', 61000, 'cat', 'cleaning',
                         'desc', 'ניקוי וליטוש סיפון',       'ago', 33),
      jsonb_build_object('amount', 23400, 'cat', 'food',
                         'desc', 'מצרכים להפלגה',            'ago', 41)
    );
    v_spec  jsonb;
    v_amt   bigint;
  begin
    for v_spec in select * from jsonb_array_elements(v_specs)
    loop
      v_amt := (v_spec ->> 'amount')::bigint;

      insert into public.expenses
        (boat_id, paid_by, amount_agorot, category, description, spent_on, created_by)
      values (v_boat, v_owner, v_amt, v_spec ->> 'cat', v_spec ->> 'desc',
              current_date - (v_spec ->> 'ago')::int, v_owner)
      returning id into v_expense;

      insert into public.expense_shares (expense_id, user_id, share_agorot)
      select v_expense,
             u,
             v_amt / v_n + case when ord <= v_amt % v_n then 1 else 0 end
      from unnest(v_crew) with ordinality as t(u, ord);
    end loop;
  end;

  -- One settlement, so the transfers tab is not empty. Picks any partner who
  -- is not the payer, whatever order the crew ids happen to sort in.
  insert into public.transfers
    (boat_id, from_user, to_user, amount_agorot, transferred_on, note, created_by)
  select v_boat, m.user_id, v_owner, 15000, current_date - 4,
         'העברה בביט', v_owner
  from public.boat_members m
  where m.boat_id = v_boat and m.user_id <> v_owner
  limit 1;

  -- ---- documents -----------------------------------------------------------
  insert into public.documents
    (boat_id, title, category, file_path, original_name, mime_type, size_bytes,
     issued_on, expires_on, reminder_days, uploaded_by)
  values
    (v_boat, 'ביטוח מקיף', 'insurance', v_boat || '/demo-insurance.pdf',
     'insurance.pdf', 'application/pdf', 284000,
     current_date - 325, current_date + 40, 60, v_owner),
    (v_boat, 'רישיון כלי שיט', 'license', v_boat || '/demo-license.pdf',
     'license.pdf', 'application/pdf', 132000,
     current_date - 200, current_date + 165, 30, v_owner),
    (v_boat, 'הסכם שכירות', 'rental', v_boat || '/demo-rental.pdf',
     'rental.pdf', 'application/pdf', 512000,
     current_date - 380, current_date + 350, 30, v_owner);

  -- ---- calendar ------------------------------------------------------------
  insert into public.events
    (boat_id, kind, title, starts_at, ends_at, all_day, location, created_by)
  values
    -- Wall-clock times are Israel local; without the explicit zone the DB would
    -- store them as UTC and they would render three hours late.
    (v_boat, 'usage', 'יציאה לסופ״ש',
     ((current_date + 4) + time '08:00') at time zone 'Asia/Jerusalem',
     ((current_date + 6) + time '18:00') at time zone 'Asia/Jerusalem',
     false, 'מרינה הרצליה', v_owner),
    (v_boat, 'arrival', 'השותף השלישי מגיע לארץ',
     (current_date + 22)::timestamptz, (current_date + 36)::timestamptz,
     true, null, v_owner),
    (v_boat, 'maintenance', 'טיפול שנתי למנוע',
     (current_date + 48)::timestamptz, null, true, 'מספנת הרצליה', v_owner);

  -- ---- tasks ---------------------------------------------------------------
  insert into public.tasks (boat_id, title, due_on, created_by)
  values
    (v_boat, 'בדיקת מצבר', current_date + 9, v_owner),
    (v_boat, 'ניקוי סיפון', current_date + 14, v_owner);

  raise notice 'Demo boat % ready with % crew member(s).',
    v_boat, array_length(v_crew, 1);
end;
$$;
