// Hoodie orders, as one Vercel Function: /api/hoodie
//   POST { action: 'order', name, email, size, qty }   starts a Stripe Checkout page and answers { url }
//   POST { action: 'info' }                            is the shop open, the price, the sizes
// No account is needed: the buyer pays on Stripe's page, and the Stripe webhook (api/stripe-webhook.js) marks the
// order paid. Every paid order is emailed to HOODIE_NOTIFY (or SPONSOR_NOTIFY) and shows in Stripe with the
// name, size and count. The price lives here, not in the browser, so nobody can change it.
import { getPool, ensureSchema } from './_pg.js';
import { tooManyTries } from './_auth.js';
import { jsonBody } from './_shared.js';

export const HOODIE_CENTS = 2000; // $20 each. Keep in step with "hoodie" in js/config.js ($25, 20% off).
export const SIZES = ['S', 'M', 'L', 'XL', 'XXL'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STRIPE = () => String(process.env.STRIPE_API_BASE || 'https://api.stripe.com');
const stripeKey = () => process.env.STRIPE_SECRET_KEY || '';
const clientIp = req => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim() || 'ip';
const fail = (message, code = 'bad_request') => ({ data: null, error: { message, code } });
const ok = data => ({ data, error: null });
const siteOrigin = req => {
  if (process.env.SITE_URL) return String(process.env.SITE_URL).replace(/\/+$/, '');
  const h = req.headers || {};
  const host = h['x-forwarded-host'] || h.host || '';
  return (h['x-forwarded-proto'] || (/^localhost|^127\./.test(host) ? 'http' : 'https')) + '://' + host;
};

async function stripe(path, params) {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) body.append(k, String(v));
  const r = await fetch(STRIPE() + '/v1/' + path, { method: 'POST', headers: { Authorization: 'Bearer ' + stripeKey(), 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('The payment page could not be opened. Try again in a moment.');
  return j;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json(fail('Use POST.')); return; }
  try {
    const b = jsonBody(req) || {};
    const action = String(b.action || '');
    if (action === 'info') { res.status(200).json(ok({ open: !!stripeKey(), cents: HOODIE_CENTS, sizes: SIZES })); return; }
    if (action !== 'order') { res.status(200).json(fail('Unknown request.')); return; }

    if (!stripeKey()) { res.status(200).json(fail('Hoodie orders aren’t open yet. Check back soon.', 'pay_off')); return; }
    const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const email = String(b.email || '').trim().toLowerCase().slice(0, 200);
    const size = String(b.size || '').toUpperCase();
    const qty = Math.floor(Number(b.qty) || 0);
    if (tooManyTries('hoodie|' + clientIp(req), 12)) { res.status(200).json(fail('Too many tries. Wait a few minutes and try again.', 'rate_limited')); return; }
    if (name.length < 3 || !/\s/.test(name)) { res.status(200).json(fail('Enter your first and last name, so we know whose hoodie it is.')); return; }
    if (!EMAIL.test(email)) { res.status(200).json(fail('Enter a real email address. Your receipt goes there.')); return; }
    if (!SIZES.includes(size)) { res.status(200).json(fail('Pick a size.')); return; }
    if (qty < 1 || qty > 4) { res.status(200).json(fail('You can order 1 to 4 hoodies at a time.')); return; }

    await ensureSchema();
    const client = await getPool().connect();
    try {
      const amount = HOODIE_CENTS * qty;
      const row = await client.query('insert into shop.hoodie_orders (name, email, size, qty, amount_cents) values ($1, $2, $3, $4, $5) returning id', [name, email, size, qty, amount]);
      const id = row.rows[0].id;
      const back = siteOrigin(req) + '/#/';
      const session = await stripe('checkout/sessions', {
        mode: 'payment',
        'line_items[0][quantity]': qty,
        'line_items[0][price_data][currency]': 'usd',
        'line_items[0][price_data][unit_amount]': HOODIE_CENTS,
        'line_items[0][price_data][product_data][name]': 'Ridge Tank hoodie, size ' + size,
        customer_email: email,
        client_reference_id: id,
        'metadata[kind]': 'hoodie_order',
        'metadata[order_id]': id,
        'metadata[name]': name,
        'metadata[size]': size,
        'metadata[qty]': qty,
        'payment_intent_data[description]': `Ridge Tank hoodie x${qty}, size ${size}, for ${name}`,
        success_url: back + '?hoodie=paid',
        cancel_url: back + '?hoodie=back'
      });
      await client.query('update shop.hoodie_orders set ref = $2 where id = $1', [id, session.id]);
      res.status(200).json(ok({ url: session.url }));
    } finally { client.release(); }
  } catch (e) {
    res.status(200).json(fail(e && /payment page/.test(e.message || '') ? e.message : 'Something went wrong. Try again in a moment.', 'server_error'));
  }
}
