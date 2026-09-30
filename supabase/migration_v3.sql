-- Ridge Tank v3: phone numbers for the club group chat.
-- Run after migration_v2.sql. Safe to re-run.
-- Only the member and officers can see a phone number (same rule as the rest of the members table).

alter table public.members add column if not exists phone text;

-- Members can't write the members table directly, so they save their own number through this.
create or replace function public.set_my_phone(p_phone text)
returns public.members language plpgsql security definer set search_path = public as $$
declare m public.members;
begin
  if auth.uid() is null then raise exception 'Please sign in first.'; end if;
  update public.members set phone = nullif(btrim(p_phone), '')
   where user_id = auth.uid()
  returning * into m;
  if not found then raise exception 'Finish joining first.'; end if;
  return m;
end;
$$;
grant execute on function public.set_my_phone(text) to authenticated;
