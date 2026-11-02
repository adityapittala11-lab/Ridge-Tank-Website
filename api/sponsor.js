// Sponsor accounts, as one Vercel Function: /api/sponsor
// Sponsors are local businesses, not students, so they get their own small login that never touches member accounts.
//   POST { action: 'signUp', email, password, business, contact_name, phone, website, level, meeting, pitch_note, logo }
//   POST { action: 'signIn', email, password }
//   POST { action: 'resend', email }                     send the confirmation email again
//   POST { action: 'me' }                                (with "Authorization: Bearer <token>") the sponsor's dashboard data
//   POST { action: 'update', ...fields }                 (with token) change business details or the logo
//   GET  /api/sponsor?verify=<token>                     the link in the confirmation email
// Sponsor tokens are signed for the purpose "sponsor", so they can never be used as a member login and the other way round.
import { getPool, ensureSchema } from './_pg.js';
import { hashPassword, checkPassword, signPurposeToken, verifyPurposeToken, bearer, tooManyTries } from './_auth.js';
import { sendMail, mailConfigured } from './_mail.js';
import { jsonBody } from './_shared.js';

const TOKEN_HOURS = 24 * 30;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LOGO = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const LEVELS = new Set(['meeting', 'inkind', 'basic', 'full']);
const MEETING = /^[a-z0-9-]{1,40}$/;
const MAX_LOGO = 700000; // characters of the data: address, about 500 KB of picture

const clientIp = req => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim() || 'ip';
const fail = (message, code = 'bad_request') => ({ data: null, error: { message, code } });
const ok = data => ({ data, error: null });
const clean = (v, max) => { const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); return s ? s.slice(0, max) : null; };

const siteOrigin = req => {
  if (process.env.SITE_URL) return String(process.env.SITE_URL).replace(/\/+$/, '');
  const h = req.headers || {};
  const host = h['x-forwarded-host'] || h.host || '';
  return (h['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https')) + '://' + host;
};

// What the sponsor may see about their own account. The officers' private note and the password hash stay out.
function publicAccount(a) {
  return {
    id: a.id, email: a.email, business: a.business, contact_name: a.contact_name, phone: a.phone, website: a.website,
    level: a.level, meeting: a.meeting, pitch_note: a.pitch_note, logo: a.logo, status: a.status, message: a.message,
    created_at: a.created_at, updated_at: a.updated_at
  };
}

function session(a) {
  const token = signPurposeToken('sponsor', a.id, TOKEN_HOURS);
  return { token, expires_at: Math.floor(Date.now() / 1000) + TOKEN_HOURS * 3600, account: publicAccount(a) };
}

// Checks the editable fields. Returns { values } or { error }. "partial" = only check what was sent (for updates).
function readFields(b, partial) {
  const v = {};
  const has = k => !partial || Object.prototype.hasOwnProperty.call(b, k);
  if (has('business')) {
    v.business = clean(b.business, 80);
    if (!v.business || v.business.length < 2) return { error: 'Enter your business name.' };
  }
  if (has('contact_name')) {
    v.contact_name = clean(b.contact_name, 60);
    if (!v.contact_name || v.contact_name.length < 2) return { error: 'Enter your name.' };
  }
  if (has('phone')) {
    const digits = String(b.phone || '').replace(/\D/g, '');
    if (digits && (digits.length < 10 || digits.length > 15)) return { error: 'Enter a 10-digit phone number, or leave it empty.' };
    v.phone = digits ? clean(b.phone, 25) : null;
  }
  if (has('website')) {
    let w = clean(b.website, 200);
    if (w && !/^https?:\/\//i.test(w)) w = 'https://' + w;
    if (w && !/^https?:\/\/[^\s/]+\.[^\s]+$/i.test(w)) return { error: 'That website address doesn’t look right.' };
    v.website = w;
  }
  if (has('level')) {
    if (!LEVELS.has(String(b.level))) return { error: 'Pick how you’d like to help.' };
    v.level = String(b.level);
  }
  if (has('meeting')) {
    if (!MEETING.test(String(b.meeting || ''))) return { error: 'Pick a meeting.' };
    v.meeting = String(b.meeting);
  }
  if (has('pitch_note')) v.pitch_note = b.pitch_note ? String(b.pitch_note).trim().slice(0, 500) || null : null;
  if (has('logo')) {
    if (b.logo == null || b.logo === '') v.logo = null;
    else if (!LOGO.test(String(b.logo)) || String(b.logo).length > MAX_LOGO) return { error: 'That logo is too big or not a picture. Try a PNG or JPG under 5 MB.' };
    else v.logo = String(b.logo);
  }
  return { values: v };
}

async function sendConfirmation(req, a) {
  const link = siteOrigin(req) + '/api/sponsor?verify=' + encodeURIComponent(signPurposeToken('sponsor-verify', a.id, 48));
  const first = String(a.contact_name || '').split(' ')[0] || 'there';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  await sendMail({
    to: a.email,
    subject: 'Confirm your Ridge Tank sponsor account',
    text: `Hi ${first},\n\nThanks for backing Ridge Tank! Tap this link to confirm your email and open your sponsor dashboard:\n${link}\n\nThe link works for 48 hours. If you didn't sign up, ignore this email.\n\nRidge Tank, Mountain Ridge High School`,
    html: `<div style="font-family:system-ui,Arial,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0b1f15">
      <h2 style="margin:0 0 12px">Confirm your email</h2>
      <p>Hi ${esc(first)}, thanks for backing Ridge Tank! Tap the button to open your sponsor dashboard.</p>
      <p style="margin:24px 0"><a href="${esc(link)}" style="background:#1e8f5b;color:#fff;padding:14px 22px;text-decoration:none;font-weight:600;display:inline-block">Confirm my email</a></p>
      <p style="font-size:13px;color:#555">The link works for 48 hours. If you didn't sign up, ignore this email.<br>Button not working? Copy this into your browser:<br>${esc(link)}</p></div>`
  });
}

// Optional heads-up to the officers when a new sponsor signs up: set SPONSOR_NOTIFY (comma separated emails) in Vercel.
async function notifyOfficers(a) {
  const to = String(process.env.SPONSOR_NOTIFY || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!to.length || !mailConfigured()) return;
  const text = `New sponsor sign-up\n\n${a.business}\n${a.contact_name} · ${a.email}${a.phone ? ' · ' + a.phone : ''}\nLevel: ${a.level}\nMeeting: ${a.meeting}\n${a.pitch_note ? '\nNote: ' + a.pitch_note + '\n' : ''}\nApprove or decline it in Officer tools > Sponsors.`;
  for (const addr of to) { try { await sendMail({ to: addr, subject: 'New Ridge Tank sponsor: ' + a.business, text, html: '<pre style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">' + text.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</pre>' }); } catch (e) { /* not important */ } }
}

async function signedIn(req, client) {
  const claims = verifyPurposeToken(bearer(req), 'sponsor');
  if (!claims || !/^[0-9a-f-]{36}$/i.test(String(claims.sub))) return null;
  const r = await client.query('select * from sponsor_portal.accounts where id = $1', [claims.sub]);
  return r.rows[0] || null;
}

async function run(req, b) {
  const client = await getPool().connect();
  try {
    const action = String(b.action || '');

    if (action === 'signUp' || action === 'signIn') {
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      if (tooManyTries('sponsor|' + clientIp(req) + '|' + email)) return fail('Too many tries. Wait a few minutes and try again.', 'rate_limited');
      if (!EMAIL.test(email) || email.length > 200) return fail('Enter a real email address.');

      if (action === 'signUp') {
        if (password.length < 8 || password.length > 200) return fail('Use a password with at least 8 characters.');
        const f = readFields(b, false);
        if (f.error) return fail(f.error);
        const v = f.values;
        const exists = await client.query('select 1 from sponsor_portal.accounts where lower(email) = $1', [email]);
        if (exists.rows.length) return fail('That email already has a sponsor account. Try logging in.', 'exists');
        const confirmNow = !mailConfigured(); // no email service yet: skip the link (officers still approve every sponsor)
        const r = await client.query(
          `insert into sponsor_portal.accounts (email, password, business, contact_name, phone, website, level, meeting, pitch_note, logo, email_confirmed_at, last_sign_in_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, ${confirmNow ? 'now(), now()' : 'null, null'}) returning *`,
          [email, hashPassword(password), v.business, v.contact_name, v.phone, v.website, v.level, v.meeting, v.pitch_note, v.logo]);
        const a = r.rows[0];
        await notifyOfficers(a);
        if (confirmNow) return ok({ confirm: false, ...session(a) });
        try { await sendConfirmation(req, a); } catch (e) {
          await client.query('delete from sponsor_portal.accounts where id = $1', [a.id]);
          return fail('We couldn’t send an email to that address. Check it and try again.', 'mail_failed');
        }
        return ok({ confirm: true, email });
      }

      const r = await client.query('select * from sponsor_portal.accounts where lower(email) = $1', [email]);
      const a = r.rows[0];
      if (!a || !checkPassword(password, a.password)) return fail('Wrong email or password.', 'invalid_credentials');
      if (!a.email_confirmed_at) return fail('Confirm your email first. Check your inbox (and spam) for our link.', 'email_not_confirmed');
      await client.query('update sponsor_portal.accounts set last_sign_in_at = now() where id = $1', [a.id]);
      return ok(session(a));
    }

    // Always answers "ok", so it can't be used to find out who has an account.
    if (action === 'resend') {
      const email = String(b.email || '').trim().toLowerCase();
      if (tooManyTries('sponsor-resend|' + clientIp(req) + '|' + email, 5)) return ok({ sent: true });
      const r = await client.query('select * from sponsor_portal.accounts where lower(email) = $1 and email_confirmed_at is null', [email]);
      if (r.rows.length && mailConfigured()) { try { await sendConfirmation(req, r.rows[0]); } catch (e) { /* ignore */ } }
      return ok({ sent: true });
    }

    if (action === 'me' || action === 'update' || action === 'password') {
      const a = await signedIn(req, client);
      if (!a) return fail('Please log in again.', 'signed_out');

      if (action === 'me') return ok(publicAccount(a));

      if (action === 'password') {
        if (!checkPassword(String(b.current || ''), a.password)) return fail('Your current password isn’t right.');
        const pw = String(b.password || '');
        if (pw.length < 8 || pw.length > 200) return fail('Use a password with at least 8 characters.');
        await client.query('update sponsor_portal.accounts set password = $2, updated_at = now() where id = $1', [a.id, hashPassword(pw)]);
        return ok({ changed: true });
      }

      const f = readFields(b, true);
      if (f.error) return fail(f.error);
      const cols = Object.keys(f.values);
      if (!cols.length) return ok(publicAccount(a));
      const params = [a.id];
      const sets = cols.map(c => { params.push(f.values[c]); return c + ' = $' + params.length; });
      const r = await client.query('update sponsor_portal.accounts set ' + sets.join(', ') + ', updated_at = now() where id = $1 returning *', params);
      return ok(publicAccount(r.rows[0]));
    }

    return fail('Unknown request.');
  } finally {
    client.release();
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    await ensureSchema();
  } catch (e) {
    res.status(503).json(fail(e.code === 'NO_DB' ? 'The database is not connected yet.' : 'Database setup failed.', e.code || 'setup_failed'));
    return;
  }

  // The confirmation link.
  if (req.method === 'GET') {
    const url = new URL(req.url || '/', 'http://x');
    const claims = verifyPurposeToken(url.searchParams.get('verify'), 'sponsor-verify');
    let dest = '/#/sponsor?confirmed=1';
    if (!claims) dest = '/#/sponsor?confirmed=expired';
    else {
      try { await getPool().query('update sponsor_portal.accounts set email_confirmed_at = now() where id = $1 and email_confirmed_at is null', [claims.sub]); }
      catch (e) { dest = '/#/sponsor?confirmed=error'; }
    }
    res.setHeader('Location', dest);
    res.statusCode = 302;
    res.end();
    return;
  }

  if (req.method !== 'POST') { res.status(405).json(fail('Use POST.')); return; }
  try {
    res.status(200).json(await run(req, jsonBody(req)));
  } catch (e) {
    res.status(200).json(fail('Something went wrong. Try again in a moment.', 'server_error'));
  }
}
