-- One-time cleanup: remove the owner's test sponsor account (and its payment rows) from the sponsor list.
delete from sponsor_portal.accounts
 where lower(email) like 'adityapittala.11%@gmail.com';
