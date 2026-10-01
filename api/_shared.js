// Shared by the AI functions in this folder (shark.js and sharks.js). Files that start with _ are not web addresses.
// The Groq key itself is only ever read from process.env.GROQ_API_KEY inside those functions. It is never in the repo.

// Both are public values (the same ones in js/config.js). The publishable key alone is not a member login.
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://stnhxldorcxzgevxvvpw.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_UnjvpcC8MmbCDUU8DG_R6Q_JUVDlYzZ';

// Returns the signed-in member's user id, or null. Only tools/dev-server.mjs sets RT_DEV_NO_AUTH, so this computer
// can be tested without logging in. It is never set on Vercel.
export async function memberId(req) {
  if (process.env.RT_DEV_NO_AUTH === '1') return 'dev';
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;
  try {
    const r = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token } });
    if (!r.ok) return null;
    const u = await r.json().catch(() => null);
    return u && u.id ? u.id : null;
  } catch (e) {
    return null;
  }
}

// A per-member daily cap so one person can't use up the shared free quota. Best effort: the counts live in memory
// and start over when Vercel restarts the function, which is fine for this.
export function dailyLimit(perDay) {
  const used = new Map();
  return id => {
    const day = new Date().toISOString().slice(0, 10);
    const u = used.get(id);
    if (u && u.day === day && u.n >= perDay) return false;
    used.set(id, { day, n: u && u.day === day ? u.n + 1 : 1 });
    return true;
  };
}

export function jsonBody(req) {
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = null; } }
  return body && typeof body === 'object' ? body : {};
}
