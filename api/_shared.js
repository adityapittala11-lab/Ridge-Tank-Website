// Shared by the AI functions in this folder (shark.js and sharks.js). Files that start with _ are not web addresses.
// The Groq key itself is only ever read from process.env.GROQ_API_KEY inside those functions. It is never in the repo.

import { verifyToken, bearer } from './_auth.js';
import { getPool } from './_pg.js';

// Returns the signed-in member's user id, or null. Only tools/dev-server.mjs sets RT_DEV_NO_AUTH, so this computer
// can be tested without logging in. It is never set on Vercel.
export async function memberId(req) {
  if (process.env.RT_DEV_NO_AUTH === '1') return 'dev';
  const claims = verifyToken(bearer(req));
  if (!claims) return null;
  // Banned members are treated as logged out (checked at most every 30 seconds per person).
  try {
    const hit = banCache.get(claims.sub);
    let banned;
    if (hit && Date.now() - hit.at < 30000) banned = hit.banned;
    else {
      // Banned, deleted, or still waiting for approval: treated as logged out for the AI tools.
      const r = await getPool().query(`select 1 where not exists (select 1 from public.admins a where a.user_id = $1)
          and (not exists (select 1 from auth.users u where u.id = $1)
            or exists (select 1 from public.members m where (m.banned or m.status = 'pending') and (m.user_id = $1 or lower(m.email) = lower($2)))
            or exists (select 1 from public.banned_emails b where b.email = lower($2)))`, [claims.sub, claims.email || '']);
      banned = r.rows.length > 0;
      banCache.set(claims.sub, { at: Date.now(), banned });
      if (banCache.size > 2000) banCache.clear();
    }
    if (banned) return null;
  } catch (e) { /* if the check can't run, fall back to the signed login */ }
  return claims.sub;
}
const banCache = new Map();

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
