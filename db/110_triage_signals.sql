-- Bounty claim triage (AI verdicts), account duplicate signals, and a reset for bounty claims. Safe to re-run.

-- ---------------------------------------------------------------------
-- AI triage of claims. 'junk' claims are hidden from the officer's main queue (but never deleted automatically).
-- ---------------------------------------------------------------------
alter table public.bounty_claims add column if not exists ai_verdict text;
alter table public.bounty_claims add column if not exists ai_reason text;
alter table public.bounty_claims add column if not exists ai_at timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bounty_claims_ai_verdict_check') then
    alter table public.bounty_claims add constraint bounty_claims_ai_verdict_check check (ai_verdict is null or ai_verdict in ('genuine', 'unsure', 'junk'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Duplicate-account signals. Stored in the private "auth" schema, which the site's table access never reaches.
-- device_id: a random id the browser makes once. ip_hash: a scrambled network address (never the address itself).
-- ---------------------------------------------------------------------
create table if not exists auth.account_signals (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text not null default '',
  ip_hash text not null default '',
  seen_at timestamptz not null default now(),
  primary key (user_id, device_id, ip_hash)
);
create index if not exists account_signals_device_idx on auth.account_signals (device_id) where device_id <> '';
create index if not exists account_signals_ip_idx on auth.account_signals (ip_hash) where ip_hash <> '';

-- Officers only: which members look like the same person as another member.
--   'device'  = same browser (strong hint)
--   'network' = same internet connection (weak: everyone on the school Wi-Fi shares one)
create or replace function public.duplicate_signals()
returns table (member_id uuid, other_id uuid, other_name text, other_joined timestamptz, kind text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Officers only.'; end if;
  return query
  with pairs as (
    select s1.user_id as u1, s2.user_id as u2,
           bool_or(s1.device_id <> '' and s1.device_id = s2.device_id) as same_device,
           bool_or(s1.ip_hash <> '' and s1.ip_hash = s2.ip_hash) as same_net
      from auth.account_signals s1
      join auth.account_signals s2 on s1.user_id <> s2.user_id
       and ((s1.device_id <> '' and s1.device_id = s2.device_id) or (s1.ip_hash <> '' and s1.ip_hash = s2.ip_hash))
     group by s1.user_id, s2.user_id
  )
  select m1.id, m2.id, m2.name, m2.created_at,
         case when p.same_device then 'device' else 'network' end
    from pairs p
    join public.members m1 on m1.user_id = p.u1
    join public.members m2 on m2.user_id = p.u2;
end;
$$;
revoke execute on function public.duplicate_signals() from public, anon;
grant execute on function public.duplicate_signals() to authenticated;

-- ---------------------------------------------------------------------
-- Officers: wipe every bounty claim (approved ones too, so their Bites go away) and start fresh.
-- The bounties themselves stay.
-- ---------------------------------------------------------------------
create or replace function public.reset_bounty_claims()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Officers only.'; end if;
  delete from public.bounty_claims;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.reset_bounty_claims() from public, anon;
grant execute on function public.reset_bounty_claims() to authenticated;
