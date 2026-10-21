// Accounts: password hashing and login tokens. No outside login service.
// Tokens are signed with AUTH_SECRET (set it in Vercel). If it isn't set, a secret is derived from the database
// address, which only the server knows, so logins still work and stay private.
import crypto from 'node:crypto';

const TOKEN_DAYS = 30;

function secret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  const base = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING || '';
  if (!base) throw new Error('AUTH_SECRET is not set.');
  return crypto.createHash('sha256').update('ridge-tank:' + base).digest('hex');
}

const b64 = buf => Buffer.from(buf).toString('base64url');
const unb64 = s => Buffer.from(String(s), 'base64url');

// scrypt, 16 byte random salt. Stored as "salt:hash" (hex).
export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 64);
  return salt.toString('hex') + ':' + hash.toString('hex');
}

export function checkPassword(password, stored) {
  const [saltHex, hashHex] = String(stored || '').split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function signToken(user) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ sub: user.id, email: user.email, role: 'authenticated', iat: now, exp: now + TOKEN_DAYS * 86400 }));
  const sig = crypto.createHmac('sha256', secret()).update(header + '.' + payload).digest();
  return header + '.' + payload + '.' + b64(sig);
}

// Returns { sub, email, exp } for a good token, or null.
export function verifyToken(token) {
  try {
    const [h, p, s] = String(token || '').split('.');
    if (!h || !p || !s) return null;
    const expected = crypto.createHmac('sha256', secret()).update(h + '.' + p).digest();
    const given = unb64(s);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    const payload = JSON.parse(unb64(p).toString('utf8'));
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// Short-lived "unlock" proofs for sensitive tools (the officer Assistant). Signed like a login token but only valid
// for one scope and one user, so a login token can't be reused as an unlock.
export function signUnlock(userId, scope, hours = 8) {
  const exp = Math.floor(Date.now() / 1000) + hours * 3600;
  const body = userId + '.' + scope + '.' + exp;
  return b64(body) + '.' + b64(crypto.createHmac('sha256', secret()).update('unlock:' + body).digest());
}
export function verifyUnlock(token, userId, scope) {
  try {
    const [bb, sig] = String(token || '').split('.');
    const body = unb64(bb).toString('utf8');
    const [uid, sc, exp] = body.split('.');
    if (uid !== userId || sc !== scope || Number(exp) < Math.floor(Date.now() / 1000)) return false;
    const expected = crypto.createHmac('sha256', secret()).update('unlock:' + body).digest();
    const given = unb64(sig);
    return expected.length === given.length && crypto.timingSafeEqual(expected, given);
  } catch (e) {
    return false;
  }
}

// A one-way scramble of a network address or device id, for spotting duplicate accounts. The value itself is never stored.
export function hashSignal(value) {
  return crypto.createHmac('sha256', secret()).update('signal:' + String(value || '')).digest('hex').slice(0, 32);
}

export function bearer(req) {
  return String((req.headers && (req.headers.authorization || req.headers.Authorization)) || '').replace(/^Bearer\s+/i, '').trim();
}

// Best-effort limit on password guesses: 15 tries per 10 minutes per address + email. Lives in memory.
const tries = new Map();
export function tooManyTries(key, max = 15) {
  const now = Date.now();
  const list = (tries.get(key) || []).filter(t => now - t < 600000);
  list.push(now);
  tries.set(key, list);
  if (tries.size > 5000) tries.clear();
  return list.length > max;
}
