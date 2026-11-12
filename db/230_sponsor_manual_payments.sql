-- Officers can put a payment on (or take one off) a sponsor's record by hand: a check through the school,
-- or a Stripe payment the webhook missed. The reference must be unique (a Stripe charge/session id, or a check number).
create or replace function public.sponsor_admin_record_payment(p_id uuid, p_kind text, p_cents integer, p_ref text)
returns text language plpgsql volatile security definer set search_path = public, sponsor_portal as $$
declare v_ref text := nullif(trim(p_ref), '');
begin
  if not public.is_admin() then raise exception 'Officers only.' using errcode = '42501'; end if;
  if p_kind not in ('deposit', 'balance', 'meeting', 'hoodie', 'event', 'monthly', 'manual') then raise exception 'Unknown payment kind.'; end if;
  if p_cents is null or p_cents <= 0 or p_cents > 500000 then raise exception 'Enter an amount between $0.01 and $5,000.'; end if;
  if v_ref is null then v_ref := 'manual_' || gen_random_uuid()::text; end if;
  if not exists (select 1 from sponsor_portal.accounts where id = p_id) then raise exception 'No such sponsor.'; end if;
  insert into sponsor_portal.payments (account_id, kind, amount_cents, ref) values (p_id, p_kind, p_cents, v_ref)
    on conflict (ref) do nothing;
  return v_ref;
end;
$$;

create or replace function public.sponsor_admin_remove_payment(p_ref text)
returns integer language plpgsql volatile security definer set search_path = public, sponsor_portal as $$
declare n integer;
begin
  if not public.is_admin() then raise exception 'Officers only.' using errcode = '42501'; end if;
  delete from sponsor_portal.payments where ref = trim(p_ref);
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Officers see each payment line (kind, amount, when, reference) for one sponsor, so a wrong line can be removed by its reference.
create or replace function public.sponsor_admin_payment_lines(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public, sponsor_portal as $$
begin
  if not public.is_admin() then raise exception 'Officers only.' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('kind', p.kind, 'amount_cents', p.amount_cents, 'created_at', p.created_at, 'ref', p.ref) order by p.created_at desc)
    from sponsor_portal.payments p where p.account_id = p_id), '[]'::jsonb);
end;
$$;
