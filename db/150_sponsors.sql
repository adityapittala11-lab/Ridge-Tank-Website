-- Sponsors: local businesses sign up, get their own dashboard, and officers approve them.
-- Sponsor accounts are kept apart from member accounts on purpose: they live in their own private schema that the
-- site's table access (/api/db) never reaches. Only api/sponsor.js (the server) reads and writes them, and officers
-- see them through the officer-only functions below. Safe to re-run.

create schema if not exists sponsor_portal;
revoke all on schema sponsor_portal from public;
do $$ begin
  execute 'revoke all on schema sponsor_portal from anon, authenticated';
exception when others then null;
end $$;

create table if not exists sponsor_portal.accounts (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  password text not null,                      -- scrypt hash, never plain text
  business text not null,
  contact_name text not null,
  phone text,
  website text,
  level text not null default 'meeting',       -- 'meeting' ($100 per meeting) or 'inkind' (snacks, drinks, gift cards)
  meeting text not null default 'any',         -- which meeting they want to back (see js/config.js sponsor.meetings)
  pitch_note text,                             -- anything they told us when signing up
  logo text,                                   -- small picture, stored as a data: address
  status text not null default 'pending',      -- pending, approved, declined
  message text,                                -- a note from the officers that the sponsor sees on their dashboard
  officer_note text,                           -- officers only, never sent to the sponsor
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sign_in_at timestamptz
);
create unique index if not exists sponsor_accounts_email_key on sponsor_portal.accounts (lower(email));
do $$ begin
  alter table sponsor_portal.accounts add constraint sponsor_status_ok check (status in ('pending', 'approved', 'declined'));
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table sponsor_portal.accounts add constraint sponsor_level_ok check (level in ('meeting', 'inkind'));
exception when duplicate_object then null;
end $$;

-- ---------- officer tools (called from Officer tools > Sponsors) ----------
create or replace function public.sponsor_admin_list()
returns jsonb language plpgsql stable security definer set search_path = public, sponsor_portal as $$
begin
  if not public.is_admin() then raise exception 'Officers only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'email', a.email, 'business', a.business, 'contact_name', a.contact_name, 'phone', a.phone,
      'website', a.website, 'level', a.level, 'meeting', a.meeting, 'pitch_note', a.pitch_note, 'logo', a.logo,
      'status', a.status, 'message', a.message, 'officer_note', a.officer_note,
      'email_confirmed', a.email_confirmed_at is not null, 'created_at', a.created_at, 'last_sign_in_at', a.last_sign_in_at
    ) order by a.created_at desc)
    from sponsor_portal.accounts a), '[]'::jsonb);
end;
$$;

create or replace function public.sponsor_admin_set(p_id uuid, p_status text, p_message text default null, p_note text default null)
returns void language plpgsql volatile security definer set search_path = public, sponsor_portal as $$
begin
  if not public.is_admin() then raise exception 'Officers only.' using errcode = '42501'; end if;
  if p_status not in ('pending', 'approved', 'declined') then raise exception 'Unknown status.'; end if;
  update sponsor_portal.accounts
     set status = p_status,
         message = nullif(left(btrim(coalesce(p_message, '')), 600), ''),
         officer_note = nullif(left(btrim(coalesce(p_note, '')), 600), ''),
         updated_at = now()
   where id = p_id;
  if not found then raise exception 'That sponsor is gone. Reload the list.'; end if;
end;
$$;

create or replace function public.sponsor_admin_delete(p_id uuid)
returns void language plpgsql volatile security definer set search_path = public, sponsor_portal as $$
begin
  if not public.is_admin() then raise exception 'Officers only.' using errcode = '42501'; end if;
  delete from sponsor_portal.accounts where id = p_id;
end;
$$;

-- How many sponsors are waiting for an officer to look at them (for the tab badge).
create or replace function public.sponsor_admin_pending()
returns int language sql stable security definer set search_path = public, sponsor_portal as $$
  select case when public.is_admin() then (select count(*)::int from sponsor_portal.accounts where status = 'pending') else 0 end;
$$;
