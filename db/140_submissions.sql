-- Meeting activity submissions: one picture per member per activity, timestamped by the server.
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  activity text not null default 'November Meeting Activity Submission',
  note text,
  mime text not null,
  bytes integer not null,
  thumb text not null,
  image text not null,
  created_at timestamptz not null default now()
);
create index if not exists submissions_member_idx on public.submissions (member_id);
create index if not exists submissions_created_idx on public.submissions (created_at desc);
alter table public.submissions enable row level security;

create or replace function public.submissions_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.member_id := public.my_member_id();
  new.created_at := now();
  if new.member_id is null then raise exception 'Finish setting up your member profile first.'; end if;
  if new.mime not in ('image/jpeg', 'image/png', 'image/webp') then raise exception 'Please upload a JPG, PNG or WebP picture.'; end if;
  if new.image !~ '^data:image/' or length(new.image) > 3500000 then raise exception 'That picture is too big. Try a smaller one.'; end if;
  new.bytes := length(new.image);
  new.note := nullif(left(btrim(coalesce(new.note, '')), 300), '');
  new.activity := 'November Meeting Activity Submission';
  return new;
end;
$$;
drop trigger if exists submissions_guard on public.submissions;
create trigger submissions_guard before insert on public.submissions
  for each row execute function public.submissions_guard();

drop policy if exists "submissions read" on public.submissions;
drop policy if exists "submissions add" on public.submissions;
drop policy if exists "submissions own delete" on public.submissions;
create policy "submissions read" on public.submissions for select to authenticated using (member_id = public.my_member_id() or public.is_admin());
create policy "submissions add" on public.submissions for insert to authenticated with check (public.my_member_id() is not null);
create policy "submissions own delete" on public.submissions for delete to authenticated using (member_id = public.my_member_id() or public.is_admin());
