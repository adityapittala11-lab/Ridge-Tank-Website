-- Sponsors are approved automatically now. Approve anyone still waiting (officers can still decline someone later).
update sponsor_portal.accounts set status = 'approved' where status = 'pending';
alter table sponsor_portal.accounts alter column status set default 'approved';
