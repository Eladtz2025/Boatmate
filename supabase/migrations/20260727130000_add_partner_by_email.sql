-- ============================================================================
-- Inviting a partner.
--
-- auth.users is not readable under RLS, so resolving an email to a user id has
-- to happen inside a SECURITY DEFINER function. The function re-checks that the
-- caller is a member of the boat before it will add anybody — without that
-- check, being able to call it would be equivalent to joining any boat.
-- ============================================================================

create or replace function public.add_partner_by_email(
  p_boat_id      uuid,
  p_email        text,
  p_display_name text default null,
  p_is_remote    boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_boat_member(p_boat_id) then
    raise exception 'Only partners of this boat can add crew'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = lower(trim(p_email))
  limit 1;

  if v_user_id is null then
    raise exception 'No Boatmate account exists for %', p_email
      using errcode = 'no_data_found';
  end if;

  insert into public.boat_members (boat_id, user_id, display_name, is_remote)
  values (p_boat_id, v_user_id, nullif(trim(coalesce(p_display_name, '')), ''), p_is_remote)
  on conflict (boat_id, user_id) do update
    set display_name = coalesce(excluded.display_name, public.boat_members.display_name),
        is_remote    = excluded.is_remote;

  return v_user_id;
end;
$$;

revoke all on function public.add_partner_by_email(uuid, text, text, boolean) from public;
grant execute on function public.add_partner_by_email(uuid, text, text, boolean) to authenticated;
