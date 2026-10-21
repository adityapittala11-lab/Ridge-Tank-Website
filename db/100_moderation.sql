-- Moderation: approval for new accounts, names that look real, chat that only officers start, mutes, and bans that
-- remove a person entirely. Safe to re-run.

-- ---------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------
-- 'pending' = signed up on their own and waiting for an officer to look at their name.
-- Everyone already here, and anyone an officer added or handed a code to, is 'approved'.
alter table public.members add column if not exists status text not null default 'approved';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'members_status_check') then
    alter table public.members add constraint members_status_check check (status in ('pending', 'approved'));
  end if;
end $$;
alter table public.members add column if not exists muted_until timestamptz;

-- Emails that were banned. A ban deletes the person, so this is what stops them signing up again.
create table if not exists public.banned_emails (
  email text primary key,
  reason text,
  banned_at timestamptz not null default now()
);
alter table public.banned_emails enable row level security;
drop policy if exists "banned_emails admin" on public.banned_emails;
create policy "banned_emails admin" on public.banned_emails for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- Names that look like real names: two or more words made of letters, no keyboard mashing.
-- ---------------------------------------------------------------------
create or replace function public.valid_person_name(n text)
returns boolean language sql immutable as $$
  select n is not null
     and length(btrim(n)) between 4 and 60
     and btrim(n) ~ '^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ''’.-]*( [A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ''’.-]*)+$'
     and btrim(n) !~* '(.)\1\1'
     and btrim(n) !~* '(asdf|qwer|zxcv|fake|troll|xxx)';
$$;

-- ---------------------------------------------------------------------
-- Sign-up: real-looking name, not banned, and new accounts wait for approval unless an officer already knows them.
-- ---------------------------------------------------------------------
drop function if exists public.register_member(text, text, text, text, boolean);
create or replace function public.register_member(
  p_name text, p_grade text, p_ref text default null, p_phone text default null, p_whatsapp boolean default false)
returns public.members language plpgsql security definer set search_path = public as $$
declare
  m public.members;
  ref_id uuid;
  ph text;
  my_email text;
  my_confirmed boolean;
  is_officer boolean;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  select * into m from public.members where user_id = auth.uid();
  if found then return m; end if;
  if not public.valid_person_name(p_name) then
    raise exception 'Use your real first and last name.';
  end if;

  ph := public.clean_phone(p_phone);
  if coalesce(btrim(p_phone), '') <> '' and ph is null then
    raise exception 'That phone number doesn''t look right.';
  end if;

  select email, email_confirmed_at is not null into my_email, my_confirmed from auth.users where id = auth.uid();
  if exists (select 1 from public.banned_emails b where b.email = lower(my_email)) then
    raise exception 'This email can''t be used.';
  end if;
  is_officer := exists (select 1 from public.admins where user_id = auth.uid());

  if coalesce(btrim(p_ref), '') <> '' then
    select id into ref_id from public.members
     where lower(login_code) = lower(btrim(p_ref)) and user_id is not null;
  end if;

  -- An officer already added this person (for example from the Google Form) with this email: link to that row.
  if my_confirmed and my_email is not null then
    update public.members
       set user_id = auth.uid(),
           name = btrim(p_name),
           grade = coalesce(nullif(btrim(p_grade), ''), grade),
           phone = coalesce(ph, phone),
           whatsapp_ok = whatsapp_ok or coalesce(p_whatsapp, false),
           referred_by = coalesce(referred_by, ref_id),
           status = 'approved'
     where id = (select id from public.members
                  where user_id is null and email is not null and lower(email) = lower(my_email)
                  order by created_at limit 1)
    returning * into m;
    if found then return m; end if;
  end if;

  insert into public.members (name, grade, email, user_id, card_status, referred_by, phone, whatsapp_ok, source, status)
  values (btrim(p_name), nullif(btrim(p_grade), ''), my_email, auth.uid(), 'pending', ref_id, ph,
          coalesce(p_whatsapp, false), 'website', case when is_officer then 'approved' else 'pending' end)
  returning * into m;
  return m;
end;
$$;
revoke execute on function public.register_member(text, text, text, text, boolean) from public, anon;
grant execute on function public.register_member(text, text, text, text, boolean) to authenticated;

-- A login code comes from an officer, so using one counts as approved.
create or replace function public.claim_card(p_code text)
returns public.members language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  if exists (select 1 from public.members where user_id = auth.uid()) then
    raise exception 'This account is already linked to a member profile.';
  end if;
  if exists (select 1 from public.banned_emails b where b.email = lower((select email from auth.users where id = auth.uid()))) then
    raise exception 'This email can''t be used.';
  end if;
  update public.members
     set user_id = auth.uid(),
         email = coalesce(email, (select email from auth.users where id = auth.uid())),
         status = 'approved'
   where lower(login_code) = lower(btrim(p_code)) and user_id is null
  returning * into m;
  if not found then raise exception 'That code doesn''t match an unclaimed Ridge Tank card.'; end if;
  return m;
end;
$$;

-- ---------------------------------------------------------------------
-- Chat rules. Officers can post anything. Members can only reply to a message, and not while muted.
-- ---------------------------------------------------------------------
create or replace function public.messages_rules()
returns trigger language plpgsql security definer set search_path = public as $$
declare me uuid := public.my_member_id(); mm public.members;
begin
  if public.is_admin() then return new; end if;
  select * into mm from public.members where id = me;
  if not found then raise exception 'Finish joining first.'; end if;
  if mm.status = 'pending' then raise exception 'Your account is waiting for an officer to approve it.'; end if;
  if mm.muted_until is not null and mm.muted_until > now() then
    raise exception 'You are muted for about % more minutes.', greatest(1, ceil(extract(epoch from (mm.muted_until - now())) / 60)::int);
  end if;
  if new.reply_to is null then
    raise exception 'Only officers can start a message. Tap Reply on a message to answer it.';
  end if;
  if not exists (select 1 from public.messages where id = new.reply_to) then
    raise exception 'That message is gone.';
  end if;
  return new;
end;
$$;
drop trigger if exists messages_zz_rules on public.messages;
create trigger messages_zz_rules before insert on public.messages
  for each row execute function public.messages_rules();

-- ---------------------------------------------------------------------
-- Ban: removes the person from the site entirely (account, profile, check-ins, pitches, badges, messages)
-- and blocks their email from signing up again.
-- ---------------------------------------------------------------------
create or replace function public.ban_member(p_member uuid, p_reason text default null)
returns void language plpgsql security definer set search_path = public as $$
declare mm public.members; em text;
begin
  if not public.is_admin() then raise exception 'Officers only.'; end if;
  select * into mm from public.members where id = p_member;
  if not found then raise exception 'Member not found.'; end if;
  if mm.user_id is not null and exists (select 1 from public.admins where user_id = mm.user_id) then
    raise exception 'Officers can''t be banned.';
  end if;
  em := lower(coalesce(mm.email, (select email from auth.users where id = mm.user_id)));
  if em is not null and em <> '' then
    insert into public.banned_emails (email, reason) values (em, nullif(btrim(coalesce(p_reason, '')), ''))
    on conflict (email) do update set reason = excluded.reason, banned_at = now();
  end if;
  delete from public.members where id = p_member;
  if mm.user_id is not null then delete from auth.users where id = mm.user_id; end if;
end;
$$;
revoke execute on function public.ban_member(uuid, text) from public, anon;
grant execute on function public.ban_member(uuid, text) to authenticated;

create or replace function public.unban_email(p_email text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Officers only.'; end if;
  delete from public.banned_emails where email = lower(btrim(p_email));
end;
$$;
revoke execute on function public.unban_email(text) from public, anon;
grant execute on function public.unban_email(text) to authenticated;

-- ---------------------------------------------------------------------
-- The name list now says who the officers are (for the "Officer" tag in chat) and hides people still waiting for approval.
-- ---------------------------------------------------------------------
create or replace view public.member_directory as
  select m.id, m.name,
         exists (select 1 from public.admins a where a.user_id = m.user_id) as is_officer
    from public.members m
   where m.status = 'approved';
revoke all on public.member_directory from anon;
grant select on public.member_directory to authenticated;
