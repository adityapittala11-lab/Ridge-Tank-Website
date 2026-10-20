-- =====================================================================
-- Ridge Tank: Tank Academy cheat checks
-- Rounds are now scored and saved by the server (api/shark.js), so members can no longer add rounds themselves.
-- flagged/flags hold why a round looked copied, AI-written or machine-typed. Never what the student wrote.
-- =====================================================================

alter table public.course_rounds add column if not exists flagged boolean not null default false;
alter table public.course_rounds add column if not exists flags jsonb;
create index if not exists course_rounds_flagged_idx on public.course_rounds (created_at) where flagged;

-- Members can't insert rounds any more; only the server can.
drop policy if exists "course_rounds: add own" on public.course_rounds;

-- Officers can clear a flag (and count a held round) after looking at it.
drop policy if exists "course_rounds: officer update" on public.course_rounds;
create policy "course_rounds: officer update" on public.course_rounds
  for update using (public.is_admin()) with check (public.is_admin());
