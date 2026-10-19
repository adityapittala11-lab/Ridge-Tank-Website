-- Last step: let logged-in members use everything the access rules (row level security) allow.
-- Row level security still decides which rows they can see; these grants only open the door to the tables and views.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- Views the logged-out role must never read (the earlier files also revoke these).
revoke all on public.member_points, public.member_tiers, public.member_directory from anon;
