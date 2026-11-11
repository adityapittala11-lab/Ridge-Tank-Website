-- Ridge Tank hoodie orders (the public shop on the landing page). Kept in its own schema so the site's table
-- access never reaches it: only /api/hoodie and the Stripe webhook touch it. Safe to run again.
create schema if not exists shop;
create table if not exists shop.hoodie_orders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  size text not null,
  qty int not null check (qty between 1 and 4),
  amount_cents int not null,
  status text not null default 'pending',   -- pending (sent to Stripe) or paid (Stripe told us)
  ref text unique,                           -- the Stripe Checkout session
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
