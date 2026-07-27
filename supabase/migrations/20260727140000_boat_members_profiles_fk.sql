-- ============================================================================
-- boat_members.user_id already references auth.users, but PostgREST cannot
-- embed profiles through that: there is no direct relationship between
-- boat_members and public.profiles. Adding the second foreign key makes
-- `boat_members(..., profiles(full_name))` resolvable, and tightens integrity —
-- every crew member now provably has a profile row.
--
-- Safe because handle_new_user() creates a profile for every auth user.
-- ============================================================================

insert into public.profiles (id, full_name)
select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1))
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);

alter table public.boat_members
  add constraint boat_members_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete cascade;
