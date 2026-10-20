-- Officer Bite adjustments: add or remove Bites for a member (with a reason). They count like any other Bites.
-- Only officers can add them. Members can see their own so they know why their total changed.
create table if not exists public.bite_adjustments (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  amount int not null check (amount <> 0 and amount between -100000 and 100000),
  reason text not null default '' check (char_length(reason) <= 200),
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists bite_adjustments_member_idx on public.bite_adjustments (member_id, created_at);
alter table public.bite_adjustments enable row level security;
drop policy if exists "adjustments read" on public.bite_adjustments;
create policy "adjustments read" on public.bite_adjustments for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
drop policy if exists "adjustments admin" on public.bite_adjustments;
create policy "adjustments admin" on public.bite_adjustments for all to authenticated using (public.is_admin()) with check (public.is_admin());
create or replace function public.bite_adjustments_stamp() returns trigger language plpgsql security definer set search_path = public as $$
begin new.created_by := auth.uid(); return new; end $$;
drop trigger if exists bite_adjustments_stamp on public.bite_adjustments;
create trigger bite_adjustments_stamp before insert on public.bite_adjustments for each row execute function public.bite_adjustments_stamp();

-- The Bites total now includes adjustments (same columns as before).
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

