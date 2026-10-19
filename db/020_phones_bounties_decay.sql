-- Ridge Tank v3: phone numbers + welcome tracking, announcements, bounties, calendar events, bite decay.
-- Safe to re-run.

-- =====================================================================
-- Phone numbers and welcome tracking
-- =====================================================================
alter table public.members add column if not exists phone text;
alter table public.members add column if not exists whatsapp_ok boolean not null default false;
alter table public.members add column if not exists contact_status text not null default 'new';
alter table public.members add column if not exists source text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_contact_status_check') then
    alter table public.members add constraint members_contact_status_check
      check (contact_status in ('new', 'messaged', 'in_group', 'no_whatsapp'));
  end if;
end $$;

-- Officers are already in the loop, so they don't need a welcome text.
update public.members set contact_status = 'in_group'
 where user_id in (select user_id from public.admins) and contact_status = 'new';

-- "(555) 010-0199", "555-010-0199", "+1 555 010 0199" -> "+15550100199". Anything that isn't a real number -> null.
create or replace function public.clean_phone(p text)
returns text language sql immutable as $$
  select case
    when p is null or btrim(p) = '' then null
    when length(regexp_replace(p, '\D', '', 'g')) = 10 then '+1' || regexp_replace(p, '\D', '', 'g')
    when length(regexp_replace(p, '\D', '', 'g')) = 11 and left(regexp_replace(p, '\D', '', 'g'), 1) = '1'
      then '+' || regexp_replace(p, '\D', '', 'g')
    when btrim(p) like '+%' and length(regexp_replace(p, '\D', '', 'g')) between 8 and 15
      then '+' || regexp_replace(p, '\D', '', 'g')
    else null
  end;
$$;

-- Sign-up now takes a phone number. If an officer already added this person (for example from the
-- Google Form) and their confirmed email matches, this links to that row instead of making a duplicate.
drop function if exists public.register_member(text, text, text);
create or replace function public.register_member(
  p_name text, p_grade text, p_ref text default null, p_phone text default null, p_whatsapp boolean default false)
returns public.members language plpgsql security definer set search_path = public as $$
declare
  m public.members;
  ref_id uuid;
  ph text;
  my_email text;
  my_confirmed boolean;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into m from public.members where user_id = auth.uid();
  if found then return m; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Please enter your name.'; end if;

  ph := public.clean_phone(p_phone);
  if coalesce(btrim(p_phone), '') <> '' and ph is null then
    raise exception 'That phone number doesn''t look right.';
  end if;

  select email, email_confirmed_at is not null into my_email, my_confirmed from auth.users where id = auth.uid();

  if coalesce(btrim(p_ref), '') <> '' then
    select id into ref_id from public.members
     where lower(login_code) = lower(btrim(p_ref)) and user_id is not null;
  end if;

  if my_confirmed and my_email is not null then
    update public.members
       set user_id = auth.uid(),
           name = btrim(p_name),
           grade = coalesce(nullif(btrim(p_grade), ''), grade),
           phone = coalesce(ph, phone),
           whatsapp_ok = whatsapp_ok or coalesce(p_whatsapp, false),
           referred_by = coalesce(referred_by, ref_id)
     where id = (select id from public.members
                  where user_id is null and email is not null and lower(email) = lower(my_email)
                  order by created_at limit 1)
    returning * into m;
    if found then return m; end if;
  end if;

  insert into public.members (name, grade, email, user_id, card_status, referred_by, phone, whatsapp_ok, source)
  values (btrim(p_name), nullif(btrim(p_grade), ''), my_email, auth.uid(), 'pending', ref_id, ph,
          coalesce(p_whatsapp, false), 'website')
  returning * into m;
  return m;
end;
$$;

drop function if exists public.update_my_profile(text, text);
create or replace function public.update_my_profile(
  p_name text, p_grade text, p_phone text default null, p_whatsapp boolean default null)
returns public.members language plpgsql security definer set search_path = public as $$
declare
  m public.members;
  ph text;
begin
  if p_phone is not null and btrim(p_phone) <> '' then
    ph := public.clean_phone(p_phone);
    if ph is null then raise exception 'That phone number doesn''t look right.'; end if;
  end if;
  update public.members
     set name = coalesce(nullif(btrim(p_name), ''), name),
         grade = nullif(btrim(p_grade), ''),
         phone = case when p_phone is null then phone when btrim(p_phone) = '' then null else ph end,
         whatsapp_ok = coalesce(p_whatsapp, whatsapp_ok)
   where user_id = auth.uid()
  returning * into m;
  if not found then raise exception 'No member profile is linked to this account.'; end if;
  return m;
end;
$$;

-- =====================================================================
-- Calendar: meetings can now be plain events, with a time and a description
-- =====================================================================
alter table public.meetings add column if not exists kind text not null default 'meeting';
alter table public.meetings add column if not exists start_time time;
alter table public.meetings add column if not exists end_time time;
alter table public.meetings add column if not exists description text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'meetings_kind_check') then
    alter table public.meetings add constraint meetings_kind_check check (kind in ('meeting', 'event'));
  end if;
end $$;

-- =====================================================================
-- Announcements
-- =====================================================================
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  body text not null default '' check (char_length(body) <= 4000),
  pinned boolean not null default false,
  author_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists announcements_order_idx on public.announcements (pinned desc, created_at desc);
alter table public.announcements enable row level security;

-- =====================================================================
-- Bounties (challenges) and claims
-- =====================================================================
create table if not exists public.bounties (
  id bigint generated always as identity primary key,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  description text not null default '' check (char_length(description) <= 1000),
  points integer not null check (points between 1 and 1000),
  proof text not null default 'note' check (proof in ('none', 'note', 'link')),
  max_per_member integer not null default 1 check (max_per_member >= 1),
  max_total integer check (max_total is null or max_total >= 1),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.bounties enable row level security;

create table if not exists public.bounty_claims (
  id bigint generated always as identity primary key,
  bounty_id bigint not null references public.bounties(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  note text check (note is null or char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_note text
);
create index if not exists bounty_claims_bounty_idx on public.bounty_claims (bounty_id);
create index if not exists bounty_claims_member_idx on public.bounty_claims (member_id);
alter table public.bounty_claims enable row level security;

-- How many spots are taken, without exposing who claimed what.
create or replace view public.bounty_counts as
  select bounty_id, count(*) filter (where status <> 'rejected')::int as taken
    from public.bounty_claims group by bounty_id;

create or replace function public.claim_bounty(p_bounty_id bigint, p_note text default null)
returns public.bounty_claims language plpgsql security definer set search_path = public as $$
declare
  b public.bounties;
  me uuid := public.my_member_id();
  mine int;
  total int;
  c public.bounty_claims;
begin
  if me is null then raise exception 'Finish setting up your member profile first.'; end if;
  perform pg_advisory_xact_lock(p_bounty_id);
  select * into b from public.bounties where id = p_bounty_id;
  if not found or not b.active then raise exception 'That bounty isn''t open.'; end if;
  if b.ends_at is not null and now() > b.ends_at then raise exception 'That bounty has ended.'; end if;
  if b.proof <> 'none' and coalesce(btrim(p_note), '') = '' then
    raise exception 'Add a short note so the officers can check it.';
  end if;
  select count(*) into mine from public.bounty_claims
   where bounty_id = b.id and member_id = me and status <> 'rejected';
  if mine >= b.max_per_member then raise exception 'You already claimed this one.'; end if;
  if b.max_total is not null then
    select count(*) into total from public.bounty_claims where bounty_id = b.id and status <> 'rejected';
    if total >= b.max_total then raise exception 'All the spots are taken.'; end if;
  end if;
  insert into public.bounty_claims (bounty_id, member_id, note)
  values (b.id, me, nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning * into c;
  return c;
end;
$$;

create or replace function public.review_claim(p_claim_id bigint, p_approve boolean, p_note text default null)
returns public.bounty_claims language plpgsql security definer set search_path = public as $$
declare
  c public.bounty_claims;
  b public.bounties;
begin
  if not public.is_admin() then raise exception 'Officers only.'; end if;
  select * into c from public.bounty_claims where id = p_claim_id for update;
  if not found then raise exception 'Claim not found.'; end if;
  select * into b from public.bounties where id = c.bounty_id;
  update public.bounty_claims
     set status = case when p_approve then 'approved' else 'rejected' end,
         points_awarded = case when p_approve then b.points else 0 end,
         reviewed_at = now(),
         reviewed_note = nullif(btrim(coalesce(p_note, '')), '')
   where id = p_claim_id
  returning * into c;
  return c;
end;
$$;

-- =====================================================================
-- Settings (bite decay rules live here so officers can change them)
-- =====================================================================
create table if not exists public.settings (
  key text primary key,
  value text not null
);
alter table public.settings enable row level security;
insert into public.settings (key, value) values
  ('decay_grace_days', '30'),
  ('decay_pct_per_day', '0.5'),
  ('decay_max_pct', '50')
on conflict (key) do nothing;

-- =====================================================================
-- Points with bite decay.
-- A "meeting" here means a row with kind = 'meeting' (events don't reset the clock).
-- After `decay_grace_days` without one, you lose `decay_pct_per_day` percent per day of what you had
-- when you last showed up. Showing up stops it. Total loss is capped at `decay_max_pct` of all you earned.
-- =====================================================================
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

-- =====================================================================
-- Starter bounties (officers can edit or delete these)
-- =====================================================================
insert into public.bounties (title, description, points, proof, max_per_member, max_total)
select v.* from (values
  ('Bring a friend', 'Get a friend to join Ridge Tank and show up to a meeting. Put their name in the note.', 20, 'note', 5, null::int),
  ('Find us a speaker', 'Know a business owner or entrepreneur who could talk to the club? Tell us who they are and how to reach them.', 30, 'note', 3, null::int),
  ('Early bird', 'Get to a meeting 10 minutes early and help set up. Claim it once you''re there.', 10, 'none', 1, 10),
  ('Share the club', 'Post or share Ridge Tank on your story or in a group chat, then paste a link or describe where.', 10, 'link', 1, null::int)
) as v(title, description, points, proof, max_per_member, max_total)
where not exists (select 1 from public.bounties b where b.title = v.title);

-- =====================================================================
-- Access rules
-- =====================================================================
drop policy if exists "announcements read" on public.announcements;
drop policy if exists "announcements admin" on public.announcements;
create policy "announcements read" on public.announcements for select to authenticated using (true);
create policy "announcements admin" on public.announcements for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "bounties read" on public.bounties;
drop policy if exists "bounties admin" on public.bounties;
create policy "bounties read" on public.bounties for select to authenticated using (active or public.is_admin());
create policy "bounties admin" on public.bounties for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "claims read" on public.bounty_claims;
drop policy if exists "claims admin" on public.bounty_claims;
create policy "claims read" on public.bounty_claims for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy "claims admin" on public.bounty_claims for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "settings read" on public.settings;
drop policy if exists "settings admin" on public.settings;
create policy "settings read" on public.settings for select to authenticated using (true);
create policy "settings admin" on public.settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

revoke all on public.bounty_counts from anon;
grant select on public.bounty_counts to authenticated;
grant select on public.member_points, public.member_tiers to authenticated;
revoke all on public.member_points from anon;

revoke execute on function public.register_member(text, text, text, text, boolean) from public, anon;
revoke execute on function public.update_my_profile(text, text, text, boolean) from public, anon;
revoke execute on function public.claim_bounty(bigint, text) from public, anon;
revoke execute on function public.review_claim(bigint, boolean, text) from public, anon;
revoke execute on function public.clean_phone(text) from public, anon;
grant execute on function public.register_member(text, text, text, text, boolean) to authenticated;
grant execute on function public.update_my_profile(text, text, text, boolean) to authenticated;
grant execute on function public.claim_bounty(bigint, text) to authenticated;
grant execute on function public.review_claim(bigint, boolean, text) to authenticated;
grant execute on function public.clean_phone(text) to authenticated;

-- =====================================================================
-- The club currency is now called "bites" (badge descriptions)
-- =====================================================================
update public.badges set description = 'Earn the most bites in a session' where name = 'Crowd Favorite';
update public.badges set description = 'Invest your bites in 5 sessions' where name = 'Active Investor';
