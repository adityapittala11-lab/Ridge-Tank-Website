-- Tank Academy, part 3: 80 levels, and Academy levels now earn Bites.
-- Levels 41-80 are the new ones. The number members see on screen is a level's place in the course (js/course-data.js);
-- "item" is the id its rounds are saved under, which never changes, so old progress keeps counting.
-- Both sets run 10 per season by id: ids 1-10 and 41-50 are Spark, 11-20 and 51-60 Build, 21-30 and 61-70 Sell, 31-40 and 71-80 Grow.
-- Bites per level: 20 / 30 / 40 / 50 by season, +10 for 2 stars, +25 for 3 stars. A weekly challenge: 15.
-- Academy Bites count in the Bites total (member_points), the tiers and the leaderboard, like meeting Bites.
-- Rounds passed with the test cheat code (breakdown.cheat) unlock levels but earn no Bites and don't rank on the board.

alter table public.course_rounds drop constraint if exists course_rounds_item_check;
alter table public.course_rounds add constraint course_rounds_item_check check (item between 0 and 80);

-- Academy board: levels passed, then Bites earned in the Academy (the column keeps its old name, xp).
create or replace view public.course_board as
with best as (
  select member_id, kind, item, max(stars) as stars
    from public.course_rounds
   where passed and coalesce(breakdown->>'cheat', '') <> 'true'
   group by member_id, kind, item
)
select m.id as member_id,
       m.name,
       count(*) filter (where b.kind = 'level')::int as levels,
       coalesce(sum(case when b.kind = 'level'
                         then (array[20, 30, 40, 50])[((greatest(b.item, 1) - 1) % 40) / 10 + 1] + (array[0, 0, 10, 25])[least(greatest(b.stars, 0), 3) + 1]
                         else 15 end), 0)::int as xp
  from public.members m
  join best b on b.member_id = m.id
 group by m.id, m.name;

revoke all on public.course_board from anon;
grant select on public.course_board to authenticated;

-- The Bites total now includes the Academy (same columns as before).
create or replace view public.member_points as
with cfg as (
  select coalesce((select nullif(value, '')::numeric from public.settings where key = 'decay_grace_days'), 30) as grace,
         coalesce((select nullif(value, '')::numeric from public.settings where key = 'decay_pct_per_day'), 0.5) / 100 as rate,
         coalesce((select nullif(value, '')::numeric from public.settings where key = 'decay_max_pct'), 50) / 100 as maxp
),
ev as (
  select a.member_id, mt.meeting_date as d, a.points_awarded::numeric as pts
    from public.attendance a join public.meetings mt on mt.id = a.meeting_id
  union all
  select p.member_id, coalesce(mt.meeting_date, p.created_at::date), p.points_awarded::numeric
    from public.pitch_entries p left join public.meetings mt on mt.id = p.meeting_id
  union all
  select c.member_id, c.reviewed_at::date, c.points_awarded::numeric
    from public.bounty_claims c where c.status = 'approved' and c.reviewed_at is not null
  union all
  select j.member_id, j.created_at::date, j.amount::numeric
    from public.bite_adjustments j
  union all
  -- Tank Academy: each level or weekly challenge counts once, on the day it was first passed, with its best stars.
  select r.member_id, r.first_at::date,
         (case when r.kind = 'level'
               then (array[20, 30, 40, 50])[((greatest(r.item, 1) - 1) % 40) / 10 + 1] + (array[0, 0, 10, 25])[least(greatest(r.stars, 0), 3) + 1]
               else 15 end)::numeric
    from (select member_id, kind, item, max(stars) as stars, min(created_at) as first_at
            from public.course_rounds
           where passed and coalesce(breakdown->>'cheat', '') <> 'true'
           group by member_id, kind, item) r
),
gross as (
  select member_id, sum(pts) as earned from ev group by member_id
),
showed as (
  select distinct a.member_id, mt.meeting_date as d
    from public.attendance a join public.meetings mt on mt.id = a.meeting_id
   where mt.kind = 'meeting'
),
anchor as (
  select m.id as member_id,
         least(coalesce(m.join_date, m.created_at::date),
               coalesce((select min(s.d) from showed s where s.member_id = m.id), coalesce(m.join_date, m.created_at::date))) as d
    from public.members m
  union
  select member_id, d from showed
),
span as (
  select member_id, d as start_d,
         coalesce(lead(d) over (partition by member_id order by d), current_date) as end_d
    from anchor
),
cost as (
  select s.member_id,
         sum(greatest(0, (s.end_d - s.start_d) - cfg.grace) * cfg.rate
             * coalesce((select sum(e.pts) from ev e where e.member_id = s.member_id and e.d <= s.start_d), 0)) as decay
    from span s cross join cfg
   group by s.member_id
)
select m.id as member_id,
       m.name,
       greatest(0, round(coalesce(g.earned, 0)) - round(least(coalesce(c.decay, 0), coalesce(g.earned, 0) * cfg.maxp)))::bigint as total_points,
       round(coalesce(g.earned, 0))::bigint as earned_points,
       round(least(coalesce(c.decay, 0), coalesce(g.earned, 0) * cfg.maxp))::bigint as decay_points
  from public.members m
  cross join cfg
  left join gross g on g.member_id = m.id
  left join cost c on c.member_id = m.id;
