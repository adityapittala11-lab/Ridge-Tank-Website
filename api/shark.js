// Vercel Function "/api/shark": the AI sharks for the live site.
// The Groq key is read from the Vercel environment variable GROQ_API_KEY (Project Settings > Environment Variables).
// It is never in the repo and the browser never sees it: the browser sends the round, this asks Groq, only the reply goes back.
// Only signed-in members can use it, so the endpoint can't be used as a free chatbot.
import { handle } from '../supabase/functions/shark/core.mjs';

// Both are public values (the same ones in js/config.js). The publishable key alone is not a member login.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://stnhxldorcxzgevxvvpw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UnjvpcC8MmbCDUU8DG_R6Q_JUVDlYzZ';

async function isMember(req) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } });
    if (!r.ok) return false;
    const u = await r.json().catch(() => null);
    return !!(u && u.id);
  } catch (e) {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, obj) => res.status(status).json(obj);

  // Open this address in a browser to check the key is set. It never shows the key.
  if (req.method === 'GET') return send(200, { aiConfigured: !!process.env.GROQ_API_KEY });
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });

  if (!(await isMember(req))) return send(401, { error: 'Log in first.' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { return send(400, { error: 'Bad request.' }); } }

  try {
    return send(200, await handle(body, process.env.GROQ_API_KEY || ''));
  } catch (e) {
    return send(e.status || 500, { error: e.message || 'Something went wrong.' });
  }
}
