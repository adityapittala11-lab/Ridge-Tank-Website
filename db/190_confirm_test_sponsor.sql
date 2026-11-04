-- One-time fix: mark the owner's temporary test sponsor account as email-confirmed so it can log in without the email link.
update sponsor_portal.accounts set email_confirmed_at = coalesce(email_confirmed_at, now())
 where lower(email) = 'adityapittala.11+sponsortest@gmail.com';
