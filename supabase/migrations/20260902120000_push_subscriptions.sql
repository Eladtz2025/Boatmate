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
-- Permission model: **your own rows, and nothing else.** This is the one table
-- in the schema that does not follow "all partners equal".
--
-- Every other boat-scoped table lets any partner read and write any row, which
-- is right for shared money, shared documents and a shared calendar — those are
-- the crew's joint business. A push subscription is not. It is a delivery
-- address for a specific person's specific device: reading one tells you which
-- devices a partner owns and when they registered them, and writing one is the
-- ability to make their phone buzz at your choosing. Neither is anybody else's
-- business, including a crewmate's.
--
-- Nothing is lost by closing it, because no client ever needs to read another
-- partner's row: `notifyBoat()` (src/lib/push.ts) sends through the service
-- role, which bypasses RLS entirely. The browser only ever writes its own
-- subscription and deletes it again.
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

-- Read: your own devices only. A crewmate's endpoints are not readable, and
-- there is no client that wants them — the send is a service-role job.
create policy "own push subscription select"
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

-- Insert: for yourself, on a boat you actually belong to. Membership is still
-- checked so a row cannot be parked against a boat the caller has nothing to
-- do with, which would put an endpoint in that crew's notification fan-out.
create policy "own push subscription insert"
  on public.push_subscriptions for insert to authenticated
  with check (user_id = auth.uid() and public.is_boat_member(boat_id));

-- Update: your own rows, and you may not hand one to somebody else. `using`
-- gates which rows you may touch; `with check` gates what they may become —
-- without the second, an update could move a row onto another user_id.
create policy "own push subscription update"
  on public.push_subscriptions for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.is_boat_member(boat_id));

create policy "own push subscription delete"
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());
