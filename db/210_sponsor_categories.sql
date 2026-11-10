-- Sponsor categories: normal ($10/mo), meeting ($100 once or $79.99/mo), hoodie ($333 once), event ($799 once).
alter table sponsor_portal.accounts drop constraint if exists sponsor_level_ok;
alter table sponsor_portal.accounts add constraint sponsor_level_ok check (level in ('meeting', 'inkind', 'basic', 'full', 'hoodie', 'event'));
