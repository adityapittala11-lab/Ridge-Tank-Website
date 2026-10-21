// Program chat: officers post, members reply. Sender + time above incoming bubbles, delivery status under yours.
// Officers also get a small menu next to each name to mute (10 min to a week) or ban.
// New messages arrive by quick polling (see channel() in js/backend.js), with a slower backup poll here.
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
    let modMembers = new Map();   // officers only: id -> member row (for mute status)
    async function loadMods() {
      if (!S.isAdmin) return;
      const r = await sb.from('members').select('id, name, user_id, muted_until');
      if (r.data) modMembers = new Map(r.data.map(x => [x.id, x]));
    }

    // Officers: wipe the whole chat (asks first).
    function clearBtn() {
      const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', title: 'Delete every message' }, icon('trash', 14), 'Clear chat');
      b.addEventListener('click', async () => {
        const ok = await confirmDialog({ title: 'Delete every message?', message: 'This clears the whole chat for everyone and can’t be undone.', confirmText: 'Clear chat', danger: true, requireText: 'CLEAR' });
        if (!ok) return;
        const { error } = await sb.from('messages').delete().gt('id', 0);
        if (error) { toast(friendly(error), 'error'); return; }
        toast('Chat cleared', 'success');
        RT.rerender();
      });
      return b;
    }

    const liveDot = h('span', { class: 'live-pill' }, h('span', { class: 'live-dot' }), 'Connecting');
    const head = h('header', { class: 'chat-head' },
      h('div', { class: 'chat-title' },
        h('span', { class: 'chat-icon' }, icon('chat', 18)),
        h('div', null, h('h2', null, 'Program chat'), h('p', { class: 'muted small' }, S.isAdmin ? 'You post, members reply.' : 'Officers post here. Reply to any message.'))),
      h('div', { class: 'row gap-sm' }, S.isAdmin ? clearBtn() : null, liveDot));

    const list = h('div', { class: 'chat-list' });
    const olderBtn = h('button', { class: 'btn btn-ghost btn-sm older-btn', type: 'button', hidden: true }, 'Load earlier messages');
    const scroller = h('div', { class: 'chat-scroll', role: 'log', 'aria-live': 'polite', 'aria-label': 'Messages' }, olderBtn, list);
    const newPill = h('button', { class: 'new-pill', type: 'button', hidden: true, onclick: () => scrollToBottom(true) }, 'New messages', icon('chevronDown', 14));

    const input = h('textarea', { class: 'composer-input', rows: 1, placeholder: 'Message everyone…', maxlength: 1000, 'aria-label': 'Message' });
    const counter = h('span', { class: 'composer-count mono', hidden: true });
    const sendBtn = h('button', { class: 'send-btn', type: 'submit', disabled: true, 'aria-label': 'Send message' }, icon('arrowUp', 18));
    let replyTo = null;       // the message being answered
    const replyBar = h('div', { class: 'reply-bar', hidden: true });
    const composer = h('form', { class: 'composer' }, input, counter, sendBtn);
    const hint = h('div', { class: 'chat-hint muted small', hidden: true });
    // Members can't start a message. The box appears when they tap Reply, and is replaced by a note while they're muted.
    function syncComposer() {
      const muted = !S.isAdmin && RT.moderation.isMuted(S.me);
      composer.hidden = muted || (!S.isAdmin && !replyTo);
      hint.hidden = !(muted || (!S.isAdmin && !replyTo));
      hint.textContent = muted ? 'You are muted for ' + RT.moderation.mutedFor(S.me) + '. You can read the chat but not post.' : 'Only officers start messages. Tap the reply arrow on a message to answer it.';
      if (S.isAdmin) input.placeholder = replyTo ? 'Write a reply…' : 'Post to everyone…';
    }

    const panel = h('section', { class: 'chat card reveal' }, head, h('div', { class: 'chat-body' }, scroller, newPill), replyBar, composer, hint);
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
          S.officerMembers = new Set(dir.filter(d => d.is_officer).map(d => d.id));
        } catch (e) { /* names fall back to "Member" */ }
      }
    }

    async function loadInitial() {
      list.appendChild(RT.skeleton(4, 'chat-skel'));
      await loadMods();
      const { data, error } = await sb.from('messages').select('id, member_id, user_id, body, created_at, reply_to').order('id', { ascending: false }).limit(PAGE);
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
      const { data, error } = await sb.from('messages').select('id, member_id, user_id, body, created_at, reply_to').lt('id', oldestLoaded).order('id', { ascending: false }).limit(PAGE);
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
      const { data, error } = await sb.from('messages').select('id, member_id, user_id, body, created_at, reply_to').gt('id', lastReal).order('id', { ascending: true }).limit(PAGE);
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
          h('p', { class: 'muted' }, S.isAdmin ? 'Post something. Members can reply to it.' : 'Officers will post here. You can reply to anything they send.')));
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
          S.officerMembers.has(m.member_id) ? h('span', { class: 'msg-officer' }, 'Officer') : null,
          h('span', { class: 'msg-time' }, fmtTime(m.created_at)),
          modFor(m)));
      }
      stack.appendChild(foot);
      const el = h('div', { class: 'msg-group ' + (mine ? 'out' : 'in') }, mine ? null : avatar(nameOf(m.member_id), 32, 'msg-avatar'), stack);
      return { el, stack, foot, last: m };
    }

    // Officers: a small menu next to someone else's name.
    function modFor(m) {
      if (!S.isAdmin || m.user_id === S.user.id || S.officerMembers.has(m.member_id)) return null;
      const row = modMembers.get(m.member_id) || { id: m.member_id, name: nameOf(m.member_id), muted_until: null };
      return RT.moderation.muteMenu(row, async removed => {
        if (removed) { await loadMods(); for (const x of [...msgs]) if (x.member_id === m.member_id) remove(x.id); }
        else await loadMods();
        render();
      });
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

    const snippet = t => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > 90 ? x.slice(0, 90) + '…' : x; };
    function quoteEl(m) {
      if (!m.reply_to) return null;
      const orig = byId.get(m.reply_to);
      const q = h('button', { class: 'bubble-quote', type: 'button', onclick: e => { e.stopPropagation(); jumpTo(m.reply_to); } },
        h('b', null, orig ? (orig.user_id === S.user.id ? 'You' : nameOf(orig.member_id)) : 'Earlier message'),
        h('span', null, orig ? snippet(orig.body) : 'Tap to find it'));
      return q;
    }
    function jumpTo(id) {
      const el = list.querySelector('[data-mid="' + id + '"]');
      if (!el) { toast('That message is further up. Load earlier messages.', 'info'); return; }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('flash');
      setTimeout(() => el.classList.remove('flash'), 1400);
    }
    function startReply(m) {
      if (!S.isAdmin && RT.moderation.isMuted(S.me)) { toast('You are muted for ' + RT.moderation.mutedFor(S.me) + '.', 'error'); return; }
      replyTo = m;
      RT.put(clear(replyBar),
        h('div', { class: 'min0' }, h('b', null, 'Replying to ' + (m.user_id === S.user.id ? 'yourself' : nameOf(m.member_id))), h('div', { class: 'muted small ellipsis' }, snippet(m.body))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cancel reply', onclick: cancelReply }, icon('x', 16)));
      replyBar.hidden = false;
      syncComposer();
      input.focus();
    }
    function cancelReply() { replyTo = null; replyBar.hidden = true; clear(replyBar); syncComposer(); }

    function bubble(m, mine) {
      const canDelete = typeof m.id === 'number' && (mine || S.isAdmin);
      const canReply = typeof m.id === 'number';
      const b = h('div', { class: 'bubble-row' + (fresh.has(m.id) ? ' pop' : ''), 'data-mid': String(m.id) },
        canReply ? h('button', { class: 'bubble-reply', type: 'button', 'aria-label': 'Reply', title: 'Reply', onclick: () => startReply(m) }, icon('reply', 14)) : null,
        h('div', {
          class: 'bubble' + (m.status === 'failed' ? ' failed' : '') + (m.status === 'sending' ? ' sending' : ''),
          // On phones there's no hover, so tapping a message reveals its delete button.
          onclick: (canDelete || canReply) ? () => b.classList.toggle('show-del') : null
        }, quoteEl(m), m.body),
        canDelete ? h('button', { class: 'bubble-del', type: 'button', 'aria-label': 'Delete message', title: 'Delete', onclick: () => del(m) }, icon('trash', 14)) : null);
      return b;
    }

    // ---------- sending ----------
    let tempSeq = 0;
    async function send(body, existing, replyId) {
      const temp = existing || {
        id: 'tmp-' + (++tempSeq), member_id: S.me.id, user_id: S.user.id, body, created_at: new Date().toISOString(), status: 'sending', reply_to: replyId || null
      };
      replyId = existing ? existing.reply_to : replyId;
      if (!existing) { add(temp, { animate: true }); sortMsgs(); }
      temp.status = 'sending';
      render();
      scrollToBottom(true);
      const { data, error } = await sb.from('messages').insert({ body, member_id: S.me.id, user_id: S.user.id, reply_to: replyId || null }).select('id, member_id, user_id, body, created_at, reply_to').single();
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
      if (e.key === 'Escape' && replyTo) cancelReply();
    });
    composer.addEventListener('submit', e => {
      e.preventDefault();
      const body = input.value.trim();
      if (!body) return;
      input.value = '';
      autosize();
      const rid = replyTo && typeof replyTo.id === 'number' ? replyTo.id : null;
      cancelReply();
      send(body, null, rid);
      input.focus();
    });

    syncComposer();
    loadInitial().then(() => { if (alive) subscribe(); });
    if (window.innerWidth > 720 && S.isAdmin) setTimeout(() => input.focus({ preventScroll: true }), 300);
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
