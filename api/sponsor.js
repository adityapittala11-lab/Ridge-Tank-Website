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
const LEVELS = new Set(['meeting', 'inkind', 'basic', 'full', 'hoodie', 'event']);
const PICKABLE = new Set(['meeting', 'basic', 'full', 'hoodie', 'event']); // in-kind is set up by email, not picked on the site
// Limited spots. "reserved" = businesses that said yes by email, matched by their email's domain. Their spot is
// counted as taken right away, and not counted a second time when they pay on the site.
export const SPOTS = { hoodie: { total: 3, reserved: ['ramseyautocenter.com'] }, event: { total: 1, reserved: [] } };
const MEETING = /^[a-z0-9-]{1,40}$/;
const MAX_LOGO = 700000; // characters of the data: address, about 500 KB of picture

const clientIp = req => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim() || 'ip';
const fail = (message, code = 'bad_request') => ({ data: null, error: { message, code } });
const ok = data => ({ data, error: null });
const STRIPE = () => String(process.env.STRIPE_API_BASE || 'https://api.stripe.com');
const stripeKey = () => process.env.STRIPE_SECRET_KEY || '';
const MONTHLY = { basic: 1000, full: 7999 };
const ONCE = { meeting: 10000, hoodie: 33300, event: 79900 };
const NAMES = {
  deposit: 'Meeting partner: first half', balance: 'Meeting partner: final half',
  meeting: 'Ridge Tank meeting sponsor', hoodie: 'Ridge Tank hoodie sponsor (name on 60 hoodies)', event: 'Ridge Tank Finale event sponsor',
  monthly: { basic: 'Ridge Tank Normal sponsor (monthly)', full: 'Ridge Tank Full package sponsor (monthly)' }
};

// How many hoodie and event spots are left. A spot is taken once it is paid for on the site, or sold offline.
async function spotsLeft(client) {
  const r = await client.query(`select p.kind, lower(split_part(a.email, '@', 2)) as domain from sponsor_portal.payments p
    join sponsor_portal.accounts a on a.id = p.account_id where p.kind in ('hoodie', 'event') group by p.kind, p.account_id, a.email`);
  const out = {};
  for (const [k, v] of Object.entries(SPOTS)) {
    const online = r.rows.filter(x => x.kind === k && !v.reserved.includes(x.domain)).length;
    out[k] = { total: v.total, left: Math.max(0, v.total - v.reserved.length - online) };
  }
  return out;
}

// One call to Stripe. (This helper went missing in an earlier change, which broke every sponsor payment button.)
async function stripe(path, fields) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(fields)) if (v != null && v !== '') body.append(k, String(v));
  const r = await fetch(STRIPE() + '/v1/' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + stripeKey(), 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const out = await r.json().catch(() => null);
  if (!r.ok || !out) throw new Error((out && out.error && out.error.message) || 'Stripe did not answer.');
  return out;
}

// One GET to Stripe (lists and lookups).
async function stripeGet(path, params) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (Array.isArray(v)) v.forEach(x => q.append(k, String(x))); else if (v != null && v !== '') q.append(k, String(v));
  }
  const r = await fetch(STRIPE() + '/v1/' + path + (q.toString() ? '?' + q : ''), { headers: { Authorization: 'Bearer ' + stripeKey() } });
  const out = await r.json().catch(() => null);
  if (!r.ok || !out) throw new Error((out && out.error && out.error.message) || 'Stripe did not answer.');
  return out;
}

const UUID = /^[0-9a-f-]{36}$/i;
const ONE_TIME_KINDS = ['deposit', 'balance', 'meeting', 'hoodie', 'event'];

// Writes what ONE Stripe Checkout session says into our payments table. Idempotent: a session is keyed by its id,
// so seeing it twice (webhook + this) never counts twice. A fully refunded session is removed, so the dashboard
// and the spot count stay truthful after a refund. Answers true when a paid one-time payment is on record.
async function recordSession(client, s) {
  if (!s || s.object !== 'checkout.session') return false;
  const id = (s.metadata && s.metadata.account_id) || s.client_reference_id;
  if (!UUID.test(String(id || ''))) return false;
  const kind = (s.metadata && s.metadata.kind) || '';
  if (s.customer) await client.query('update sponsor_portal.accounts set stripe_customer = $2 where id = $1 and stripe_customer is distinct from $2', [id, s.customer]);
  if (s.mode === 'subscription') {
    if (s.subscription) await client.query('update sponsor_portal.accounts set stripe_subscription = $2 where id = $1 and stripe_subscription is distinct from $2', [id, s.subscription]);
    return false; // monthly plans are recorded per invoice by the webhook
  }
  if (!ONE_TIME_KINDS.includes(kind)) return false;
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const charge = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  const refunded = !!(charge && charge.refunded);
  if (s.payment_status === 'paid' && !refunded) {
    await client.query('insert into sponsor_portal.payments (account_id, kind, amount_cents, ref) values ($1, $2, $3, $4) on conflict (ref) do nothing', [id, kind, s.amount_total || 0, s.id]);
    return true;
  }
  if (refunded) await client.query('delete from sponsor_portal.payments where ref = $1', [s.id]);
  return false;
}

// Asks Stripe directly instead of trusting only the webhook. With a session id: that one session.
// Without: the latest 100 sessions, which heals every account at once. Never throws; a Stripe hiccup
// must not break the dashboard.
async function syncFromStripe(client, sessionId) {
  if (!stripeKey()) return { ok: false };
  try {
    if (sessionId) {
      if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return { ok: false };
      const s = await stripeGet('checkout/sessions/' + sessionId, { 'expand[]': ['payment_intent.latest_charge'] });
      return { ok: true, recorded: await recordSession(client, s), accountId: (s.metadata && s.metadata.account_id) || s.client_reference_id || null, paid: s.payment_status === 'paid' };
    }
    const list = await stripeGet('checkout/sessions', { limit: 100, 'expand[]': ['data.payment_intent.latest_charge'] });
    let n = 0;
    for (const s of (list.data || [])) { try { if (await recordSession(client, s)) n++; } catch (e) { /* next */ } }
    return { ok: true, recorded: n };
  } catch (e) {
    return { ok: false, error: e && e.message };
  }
}

// Opens a Stripe Checkout page for one thing this sponsor can pay for, and answers its address.
async function checkoutUrl(req, a, opt, backPath) {
  const back = siteOrigin(req) + backPath;
  const monthly = opt.kind === 'monthly';
  const session = await stripe('checkout/sessions', {
    mode: monthly ? 'subscription' : 'payment',
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': opt.cents,
    'line_items[0][price_data][product_data][name]': monthly ? NAMES.monthly[a.level] : NAMES[opt.kind],
    'line_items[0][price_data][recurring][interval]': monthly ? 'month' : '',
    customer: a.stripe_customer || '',
    customer_email: a.stripe_customer ? '' : a.email,
    client_reference_id: a.id,
    'metadata[account_id]': a.id,
    'metadata[kind]': opt.kind,
    'subscription_data[metadata][account_id]': monthly ? a.id : '',
    success_url: back + '?paid=1&cs={CHECKOUT_SESSION_ID}',
    cancel_url: back + '?paid=0'
  });
  return session.url;
}

async function paymentInfo(client, a) {
  const r = await client.query('select kind, amount_cents, created_at from sponsor_portal.payments where account_id = $1 order by created_at desc limit 50', [a.id]);
  const kinds = new Set(r.rows.map(x => x.kind));
  const spots = await spotsLeft(client);
  const options = [];
  let soldOut = false;
  if (stripeKey() && a.status === 'approved') {
    if (a.level === 'meeting' && kinds.has('deposit')) {
      // Sponsors from before the $100-once change pay their second half the old way.
      if (a.balance_due && !kinds.has('balance')) options.push({ kind: 'balance', cents: 5000 });
    } else if (ONCE[a.level]) {
      if (!kinds.has(a.level)) {
        if (spots[a.level] && spots[a.level].left <= 0) soldOut = true;
        else options.push({ kind: a.level, cents: ONCE[a.level] });
      }
    } else if (MONTHLY[a.level] && !a.stripe_subscription) options.push({ kind: 'monthly', cents: MONTHLY[a.level] });
  }
  return { configured: !!stripeKey(), payments: r.rows, options, canManage: !!a.stripe_customer, spots, soldOut, paidKinds: [...kinds] };
}

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
    created_at: a.created_at, updated_at: a.updated_at, balance_due: !!a.balance_due, subscribed: !!a.stripe_subscription
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
    if (!PICKABLE.has(String(b.level))) return { error: 'Pick how you’d like to help.' };
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
        const sp = (await spotsLeft(client))[v.level];
        if (sp && sp.left <= 0) return fail('Sorry, every ' + v.level + ' spot is taken. Pick another way to help.', 'sold_out');
        const exists = await client.query('select 1 from sponsor_portal.accounts where lower(email) = $1', [email]);
        if (exists.rows.length) return fail('That email already has a sponsor account. Try logging in.', 'exists');
        const confirmNow = !mailConfigured(); // no email service yet: skip the link (sponsors are approved automatically)
        const r = await client.query(
          `insert into sponsor_portal.accounts (email, password, business, contact_name, phone, website, level, meeting, pitch_note, logo, status, email_confirmed_at, last_sign_in_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'approved', ${confirmNow ? 'now(), now()' : 'null, null'}) returning *`,
          [email, hashPassword(password), v.business, v.contact_name, v.phone, v.website, v.level, v.meeting, v.pitch_note, v.logo]);
        const a = r.rows[0];
        await notifyOfficers(a);
        // Payment comes before login: the new sponsor goes straight to the Stripe page for the plan they picked.
        // If that page can't be opened, sign-up still works and they can pay later from their dashboard.
        let payUrl = null;
        try {
          const first = (await paymentInfo(client, a)).options[0];
          if (first) payUrl = await checkoutUrl(req, a, first, confirmNow ? '/#/sponsor/dashboard/payments' : '/#/sponsor');
        } catch (e) { payUrl = null; }
        if (confirmNow) return ok({ confirm: false, payUrl, ...session(a) });
        try { await sendConfirmation(req, a); } catch (e) {
          await client.query('delete from sponsor_portal.accounts where id = $1', [a.id]);
          return fail('We couldn’t send an email to that address. Check it and try again.', 'mail_failed');
        }
        return ok({ confirm: true, email, payUrl });
      }

      const r = await client.query('select * from sponsor_portal.accounts where lower(email) = $1', [email]);
      const a = r.rows[0];
      if (!a || !checkPassword(password, a.password)) return fail('Wrong email or password.', 'invalid_credentials');
      if (!a.email_confirmed_at) return fail('Confirm your email first. Check your inbox (and spam) for our link.', 'email_not_confirmed');
      await client.query('update sponsor_portal.accounts set last_sign_in_at = now() where id = $1', [a.id]);
      return ok(session(a));
    }

    if (action === 'spots') return ok(await spotsLeft(client));

    // Coming back from Stripe Checkout: confirm that session right now, webhook or no webhook.
    if (action === 'confirmPay') {
      if (tooManyTries('sponsor-confirm|' + clientIp(req), 30)) return fail('Too many tries. Wait a minute.', 'rate_limited');
      const out = await syncFromStripe(client, String(b.session || ''));
      return ok({ recorded: !!out.recorded, paid: !!out.paid });
    }

    // Always answers "ok", so it can't be used to find out who has an account.
    if (action === 'resend') {
      const email = String(b.email || '').trim().toLowerCase();
      if (tooManyTries('sponsor-resend|' + clientIp(req) + '|' + email, 5)) return ok({ sent: true });
      const r = await client.query('select * from sponsor_portal.accounts where lower(email) = $1 and email_confirmed_at is null', [email]);
      if (r.rows.length && mailConfigured()) { try { await sendConfirmation(req, r.rows[0]); } catch (e) { /* ignore */ } }
      return ok({ sent: true });
    }

    if (action === 'me' || action === 'update' || action === 'password' || action === 'pay' || action === 'portal') {
      const a = await signedIn(req, client);
      if (!a) return fail('Please log in again.', 'signed_out');

      if (action === 'me') {
        // Before saying "payment due", check with Stripe: a missed webhook must never ask a sponsor to pay twice.
        // One Stripe lookup per dashboard open. Cheap at our size, and it also clears a payment after a refund.
        const cs = String(b.session || '');
        if (cs) await syncFromStripe(client, cs);
        if (stripeKey()) await syncFromStripe(client);
        return ok(Object.assign(publicAccount(a), { pay: await paymentInfo(client, a) }));
      }

      if (action === 'pay') {
        if (!stripeKey()) return fail('Payments aren’t switched on yet. Email us and we’ll sort it out.', 'pay_off');
        if (a.status !== 'approved') return fail('Payments aren’t open for this account. Email us and we’ll sort it out.', 'not_approved');
        await syncFromStripe(client); // if they already paid and we missed it, this records it and the option below disappears
        const info = await paymentInfo(client, a);
        const opt = info.options.find(o => o.kind === String(b.kind || ''));
        if (!opt) {
          const paidAlready = info.paidKinds.includes(String(b.kind || '')) || (ONCE[a.level] && info.paidKinds.includes(a.level));
          return fail(paidAlready ? 'You’ve already paid for this. Thank you! Refresh and it will show as paid.' : 'Nothing is due right now.', paidAlready ? 'already_paid' : 'nothing_due');
        }
        return ok({ url: await checkoutUrl(req, a, opt, '/#/sponsor/dashboard/payments') });
      }

      if (action === 'portal') {
        if (!stripeKey() || !a.stripe_customer) return fail('There is no billing to manage yet.', 'nothing_due');
        const portal = await stripe('billing_portal/sessions', { customer: a.stripe_customer, return_url: siteOrigin(req) + '/#/sponsor/dashboard/payments' });
        return ok({ url: portal.url });
      }

      if (action === 'password') {
        if (!checkPassword(String(b.current || ''), a.password)) return fail('Your current password isn’t right.');
        const pw = String(b.password || '');
        if (pw.length < 8 || pw.length > 200) return fail('Use a password with at least 8 characters.');
        await client.query('update sponsor_portal.accounts set password = $2, updated_at = now() where id = $1', [a.id, hashPassword(pw)]);
        return ok({ changed: true });
      }

      if (b.level === a.level) delete b.level; // unchanged (lets older in-kind partners keep saving their details)
      const f = readFields(b, true);
      if (f.error) return fail(f.error);
      if (f.values.level && f.values.level !== a.level) {
        const sp = (await spotsLeft(client))[f.values.level];
        const paidIt = await client.query('select 1 from sponsor_portal.payments where account_id = $1 and kind = $2', [a.id, f.values.level]);
        if (sp && sp.left <= 0 && !paidIt.rows.length) return fail('Sorry, every ' + f.values.level + ' spot is taken.', 'sold_out');
      }
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
      try {
        // The first click confirms the email AND logs them in (the session rides in the URL fragment, which the page
        // stores and wipes right away). A second click just goes to the log in page.
        const r = await getPool().query('update sponsor_portal.accounts set email_confirmed_at = now(), last_sign_in_at = now() where id = $1 and email_confirmed_at is null returning *', [claims.sub]);
        if (r.rows.length) {
          const s = session(r.rows[0]);
          dest = '/#/sponsor/dashboard?confirmed=auto&s=' + Buffer.from(JSON.stringify({ token: s.token, expires_at: s.expires_at })).toString('base64url');
        }
      }
      catch (e) { dest = '/#/sponsor?confirmed=error'; }
    }
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Location', dest);
    res.statusCode = 302;
    res.end();
    return;
  }

  if (req.method !== 'POST') { res.status(405).json(fail('Use POST.')); return; }
  try {
    res.status(200).json(await run(req, jsonBody(req)));
  } catch (e) {
    res.status(200).json(fail(e && e.message && /stripe|payment/i.test(e.message) ? e.message : 'Something went wrong. Try again in a moment.', 'server_error'));
  }
}
