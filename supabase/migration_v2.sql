-- Ridge Tank v2: accounts, chat, admin role, locked-down access.
-- Safe to re-run.

-- 1) Members: account + card fields
alter table public.members add column if not exists user_id uuid unique references auth.users(id) on delete set null;
alter table public.members add column if not exists email text;
alter table public.members add column if not exists grade text;
alter table public.members add column if not exists login_code text;
alter table public.members add column if not exists card_status text not null default 'pending';
update public.members set card_status = 'linked' where card_uid is not null;

alter table public.meetings add column if not exists location text;

-- 2) Admin role
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create or replace function public.my_member_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.members where user_id = auth.uid() limit 1;
$$;

-- 3) Member codes: a word + 4 digits (e.g. Falcon4829)
create or replace function public.generate_login_code()
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  words text[] := array['Falcon','Tiger','Marlin','Orca','Summit','Harbor','Comet','Ember','Canyon','Cobalt',
                        'Onyx','Raven','Delta','Nova','Atlas','Cedar','Vector','Pioneer','Beacon','Granite',
                        'Voyage','Titan','Sierra','Drift','Quartz','Horizon','Glacier','Mako','Thunder','Anchor'];
  candidate text;
begin
  loop
    candidate := words[1 + floor(random() * array_length(words, 1))::int]
                 || lpad(floor(random() * 10000)::int::text, 4, '0');
    exit when not exists (select 1 from public.members where lower(login_code) = lower(candidate));
  end loop;
  return candidate;
end;
$$;

update public.members set login_code = public.generate_login_code() where login_code is null;
alter table public.members alter column login_code set default public.generate_login_code();
create unique index if not exists members_login_code_key on public.members (lower(login_code));

-- 4) Self-service functions (members never write the members table directly)
drop function if exists public.register_member(text, text);
create or replace function public.register_member(p_name text, p_grade text, p_ref text default null)
returns public.members language plpgsql security definer set search_path = public as $$
declare
  m public.members;
  ref_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into m from public.members where user_id = auth.uid();
  if found then return m; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'Please enter your name.'; end if;
  if coalesce(btrim(p_ref), '') <> '' then
    select id into ref_id from public.members
     where lower(login_code) = lower(btrim(p_ref)) and user_id is not null;
  end if;
  insert into public.members (name, grade, email, user_id, card_status, referred_by)
  values (btrim(p_name), nullif(btrim(p_grade), ''),
          (select email from auth.users where id = auth.uid()), auth.uid(), 'pending', ref_id)
  returning * into m;
  return m;
end;
$$;

create or replace function public.claim_card(p_code text)
returns public.members language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'This account is already linked to a member profile.';
  end if;
  update public.members
     set user_id = auth.uid(),
         email = coalesce(email, (select email from auth.users where id = auth.uid()))
   where lower(login_code) = lower(btrim(p_code)) and user_id is null
  returning * into m;
  if not found then raise exception 'That code doesn''t match an unclaimed Ridge Tank card.'; end if;
  return m;
end;
$$;

create or replace function public.update_my_profile(p_name text, p_grade text)
returns public.members language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  update public.members
     set name = coalesce(nullif(btrim(p_name), ''), name),
         grade = nullif(btrim(p_grade), '')
   where user_id = auth.uid()
  returning * into m;
  if not found then raise exception 'No member profile is linked to this account.'; end if;
  return m;
end;
$$;

create or replace function public.my_referral_count()
returns int language sql stable security definer set search_path = public as $$
  select count(distinct r.id)::int
    from public.members r
    join public.attendance a on a.member_id = r.id
   where r.referred_by = public.my_member_id();
$$;

-- 5) Name directory for chat (id + name only, nothing private)
create or replace view public.member_directory as
  select id, name from public.members;

-- 6) Chat
create table if not exists public.messages (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index if not exists messages_created_at_idx on public.messages (created_at desc);
alter table public.messages enable row level security;

create or replace function public.messages_set_sender()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.user_id := auth.uid();
  new.member_id := public.my_member_id();
  new.created_at := now();
  if new.user_id is null or new.member_id is null then
    raise exception 'Finish setting up your member profile before chatting.';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_set_sender on public.messages;
create trigger messages_set_sender before insert on public.messages
  for each row execute function public.messages_set_sender();

-- 7) Badge catalog
alter table public.badges add column if not exists category text;
alter table public.badges add column if not exists sort_order int;
insert into public.badges (name, description, trigger_type, threshold, category, sort_order)
select v.* from (values
  ('First Bite',          'Attend your first meeting',                    'attendance_count', 1,  'Attendance', 1),
  ('Circling',            'Attend 5 meetings',                            'attendance_count', 5,  'Attendance', 2),
  ('Feeding Frenzy',      'Attend 10 meetings',                           'attendance_count', 10, 'Attendance', 3),
  ('Apex',                'Attend 25 meetings',                           'attendance_count', 25, 'Attendance', 4),
  ('On the Hunt',         'Attend 5 meetings in a row',                   'streak',           5,  'Attendance', 5),
  ('Relentless',          'Attend 10 meetings in a row',                  'streak',           10, 'Attendance', 6),
  ('In the Tank',         'Pitch for the first time',                     'pitch_count',      1,  'Pitching',   7),
  ('Repeat Contender',    'Pitch 5 times',                                'pitch_count',      5,  'Pitching',   8),
  ('Podium Shark',        'Place top 3 in a Tank competition',            'placement',        3,  'Pitching',   9),
  ('Tank Champion',       'Win a Tank competition',                       'placement',        1,  'Pitching',   10),
  ('Crowd Favorite',      'Earn the most currency votes in a session',    'crowd_favorite',   1,  'Currency',   11),
  ('Active Investor',     'Vote your currency in 5 sessions',             'votes_given',      5,  'Currency',   12),
  ('Headhunter',          'Bring a friend who joins and attends',         'referral_count',   1,  'Growth',     13),
  ('Chief Talent Officer','Bring 3 friends who join and attend',          'referral_count',   3,  'Growth',     14),
  ('Boardroom',           'Win an officer election',                      'manual',           null, 'Exec',     15),
  ('Keynote',             'Present at a meeting',                         'manual',           null, 'Exec',     16),
  ('Crew',                'Help run the club',                            'manual',           null, 'Exec',     17),
  ('Founding Shark',      'One of the club''s first members',             'manual',           null, 'Exec',     18),
  ('King of the Tank',    'Finish the school year #1 on the leaderboard', 'manual',           null, 'Season',   19)
) as v(name, description, trigger_type, threshold, category, sort_order)
where not exists (select 1 from public.badges b where b.name = v.name);

-- 8) Access rules: drop the old wide-open policies
drop policy if exists "public read members"    on public.members;
drop policy if exists "insert members"         on public.members;
drop policy if exists "update members"         on public.members;
drop policy if exists "public read meetings"   on public.meetings;
drop policy if exists "insert meetings"        on public.meetings;
drop policy if exists "public read attendance" on public.attendance;
drop policy if exists "insert attendance"      on public.attendance;
drop policy if exists "public read badges"     on public.badges;
drop policy if exists "public read tiers"      on public.tiers;

-- members: you see your own row; admins see and manage everyone
drop policy if exists "members read"   on public.members;
drop policy if exists "members admin"  on public.members;
create policy "members read"  on public.members for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy "members admin" on public.members for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "meetings read"  on public.meetings;
drop policy if exists "meetings admin" on public.meetings;
create policy "meetings read"  on public.meetings for select to authenticated using (true);
create policy "meetings admin" on public.meetings for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "attendance read"  on public.attendance;
drop policy if exists "attendance admin" on public.attendance;
create policy "attendance read"  on public.attendance for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy "attendance admin" on public.attendance for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "pitches read"  on public.pitch_entries;
drop policy if exists "pitches admin" on public.pitch_entries;
create policy "pitches read"  on public.pitch_entries for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy "pitches admin" on public.pitch_entries for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "votes read"  on public.currency_votes;
drop policy if exists "votes admin" on public.currency_votes;
create policy "votes read"  on public.currency_votes for select to authenticated using (true);
create policy "votes admin" on public.currency_votes for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "badges read"  on public.badges;
drop policy if exists "badges admin" on public.badges;
create policy "badges read"  on public.badges for select to authenticated using (true);
create policy "badges admin" on public.badges for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "member_badges read"  on public.member_badges;
drop policy if exists "member_badges admin" on public.member_badges;
create policy "member_badges read"  on public.member_badges for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy "member_badges admin" on public.member_badges for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "tiers read"  on public.tiers;
drop policy if exists "tiers admin" on public.tiers;
create policy "tiers read"  on public.tiers for select to authenticated using (true);
create policy "tiers admin" on public.tiers for all    to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "messages read"   on public.messages;
drop policy if exists "messages send"   on public.messages;
drop policy if exists "messages delete" on public.messages;
create policy "messages read"   on public.messages for select to authenticated using (true);
create policy "messages send"   on public.messages for insert to authenticated with check (user_id = auth.uid());
create policy "messages delete" on public.messages for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- 9) Leaderboard + directory: logged-in members only
revoke all on public.member_points    from anon;
revoke all on public.member_tiers     from anon;
revoke all on public.member_directory from anon;
grant select on public.member_points, public.member_tiers, public.member_directory to authenticated;

revoke execute on function public.register_member(text, text, text) from public, anon;
revoke execute on function public.claim_card(text)                  from public, anon;
revoke execute on function public.update_my_profile(text, text)     from public, anon;
revoke execute on function public.my_referral_count()               from public, anon;
grant  execute on function public.register_member(text, text, text) to authenticated;
grant  execute on function public.claim_card(text)                  to authenticated;
grant  execute on function public.update_my_profile(text, text)     to authenticated;
grant  execute on function public.my_referral_count()               to authenticated;

-- 10) Live chat updates
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- After you sign up on the site, run this once to make yourself admin:
-- insert into public.admins (user_id) select id from auth.users where email = 'adityapittala.11@gmail.com' on conflict do nothing;
