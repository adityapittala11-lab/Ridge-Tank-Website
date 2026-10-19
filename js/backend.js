// The browser side of the site's own backend. It looks and behaves like a small database client
// (from('table').select()..., rpc(), auth.signIn...) but talks to api/db.js on our own server.
// It replaces the outside database service the site used before, so the rest of the code did not have to change.
(function () {
  const SESSION_KEY = 'rt_session_v1';
  const ENDPOINT = '/api/db';

  function createClient() {
    const listeners = new Set();
    let session = readSession();

    function readSession() {
      try {
        const s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (s && s.access_token && s.expires_at * 1000 > Date.now()) return s;
      } catch (e) { /* storage blocked or bad data */ }
      return null;
    }
    function writeSession(s) {
      session = s;
      try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch (e) { /* ignore */ }
    }
    function emit(event) { listeners.forEach(cb => setTimeout(() => { try { cb(event, session); } catch (e) { console.error(e); } }, 0)); }

    // Another tab signed in or out.
    window.addEventListener('storage', e => {
      if (e.key !== SESSION_KEY) return;
      const before = session && session.user && session.user.id;
      session = readSession();
      const after = session && session.user && session.user.id;
      if (before !== after) emit(session ? 'SIGNED_IN' : 'SIGNED_OUT');
    });

    async function call(body) {
      const headers = { 'content-type': 'application/json' };
      if (session) headers.authorization = 'Bearer ' + session.access_token;
      let r;
      try {
        r = await fetch(ENDPOINT, { method: 'POST', headers, body: JSON.stringify(body) });
      } catch (e) {
        return { data: null, error: { message: 'Failed to fetch' } };
      }
      let out = null;
      try { out = await r.json(); } catch (e) { /* not JSON */ }
      if (!out) return { data: null, error: { message: r.status === 404 ? 'The site’s server is not running here.' : 'The server did not answer. Try again.' } };
      if (out.error && out.error.code === 'PGRST301' && session) {
        writeSession(null);
        emit('SIGNED_OUT');
      }
      return out;
    }

    // ---------- accounts ----------
    const auth = {
      async getSession() { return { data: { session }, error: null }; },
      onAuthStateChange(cb) {
        listeners.add(cb);
        setTimeout(() => { try { cb('INITIAL_SESSION', session); } catch (e) { console.error(e); } }, 0);
        return { data: { subscription: { unsubscribe() { listeners.delete(cb); } } } };
      },
      async signUp({ email, password, options }) {
        const out = await call({ op: 'auth', action: 'signUp', email, password, data: options && options.data });
        if (out.data && out.data.session) { writeSession(out.data.session); emit('SIGNED_IN'); }
        return { data: out.data || { user: null, session: null }, error: out.error || null };
      },
      async signInWithPassword({ email, password }) {
        const out = await call({ op: 'auth', action: 'signIn', email, password });
        if (out.data && out.data.session) { writeSession(out.data.session); emit('SIGNED_IN'); }
        return { data: out.data || { user: null, session: null }, error: out.error || null };
      },
      async signOut() {
        writeSession(null);
        emit('SIGNED_OUT');
        return { error: null };
      },
      async updateUser(attrs) {
        const out = await call({ op: 'auth', action: 'updateUser', password: attrs && attrs.password, data: attrs && attrs.data });
        if (out.data && out.data.user && session) {
          writeSession(Object.assign({}, session, { user: out.data.user }));
          emit('USER_UPDATED');
        }
        return { data: out.data || { user: null }, error: out.error || null };
      },
      // Officers only: set a new password for a member who forgot theirs.
      async adminSetPassword(email, password) {
        const out = await call({ op: 'auth', action: 'adminSetPassword', email, password });
        return { data: out.data || null, error: out.error || null };
      },
      async resetPasswordForEmail() {
        return { data: null, error: { message: 'Password reset by email isn’t available. Ask an officer to set a new password for you.' } };
      },
      async signInWithOAuth() {
        return { data: null, error: { message: 'Google sign-in isn’t available. Use your email and a password.' } };
      }
    };

    // ---------- tables ----------
    class Query {
      constructor(table) { this.b = { table, op: 'select', filters: [], or: [], order: [] }; this.mutating = false; }
      select(columns, opts) {
        if (this.mutating) { this.b.returning = true; return this; }
        this.b.op = 'select';
        this.b.columns = columns;
        if (opts && opts.count) this.b.count = opts.count;
        if (opts && opts.head) this.b.head = true;
        return this;
      }
      insert(values) { this.b.op = 'insert'; this.b.values = values; this.mutating = true; return this; }
      update(values) { this.b.op = 'update'; this.b.values = values; this.mutating = true; return this; }
      upsert(values, opts) { this.b.op = 'upsert'; this.b.values = values; this.mutating = true; if (opts) { this.b.onConflict = opts.onConflict; this.b.ignoreDuplicates = !!opts.ignoreDuplicates; } return this; }
      delete() { this.b.op = 'delete'; this.mutating = true; return this; }
      _f(op, col, val) { this.b.filters.push({ op, col, val }); return this; }
      eq(c, v) { return this._f('eq', c, v); }
      neq(c, v) { return this._f('neq', c, v); }
      gt(c, v) { return this._f('gt', c, v); }
      gte(c, v) { return this._f('gte', c, v); }
      lt(c, v) { return this._f('lt', c, v); }
      lte(c, v) { return this._f('lte', c, v); }
      like(c, v) { return this._f('like', c, v); }
      ilike(c, v) { return this._f('ilike', c, v); }
      is(c, v) { return this._f('is', c, v); }
      in(c, v) { return this._f('in', c, v); }
      not(c, op, v) { this.b.filters.push({ op: 'not', col: c, val: { op, val: v } }); return this; }
      or(str) { this.b.or.push(str); return this; }
      match(obj) { Object.keys(obj || {}).forEach(k => this._f('eq', k, obj[k])); return this; }
      order(col, opts) { this.b.order.push({ col, asc: !(opts && opts.ascending === false), nullsFirst: opts && opts.nullsFirst }); return this; }
      limit(n) { this.b.limit = n; return this; }
      range(a, z) { this.b.range = [a, z]; return this; }
      single() { this.b.single = true; return this; }
      maybeSingle() { this.b.maybeSingle = true; return this; }
      then(ok, fail) { return call(this.b).then(r => ({ data: r.data == null ? null : r.data, error: r.error || null, count: r.count == null ? null : r.count })).then(ok, fail); }
    }

    function rpc(fn, args) {
      return call({ op: 'rpc', fn, args: args || {} }).then(r => ({ data: r.data == null ? null : r.data, error: r.error || null }));
    }

    // ---------- live chat ----------
    // Not a real push connection: while a "channel" is open on messages it checks for new and removed messages every
    // few seconds and tells the page, so the chat screen works the same way it did with live updates.
    function channel() {
      const subs = [];
      let timer = null, known = null, maxId = 0;
      const ch = {
        on(type, filter, cb) { subs.push({ event: filter && filter.event, table: filter && filter.table, cb }); return ch; },
        subscribe(status) {
          const watching = subs.filter(s => s.table === 'messages');
          if (watching.length) {
            const poll = async () => {
              if (document.hidden || !session) return;
              const r = await call({ op: 'select', table: 'messages', columns: 'id, member_id, user_id, body, created_at', order: [{ col: 'id', asc: false }], limit: 60 });
              if (!r || !Array.isArray(r.data)) return;
              const now = new Map(r.data.map(m => [m.id, m]));
              if (known === null) { known = new Set(now.keys()); maxId = Math.max(0, ...now.keys()); return; }
              const fresh = r.data.filter(m => m.id > maxId).sort((a, b) => a.id - b.id);
              fresh.forEach(m => watching.filter(s => !s.event || s.event === 'INSERT' || s.event === '*').forEach(s => s.cb({ eventType: 'INSERT', new: m })));
              if (fresh.length) maxId = fresh[fresh.length - 1].id;
              const floor = Math.min(...now.keys());
              known.forEach(id => {
                if (id >= floor && !now.has(id)) watching.filter(s => !s.event || s.event === 'DELETE' || s.event === '*').forEach(s => s.cb({ eventType: 'DELETE', old: { id } }));
              });
              known = new Set(now.keys());
            };
            poll();
            timer = setInterval(poll, 3000);
          }
          if (status) setTimeout(() => status('SUBSCRIBED'), 0);
          return ch;
        },
        _stop() { if (timer) clearInterval(timer); timer = null; }
      };
      return ch;
    }

    return {
      auth,
      from: table => new Query(table),
      rpc,
      channel,
      removeChannel(ch) { if (ch && ch._stop) ch._stop(); return Promise.resolve('ok'); }
    };
  }

  window.RTDB = { createClient };
})();
