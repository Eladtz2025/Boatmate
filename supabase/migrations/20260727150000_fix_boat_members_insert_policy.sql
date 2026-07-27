-- ============================================================================
-- SECURITY FIX: privilege escalation via self-insert into boat_members.
--
-- The original policy was:
--
--   with check (public.is_boat_member(boat_id) or user_id = auth.uid())
--
-- The second branch was intended to bootstrap a brand-new boat, but because it
-- never constrained WHICH boat, any authenticated user could insert
-- (someone_elses_boat, themselves) and instantly gain full read/write access to
-- that boat's expenses, documents and files. Caught by supabase/tests/rls.sql
-- ("RLS 7 FAILED — Mallory added herself to Alice's boat").
--
-- The bootstrap case does not need a policy at all: add_creator_as_member() is
-- a SECURITY DEFINER trigger that runs on boat insert, and add_partner_by_email()
-- is SECURITY DEFINER and re-checks the caller's membership. Both bypass RLS
-- legitimately, so the policy can simply require existing membership.
-- ============================================================================

drop policy if exists "members add crew" on public.boat_members;

create policy "members add crew"
  on public.boat_members for insert to authenticated
  with check (public.is_boat_member(boat_id));
