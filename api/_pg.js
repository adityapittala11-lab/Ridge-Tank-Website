// Database connection and first-run setup. Uses the Postgres that Vercel connects to the project
// (Vercel > Storage > Neon). The address is read from DATABASE_URL (or POSTGRES_URL).
import pg from 'pg';
import { SQL_FILES, SCHEMA_VERSION } from './_schema.js';

let pool = null;
export function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
  if (!url) { const e = new Error('The database is not connected yet.'); e.code = 'NO_DB'; throw e; }
  const local = /localhost|127\.0\.0\.1|\/var\/|%2F/.test(url);
  pool = new pg.Pool({
    connectionString: url,
    ssl: local ? false : { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 8000
  });
  pool.on('error', () => { /* a dropped idle connection is fine; the pool reconnects */ });
  return pool;
}

// Creates the tables the first time, and again whenever db/*.sql changes (SCHEMA_VERSION goes up).
let ready = null;
export function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      const client = await getPool().connect();
      try {
        // One transaction with a lock: if two cold starts arrive together, one sets up and the other waits.
        // The version note lives in the private "auth" schema, which the site's table access never reaches.
        await client.query('begin');
        await client.query('select pg_advisory_xact_lock(727274)');
        await client.query('create schema if not exists auth');
        await client.query('create table if not exists auth.rt_schema (id int primary key, version int not null)');
        const cur = await client.query('select version from auth.rt_schema where id = 1');
        if (!cur.rows.length || cur.rows[0].version < SCHEMA_VERSION) {
          // Views hold no data and several files redefine the same view with more columns, which a re-run can't do in place.
          // So on every re-run, drop them all first; the files below put each one back.
          await client.query(`do $$ declare r record; begin
            for r in select viewname from pg_views where schemaname = 'public' loop
              execute format('drop view if exists public.%I cascade', r.viewname);
            end loop; end $$`);
          for (const f of SQL_FILES) {
            try { await client.query(f.sql); } catch (e) { e.message = f.name + ': ' + e.message; throw e; }
          }
          await client.query('insert into auth.rt_schema (id, version) values (1, $1) on conflict (id) do update set version = excluded.version', [SCHEMA_VERSION]);
        }
        await client.query('commit');
      } catch (e) {
        try { await client.query('rollback'); } catch (x) { /* ignore */ }
        throw e;
      } finally {
        client.release();
      }
    })().catch(e => { ready = null; throw e; });
  }
  return ready;
}
