// Vercel Function "/api/verify": the link in the confirmation email. Marks the email as confirmed, then sends the
// person to the log-in page.
import { getPool } from './_pg.js';
import { verifyPurposeToken } from './_auth.js';

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://x');
  const claims = verifyPurposeToken(url.searchParams.get('token'), 'verify-email');
  let dest = '/#/login?confirmed=1';
  if (!claims) dest = '/#/login?confirmed=expired';
  else {
    try {
      await getPool().query('update auth.users set email_confirmed_at = now() where id = $1 and email_confirmed_at is null', [claims.sub]);
    } catch (e) { dest = '/#/login?confirmed=error'; }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', dest);
  res.statusCode = 302;
  res.end();
}
