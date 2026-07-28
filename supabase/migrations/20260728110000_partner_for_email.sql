-- ============================================================================
-- Resolving a sign-in address without scanning auth.users.
--
-- requestEntry() used to pull every account through the admin API and match in
-- JS. That made one unserialisable row fatal for everybody: a hand-inserted
-- auth.users row with NULL token columns makes GoTrue's listUsers return a
-- bodyless 500, so *no* partner could sign in — not just the one with the bad
-- row. Resolving the address in SQL touches only the matching row and never
-- goes through GoTrue's marshalling at all.
--
-- Same shape as add_partner_by_email: auth.users is not readable under RLS, so
-- the lookup has to happen inside a SECURITY DEFINER function.
--
-- The join to boat_members is what keeps the membership check *before*
-- generateLink, which would otherwise create an account for an unknown address.
-- A non-partner and an unknown address both come back as zero rows, so the
-- caller cannot tell them apart — same as the single vague refusal on screen.
--
-- EXECUTE is granted to service_role alone. Anyone else able to call this would
-- learn whether a given address belongs to a partner, which is exactly the
-- directory the login screen declines to hand out.
-- ============================================================================

create or replace function public.partner_for_email(p_email text)
returns table (user_id uuid, user_email text)
language sql
security definer
stable
set search_path = public
as $$
  select m.user_id, u.email::text
  from public.boat_members m
  join auth.users u on u.id = m.user_id
  where lower(trim(u.email)) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.partner_for_email(text) from public;
revoke all on function public.partner_for_email(text) from anon;
revoke all on function public.partner_for_email(text) from authenticated;
grant execute on function public.partner_for_email(text) to service_role;
