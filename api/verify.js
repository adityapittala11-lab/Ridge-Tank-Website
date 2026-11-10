// Vercel Function "/api/verify": the link in the confirmation email. Marks the email as confirmed. The FIRST time the
// link is used it also logs the person in (the page gets a session in the URL fragment, which never reaches a server,
// and removes it right away). Used a second time, or by an officer, or by a banned account, it just goes to log in.
import { getPool } from './_pg.js';
import { verifyPurposeToken, signToken, verifyToken } from './_auth.js';

const OFFICERS = ['adityapittala.11@gmail.com', 'kavin.spork@gmail.com'];
const officerEmails = () => [...new Set([...OFFICERS, ...String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)])];

export default async function handler(req, res) {
  const url = new URL(req.url || '/', 'http://x');
  const claims = verifyPurposeToken(url.searchParams.get('token'), 'verify-email');
  let dest = '/#/login?confirmed=1';
  if (!claims) dest = '/#/login?confirmed=expired';
  else {
    try {
      const pool = getPool();
      const r = await pool.query(
        'update auth.users set email_confirmed_at = now(), last_sign_in_at = now() where id = $1 and email_confirmed_at is null returning id, email, raw_user_meta_data, created_at', [claims.sub]);
      if (r.rows.length) {
        const u = r.rows[0];
        const email = String(u.email || '').toLowerCase();
        const banned = await pool.query(
          `select 1 from public.members m where m.banned and (m.user_id = $1 or lower(m.email) = $2)
           union all select 1 from public.banned_emails b where b.email = $2`, [u.id, email]);
        if (!banned.rows.length && !officerEmails().includes(email)) {
          const token = signToken(u);
          const c = verifyToken(token);
          const session = {
            access_token: token, refresh_token: '', token_type: 'bearer', expires_at: c.exp, expires_in: c.exp - Math.floor(Date.now() / 1000),
            user: { id: u.id, email: u.email, user_metadata: u.raw_user_meta_data || {}, created_at: u.created_at, identities: [{ provider: 'email' }], app_metadata: { provider: 'email' } }
          };
          dest = '/#/?confirmed=auto&s=' + Buffer.from(JSON.stringify(session)).toString('base64url');
        }
      }
    } catch (e) { dest = '/#/login?confirmed=error'; }
  }
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Location', dest);
  res.statusCode = 302;
  res.end();
}
