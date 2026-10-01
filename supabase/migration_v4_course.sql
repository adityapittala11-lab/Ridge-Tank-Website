-- =====================================================================
-- Ridge Tank v4: Tank Academy progress
-- Run once in Supabase > SQL Editor. Safe to run again.
-- One row per finished shark round or weekly challenge. Only scores are stored, never what a member wrote.
-- =====================================================================

create table if not exists public.course_rounds (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  kind text not null check (kind in ('level', 'weekly')),
  item int not null check (item between 0 and 40),
  score int not null check (score between 0 and 20),
  stars int not null default 0 check (stars between 0 and 3),
  passed boolean not null,
  breakdown jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists course_rounds_member_idx on public.course_rounds (member_id, created_at);
alter table public.course_rounds enable row level security;

-- Members see and add only their own rounds. Officers see everyone's and can remove rows.
drop policy if exists "course_rounds: read own or officer" on public.course_rounds;
create policy "course_rounds: read own or officer" on public.course_rounds
  for select using (member_id = public.my_member_id() or public.is_admin());

drop policy if exists "course_rounds: add own" on public.course_rounds;
create policy "course_rounds: add own" on public.course_rounds
  for insert with check (member_id = public.my_member_id());

drop policy if exists "course_rounds: officer delete" on public.course_rounds;
create policy "course_rounds: officer delete" on public.course_rounds
  for delete using (public.is_admin());

-- No more than 3 tries per level (or weekly challenge) per day, checked on the server too.
create or replace function public.course_rounds_limit()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.course_rounds
       where member_id = new.member_id and kind = new.kind and item = new.item
         and created_at >= date_trunc('day', now() at time zone 'America/Phoenix') at time zone 'America/Phoenix') >= 3 then
    raise exception 'No tries left today for this one. Come back tomorrow.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists course_rounds_limit on public.course_rounds;
create trigger course_rounds_limit before insert on public.course_rounds
  for each row execute function public.course_rounds_limit();

-- Academy leaderboard: levels passed, then XP.
-- XP per level: 100 / 150 / 200 / 250 by season, +25 for 2 stars, +60 for 3 stars. Weekly challenge: 40.
create or replace view public.course_board as
with best as (
  select member_id, kind, item, max(stars) as stars
    from public.course_rounds
   where passed
   group by member_id, kind, item
)
select m.id as member_id,
       m.name,
       count(*) filter (where b.kind = 'level')::int as levels,
       coalesce(sum(case when b.kind = 'level'
                         then (array[100, 150, 200, 250])[((b.item - 1) / 10) + 1] + (array[0, 0, 25, 60])[b.stars + 1]
                         else 40 end), 0)::int as xp
  from public.members m
  join best b on b.member_id = m.id
 group by m.id, m.name;

revoke all on public.course_board from anon;
grant select on public.course_board to authenticated;
