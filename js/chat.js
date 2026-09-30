// Club chat: sender + time above incoming bubbles, delivery status under yours.
// Live updates over Supabase Realtime, with polling as a backup.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, avatar, friendly, fmtTime, dayLabel, confirmDialog } = RT;
  const S = RT.state;
  const sb = RT.sb;
  const PAGE = 100;
  const GROUP_GAP = 5 * 60 * 1000;

  RT.views.chat = function (root) {
    const msgs = [];          // sorted by created_at
    const byId = new Map();
    const fresh = new Set();  // ids to animate in
    let oldestLoaded = null;
    let hasMore = false;
    let channel = null;
    let live = false;
    let pollTimer = null;
    let alive = true;

    const liveDot = h('span', { class: 'live-pill' }, h('span', { class: 'live-dot' }), 'Connecting');
    const head = h('header', { class: 'chat-head' },
      h('div', { class: 'chat-title' },
        h('span', { class: 'chat-icon' }, icon('chat', 18)),
        h('div', null, h('h2', null, 'Club chat'), h('p', { class: 'muted small' }, `Everyone in Ridge Tank · ${S.directory.size || S.board.length} members`))),
      liveDot);

    const list = h('div', { class: 'chat-list' });
    const olderBtn = h('button', { class: 'btn btn-ghost btn-sm older-btn', type: 'button', hidden: true }, 'Load earlier messages');
    const scroller = h('div', { class: 'chat-scroll', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' }, olderBtn, list);
    const newPill = h('button', { class: 'new-pill', type: 'button', hidden: true, onclick: () => scrollToBottom(true) }, 'New messages', icon('chevronDown', 14));

    const input = h('textarea', { class: 'composer-input', rows: 1, placeholder: 'Message the club…', maxlength: 1000, 'aria-label': 'Message' });
    const counter = h('span', { class: 'composer-count mono', hidden: true });
    const sendBtn = h('button', { class: 'send-btn', type: 'submit', disabled: true, 'aria-label': 'Send message' }, icon('arrowUp', 18));
    const composer = h('form', { class: 'composer' }, input, counter, sendBtn);

    const panel = h('section', { class: 'chat card reveal' }, head, h('div', { class: 'chat-body' }, scroller, newPill), composer);
    root.appendChild(panel);

    // ---------- data ----------
    function add(row, { animate = false } = {}) {
      if (!row || byId.has(row.id)) return false;
      const m = { ...row, status: row.status || 'sent' };
      byId.set(m.id, m);
      msgs.push(m);
      if (animate) fresh.add(m.id);
      return true;
    }
    function sortMsgs() { msgs.sort((a, b) => new Date(a.created_at) - new Date(b.created_at) || (a.id > b.id ? 1 : -1)); }
    function remove(id) {
      const m = byId.get(id);
      if (!m) return;
      byId.delete(id);
      msgs.splice(msgs.indexOf(m), 1);
    }
    function nameOf(memberId) { return S.directory.get(memberId) || 'Member'; }
    async function ensureNames(rows) {
      if (rows.some(r => !S.directory.has(r.member_id))) {
        try {
          const dir = await RT.api.directory();
          S.directory = new Map(dir.map(d => [d.id, d.name]));
        } catch (e) { /* names fall back to "Member" */ }
      }
    }

    async function loadInitial() {
      list.appendChild(RT.skeleton(4, 'chat-skel'));
      const { data, error } = await sb.from('messages').select('id, member_id, user_id, body, created_at').order('id', { ascending: false }).limit(PAGE);
      if (!alive) return;
      clear(list);
      if (error) { list.appendChild(h('div', { class: 'empty' }, h('p', { class: 'muted' }, friendly(error)))); return; }
      await ensureNames(data);
      data.forEach(r => add(r));
      sortMsgs();
      hasMore = data.length === PAGE;
      oldestLoaded = data.length ? data[data.length - 1].id : null;
      render();
      scrollToBottom(false);
    }

    async function loadOlder() {
      if (!oldestLoaded) return;
      const prevH = scroller.scrollHeight;
      const { data, error } = await sb.from('messages').select('id, member_id, user_id, body, created_at').lt('id', oldestLoaded).order('id', { ascending: false }).limit(PAGE);
      if (error) { toast(friendly(error), 'error'); return; }
      await ensureNames(data);
      data.forEach(r => add(r));
      sortMsgs();
      hasMore = data.length === PAGE;
      if (data.length) oldestLoaded = data[data.length - 1].id;
      render();
      scroller.scrollTop = scroller.scrollHeight - prevH;
    }
    olderBtn.addEventListener('click', () => RT.busy(olderBtn, loadOlder));

    async function pollNew() {
      const lastReal = msgs.filter(m => typeof m.id === 'number').map(m => m.id).reduce((a, b) => Math.max(a, b), 0);
      const { data, error } = await sb.from('messages').select('id, member_id, user_id, body, created_at').gt('id', lastReal).order('id', { ascending: true }).limit(PAGE);
      if (error || !alive || !data.length) return;
      await ensureNames(data);
      incoming(data);
    }

    function incoming(rows) {
      const nearBottom = isNearBottom();
      let added = 0;
      rows.forEach(r => {
        // Our own message can arrive over realtime before the insert call returns; swap out the placeholder.
        if (r.user_id === S.user.id && !byId.has(r.id)) {
          const temp = msgs.find(x => typeof x.id === 'string' && x.status === 'sending' && x.body === r.body);
          if (temp) remove(temp.id);
        }
        if (add(r, { animate: true })) added++;
      });
      if (!added) return;
      sortMsgs();
      render();
      if (nearBottom || rows.every(r => r.user_id === S.user.id)) scrollToBottom(true);
      else newPill.hidden = false;
    }

    // ---------- realtime ----------
    function subscribe() {
      channel = sb.channel('club-chat')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, async payload => {
          await ensureNames([payload.new]);
          incoming([payload.new]);
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, payload => {
          if (payload.old && byId.has(payload.old.id)) { remove(payload.old.id); render(); }
        })
        .subscribe(status => {
          live = status === 'SUBSCRIBED';
          liveDot.classList.toggle('on', live);
          liveDot.lastChild.textContent = live ? 'Live' : 'Syncing';
          if (live) pollNew();
        });
      // Backup: quick polling while realtime is down, slow polling while it's up.
      let tick = 0;
      pollTimer = setInterval(() => {
        tick++;
        if (document.hidden) return;
        if (!live || tick % 6 === 0) pollNew();
      }, 4000);
    }

    // ---------- rendering ----------
    function isNearBottom() { return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 140; }
    function scrollToBottom(smooth) {
      newPill.hidden = true;
      requestAnimationFrame(() => scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' }));
    }
    scroller.addEventListener('scroll', () => { if (isNearBottom()) newPill.hidden = true; });

    function render() {
      olderBtn.hidden = !hasMore;
      clear(list);
      if (!msgs.length) {
        list.appendChild(h('div', { class: 'chat-empty' },
          h('span', { class: 'big-icon' }, icon('chat', 26)),
          h('h3', null, 'No messages yet'),
          h('p', { class: 'muted' }, 'Say hi. Everyone in the club can see this chat.')));
        return;
      }
      let lastDay = null;
      let group = null;
      const lastMine = [...msgs].reverse().find(m => m.user_id === S.user.id);
      msgs.forEach((m, idx) => {
        const day = RT.localDateISO(new Date(m.created_at));
        if (day !== lastDay) {
          list.appendChild(h('div', { class: 'day-sep' }, h('span', null, dayLabel(m.created_at))));
          lastDay = day;
          group = null;
        }
        const mine = m.user_id === S.user.id;
        const prev = msgs[idx - 1];
        const joins = group && prev && prev.member_id === m.member_id && prev.user_id === m.user_id &&
          new Date(m.created_at) - new Date(prev.created_at) < GROUP_GAP;
        if (!joins) {
          group = buildGroup(m, mine);
          list.appendChild(group.el);
        }
        group.stack.insertBefore(bubble(m, mine), group.foot);
        group.last = m;
        if (mine) updateFoot(group, m === lastMine);
      });
      fresh.clear();
    }

    function buildGroup(m, mine) {
      const stack = h('div', { class: 'msg-stack' });
      const foot = h('div', { class: 'msg-foot' });
      if (!mine) {
        stack.appendChild(h('div', { class: 'msg-meta' },
          h('span', { class: 'msg-name' }, nameOf(m.member_id)),
          h('span', { class: 'msg-time' }, fmtTime(m.created_at))));
      }
      stack.appendChild(foot);
      const el = h('div', { class: 'msg-group ' + (mine ? 'out' : 'in') }, mine ? null : avatar(nameOf(m.member_id), 32, 'msg-avatar'), stack);
      return { el, stack, foot, last: m };
    }

    function updateFoot(group, isLatest) {
      const m = group.last;
      clear(group.foot);
      if (m.status === 'sending') group.foot.append(icon('clock', 13), 'Sending…');
      else if (m.status === 'failed') {
        group.foot.classList.add('failed');
        group.foot.append(icon('alert', 13), 'Not sent · ',
          h('button', { class: 'link-btn', type: 'button', onclick: () => retry(m) }, 'Retry'));
      } else {
        group.foot.classList.remove('failed');
        RT.put(group.foot, h('span', null, fmtTime(m.created_at)), isLatest ? h('span', { class: 'delivered' }, icon('checks', 14), 'Delivered') : null);
      }
    }

    function bubble(m, mine) {
      const canDelete = typeof m.id === 'number' && (mine || S.isAdmin);
      const b = h('div', { class: 'bubble-row' + (fresh.has(m.id) ? ' pop' : '') },
        h('div', {
          class: 'bubble' + (m.status === 'failed' ? ' failed' : '') + (m.status === 'sending' ? ' sending' : ''),
          // On phones there's no hover, so tapping a message reveals its delete button.
          onclick: canDelete ? () => b.classList.toggle('show-del') : null
        }, m.body),
        canDelete ? h('button', { class: 'bubble-del', type: 'button', 'aria-label': 'Delete message', title: 'Delete', onclick: () => del(m) }, icon('trash', 14)) : null);
      return b;
    }

    // ---------- sending ----------
    let tempSeq = 0;
    async function send(body, existing) {
      const temp = existing || {
        id: 'tmp-' + (++tempSeq), member_id: S.me.id, user_id: S.user.id, body, created_at: new Date().toISOString(), status: 'sending'
      };
      if (!existing) { add(temp, { animate: true }); sortMsgs(); }
      temp.status = 'sending';
      render();
      scrollToBottom(true);
      const { data, error } = await sb.from('messages').insert({ body, member_id: S.me.id, user_id: S.user.id }).select('id, member_id, user_id, body, created_at').single();
      if (!alive) return;
      if (error) {
        temp.status = 'failed';
        render();
        toast(friendly(error), 'error');
        return;
      }
      remove(temp.id);
      if (!byId.has(data.id)) add(data);
      sortMsgs();
      render();
      scrollToBottom(true);
    }
    function retry(m) { send(m.body, m); }

    async function del(m) {
      const ok = await confirmDialog({ title: 'Delete message?', message: 'It will disappear for everyone.', confirmText: 'Delete', danger: true });
      if (!ok) return;
      const { error } = await sb.from('messages').delete().eq('id', m.id);
      if (error) { toast(friendly(error), 'error'); return; }
      remove(m.id);
      render();
    }

    function autosize() {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 140) + 'px';
      const len = input.value.length;
      sendBtn.disabled = !input.value.trim();
      counter.hidden = len < 800;
      counter.textContent = String(1000 - len);
    }
    input.addEventListener('input', autosize);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); composer.requestSubmit(); }
    });
    composer.addEventListener('submit', e => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      input.value = '';
      autosize();
      send(body);
      input.focus();
    });

    loadInitial().then(() => { if (alive) subscribe(); });
    if (window.innerWidth > 720) setTimeout(() => input.focus({ preventScroll: true }), 300);
    const onVis = () => { if (!document.hidden && alive) pollNew(); };
    document.addEventListener('visibilitychange', onVis);

    return {
      cleanup() {
        alive = false;
        clearInterval(pollTimer);
        document.removeEventListener('visibilitychange', onVis);
        if (channel) sb.removeChannel(channel);
      }
    };
  };
})();
