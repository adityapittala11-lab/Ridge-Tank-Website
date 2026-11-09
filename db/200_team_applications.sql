-- Crew team applications (Bounties > Forms). One application per member. Each team takes 3 members.
-- Officers review them in Officer tools > Applications. Safe to re-run.
create table if not exists public.team_applications (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null unique references public.members(id) on delete cascade,
  team text not null,
  team2 text,
  grade text,
  why text not null,
  experience text not null,
  built text,
  hours text,
  parent_email text,
  agree boolean not null default false,
  status text not null default 'pending',
  officer_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists team_applications_team_idx on public.team_applications (team, status);
alter table public.team_applications enable row level security;

create or replace function public.team_applications_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare taken int;
begin
  if tg_op = 'INSERT' or not public.is_admin() then
    if tg_op = 'INSERT' then
      new.member_id := public.my_member_id();
      new.created_at := now();
      new.status := 'pending';
      new.officer_note := null;
    else
      -- A member editing their own application: only while it is still waiting.
      if old.status <> 'pending' then raise exception 'Officers already reviewed your application. Talk to an officer to change it.'; end if;
      new.member_id := old.member_id;
      new.status := old.status;
      new.officer_note := old.officer_note;
      new.created_at := old.created_at;
    end if;
    if new.member_id is null then raise exception 'Finish setting up your member profile first.'; end if;
    new.team := lower(btrim(coalesce(new.team, '')));
    new.team2 := nullif(lower(btrim(coalesce(new.team2, ''))), '');
    if new.team !~ '^[a-z]{2,20}$' then raise exception 'Pick a team.'; end if;
    if new.team2 is not null and (new.team2 !~ '^[a-z]{2,20}$' or new.team2 = new.team) then new.team2 := null; end if;
    new.why := btrim(coalesce(new.why, ''));
    new.experience := btrim(coalesce(new.experience, ''));
    if char_length(new.why) < 10 then raise exception 'Tell us why you want this team (at least one sentence).'; end if;
    if char_length(new.experience) < 3 then raise exception 'Add your experience. "None yet" is fine.'; end if;
    new.why := left(new.why, 600);
    new.experience := left(new.experience, 800);
    new.built := nullif(left(btrim(coalesce(new.built, '')), 600), '');
    new.hours := nullif(left(btrim(coalesce(new.hours, '')), 30), '');
    new.grade := nullif(left(btrim(coalesce(new.grade, '')), 20), '');
    new.parent_email := nullif(lower(btrim(coalesce(new.parent_email, ''))), '');
    if new.parent_email is not null and new.parent_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      raise exception 'That parent email doesn''t look right.';
    end if;
    if not coalesce(new.agree, false) then raise exception 'Check the box to agree to the team rules.'; end if;
  end if;

  if new.status not in ('pending', 'accepted', 'waitlist', 'rejected') then raise exception 'Unknown status.'; end if;
  new.officer_note := nullif(left(btrim(coalesce(new.officer_note, '')), 300), '');
  if new.status = 'accepted' and (tg_op = 'INSERT' or old.status is distinct from 'accepted' or old.team is distinct from new.team) then
    select count(*) into taken from public.team_applications
     where team = new.team and status = 'accepted' and id <> new.id;
    if taken >= 3 then raise exception 'That team already has 3 members. Move someone off it first.'; end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists team_applications_guard on public.team_applications;
create trigger team_applications_guard before insert or update on public.team_applications
  for each row execute function public.team_applications_guard();

drop policy if exists "team_applications read" on public.team_applications;
drop policy if exists "team_applications add" on public.team_applications;
drop policy if exists "team_applications edit" on public.team_applications;
drop policy if exists "team_applications delete" on public.team_applications;
create policy "team_applications read" on public.team_applications for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy "team_applications add" on public.team_applications for insert to authenticated with check (public.my_member_id() is not null);
create policy "team_applications edit" on public.team_applications for update to authenticated using (member_id = public.my_member_id() or public.is_admin()) with check (member_id = public.my_member_id() or public.is_admin());
create policy "team_applications delete" on public.team_applications for delete to authenticated using ((member_id = public.my_member_id() and status = 'pending') or public.is_admin());

-- Spots taken per team, without showing who applied.
create or replace function public.team_spots()
returns table (team text, accepted int, applied int)
language sql stable security definer set search_path = public as $$
  select t.team, (count(*) filter (where t.status = 'accepted'))::int, count(*)::int
    from public.team_applications t
   group by t.team;
$$;
revoke execute on function public.team_spots() from public, anon;
grant execute on function public.team_spots() to authenticated;
