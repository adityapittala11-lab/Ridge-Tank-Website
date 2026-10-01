-- Ridge Tank v5: the Tank Market (invest Bites in pitches, net worth leaderboard).
-- Run after migration_v2.sql and migration_v3.sql. Safe to re-run.
--
-- This replaces the earlier migration_v4.sql, which was never run. That file made its own bounty tables and a
-- monthly decay, which clash with the ones in migration_v3.sql. Here the market is built ON TOP of v3:
--   Bounties        = migration_v3.sql (bounties, bounty_claims, claim_bounty, review_claim). Not changed here.
--   Bite decay      = migration_v3.sql (member_points). Automatic: skip meetings for a month and Bites fade daily.
--   Bites you earn  = check-ins + pitch results + approved bounties - decay   (that is member_points.total_points)
--   Investing       = you put Bites into a pitcher. While results aren't final the stake is locked at cost.
--   Payout          = when results are final: 1st x3, 2nd x2, 3rd x1.5, pitched x0.5, didn't pitch x0.
--   Net worth       = Bites you earned + investment gains/losses. The leaderboard ranks net worth.
--   Available       = net worth minus Bites locked in open stakes (what you can still invest).

-- 1) Scale: 100 Bites per meeting (x10). Only touches rows that are still on the old scale.
update public.tiers set point_threshold = point_threshold * 10
 where (select max(point_threshold) from public.tiers) <= 500;
update public.bounties b set points = b.points * 10
 where b.points <= 30
   and b.title in ('Bring a friend', 'Find us a speaker', 'Early bird', 'Share the club')
   and not exists (select 1 from public.bounty_claims c where c.bounty_id = b.id);

-- 2) Switches the officers flip during the meeting
alter table public.meetings add column if not exists investing_open boolean not null default false;
alter table public.meetings add column if not exists results_final boolean not null default false;

-- 3) What each stake is worth right now
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

-- 4) The leaderboard: net worth for everyone (totals only, nothing private)
create or replace view public.member_standings as
select s.member_id, s.name, s.total_points, s.earned, s.gain, s.locked,
       (s.total_points - s.locked) as available,
       (select t.name from public.tiers t where t.point_threshold <= s.total_points order by t.point_threshold desc limit 1) as current_tier
  from (
    select p.member_id, p.name,
           p.total_points::int as earned,
           coalesce(i.gain, 0) as gain,
           coalesce(i.locked, 0) as locked,
           (p.total_points + coalesce(i.gain, 0))::int as total_points
      from public.member_points p
      left join (
        select from_member_id as member_id,
               sum(value - amount) as gain,
               sum(case when results_final then 0 else amount end) as locked
          from public.vote_values group by from_member_id
      ) i on i.member_id = p.member_id
  ) s;

revoke all on public.vote_values, public.member_standings from anon;
grant select on public.vote_values, public.member_standings to authenticated;

-- 5) Member action (members never write currency_votes directly)
create or replace function public.invest(p_to uuid, p_amount int)
returns public.currency_votes language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_member_id(); mtg public.meetings; avail int; row_ public.currency_votes;
begin
  if me is null then raise exception 'Finish joining first.'; end if;
  perform pg_advisory_xact_lock(hashtext(me::text));   -- two quick taps can't spend the same Bites twice
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
revoke execute on function public.invest(uuid, int) from public, anon;
grant execute on function public.invest(uuid, int) to authenticated;

-- 6) Wording: it's a program, not a club
update public.badges set description = 'One of the program''s first members' where name = 'Founding Shark';
update public.badges set description = 'Help run the program' where name = 'Crew';
