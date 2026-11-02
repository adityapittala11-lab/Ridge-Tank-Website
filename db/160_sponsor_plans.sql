-- Sponsor plans: one-time (meeting, in-kind) and monthly (basic, full).
alter table sponsor_portal.accounts drop constraint if exists sponsor_level_ok;
alter table sponsor_portal.accounts add constraint sponsor_level_ok check (level in ('meeting', 'inkind', 'basic', 'full'));
