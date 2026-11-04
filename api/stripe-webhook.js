// Vercel Function "/api/stripe-webhook": Stripe tells us when a sponsor has paid.
// In Stripe: Developers > Webhooks > Add endpoint > https://<your site>/api/stripe-webhook, with the events
//   checkout.session.completed, invoice.paid, customer.subscription.deleted
// then copy the "Signing secret" (whsec_...) into Vercel as STRIPE_WEBHOOK_SECRET.
import crypto from 'node:crypto';
import { getPool, ensureSchema } from './_pg.js';

export const config = { api: { bodyParser: false } };

async function readRaw(req) {
  if (typeof req.rawBody === 'string') return req.rawBody;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === 'string' ? Buffer.from(c) : c);
  return Buffer.concat(chunks).toString('utf8');
}

// Stripe signs "<time>.<body>" with the signing secret. Reject anything old or with the wrong signature.
export function verifySignature(raw, header, secret, nowSec = Math.floor(Date.now() / 1000)) {
  const parts = String(header || '').split(',').map(x => x.trim().split('='));
  const t = (parts.find(p => p[0] === 't') || [])[1];
  const sigs = parts.filter(p => p[0] === 'v1').map(p => p[1]);
  if (!t || !sigs.length || Math.abs(nowSec - Number(t)) > 300) return false;
  const want = crypto.createHmac('sha256', secret).update(t + '.' + raw).digest('hex');
  return sigs.some(s => s.length === want.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(want)));
}

async function record(client, accountId, kind, cents, ref) {
  if (!/^[0-9a-f-]{36}$/i.test(String(accountId || ''))) return;
  await client.query('insert into sponsor_portal.payments (account_id, kind, amount_cents, ref) values ($1, $2, $3, $4) on conflict (ref) do nothing', [accountId, kind, cents, ref]);
}

export default async function handler(req, res) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (req.method !== 'POST') { res.status(405).json({ error: 'Use POST.' }); return; }
  if (!secret) { res.status(503).json({ error: 'Webhook secret is not set.' }); return; }
  const raw = await readRaw(req);
  if (!verifySignature(raw, req.headers['stripe-signature'], secret)) { res.status(400).json({ error: 'Bad signature.' }); return; }
  let ev;
  try { ev = JSON.parse(raw); } catch (e) { res.status(400).json({ error: 'Bad body.' }); return; }
  try {
    await ensureSchema();
    const client = await getPool().connect();
    try {
      const o = (ev.data && ev.data.object) || {};
      if (ev.type === 'checkout.session.completed' && o.payment_status !== 'unpaid') {
        const id = (o.metadata && o.metadata.account_id) || o.client_reference_id;
        const kind = (o.metadata && o.metadata.kind) || '';
        if (o.customer) await client.query('update sponsor_portal.accounts set stripe_customer = $2 where id = $1', [id, o.customer]);
        if (o.mode === 'subscription') {
          if (o.subscription) await client.query('update sponsor_portal.accounts set stripe_subscription = $2 where id = $1', [id, o.subscription]);
          // The first month is recorded by invoice.paid, so it is not counted twice here.
        } else if (kind === 'deposit' || kind === 'balance') await record(client, id, kind, o.amount_total || 0, o.id);
      } else if (ev.type === 'invoice.paid') {
        const id = (o.subscription_details && o.subscription_details.metadata && o.subscription_details.metadata.account_id)
          || (o.parent && o.parent.subscription_details && o.parent.subscription_details.metadata && o.parent.subscription_details.metadata.account_id)
          || (o.lines && o.lines.data && o.lines.data[0] && o.lines.data[0].metadata && o.lines.data[0].metadata.account_id);
        if (id) await record(client, id, 'monthly', o.amount_paid || 0, o.id);
      } else if (ev.type === 'customer.subscription.deleted') {
        await client.query('update sponsor_portal.accounts set stripe_subscription = null where stripe_subscription = $1', [o.id]);
      }
    } finally { client.release(); }
    res.status(200).json({ received: true });
  } catch (e) {
    res.status(500).json({ error: 'Could not save that.' });
  }
}
