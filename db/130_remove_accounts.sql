-- Officer tool: delete every account except the officer who runs it. Safe to re-run (it only does something when called).
create or replace function public.remove_all_accounts_except_me()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.is_admin() then raise exception 'Officers only.'; end if;
  select count(*) into n from auth.users where id <> auth.uid();
  -- Profiles (and with them check-ins, pitches, badges, messages, bounty claims, etc.) go with the accounts.
  delete from public.members where user_id is not null and user_id <> auth.uid();
  delete from auth.users where id <> auth.uid();
  return n;
end;
$$;
revoke execute on function public.remove_all_accounts_except_me() from public, anon;
grant execute on function public.remove_all_accounts_except_me() to authenticated;
