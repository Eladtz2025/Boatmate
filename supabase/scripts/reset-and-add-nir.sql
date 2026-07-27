-- ============================================================================
-- Run this in the Supabase SQL editor:
--   Dashboard → project izyhzaqwgliftoxylgkp → SQL Editor → New query → Run
--
-- It does two things, in one transaction:
--
--   1. Clears the test data I created while checking the app, including the
--      uploaded files in Storage. Your boat, and you as a partner, are KEPT.
--   2. Creates a Boatmate account for nirkah@gmail.com and adds him to the boat
--      as "ניר", so he shows up in splits and balances straight away.
--
-- Safe to re-run: step 2 skips itself if Nir already exists.
-- Nothing here sends Nir an email. He gets one only when he asks for a sign-in
-- link himself, and it will work immediately (his address is pre-confirmed).
--
-- If anything looks wrong, the whole thing rolls back — nothing is half-applied.
-- ============================================================================

begin;

do $$
declare
  v_boat    uuid;
  v_nir     uuid;
  v_deleted jsonb;
begin
  ---------------------------------------------------------------------------
  -- Resolve the boat. Bail out loudly rather than guessing.
  ---------------------------------------------------------------------------
  select id into v_boat from public.boats order by created_at limit 1;

  if v_boat is null then
    raise exception 'No boat found — nothing to clean up.';
  end if;

  if (select count(*) from public.boats) > 1 then
    raise exception 'More than one boat exists. Tell Claude before running this.';
  end if;

  ---------------------------------------------------------------------------
  -- 1. Clear the test data.
  --
  -- expense_shares and recurring_occurrences are removed by cascade, so they
  -- are not listed here. boats and boat_members are deliberately untouched.
  ---------------------------------------------------------------------------

  -- Uploaded files first: deleting the rows would orphan the objects, and
  -- Storage paths always start with the boat id (that is what the storage
  -- policies authorise on).
  delete from storage.objects
   where bucket_id in ('documents', 'receipts', 'media')
     and (storage.foldername(name))[1] = v_boat::text;

  with
    d_expenses  as (delete from public.expenses           where boat_id = v_boat returning 1),
    d_transfers as (delete from public.transfers          where boat_id = v_boat returning 1),
    d_recurring as (delete from public.recurring_payments where boat_id = v_boat returning 1),
    d_documents as (delete from public.documents          where boat_id = v_boat returning 1),
    d_events    as (delete from public.events             where boat_id = v_boat returning 1),
    d_tasks     as (delete from public.tasks              where boat_id = v_boat returning 1),
    d_media     as (delete from public.media              where boat_id = v_boat returning 1),
    d_trips     as (delete from public.trips              where boat_id = v_boat returning 1)
  select jsonb_build_object(
           'expenses',           (select count(*) from d_expenses),
           'transfers',          (select count(*) from d_transfers),
           'recurring_payments', (select count(*) from d_recurring),
           'documents',          (select count(*) from d_documents),
           'events',             (select count(*) from d_events),
           'tasks',              (select count(*) from d_tasks),
           'media',              (select count(*) from d_media),
           'trips',              (select count(*) from d_trips)
         )
    into v_deleted;

  raise notice 'Deleted: %', v_deleted;

  ---------------------------------------------------------------------------
  -- 2. Create Nir's account.
  --
  -- Mirrors exactly what GoTrue writes for an email user: a row in auth.users
  -- plus the matching auth.identities row (without the identity, the address
  -- is not linked to the email provider and the magic link would not resolve).
  --
  -- encrypted_password is left empty on purpose — Boatmate is passwordless, so
  -- there is no password to set and none can be used to sign in.
  --
  -- The public.profiles row is created automatically by the handle_new_user
  -- trigger, which reads full_name out of raw_user_meta_data.
  ---------------------------------------------------------------------------
  select id into v_nir from auth.users where email = 'nirkah@gmail.com';

  if v_nir is null then
    v_nir := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data,
      is_sso_user, is_anonymous
    )
    values (
      v_nir,
      '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated',
      'nirkah@gmail.com', '',
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"ניר"}'::jsonb,
      false, false
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      created_at, updated_at
    )
    values (
      gen_random_uuid(),
      v_nir,
      jsonb_build_object('sub', v_nir::text, 'email', 'nirkah@gmail.com',
                         'email_verified', true, 'phone_verified', false),
      'email',
      v_nir::text,
      now(), now()
    );

    raise notice 'Created account for nirkah@gmail.com (%)', v_nir;
  else
    raise notice 'nirkah@gmail.com already had an account (%)', v_nir;
  end if;

  ---------------------------------------------------------------------------
  -- 3. Add Nir to the boat. is_remote stays false — he is not the one who flies.
  ---------------------------------------------------------------------------
  insert into public.boat_members (boat_id, user_id, display_name, is_remote)
  values (v_boat, v_nir, 'ניר', false)
  on conflict (boat_id, user_id)
    do update set display_name = excluded.display_name,
                  is_remote    = excluded.is_remote;
end;
$$;

commit;

-- ---------------------------------------------------------------------------
-- Verification. Expect: two partners (אלעד + ניר), and zeroes everywhere else.
-- ---------------------------------------------------------------------------
select
  (select string_agg(coalesce(m.display_name, u.email), ', ' order by m.joined_at)
     from public.boat_members m join auth.users u on u.id = m.user_id) as partners,
  (select count(*) from public.expenses)           as expenses,
  (select count(*) from public.transfers)          as transfers,
  (select count(*) from public.recurring_payments) as recurring,
  (select count(*) from public.documents)          as documents,
  (select count(*) from public.events)             as events,
  (select count(*) from public.media)              as media,
  (select count(*) from storage.objects
     where bucket_id in ('documents','receipts','media'))  as stored_files;
