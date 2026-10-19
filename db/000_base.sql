-- Ridge Tank database, step 0: the base tables and the small login layer the later files expect.
-- This runs automatically the first time the site talks to its database (api/_pg.js). Safe to re-run.
-- Works on any plain Postgres (Neon, Vercel Postgres, local).

-- Two roles stand in for "logged out" and "logged in". The server switches into one of them for every request,
-- so the row level security rules in the later files decide who can see what.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
end $$;
do $$
begin
  execute format('grant anon, authenticated to %I', current_user);
exception when others then null;
end $$;

-- Accounts. The server stores passwords here (scrypt hashes, never plain text).
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  encrypted_password text not null,
  email_confirmed_at timestamptz default now(),
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create unique index if not exists users_email_lower_key on auth.users (lower(email));

-- The id of whoever is making the current request (the server sets it for each request).
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

-- Core tables
create table if not exists public.tiers (
  id serial primary key,
  name text not null,
  point_threshold int not null
);
insert into public.tiers (name, point_threshold)
select v.* from (values ('Reef Shark', 0), ('Tiger Shark', 1000), ('Great White', 2500), ('Megalodon', 5000)) as v(name, point_threshold)
where not exists (select 1 from public.tiers);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  card_uid text unique,
  join_date date not null default current_date,
  referred_by uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  meeting_date date not null,
  name text,
  season text,
  created_at timestamptz not null default now()
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  meeting_id uuid not null references public.meetings(id) on delete cascade,
  points_awarded int not null default 100,
  tapped_at timestamptz not null default now(),
  unique (member_id, meeting_id)
);

create table if not exists public.pitch_entries (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  placement int,
  points_awarded int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.currency_votes (
  id uuid primary key default gen_random_uuid(),
  from_member_id uuid not null references public.members(id) on delete cascade,
  to_member_id uuid not null references public.members(id) on delete cascade,
  meeting_id uuid references public.meetings(id) on delete cascade,
  amount int not null check (amount > 0),
  created_at timestamptz not null default now()
);

create table if not exists public.badges (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  trigger_type text,
  threshold int
);

create table if not exists public.member_badges (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  badge_id uuid not null references public.badges(id) on delete cascade,
  earned_at timestamptz not null default now(),
  unique (member_id, badge_id)
);

-- Row level security ON for every core table. The access rules (policies) are in 010_accounts_chat.sql.
-- With it on and no matching rule, a table is closed, so nothing is exposed by accident.
alter table public.tiers enable row level security;
alter table public.members enable row level security;
alter table public.meetings enable row level security;
alter table public.attendance enable row level security;
alter table public.pitch_entries enable row level security;
alter table public.currency_votes enable row level security;
alter table public.badges enable row level security;
alter table public.member_badges enable row level security;

-- Points views. The later files replace member_points with the version that includes Bite decay,
-- so these are only created the first time (re-running this file must not undo that).
do $$
begin
  if to_regclass('public.member_points') is null then
    create view public.member_points as
      select m.id as member_id, m.name,
             (coalesce((select sum(a.points_awarded) from public.attendance a where a.member_id = m.id), 0)
            + coalesce((select sum(p.points_awarded) from public.pitch_entries p where p.member_id = m.id), 0))::bigint as total_points
        from public.members m;
  end if;
  if to_regclass('public.member_tiers') is null then
    create view public.member_tiers as
      select p.member_id, p.name, p.total_points,
             (select t.name from public.tiers t where t.point_threshold <= p.total_points order by t.point_threshold desc limit 1) as current_tier
        from public.member_points p;
  end if;
end $$;
