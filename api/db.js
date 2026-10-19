// The site's database and accounts, as one Vercel Function: POST /api/db
// The browser side (js/backend.js) sends small JSON requests; this runs them on Postgres.
//   { op: 'auth', action: 'signUp' | 'signIn' | 'updateUser', ... }          accounts
//   { op: 'select' | 'insert' | 'update' | 'delete' | 'upsert', table, ... } tables and views
//   { op: 'rpc', fn, args }                                                  database functions
// Every data request runs inside a transaction as the "authenticated" role with the caller's id set, so the access
// rules in db/*.sql (row level security) decide what each person can read and change.
import pg from 'pg';
import { getPool, ensureSchema } from './_pg.js';
import { hashPassword, checkPassword, signToken, verifyToken, bearer, tooManyTries } from './_auth.js';
import { jsonBody } from './_shared.js';

// Numbers stay numbers and dates stay "2026-10-21" (not shifted by a timezone).
pg.types.setTypeParser(20, v => (v == null ? v : Number(v)));       // bigint
pg.types.setTypeParser(1700, v => (v == null ? v : Number(v)));     // numeric
pg.types.setTypeParser(1082, v => v);                                // date

const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const MAX_ROWS = 1000;
const ident = (s, what) => { if (!IDENT.test(String(s))) { const e = new Error('Bad ' + (what || 'name') + '.'); e.code = 'BAD_REQUEST'; throw e; } return '"' + s + '"'; };
const bad = msg => { const e = new Error(msg); e.code = 'BAD_REQUEST'; return e; };

function errorOut(e) {
  return { message: e.message || 'Something went wrong.', code: e.code || '', details: e.detail || null, hint: e.hint || null };
}

// ---------- what exists (tables, views, functions, primary keys), cached for a minute ----------
let meta = null, metaAt = 0;
async function getMeta(client) {
  if (meta && Date.now() - metaAt < 60000) return meta;
  const rel = await client.query("select c.relname as name, c.relkind as kind from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r','v','m')");
  const pk = await client.query("select c.relname as tbl, a.attname as col from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace n on n.oid = c.relnamespace join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey) where i.indisprimary and n.nspname = 'public'");
  const fn = await client.query("select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'");
  meta = { rels: new Set(rel.rows.map(r => r.name)), pk: {}, fns: new Set(fn.rows.map(r => r.name)) };
  pk.rows.forEach(r => { (meta.pk[r.tbl] = meta.pk[r.tbl] || []).push(r.col); });
  metaAt = Date.now();
  return meta;
}

// ---------- filters ----------
const OPS = { eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=', like: 'like', ilike: 'ilike' };

function clause(f, params) {
  const col = ident(f.col, 'column');
  const op = f.op;
  if (op === 'not') return 'not (' + clause({ col: f.col, op: f.val && f.val.op, val: f.val && f.val.val }, params) + ')';
  if (op === 'is') {
    if (f.val === null || f.val === 'null') return col + ' is null';
    if (f.val === true || f.val === 'true') return col + ' is true';
    if (f.val === false || f.val === 'false') return col + ' is false';
    throw bad('Bad filter.');
  }
  if (op === 'in') {
    const list = Array.isArray(f.val) ? f.val : String(f.val).replace(/^\(|\)$/g, '').split(',');
    if (!list.length) return 'false';
    return col + ' in (' + list.map(v => { params.push(v); return '$' + params.length; }).join(', ') + ')';
  }
  if (!OPS[op]) throw bad('Bad filter.');
  params.push(f.val);
  return col + ' ' + OPS[op] + ' $' + params.length;
}

// "a.eq.1,b.eq.2" -> (a = 1 or b = 2)
function orClause(str, params) {
  const parts = String(str).split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) throw bad('Bad filter.');
  return '(' + parts.map(p => {
    const m = p.match(/^([A-Za-z_][A-Za-z0-9_]*)\.(not\.)?([a-z]+)\.(.*)$/);
    if (!m) throw bad('Bad filter.');
    const f = { col: m[1], op: m[3], val: m[4] };
    const c = clause(f, params);
    return m[2] ? 'not (' + c + ')' : c;
  }).join(' or ') + ')';
}

function whereSql(filters, orList, params) {
  const parts = [];
  (filters || []).forEach(f => parts.push(clause(f, params)));
  (orList || []).forEach(o => parts.push(orClause(o, params)));
  return parts.length ? ' where ' + parts.join(' and ') : '';
}

function selectList(columns) {
  const s = String(columns == null || columns === '' ? '*' : columns).replace(/\s+/g, '');
  if (s === '*') return '*';
  return s.split(',').filter(Boolean).map(c => ident(c, 'column')).join(', ');
}

function orderSql(order) {
  if (!order || !order.length) return '';
  return ' order by ' + order.map(o => ident(o.col, 'column') + (o.asc === false ? ' desc' : ' asc') + (o.nullsFirst === true ? ' nulls first' : o.nullsFirst === false ? ' nulls last' : '')).join(', ');
}

// ---------- one data request ----------
async function dataOp(req, b) {
  const claims = verifyToken(bearer(req));
  if (!claims) return { data: null, error: { message: 'Please log in again.', code: 'PGRST301' } };

  const client = await getPool().connect();
  try {
    if (!/^[0-9a-f-]{36}$/i.test(String(claims.sub))) return { data: null, error: { message: 'Please log in again.', code: 'PGRST301' } };
    // One round trip: open the transaction, drop to the logged-in role, and say who is asking (the id was just checked).
    await client.query("begin; set local statement_timeout = '8000'; set local role authenticated; select set_config('request.jwt.claim.sub', '" + claims.sub + "', true)");
    const m = await getMeta(client);
    const out = await runOp(client, m, b);
    await client.query('commit');
    return out;
  } catch (e) {
    try { await client.query('rollback'); } catch (x) { /* ignore */ }
    return { data: null, error: errorOut(e) };
  } finally {
    client.release();
  }
}

function pick(rows, b) {
  if (b.single || b.maybeSingle) {
    if (rows.length === 1) return { data: rows[0], error: null };
    if (rows.length === 0 && b.maybeSingle) return { data: null, error: null };
    return { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116', details: 'The result contains ' + rows.length + ' rows' } };
  }
  return { data: rows, error: null };
}

async function runOp(client, m, b) {
  const op = b.op;

  if (op === 'rpc') {
    const fn = String(b.fn || '');
    ident(fn, 'function');
    if (!m.fns.has(fn)) throw bad('Could not find the function ' + fn);
    const args = b.args && typeof b.args === 'object' ? b.args : {};
    const params = [];
    const named = Object.keys(args).map(k => { params.push(args[k]); return ident(k, 'argument') + ' := $' + params.length; });
    const r = await client.query('select * from public.' + ident(fn) + '(' + named.join(', ') + ')', params);
    if (r.fields.length === 1 && r.fields[0].name === fn) return { data: r.rows.length ? r.rows[0][fn] : null, error: null };
    return { data: r.rows.length === 1 ? r.rows[0] : r.rows, error: null };
  }

  const table = String(b.table || '');
  ident(table, 'table');
  if (!m.rels.has(table)) throw Object.assign(new Error('Could not find the table ' + table), { code: 'PGRST205' });
  const T = 'public.' + ident(table);
  const params = [];

  if (op === 'select') {
    const wh = whereSql(b.filters, b.or, params);
    let count = null;
    if (b.count) {
      const c = await client.query('select count(*)::int as n from ' + T + wh, params);
      count = c.rows[0].n;
    }
    if (b.head) return { data: null, error: null, count };
    let sql = 'select ' + selectList(b.columns) + ' from ' + T + wh + orderSql(b.order);
    let limit = MAX_ROWS, offset = 0;
    if (Array.isArray(b.range)) { offset = Math.max(0, Number(b.range[0]) || 0); limit = Math.min(MAX_ROWS, Math.max(1, (Number(b.range[1]) || 0) - offset + 1)); }
    if (b.limit != null) limit = Math.min(limit, Math.max(0, Number(b.limit) || 0));
    if (b.single || b.maybeSingle) limit = Math.min(limit, 2);
    sql += ' limit ' + limit + (offset ? ' offset ' + offset : '');
    const r = await client.query(sql, params);
    const out = pick(r.rows, b);
    if (count != null) out.count = count;
    return out;
  }

  if (op === 'insert' || op === 'upsert') {
    const rows = (Array.isArray(b.values) ? b.values : [b.values]).filter(v => v && typeof v === 'object');
    if (!rows.length) throw bad('Nothing to save.');
    if (rows.length > 500) throw bad('Too many rows at once.');
    const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
    if (!cols.length) throw bad('Nothing to save.');
    const colSql = cols.map(c => ident(c, 'column')).join(', ');
    const valSql = rows.map(r => '(' + cols.map(c => {
      if (!(c in r)) return 'default';
      params.push(r[c]);
      return '$' + params.length;
    }).join(', ') + ')').join(', ');
    let sql = 'insert into ' + T + ' (' + colSql + ') values ' + valSql;
    if (op === 'upsert') {
      const target = (b.onConflict ? String(b.onConflict).split(',').map(s => s.trim()) : (m.pk[table] || [])).filter(Boolean);
      if (!target.length) throw bad('Nothing to match on.');
      const sets = cols.filter(c => !target.includes(c)).map(c => ident(c) + ' = excluded.' + ident(c));
      sql += ' on conflict (' + target.map(c => ident(c, 'column')).join(', ') + ')' + (b.ignoreDuplicates || !sets.length ? ' do nothing' : ' do update set ' + sets.join(', '));
    }
    sql += ' returning *';
    const r = await client.query(sql, params);
    if (!b.returning) return { data: null, error: null };
    return pick(r.rows, b);
  }

  if (op === 'update' || op === 'delete') {
    if (!(b.filters && b.filters.length) && !(b.or && b.or.length)) throw bad('Add a filter before changing rows.');
    let sql;
    if (op === 'update') {
      const v = b.values && typeof b.values === 'object' ? b.values : {};
      const cols = Object.keys(v);
      if (!cols.length) throw bad('Nothing to save.');
      const sets = cols.map(c => { params.push(v[c]); return ident(c, 'column') + ' = $' + params.length; });
      sql = 'update ' + T + ' set ' + sets.join(', ') + whereSql(b.filters, b.or, params);
    } else {
      sql = 'delete from ' + T + whereSql(b.filters, b.or, params);
    }
    const r = await client.query(sql + ' returning *', params);
    if (!b.returning) return { data: null, error: null };
    return pick(r.rows, b);
  }

  throw bad('Unknown request.');
}

// ---------- accounts ----------
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clientIp = req => String((req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip'])) || '').split(',')[0].trim() || 'ip';

// Founding officer, always an admin (account already claimed). Others go in the ADMIN_EMAILS env var.
const FOUNDER_ADMINS = ['adityapittala.11@gmail.com'];

function adminEmails() {
  const fromEnv = String(process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...FOUNDER_ADMINS, ...fromEnv])];
}

function publicUser(u) {
  return { id: u.id, email: u.email, user_metadata: u.raw_user_meta_data || {}, created_at: u.created_at, identities: [{ provider: 'email' }], app_metadata: { provider: 'email' } };
}

function sessionFor(u) {
  const token = signToken(u);
  const claims = verifyToken(token);
  return { access_token: token, refresh_token: '', token_type: 'bearer', expires_at: claims.exp, expires_in: claims.exp - Math.floor(Date.now() / 1000), user: publicUser(u) };
}

async function makeAdminIfListed(client, u) {
  if (adminEmails().includes(String(u.email).toLowerCase())) {
    await client.query('insert into public.admins (user_id) values ($1) on conflict do nothing', [u.id]);
  }
}

async function authOp(req, b) {
  const action = b.action;
  const client = await getPool().connect();
  try {
    if (action === 'signUp' || action === 'signIn') {
      const email = String(b.email || '').trim().toLowerCase();
      const password = String(b.password || '');
      if (tooManyTries(clientIp(req) + '|' + email)) return { data: { user: null, session: null }, error: { message: 'Too many tries. Wait a few minutes and try again.', code: 'over_request_rate_limit' } };
      if (!EMAIL.test(email)) return { data: { user: null, session: null }, error: { message: 'Enter a real email address.', code: 'validation_failed' } };

      if (action === 'signUp') {
        if (password.length < 8 || password.length > 200) return { data: { user: null, session: null }, error: { message: 'Password should be at least 8 characters.', code: 'weak_password' } };
        const meta = b.data && typeof b.data === 'object' ? b.data : {};
        const exists = await client.query('select 1 from auth.users where lower(email) = $1', [email]);
        if (exists.rows.length) return { data: { user: null, session: null }, error: { message: 'User already registered', code: 'user_already_exists' } };
        const r = await client.query('insert into auth.users (email, encrypted_password, raw_user_meta_data, last_sign_in_at) values ($1, $2, $3, now()) returning *', [email, hashPassword(password), JSON.stringify(meta)]);
        await makeAdminIfListed(client, r.rows[0]);
        return { data: { user: publicUser(r.rows[0]), session: sessionFor(r.rows[0]) }, error: null };
      }

      const r = await client.query('select * from auth.users where lower(email) = $1', [email]);
      if (!r.rows.length || !checkPassword(password, r.rows[0].encrypted_password)) {
        return { data: { user: null, session: null }, error: { message: 'Invalid login credentials', code: 'invalid_credentials' } };
      }
      await client.query('update auth.users set last_sign_in_at = now() where id = $1', [r.rows[0].id]);
      await makeAdminIfListed(client, r.rows[0]);
      return { data: { user: publicUser(r.rows[0]), session: sessionFor(r.rows[0]) }, error: null };
    }

    if (action === 'updateUser') {
      const claims = verifyToken(bearer(req));
      if (!claims) return { data: { user: null }, error: { message: 'Please log in again.', code: 'PGRST301' } };
      const cur = await client.query('select * from auth.users where id = $1', [claims.sub]);
      if (!cur.rows.length) return { data: { user: null }, error: { message: 'Account not found.' } };
      let u = cur.rows[0];
      if (b.password != null) {
        const pw = String(b.password);
        if (pw.length < 8 || pw.length > 200) return { data: { user: null }, error: { message: 'Password should be at least 8 characters.', code: 'weak_password' } };
        u = (await client.query('update auth.users set encrypted_password = $2 where id = $1 returning *', [u.id, hashPassword(pw)])).rows[0];
      }
      if (b.data && typeof b.data === 'object') {
        u = (await client.query('update auth.users set raw_user_meta_data = raw_user_meta_data || $2::jsonb where id = $1 returning *', [u.id, JSON.stringify(b.data)])).rows[0];
      }
      return { data: { user: publicUser(u) }, error: null };
    }

    // An officer sets a new password for a member who forgot theirs (there is no reset email).
    if (action === 'adminSetPassword') {
      const claims = verifyToken(bearer(req));
      if (!claims) return { data: null, error: { message: 'Please log in again.', code: 'PGRST301' } };
      const pw = String(b.password || '');
      if (pw.length < 8 || pw.length > 200) return { data: null, error: { message: 'Password should be at least 8 characters.', code: 'weak_password' } };
      await client.query('begin');
      try {
        await client.query('set local role authenticated');
        await client.query("select set_config('request.jwt.claim.sub', $1, true)", [claims.sub]);
        const isAdmin = (await client.query('select public.is_admin() as ok')).rows[0].ok;
        await client.query('reset role');
        if (!isAdmin) { await client.query('rollback'); return { data: null, error: { message: 'Officers only.', code: '42501' } }; }
        const r = await client.query('update auth.users set encrypted_password = $2 where lower(email) = $1 returning id', [String(b.email || '').trim().toLowerCase(), hashPassword(pw)]);
        await client.query('commit');
        if (!r.rows.length) return { data: null, error: { message: 'No account uses that email yet.' } };
        return { data: { ok: true }, error: null };
      } catch (e) {
        try { await client.query('rollback'); } catch (x) { /* ignore */ }
        throw e;
      }
    }

    return { data: null, error: { message: 'Unknown request.' } };
  } finally {
    client.release();
  }
}

// ---------- entry ----------
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ data: null, error: { message: 'Use POST.' } }); return; }
  const body = jsonBody(req);
  try {
    await ensureSchema();
  } catch (e) {
    const msg = e.code === 'NO_DB'
      ? 'The database is not connected yet. In Vercel, open Storage and connect a Postgres database to this project, then redeploy.'
      : 'Database setup failed: ' + (e.message || 'unknown error');
    res.status(503).json({ data: null, error: { message: msg, code: e.code || 'SETUP_FAILED' } });
    return;
  }
  try {
    const out = body.op === 'auth' ? await authOp(req, body) : await dataOp(req, body);
    res.status(200).json(out);
  } catch (e) {
    res.status(200).json({ data: null, error: errorOut(e) });
  }
}
