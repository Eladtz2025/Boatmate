-- ============================================================================
-- Run in the Supabase SQL editor (Role: postgres — the auth schema needs it).
--
--   1. Clears the remaining test data: expenses, the standing order and its
--      occurrences, the test event.
--   2. Creates a Boatmate account for nirkah@gmail.com and adds him to the boat
--      as "ניר".
--
-- Storage is deliberately NOT touched here. Postgres blocks direct deletes on
-- storage.objects (storage.protect_delete) so that rows and files cannot drift
-- apart — files must go through the Storage API. The documents and the photo
-- were therefore already removed from inside the app, which does exactly that.
--
-- Safe to re-run. Nothing here emails Nir; he gets a link only when he asks for
-- one, and it will work immediately because his address is pre-confirmed.
-- ============================================================================

do $$
declare
  v_boat uuid;
  v_nir  uuid;
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
  -- 1. Clear the remaining test data.
  --    expense_shares and recurring_occurrences go by cascade.
  --    boats and boat_members are deliberately kept.
  ---------------------------------------------------------------------------
  delete from public.expenses           where boat_id = v_boat;
  delete from public.transfers          where boat_id = v_boat;
  delete from public.recurring_payments where boat_id = v_boat;
  delete from public.events             where boat_id = v_boat;
  delete from public.tasks              where boat_id = v_boat;
  delete from public.trips              where boat_id = v_boat;

  ---------------------------------------------------------------------------
  -- 2. Create Nir's account, mirroring exactly what GoTrue writes for an email
  --    user: auth.users plus the matching auth.identities row. Without the
  --    identity the address is not linked to the email provider and the magic
  --    link would not resolve.
  --
  --    encrypted_password stays empty on purpose — Boatmate is passwordless, so
  --    there is no password to set and none can be used to sign in.
  --
  --    public.profiles is filled in by the handle_new_user trigger, which reads
  --    full_name out of raw_user_meta_data.
  ---------------------------------------------------------------------------
  select id into v_nir from auth.users where email = 'nirkah@gmail.com';

  if v_nir is null then
    v_nir := gen_random_uuid();

    insert into auth.users (
      id, instance_id, aud, role, email, encrypted_password,
      email_confirmed_at, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user, is_anonymous
    )
    values (
      v_nir, '00000000-0000-0000-0000-000000000000',
      'authenticated', 'authenticated', 'nirkah@gmail.com', '',
      now(), now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"ניר"}'::jsonb, false, false
    );

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id, created_at, updated_at
    )
    values (
      gen_random_uuid(), v_nir,
      jsonb_build_object('sub', v_nir::text, 'email', 'nirkah@gmail.com',
                         'email_verified', true, 'phone_verified', false),
      'email', v_nir::text, now(), now()
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

-- ---------------------------------------------------------------------------
-- Verification. Expect: partners "אלעד, ניר" and zeroes across the rest.
-- ---------------------------------------------------------------------------
select
  (select string_agg(coalesce(m.display_name, u.email), ', ' order by m.joined_at)
     from public.boat_members m join auth.users u on u.id = m.user_id) as partners,
  (select count(*) from public.expenses)           as expenses,
  (select count(*) from public.transfers)          as transfers,
  (select count(*) from public.recurring_payments) as recurring,
  (select count(*) from public.documents)          as documents,
  (select count(*) from public.events)             as events,
  (select count(*) from public.media)              as media;
