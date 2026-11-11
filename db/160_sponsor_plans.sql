-- Sponsor plans. This file is replayed on every schema update, so keep this
-- list in sync with every level introduced by later sponsor migrations.
alter table sponsor_portal.accounts drop constraint if exists sponsor_level_ok;
alter table sponsor_portal.accounts add constraint sponsor_level_ok
  check (level in ('meeting', 'inkind', 'basic', 'full', 'hoodie', 'event'));
