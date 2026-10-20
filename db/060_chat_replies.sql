-- Chat replies: a message can point at the message it answers. If the original is deleted, the reply stays.
alter table public.messages add column if not exists reply_to bigint references public.messages(id) on delete set null;
