-- ============================================================================
-- Boatmate — Web Push subscriptions
--
-- One row per browser that has agreed to receive notifications. The endpoint
-- is the push service's URL for that browser; the two keys are what the
-- payload is encrypted to. All three come from the browser's PushManager and
-- none of them is a secret we choose — losing the row simply means that device
-- stops being notified until it subscribes again.
--
-- Why a table at all: a partner marking attendance has to reach the *other*
-- partners' devices, and the server has to know where those are. Nothing else
-- in this schema could answer that.
--
-- Permission model matches the rest of the app — membership in boat_members is
-- the gate — with one deliberate tightening: a row may only be written for
-- yourself. Every other boat-scoped table lets any partner write any row,
-- which is right for shared money and shared documents; it is not right for a
-- delivery address, where the ability to insert somebody else's endpoint is
-- the ability to have their phone buzz at your choosing.
-- ============================================================================

create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  boat_id     uuid not null references public.boats (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  -- The push service URL. Unique on its own: the same browser re-subscribing
  -- must update its keys in place rather than accumulate rows, or one device
  -- ends up notified five times.
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  -- Only for telling "which of my devices is this" apart in a future settings
  -- list. Never parsed.
  user_agent  text,
  created_at  timestamptz not null default now(),
  -- Set when a send comes back 404/410 — the browser has revoked it and the
  -- row is dead. Kept rather than deleted so a failure is visible.
  expired_at  timestamptz
);

create index push_subscriptions_boat_idx
  on public.push_subscriptions (boat_id, user_id)
  where expired_at is null;

alter table public.push_subscriptions enable row level security;

-- Read: partners may see that a crewmate has notifications on, which is what
-- lets the UI say "3 מכשירים" honestly. The keys are not secrets — they are
-- write-only material for the push service — and the send happens server-side
-- with the service role regardless.
create policy "members read push subscriptions"
  on public.push_subscriptions for select to authenticated
  using (public.is_boat_member(boat_id));

-- Write: your own rows only. See the note above.
create policy "own push subscription insert"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and public.is_boat_member(boat_id));

create policy "own push subscription update"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid() and public.is_boat_member(boat_id))
  with check (user_id = auth.uid() and public.is_boat_member(boat_id));

create policy "own push subscription delete"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
