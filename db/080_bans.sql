-- Officer bans. A banned member can't log in, and any session they already have stops working.
-- Only officers can change these columns (the members table is officer-write only).
alter table public.members add column if not exists banned boolean not null default false;
alter table public.members add column if not exists banned_reason text;
alter table public.members add column if not exists banned_at timestamptz;

-- Officers can see who the officers are (so the Ban button can skip them).
drop policy if exists "admins read" on public.admins;
create policy "admins read" on public.admins for select to authenticated using (public.is_admin());
