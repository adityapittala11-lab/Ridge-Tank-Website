-- Sponsor payments (Stripe). Kept in the private sponsor_portal schema; only the server and officer functions touch it.
alter table sponsor_portal.accounts add column if not exists stripe_customer text;
alter table sponsor_portal.accounts add column if not exists stripe_subscription text;
alter table sponsor_portal.accounts add column if not exists balance_due boolean not null default false;

create table if not exists sponsor_portal.payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references sponsor_portal.accounts(id) on delete cascade,
  kind text not null,                   -- deposit, balance, monthly
  amount_cents integer not null,
  ref text not null unique,             -- Stripe session or invoice id, so a repeated webhook never counts twice
  created_at timestamptz not null default now()
);
create index if not exists sponsor_payments_account_idx on sponsor_portal.payments (account_id);

create or replace function public.sponsor_admin_payments()
returns jsonb language plpgsql stable security definer set search_path = public, sponsor_portal as $$
begin
  if not public.is_admin() then raise exception 'Officers only.' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_object_agg(t.account_id, t.info) from (
      select a.id as account_id, jsonb_build_object(
        'balance_due', a.balance_due,
        'subscribed', a.stripe_subscription is not null,
        'paid_cents', coalesce((select sum(p.amount_cents) from sponsor_portal.payments p where p.account_id = a.id), 0),
        'kinds', coalesce((select jsonb_agg(distinct p.kind) from sponsor_portal.payments p where p.account_id = a.id), '[]'::jsonb),
        'last_paid', (select max(p.created_at) from sponsor_portal.payments p where p.account_id = a.id)
      ) as info from sponsor_portal.accounts a) t), '{}'::jsonb);
end;
$$;

create or replace function public.sponsor_admin_balance(p_id uuid, p_due boolean)
returns void language plpgsql volatile security definer set search_path = public, sponsor_portal as $$
begin
  if not public.is_admin() then raise exception 'Officers only.' using errcode = '42501'; end if;
  update sponsor_portal.accounts set balance_due = p_due, updated_at = now() where id = p_id;
end;
$$;
