-- Email confirmation instead of an approval queue, one account per inbox, and a one-time clear of the old chat.
-- Safe to re-run.

-- ---------------------------------------------------------------------
-- No more waiting for approval: confirming your email is the check now. Anyone still waiting gets in.
-- ---------------------------------------------------------------------
update public.members set status = 'approved' where status <> 'approved';

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
          coalesce(p_whatsapp, false), 'website', 'approved')
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

revoke execute on function public.register_member(text, text, text, text, boolean) from public, anon;
grant execute on function public.register_member(text, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- One account per inbox. email_key is the email with gmail dots and +tags removed.
-- ---------------------------------------------------------------------
alter table auth.users add column if not exists email_key text;
create or replace function auth.email_key(e text) returns text language sql immutable as $$
  select case
    when split_part(lower(btrim(e)), '@', 2) in ('gmail.com', 'googlemail.com')
      then replace(split_part(split_part(lower(btrim(e)), '@', 1), '+', 1), '.', '') || '@gmail.com'
    else split_part(split_part(lower(btrim(e)), '@', 1), '+', 1) || '@' || split_part(lower(btrim(e)), '@', 2)
  end
$$;
update auth.users set email_key = auth.email_key(email) where email_key is null;
do $$
begin
  create unique index if not exists users_email_key_key on auth.users (email_key) where email_key is not null;
exception when others then
  -- two old accounts already share an inbox: keep a plain index so nothing breaks
  create index if not exists users_email_key_idx on auth.users (email_key);
end $$;

-- ---------------------------------------------------------------------
-- One-time jobs: things that must happen once, even though this file re-runs.
-- ---------------------------------------------------------------------
create table if not exists auth.one_time_jobs (name text primary key, ran_at timestamptz not null default now());
do $$
begin
  if not exists (select 1 from auth.one_time_jobs where name = 'clear_chat_2026_10_21') then
    delete from public.messages;
    insert into auth.one_time_jobs (name) values ('clear_chat_2026_10_21');
  end if;
end $$;
