-- Ridge Tank v4: the Tank Market (net worth, investing, bounties, monthly decay).
-- Run after migration_v2.sql and migration_v3.sql. Safe to re-run.
--
-- How the money works
--   Bites you earn   = check-ins + pitch results + approved bounties - monthly decay
--   Investing        = you put Bites into a pitcher. While results aren't final the stake is locked at cost.
--   When results are final a stake pays: 1st x3, 2nd x2, 3rd x1.5, pitched x0.5, didn't pitch x0.
--   Net worth        = Bites earned + investment gains/losses. The leaderboard ranks net worth.
--   Available        = net worth minus Bites currently locked in open stakes (what you can invest or lose to decay).

-- 1) Scale: 100 Bites per meeting (x10). Only touches tiers if they are still on the old scale.
update public.tiers set point_threshold = point_threshold * 10
 where (select max(point_threshold) from public.tiers) <= 500;

-- 2) Meeting switches the officers flip during the meeting
alter table public.meetings add column if not exists investing_open boolean not null default false;
alter table public.meetings add column if not exists results_final boolean not null default false;

-- 3) Bounties
create table if not exists public.bounties (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 80),
  details text,
  reward int not null check (reward > 0 and reward <= 100000),
  expires_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.bounty_claims (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (bounty_id, member_id)
);
create table if not exists public.bite_ledger (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('bounty', 'decay', 'adjust')),
  amount int not null,
  note text,
  period text,
  claim_id uuid references public.bounty_claims(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists bite_ledger_period_key on public.bite_ledger (member_id, kind, period) where period is not null;

alter table public.bounties enable row level security;
alter table public.bounty_claims enable row level security;
alter table public.bite_ledger enable row level security;

drop policy if exists "bounties read" on public.bounties;
drop policy if exists "bounties admin" on public.bounties;
create policy "bounties read"  on public.bounties for select to authenticated using (true);
create policy "bounties admin" on public.bounties for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "claims read" on public.bounty_claims;
drop policy if exists "claims admin" on public.bounty_claims;
create policy "claims read"  on public.bounty_claims for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy "claims admin" on public.bounty_claims for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "ledger read" on public.bite_ledger;
drop policy if exists "ledger admin" on public.bite_ledger;
create policy "ledger read"  on public.bite_ledger for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy "ledger admin" on public.bite_ledger for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- 4) What each stake is worth right now
create or replace view public.vote_values as
select v.id, v.from_member_id, v.to_member_id, v.meeting_id, v.amount,
       coalesce(m.results_final, false) as results_final,
       case
         when not coalesce(m.results_final, false) then v.amount::numeric
         else round(v.amount * coalesce((
           select case when p.placement = 1 then 3 when p.placement = 2 then 2 when p.placement = 3 then 1.5 else 0.5 end
             from public.pitch_entries p
            where p.meeting_id = v.meeting_id and p.member_id = v.to_member_id
            limit 1), 0))
       end as value
  from public.currency_votes v
  left join public.meetings m on m.id = v.meeting_id;

-- 5) The leaderboard: net worth for everyone (totals only, nothing private)
create or replace view public.member_standings as
select s.member_id, s.name, s.total_points, s.earned, s.gain, s.locked,
       (s.total_points - s.locked) as available,
       (select t.name from public.tiers t where t.point_threshold <= s.total_points order by t.point_threshold desc limit 1) as current_tier
  from (
    select m.id as member_id, m.name,
           e.earned, coalesce(i.gain, 0) as gain, coalesce(i.locked, 0) as locked,
           (e.earned + coalesce(i.gain, 0))::int as total_points
      from public.members m
      cross join lateral (
        select coalesce((select sum(a.points_awarded) from public.attendance a where a.member_id = m.id), 0)
             + coalesce((select sum(p.points_awarded) from public.pitch_entries p where p.member_id = m.id), 0)
             + coalesce((select sum(l.amount) from public.bite_ledger l where l.member_id = m.id), 0) as earned
      ) e
      left join (
        select from_member_id as member_id,
               sum(value - amount) as gain,
               sum(case when results_final then 0 else amount end) as locked
          from public.vote_values group by from_member_id
      ) i on i.member_id = m.id
  ) s;
grant select on public.vote_values, public.member_standings to authenticated;

-- 6) Member actions (members never write these tables directly)
create or replace function public.invest(p_to uuid, p_amount int)
returns public.currency_votes language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_member_id(); mtg public.meetings; avail int; row_ public.currency_votes;
begin
  if me is null then raise exception 'Finish joining first.'; end if;
  select * into mtg from public.meetings where investing_open order by meeting_date desc limit 1;
  if not found then raise exception 'Investing isn''t open right now.'; end if;
  if p_to is null or p_to = me then raise exception 'Pick someone else to invest in.'; end if;
  if not exists (select 1 from public.members where id = p_to) then raise exception 'Pick a member.'; end if;
  if p_amount is null or p_amount < 1 then raise exception 'Enter an amount of at least 1 Bite.'; end if;
  select available into avail from public.member_standings where member_id = me;
  if coalesce(avail, 0) < p_amount then raise exception 'You only have % Bites available.', greatest(coalesce(avail, 0), 0); end if;
  insert into public.currency_votes (from_member_id, to_member_id, meeting_id, amount)
  values (me, p_to, mtg.id, p_amount) returning * into row_;
  return row_;
end; $$;
grant execute on function public.invest(uuid, int) to authenticated;

create or replace function public.claim_bounty(p_bounty uuid)
returns public.bounty_claims language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_member_id(); b public.bounties; c public.bounty_claims;
begin
  if me is null then raise exception 'Finish joining first.'; end if;
  select * into b from public.bounties where id = p_bounty and active and (expires_on is null or expires_on >= current_date);
  if not found then raise exception 'That bounty isn''t open anymore.'; end if;
  insert into public.bounty_claims (bounty_id, member_id) values (p_bounty, me)
  on conflict (bounty_id, member_id) do nothing returning * into c;
  if not found then raise exception 'You already claimed this one.'; end if;
  return c;
end; $$;
grant execute on function public.claim_bounty(uuid) to authenticated;

-- 7) Officer actions
create or replace function public.decide_claim(p_claim uuid, p_ok boolean)
returns public.bounty_claims language plpgsql security definer set search_path = public as $$
declare c public.bounty_claims; b public.bounties;
begin
  if not public.is_admin() then raise exception 'Officers only.'; end if;
  select * into c from public.bounty_claims where id = p_claim for update;
  if not found then raise exception 'Claim not found.'; end if;
  if c.status <> 'pending' then raise exception 'Already decided.'; end if;
  update public.bounty_claims set status = case when p_ok then 'approved' else 'rejected' end, decided_at = now()
   where id = p_claim returning * into c;
  if p_ok then
    select * into b from public.bounties where id = c.bounty_id;
    insert into public.bite_ledger (member_id, kind, amount, note, claim_id) values (c.member_id, 'bounty', b.reward, b.title, c.id);
  end if;
  return c;
end; $$;
grant execute on function public.decide_claim(uuid, boolean) to authenticated;

-- Monthly decay: takes p_pct percent of each member's AVAILABLE Bites. Once per member per period ('YYYY-MM').
create or replace function public.apply_decay(p_period text, p_pct numeric default 10)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Officers only.'; end if;
  if p_pct <= 0 or p_pct > 50 then raise exception 'Use a percent between 1 and 50.'; end if;
  with ins as (
    insert into public.bite_ledger (member_id, kind, amount, note, period)
    select member_id, 'decay', -floor(available * p_pct / 100)::int, 'Monthly decay (' || p_pct || '%)', p_period
      from public.member_standings
     where floor(available * p_pct / 100) >= 1
    on conflict do nothing
    returning 1)
  select count(*) into n from ins;
  return n;
end; $$;
grant execute on function public.apply_decay(text, numeric) to authenticated;
