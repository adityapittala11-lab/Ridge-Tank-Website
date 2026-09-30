// Officer tools: card check-in, card requests, members, meetings, pitch results + Shark Notes, badges.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, confirmDialog, segmented, avatar, memberPicker, busy, friendly, fmtDate, fmtTime, localDateISO, ordinal } = RT;
  const cfg = window.RT_CONFIG;
  const S = RT.state;
  const sb = RT.sb;

  const A = { members: [], meetings: [], attendance: [], pitches: [], votes: [], awards: [], loaded: false, meetingId: null };
  RT.adminData = A;

  const normalizeUid = raw => String(raw || '').replace(/[^0-9a-z]/gi, '').toUpperCase();
  const memberById = id => A.members.find(m => m.id === id);
  const nameOf = id => (memberById(id) || {}).name || S.directory.get(id) || 'Unknown';
  const meetingLabel = m => `${fmtDate(m.meeting_date)} · ${m.name || 'Meeting'}`;
  const pointsOf = id => { const r = S.board.find(b => b.member_id === id); return r ? r.total_points : 0; };

  async function loadAll() {
    const f = RT.api.fetchAll;
    const [members, meetings, attendance, pitches, votes, awards] = await Promise.all([
      f('members', '*', q => q.order('name')),
      f('meetings', '*', q => q.order('meeting_date', { ascending: false })),
      f('attendance', '*'),
      f('pitch_entries', '*'),
      f('currency_votes', '*'),
      f('member_badges', '*'),
      RT.refreshBoard()
    ]);
    Object.assign(A, { members, meetings, attendance, pitches, votes, awards, loaded: true });
    S.meetings = meetings;
    syncPending();
  }

  function syncPending() {
    S.pendingCount = A.members.filter(m => m.card_status === 'pending').length;
    RT.updateAdminBadge();
  }

  function defaultMeetingId() {
    if (A.meetingId && A.meetings.some(m => m.id === A.meetingId)) return A.meetingId;
    const today = localDateISO();
    const m = A.meetings.find(x => x.meeting_date === today) || A.meetings.find(x => x.meeting_date <= today) || A.meetings[0];
    return m ? m.id : null;
  }

  function meetingSelect(onChange) {
    const sel = h('select', { class: 'input select', 'aria-label': 'Meeting' });
    function fill() {
      clear(sel);
      if (!A.meetings.length) sel.appendChild(h('option', { value: '' }, 'No meetings yet'));
      A.meetings.forEach(m => sel.appendChild(h('option', { value: m.id, selected: m.id === A.meetingId }, meetingLabel(m))));
    }
    fill();
    sel.addEventListener('change', () => { A.meetingId = sel.value || null; onChange && onChange(A.meetingId); });
    sel.refill = fill;
    return sel;
  }

  async function createTodayMeeting() {
    const today = localDateISO();
    const existing = A.meetings.find(m => m.meeting_date === today);
    if (existing) return existing;
    const { data, error } = await sb.from('meetings').insert({ name: 'Meeting', meeting_date: today, season: cfg.season }).select().single();
    if (error) throw error;
    A.meetings.unshift(data);
    A.meetings.sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : -1));
    S.meetings = A.meetings;
    return data;
  }

  // Short tones so whoever runs the door can keep their eyes on people, not the screen.
  let audioCtx = null;
  let soundOn = true;
  try { soundOn = localStorage.getItem('rt_sound') !== 'off'; } catch (e) { /* ignore */ }
  function beep(ok) {
    if (!soundOn) return;
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const now = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      if (ok) { o.frequency.setValueAtTime(784, now); o.frequency.setValueAtTime(1175, now + 0.09); }
      else o.frequency.setValueAtTime(196, now);
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + (ok ? 0.26 : 0.4));
      o.connect(g).connect(audioCtx.destination);
      o.start(now);
      o.stop(now + 0.45);
    } catch (e) { /* no audio */ }
  }

  // Card readers act like a keyboard: they type the card ID and press Enter.
  // Listen at the page level so nothing needs to stay focused.
  // If someone left a text box selected, a reader's burst of keys (much faster than a person types)
  // is still recognized as a card, and the typed ID is wiped back out of the box.
  function captureCards(onUid, { inModal = false } = {}) {
    let buf = '';
    let times = [];
    let last = 0;
    let lastTarget = null;
    function onKey(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      // A page-level scanner stays quiet while a dialog is open; the dialog's own scanner takes over.
      if (!inModal && document.body.classList.contains('modal-open')) return;
      const t = e.target;
      const inField = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      const now = performance.now();
      if (now - last > 400 || t !== lastTarget) { buf = ''; times = []; }
      last = now;
      lastTarget = t;
      if (e.key === 'Enter') {
        const fast = times.length >= 4 && (times[times.length - 1] - times[0]) / (times.length - 1) < 35;
        if (buf.length >= 4 && (!inField || fast)) {
          e.preventDefault();
          e.stopPropagation();
          if (inField && typeof t.value === 'string' && t.value.endsWith(buf)) {
            t.value = t.value.slice(0, -buf.length);
            t.dispatchEvent(new Event('input', { bubbles: true }));
          }
          const v = buf;
          buf = '';
          times = [];
          onUid(v);
          return;
        }
        buf = '';
        times = [];
      } else if (e.key.length === 1) {
        buf += e.key;
        times.push(now);
      }
    }
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }

  // ---------------- view ----------------
  RT.views.admin = function (root, t) {
    const tabs = [
      { value: 'checkin', label: 'Check-in', icon: 'nfc' },
      { value: 'requests', label: 'Card requests', icon: 'card', badge: S.pendingCount || 0 },
      { value: 'members', label: 'Members', icon: 'users' },
      { value: 'meetings', label: 'Meetings', icon: 'calendar' },
      { value: 'pitches', label: 'Pitches', icon: 'mic' },
      { value: 'market', label: 'Market', icon: 'coins' },
      { value: 'badges', label: 'Badges', icon: 'award' }
    ];
    const seg = segmented({ items: tabs, value: t.tab, className: 'admin-seg', ariaLabel: 'Officer tools', onChange: v => RT.go('admin/' + v) });
    const refreshBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Reload data', title: 'Reload data' }, icon('refresh', 18));
    root.appendChild(RT.pageHead('Officer tools', 'Only officers can see this page.', refreshBtn));
    root.appendChild(h('div', { class: 'admin-nav reveal', style: { '--i': 1 } }, seg));
    const host = h('div', { class: 'admin-body' });
    root.appendChild(host);

    const onPending = e => seg.setBadge('requests', e.detail);
    window.addEventListener('rt:pending', onPending);

    let tab = t.tab;
    let tabCleanup = null;
    const TABS = { checkin: tabCheckin, requests: tabRequests, members: tabMembers, meetings: tabMeetings, pitches: tabPitches, market: pane => RT.market.adminTab(pane), badges: tabBadges };

    function show(name) {
      if (!TABS[name]) name = 'checkin';
      tab = name;
      seg.setValue(name);
      if (tabCleanup) { try { tabCleanup(); } catch (e) { /* ignore */ } tabCleanup = null; }
      const pane = h('div', { class: 'admin-pane' });
      clear(host).appendChild(pane);
      if (!A.loaded) { pane.appendChild(h('div', { class: 'card' }, RT.skeleton(5))); return; }
      tabCleanup = TABS[name](pane) || null;
    }

    async function reload() {
      try { await loadAll(); } catch (e) { toast(friendly(e), 'error'); }
      show(tab);
    }
    refreshBtn.addEventListener('click', () => busy(refreshBtn, reload));

    show(tab);
    reload();
    return {
      update: nt => show(nt.tab),
      cleanup: () => {
        window.removeEventListener('rt:pending', onPending);
        if (tabCleanup) tabCleanup();
      }
    };
  };

  // ---------------- check-in ----------------
  function tabCheckin(pane) {
    A.meetingId = defaultMeetingId();
    const today = localDateISO();

    const sel = meetingSelect(() => drawList());
    const startBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, icon('plus', 16), 'Start today’s meeting');
    startBtn.hidden = A.meetings.some(m => m.meeting_date === today);
    startBtn.addEventListener('click', () => busy(startBtn, async () => {
      try {
        const m = await createTodayMeeting();
        A.meetingId = m.id;
        sel.refill();
        startBtn.hidden = true;
        drawList();
        toast('Today’s meeting is open', 'success');
      } catch (e) { toast(friendly(e), 'error'); }
    }));
    const soundBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' });
    const drawSound = () => { clear(soundBtn).append(icon(soundOn ? 'check' : 'x', 14), soundOn ? 'Sound on' : 'Sound off'); };
    drawSound();
    soundBtn.addEventListener('click', () => {
      soundOn = !soundOn;
      try { localStorage.setItem('rt_sound', soundOn ? 'on' : 'off'); } catch (e) { /* ignore */ }
      drawSound();
    });

    const status = h('div', { class: 'scan-status' });
    const result = h('div', { class: 'scan-result', 'aria-live': 'assertive' });
    const manual = h('input', { class: 'input mono', type: 'text', placeholder: 'Or type a card ID and press Enter', autocomplete: 'off', spellcheck: false });
    manual.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); const v = manual.value; manual.value = ''; handleUid(v); }
    });
    const scanner = h('div', { class: 'card scanner' },
      h('div', { class: 'scan-ring' }, h('span', { class: 'ring r1' }), h('span', { class: 'ring r2' }), h('span', { class: 'ring r3' }), h('span', { class: 'scan-core' }, icon('nfc', 30))),
      status, result, manual);

    const count = h('span', { class: 'count-big mono' }, '0');
    const list = h('ul', { class: 'checked-list' });
    const picker = memberPicker({
      members: () => A.members,
      placeholder: 'Check someone in by name',
      describe: m => (checkedIds().has(m.id) ? 'Checked in' : m.card_status === 'linked' ? '' : 'No card yet'),
      onPick: m => checkIn(m)
    });
    const side = h('div', { class: 'card checked-card' },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Checked in'), count),
      picker, list);

    pane.append(
      h('div', { class: 'card meeting-bar' }, h('div', { class: 'grow min0' }, h('span', { class: 'card-label' }, 'Meeting'), sel), h('div', { class: 'row gap-sm wrap' }, startBtn, soundBtn)),
      h('div', { class: 'checkin-grid' }, scanner, side));

    function checkedIds() { return new Set(A.attendance.filter(a => a.meeting_id === A.meetingId).map(a => a.member_id)); }
    function drawStatus() {
      clear(status);
      if (!A.meetingId) status.append(h('strong', null, 'No meeting selected'), h('span', { class: 'muted' }, 'Start today’s meeting to begin checking people in.'));
      else status.append(h('strong', null, 'Ready for cards'), h('span', { class: 'muted' }, 'Tap a card on the reader. No need to click anything.'));
      scanner.classList.toggle('idle', !A.meetingId);
    }
    function drawList() {
      drawStatus();
      const rows = A.attendance.filter(a => a.meeting_id === A.meetingId).sort((a, b) => new Date(b.tapped_at) - new Date(a.tapped_at));
      count.textContent = String(rows.length);
      clear(list);
      if (!rows.length) { list.appendChild(h('li', { class: 'empty-li muted' }, 'No one yet.')); return; }
      rows.forEach(a => list.appendChild(h('li', null, avatar(nameOf(a.member_id), 30), h('span', { class: 'grow ellipsis' }, nameOf(a.member_id)),
        h('span', { class: 'muted small mono' }, a.tapped_at ? fmtTime(a.tapped_at) : ''),
        h('button', { class: 'icon-btn sm', type: 'button', title: 'Undo check-in', 'aria-label': 'Undo check-in for ' + nameOf(a.member_id), onclick: () => undo(a) }, icon('x', 14)))));
    }

    function flash(kind, title, detail, actions) {
      clear(result);
      result.className = 'scan-result show ' + kind;
      RT.put(result,
        h('div', { class: 'result-icon' }, icon(kind === 'ok' ? 'check' : kind === 'dup' ? 'clock' : 'alert', 22)),
        h('div', { class: 'grow min0' }, h('div', { class: 'result-title' }, title), detail ? h('div', { class: 'muted small' }, detail) : null),
        actions ? h('div', { class: 'row gap-sm wrap' }, actions) : null);
      beep(kind === 'ok');
    }

    async function checkIn(m) {
      if (!A.meetingId) { flash('err', 'No meeting open', 'Start today’s meeting first.'); return; }
      const { data, error } = await sb.from('attendance').insert({ member_id: m.id, meeting_id: A.meetingId, points_awarded: cfg.points.attendance }).select().single();
      if (error && error.code === '23505') { flash('dup', `${m.name} is already checked in`, 'No extra Bites added.'); return; }
      if (error) { flash('err', 'Check-in failed', friendly(error)); return; }
      A.attendance.push(data);
      flash('ok', m.name, `+${cfg.points.attendance} Bites · checked in`);
      if (window.RTMesh) window.RTMesh.pulse(0.3, 0.5, 1.6);
      drawList();
    }

    async function handleUid(raw) {
      const uid = normalizeUid(raw);
      if (uid.length < 4) return;
      const m = A.members.find(x => x.card_uid && normalizeUid(x.card_uid) === uid);
      if (m) return checkIn(m);
      flash('err', 'New card', 'Card ' + uid + ' isn’t linked to anyone yet.', [
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => linkCardFlow(uid, async mem => { await checkIn(mem); }) }, icon('link', 14), 'Link to a member'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => newMemberWithCard(uid, async mem => { await checkIn(mem); }) }, icon('plus', 14), 'New member')
      ]);
    }

    async function undo(a) {
      const ok = await confirmDialog({ title: 'Undo check-in?', message: `${nameOf(a.member_id)} loses the ${a.points_awarded} Bites from this meeting.`, confirmText: 'Undo', danger: true });
      if (!ok) return;
      const { error } = await sb.from('attendance').delete().eq('id', a.id);
      if (error) { toast(friendly(error), 'error'); return; }
      A.attendance = A.attendance.filter(x => x.id !== a.id);
      drawList();
    }

    drawList();
    const stop = captureCards(handleUid);
    return stop;
  }

  // Pick which member a new card belongs to.
  function linkCardFlow(uid, after) {
    const hint = h('p', { class: 'muted small' }, 'People waiting on a card are listed first.');
    const waiting = A.members.filter(m => !m.card_uid).sort((a, b) => (a.card_status === 'pending' ? 0 : 1) - (b.card_status === 'pending' ? 0 : 1));
    const quick = h('div', { class: 'quick-list' }, waiting.slice(0, 8).map(m =>
      h('button', { class: 'quick-item', type: 'button', onclick: () => pick(m) }, avatar(m.name, 28), h('span', { class: 'grow ellipsis' }, m.name), h('span', { class: 'muted small' }, m.grade ? m.grade + 'th' : ''))));
    const picker = memberPicker({ members: () => A.members, placeholder: 'Search everyone', onPick: m => pick(m), describe: m => (m.card_uid ? 'Has a card' : '') });
    const md = modal({ title: 'Link this card', subtitle: 'Card ' + uid, body: h('div', { class: 'stack' }, picker, hint, quick) });
    async function pick(m) {
      if (m.card_uid && !(await confirmDialog({ title: 'Replace their card?', message: `${m.name} already has card ${m.card_uid}. The old card will stop working.`, confirmText: 'Replace' }))) return;
      try {
        await assignCard(m, uid);
        md.close();
        toast(`Card linked to ${m.name}`, 'success');
        if (after) await after(memberById(m.id));
      } catch (e) { toast(friendly(e), 'error'); }
    }
  }

  async function assignCard(m, uid) {
    const clash = A.members.find(x => x.id !== m.id && x.card_uid && normalizeUid(x.card_uid) === uid);
    if (clash) throw new Error(`That card already belongs to ${clash.name}.`);
    const { data, error } = await sb.from('members').update({ card_uid: uid, card_status: 'linked' }).eq('id', m.id).select().single();
    if (error) throw error;
    Object.assign(memberById(m.id), data);
    syncPending();
    return data;
  }

  function newMemberWithCard(uid, after) {
    const name = h('input', { class: 'input', type: 'text', placeholder: 'First and last name', maxlength: 60, autofocus: true });
    const grade = RT.gradeSwitch('');
    const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add & check in');
    const md = modal({ title: 'New member', subtitle: uid ? 'Card ' + uid : '', body: h('div', { class: 'stack' }, RT.field('Name', name), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade)), actions: [save] });
    save.addEventListener('click', () => busy(save, async () => {
      if (name.value.trim().length < 2) { toast('Enter their name.', 'error'); return; }
      const row = { name: name.value.trim(), grade: grade.getValue() || null, card_uid: uid || null, card_status: uid ? 'linked' : 'pending' };
      const { data, error } = await sb.from('members').insert(row).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      A.members.push(data);
      A.members.sort((a, b) => a.name.localeCompare(b.name));
      S.directory.set(data.id, data.name);
      syncPending();
      md.close();
      codeModal([data]);
      if (after) await after(data);
    }));
  }

  // Show login codes so an officer can hand them out (members use them to link their account).
  function codeModal(rows) {
    const text = rows.map(r => `${r.name}, ${r.login_code}`).join('\n');
    modal({
      title: rows.length === 1 ? 'Added ' + rows[0].name : `Added ${rows.length} members`,
      subtitle: 'Give each person their code. They enter it when they sign up to link their account.',
      body: h('div', { class: 'code-list' }, rows.map(r => h('div', { class: 'code-line' }, h('span', { class: 'grow ellipsis' }, r.name), h('span', { class: 'mono code-pill' }, r.login_code)))),
      actions: [h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => RT.copyText(text, 'Codes copied') }, icon('copy', 16), 'Copy all')]
    });
  }

  // ---------------- card requests ----------------
  function tabRequests(pane) {
    const pending = A.members.filter(m => m.card_status === 'pending').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    pane.appendChild(h('div', { class: 'section-row' },
      h('div', null, h('h2', { class: 'h2' }, 'Card requests'), h('p', { class: 'muted small' }, 'Everyone here needs a physical card. Tap “Link card”, then tap their new card on the reader.')),
      h('span', { class: 'count-pill lg' }, String(pending.length))));
    if (!pending.length) {
      pane.appendChild(h('div', { class: 'card empty' }, icon('check', 24, 'accent'), h('h3', null, 'All caught up'), h('p', { class: 'muted' }, 'No one is waiting on a card.')));
      return null;
    }
    const list = h('div', { class: 'request-list' });
    pending.forEach((m, i) => {
      const online = !!m.user_id;
      list.appendChild(h('div', { class: 'card request', style: { '--i': Math.min(i, 10) } },
        avatar(m.name, 44),
        h('div', { class: 'grow min0' },
          h('div', { class: 'req-name' }, m.name, m.grade ? h('span', { class: 'muted' }, ' · ' + m.grade + 'th') : null),
          h('div', { class: 'muted small ellipsis' }, (online ? 'Signed up online' : 'Added by an officer') + ' · ' + fmtDate(m.created_at, { month: 'short', day: 'numeric' }) + (m.email ? ' · ' + m.email : ''))),
        h('span', { class: 'mono code-pill', title: 'Their code' }, m.login_code || ''),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => tapToLink(m, () => { RT.rerenderAdminTab && RT.rerenderAdminTab(); }) }, icon('nfc', 16), 'Link card')));
    });
    pane.appendChild(list);
    RT.rerenderAdminTab = () => { clear(pane); tabRequests(pane); };
    return () => { RT.rerenderAdminTab = null; };
  }

  // Modal that waits for a tap on the reader, then links that card to the member.
  function tapToLink(m, after) {
    const manual = h('input', { class: 'input mono', type: 'text', placeholder: 'Or type the card ID', autocomplete: 'off', spellcheck: false });
    const state = h('p', { class: 'muted center-text' }, 'Waiting for a card…');
    const body = h('div', { class: 'stack center-text' },
      h('div', { class: 'scan-ring sm' }, h('span', { class: 'ring r1' }), h('span', { class: 'ring r2' }), h('span', { class: 'scan-core' }, icon('nfc', 24))),
      state, manual);
    let stop = null;
    const md = modal({ title: 'Tap ' + m.name.split(' ')[0] + '’s new card', subtitle: 'Hold the card on the reader until it beeps.', body, onClose: () => stop && stop() });
    async function use(raw) {
      const uid = normalizeUid(raw);
      if (uid.length < 4) return;
      state.textContent = 'Linking card ' + uid + '…';
      try {
        await assignCard(m, uid);
        beep(true);
        toast(`Card linked to ${m.name}`, 'success');
        md.close();
        if (after) after();
      } catch (e) {
        beep(false);
        state.textContent = friendly(e);
      }
    }
    stop = captureCards(use, { inModal: true });
    manual.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); use(manual.value); manual.value = ''; } });
  }

  // ---------------- members ----------------
  function tabMembers(pane) {
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Search members', autocomplete: 'off' });
    const addBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: bulkAdd }, icon('plus', 16), 'Add members');
    // For adding everyone to the group chat: one "Name, number" per line.
    const phonesBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => {
      const rows = A.members.filter(m => m.phone);
      if (!rows.length) { toast('No phone numbers yet.', 'info'); return; }
      RT.copyText(rows.map(m => m.name + ', ' + m.phone).join('\n'), rows.length + ' phone numbers copied');
    } }, icon('copy', 16), 'Copy phone numbers');
    const linked = A.members.filter(m => m.card_status === 'linked').length;
    const withAcct = A.members.filter(m => m.user_id).length;
    pane.append(
      h('div', { class: 'stat-strip' },
        stripStat('Members', A.members.length), stripStat('Cards linked', linked), stripStat('Waiting on card', A.members.length - linked), stripStat('Have accounts', withAcct)),
      h('div', { class: 'toolbar' }, h('div', { class: 'input-icon grow' }, icon('search', 16), search), phonesBtn, addBtn));
    const table = h('div', { class: 'card table-card' });
    pane.appendChild(table);

    function draw() {
      const q = search.value.trim().toLowerCase();
      const rows = A.members.filter(m => !q || m.name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q) || (m.login_code || '').toLowerCase().includes(q) || (m.phone || '').includes(q));
      clear(table);
      table.appendChild(h('div', { class: 'trow thead' }, h('span', null, 'Name'), h('span', null, 'Grade'), h('span', null, 'Bites'), h('span', null, 'Card'), h('span', null, 'Account'), h('span')));
      if (!rows.length) { table.appendChild(h('div', { class: 'empty small' }, h('p', { class: 'muted' }, A.members.length ? 'No matches.' : 'No members yet. Add the club roster to get started.'))); return; }
      rows.forEach(m => table.appendChild(h('button', { class: 'trow', type: 'button', onclick: () => memberModal(m, draw) },
        h('span', { class: 'cell-name' }, avatar(m.name, 30), h('span', { class: 'ellipsis' }, m.name)),
        h('span', { class: 'muted' }, m.grade ? m.grade + 'th' : '—'),
        h('span', { class: 'mono' }, String(pointsOf(m.id))),
        h('span', null, h('span', { class: 'status-pill sm ' + (m.card_status === 'linked' ? 'ok' : 'wait') }, m.card_status === 'linked' ? 'Linked' : 'Pending')),
        h('span', { class: m.user_id ? 'accent' : 'muted' }, m.user_id ? icon('check', 16) : '—'),
        h('span', { class: 'muted' }, icon('chevronRight', 16)))));
    }
    search.addEventListener('input', RT.debounce(draw, 120));
    draw();

    function bulkAdd() {
      const ta = h('textarea', { class: 'input textarea', rows: 8, placeholder: 'Jordan Lee, 10, 555-123-4567\nPriya Shah, 11\nSam Carter' });
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add members');
      const md = modal({ title: 'Add members', subtitle: 'One person per line: name, then grade and phone number after commas if you have them. You can paste Google Form results here.', body: ta, actions: [save], wide: true });
      save.addEventListener('click', () => busy(save, async () => {
        const rows = ta.value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
          const [n, g, p] = l.split(/,|\t/).map(s => s.trim());
          const gr = (g || '').replace(/\D/g, '');
          const row = { name: n, grade: ['9', '10', '11', '12'].includes(gr) ? gr : null, card_status: 'pending' };
          const ph = RT.cleanPhone(p);
          if (ph) row.phone = ph;
          return row;
        }).filter(r => r.name && r.name.length >= 2);
        if (!rows.length) { toast('Add at least one name.', 'error'); return; }
        const existing = new Set(A.members.map(m => m.name.toLowerCase()));
        const dupes = rows.filter(r => existing.has(r.name.toLowerCase()));
        if (dupes.length && !(await confirmDialog({ title: 'Some names already exist', message: dupes.map(d => d.name).join(', ') + ' are already members. Add them again anyway?', confirmText: 'Add anyway' }))) return;
        const { data, error } = await sb.from('members').insert(rows).select();
        if (error) { toast(friendly(error), 'error'); return; }
        A.members.push(...data);
        A.members.sort((a, b) => a.name.localeCompare(b.name));
        data.forEach(d => S.directory.set(d.id, d.name));
        syncPending();
        md.close();
        codeModal(data);
        clear(pane);
        tabMembers(pane);
      }));
    }
    return null;
  }

  function stripStat(label, value) { return h('div', { class: 'strip-stat' }, h('div', { class: 'mono strip-val' }, String(value)), h('div', { class: 'muted small' }, label)); }

  function memberModal(m, onChange) {
    const name = h('input', { class: 'input', type: 'text', value: m.name, maxlength: 60 });
    const grade = RT.gradeSwitch(m.grade || '');
    const saveBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Save');
    const attended = A.attendance.filter(a => a.member_id === m.id).length;
    const myAwards = A.awards.filter(a => a.member_id === m.id);
    const cardBox = h('div', { class: 'detail-box' });
    const codeBox = h('div', { class: 'detail-box' });

    function drawCard() {
      clear(cardBox).append(
        h('div', { class: 'card-label' }, 'Card'),
        h('div', { class: 'row between wrap gap-sm' },
          h('div', null, h('span', { class: 'status-pill ' + (m.card_status === 'linked' ? 'ok' : 'wait') }, m.card_status === 'linked' ? 'Linked' : 'Pending'),
            m.card_uid ? h('span', { class: 'mono muted small' }, '  ' + m.card_uid) : null),
          h('div', { class: 'row gap-sm' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => tapToLink(m, () => { drawCard(); onChange(); }) }, icon('nfc', 14), m.card_uid ? 'Replace card' : 'Link card'),
            m.card_uid ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: unlinkCard }, 'Unlink') : null)));
    }
    function drawCode() {
      clear(codeBox).append(
        h('div', { class: 'card-label' }, 'Login code'),
        h('div', { class: 'row between wrap gap-sm' },
          h('span', { class: 'mono code-pill lg' }, m.login_code || '—'),
          h('div', { class: 'row gap-sm' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => RT.copyText(m.login_code, 'Code copied') }, icon('copy', 14), 'Copy'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: newCode }, icon('refresh', 14), 'New code'))),
        m.phone ? h('p', { class: 'small' }, 'Phone: ', h('a', { href: 'tel:' + m.phone, class: 'mono' }, m.phone)) : null,
        h('p', { class: 'muted small' }, m.user_id ? 'Their account is linked' + (m.email ? ' (' + m.email + ')' : '') + '.' : 'No account yet. They enter this code when they sign up.'));
    }
    async function unlinkCard() {
      if (!(await confirmDialog({ title: 'Unlink card?', message: 'Their card will stop checking them in until a new one is linked.', confirmText: 'Unlink', danger: true }))) return;
      const { data, error } = await sb.from('members').update({ card_uid: null, card_status: 'pending' }).eq('id', m.id).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      Object.assign(m, data);
      syncPending();
      drawCard();
      onChange();
    }
    async function newCode() {
      if (!(await confirmDialog({ title: 'Make a new code?', message: 'The old code stops working. Use this if someone else saw it.', confirmText: 'New code' }))) return;
      const { data: code, error: e1 } = await sb.rpc('generate_login_code');
      if (e1) { toast(friendly(e1), 'error'); return; }
      const { data, error } = await sb.from('members').update({ login_code: code }).eq('id', m.id).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      Object.assign(m, data);
      drawCode();
    }
    saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
      if (name.value.trim().length < 2) { toast('Enter a name.', 'error'); return; }
      const { data, error } = await sb.from('members').update({ name: name.value.trim(), grade: grade.getValue() || null }).eq('id', m.id).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      Object.assign(m, data);
      S.directory.set(m.id, m.name);
      toast('Saved', 'success');
      onChange();
    }));

    const delBtn = h('button', { class: 'btn btn-danger btn-sm', type: 'button' }, icon('trash', 14), 'Delete member');
    const md = modal({
      title: m.name,
      subtitle: `${pointsOf(m.id)} Bites · ${attended} meeting${attended === 1 ? '' : 's'} · joined ${fmtDate(m.join_date || m.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}`,
      wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'detail-box' }, h('div', { class: 'card-label' }, 'Profile'),
          h('div', { class: 'form-grid' }, RT.field('Name', name), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade)),
          h('div', { class: 'row end' }, saveBtn)),
        cardBox, codeBox,
        h('div', { class: 'detail-box' }, h('div', { class: 'card-label' }, 'Officer-given badges'),
          myAwards.length ? h('div', { class: 'row wrap gap-sm' }, myAwards.map(a => { const b = S.badges.find(x => x.id === a.badge_id); return h('span', { class: 'tag' }, icon(RT.badgeIcon(b ? b.name : ''), 14), b ? b.name : 'Badge'); })) : h('p', { class: 'muted small' }, 'None yet. Use the Badges tab to give one.')),
        h('div', { class: 'detail-box danger-zone' }, h('div', null, h('div', { class: 'card-label' }, 'Danger zone'), h('p', { class: 'muted small' }, 'Deletes their check-ins, pitches, badges, and messages too.')), delBtn))
    });
    drawCard();
    drawCode();
    delBtn.addEventListener('click', async () => {
      const ok = await confirmDialog({ title: 'Delete ' + m.name + '?', message: 'This removes them from the leaderboard for good.', confirmText: 'Delete forever', danger: true, requireText: m.name });
      if (!ok) return;
      try {
        await deleteMember(m);
        A.members = A.members.filter(x => x.id !== m.id);
        A.attendance = A.attendance.filter(x => x.member_id !== m.id);
        A.pitches = A.pitches.filter(x => x.member_id !== m.id);
        A.awards = A.awards.filter(x => x.member_id !== m.id);
        A.votes = A.votes.filter(x => x.from_member_id !== m.id && x.to_member_id !== m.id);
        syncPending();
        await RT.refreshBoard();
        md.close();
        toast(m.name + ' deleted', 'success');
        onChange();
      } catch (e) { toast(friendly(e), 'error'); }
    });
  }

  async function deleteMember(m) {
    const steps = [
      () => sb.from('attendance').delete().eq('member_id', m.id),
      () => sb.from('pitch_entries').delete().eq('member_id', m.id),
      () => sb.from('member_badges').delete().eq('member_id', m.id),
      () => sb.from('currency_votes').delete().or(`from_member_id.eq.${m.id},to_member_id.eq.${m.id}`),
      () => sb.from('members').update({ referred_by: null }).eq('referred_by', m.id),
      () => sb.from('members').delete().eq('id', m.id)
    ];
    for (const step of steps) {
      const { error } = await step();
      if (error) throw error;
    }
  }

  // ---------------- meetings ----------------
  function tabMeetings(pane) {
    const date = h('input', { class: 'input', type: 'date', value: localDateISO() });
    const name = h('input', { class: 'input', type: 'text', placeholder: 'Meeting', maxlength: 80 });
    const where = h('input', { class: 'input', type: 'text', placeholder: 'Room (optional)', maxlength: 80 });
    const add = h('button', { class: 'btn btn-primary', type: 'button' }, icon('plus', 16), 'Add meeting');
    pane.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Schedule a meeting'), h('span', { class: 'muted small' }, 'Members see the next one on their home page.')),
      h('div', { class: 'form-grid three' }, RT.field('Date', date), RT.field('Name', name), RT.field('Where', where)),
      h('div', { class: 'row end' }, add)));
    const list = h('div', { class: 'meeting-list' });
    pane.appendChild(list);

    add.addEventListener('click', () => busy(add, async () => {
      if (!date.value) { toast('Pick a date.', 'error'); return; }
      const { data, error } = await sb.from('meetings').insert({ meeting_date: date.value, name: name.value.trim() || 'Meeting', location: where.value.trim() || null, season: cfg.season }).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      A.meetings.push(data);
      A.meetings.sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : -1));
      S.meetings = A.meetings;
      name.value = ''; where.value = '';
      toast('Meeting added', 'success');
      draw();
    }));

    function draw() {
      clear(list);
      if (!A.meetings.length) { list.appendChild(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, 'No meetings yet.'))); return; }
      const today = localDateISO();
      A.meetings.forEach((m, i) => {
        const n = A.attendance.filter(a => a.meeting_id === m.id).length;
        const upcoming = m.meeting_date > today;
        list.appendChild(h('div', { class: 'card meeting-row', style: { '--i': Math.min(i, 10) } },
          h('div', { class: 'cal-tile sm' + (m.meeting_date === today ? ' today' : '') }, h('span', { class: 'cal-mon' }, fmtDate(m.meeting_date, { month: 'short' })), h('span', { class: 'cal-day mono' }, fmtDate(m.meeting_date, { day: 'numeric' }))),
          h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis' }, m.name || 'Meeting', m.meeting_date === today ? h('span', { class: 'tag sm' }, 'Today') : upcoming ? h('span', { class: 'tag sm muted' }, 'Upcoming') : null),
            h('div', { class: 'muted small' }, fmtDate(m.meeting_date, { weekday: 'long' }) + (m.location ? ' · ' + m.location : ''))),
          h('span', { class: 'mono muted small' }, n + ' checked in'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { A.meetingId = m.id; RT.go('admin/checkin'); } }, 'Check-in'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete meeting', title: 'Delete meeting', onclick: () => delMeeting(m, n) }, icon('trash', 16))));
      });
    }

    async function delMeeting(m, n) {
      const ok = await confirmDialog({ title: 'Delete this meeting?', message: `${meetingLabel(m)}. ${n ? n + ' check-ins, plus any pitch results and Shark Notes from it, will be removed and those Bites taken back.' : 'No one has checked in yet.'}`, confirmText: 'Delete', danger: true });
      if (!ok) return;
      try {
        for (const step of [
          () => sb.from('attendance').delete().eq('meeting_id', m.id),
          () => sb.from('pitch_entries').delete().eq('meeting_id', m.id),
          () => sb.from('currency_votes').delete().eq('meeting_id', m.id),
          () => sb.from('meetings').delete().eq('id', m.id)
        ]) { const { error } = await step(); if (error) throw error; }
        A.meetings = A.meetings.filter(x => x.id !== m.id);
        A.attendance = A.attendance.filter(x => x.meeting_id !== m.id);
        A.pitches = A.pitches.filter(x => x.meeting_id !== m.id);
        A.votes = A.votes.filter(x => x.meeting_id !== m.id);
        S.meetings = A.meetings;
        if (A.meetingId === m.id) A.meetingId = null;
        toast('Meeting deleted', 'success');
        draw();
      } catch (e) { toast(friendly(e), 'error'); }
    }
    draw();
    return null;
  }

  // ---------------- pitches + Shark Notes ----------------
  function tabPitches(pane) {
    A.meetingId = defaultMeetingId();
    const sel = meetingSelect(() => { drawPitches(); drawVotes(); });
    pane.appendChild(h('div', { class: 'card meeting-bar' }, h('div', { class: 'grow min0' }, h('span', { class: 'card-label' }, 'Meeting'), sel)));
    if (!A.meetings.length) { pane.appendChild(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, 'Add a meeting first (Meetings tab).'))); return null; }
    // Investing / final-results switches (only once the v4 database update has been run).
    const switchHost = h('div');
    pane.appendChild(switchHost);
    const drawSwitches = () => {
      clear(switchHost);
      if (RT.market && RT.market.live && A.meetings.some(x => 'investing_open' in x)) switchHost.appendChild(RT.market.meetingSwitches(A.meetingId));
    };
    drawSwitches();
    sel.addEventListener('change', drawSwitches);

    // Pitch results
    let pitcher = null;
    const pPick = memberPicker({ members: () => A.members, placeholder: 'Who pitched?', keepValue: true, onPick: m => { pitcher = m; } });
    const place = segmented({ items: [{ value: '1', label: '1st' }, { value: '2', label: '2nd' }, { value: '3', label: '3rd' }, { value: '0', label: 'Pitched' }], value: '0', className: 'seg-fill', ariaLabel: 'Placement' });
    const pAdd = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add result');
    const pList = h('div', { class: 'entry-list' });
    const ptsHint = h('span', { class: 'muted small' }, `1st +${cfg.points.pitch[1]} · 2nd +${cfg.points.pitch[2]} · 3rd +${cfg.points.pitch[3]} · pitched +${cfg.points.pitch[0]}`);

    // Shark Notes
    let investor = null, receiver = null;
    const vFrom = memberPicker({ members: () => A.members, placeholder: 'Investor', keepValue: true, onPick: m => { investor = m; } });
    const vTo = memberPicker({ members: () => A.members, placeholder: 'Invested in', keepValue: true, onPick: m => { receiver = m; } });
    const vAmt = h('input', { class: 'input mono', type: 'number', min: 1, step: 1, placeholder: 'Amount' });
    const vAdd = h('button', { class: 'btn btn-primary', type: 'button' }, 'Record');
    const vList = h('div', { class: 'entry-list' });
    const vTotals = h('div', { class: 'totals' });

    pane.append(h('div', { class: 'two-col' },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Pitch results'), ptsHint),
        h('div', { class: 'stack-sm' }, pPick, place, h('div', { class: 'row end' }, pAdd)), pList),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Shark Notes'), h('span', { class: 'muted small' }, 'Who invested in whom')),
        h('div', { class: 'stack-sm' }, h('div', { class: 'form-grid' }, vFrom, vTo), h('div', { class: 'row gap-sm' }, vAmt, vAdd)), vTotals, vList)));

    pAdd.addEventListener('click', () => busy(pAdd, async () => {
      if (!A.meetingId) { toast('Pick a meeting.', 'error'); return; }
      if (!pitcher) { toast('Pick who pitched.', 'error'); return; }
      if (A.pitches.some(p => p.meeting_id === A.meetingId && p.member_id === pitcher.id)) { toast(pitcher.name + ' already has a result for this meeting.', 'error'); return; }
      const placement = Number(place.getValue());
      const { data, error } = await sb.from('pitch_entries').insert({ member_id: pitcher.id, meeting_id: A.meetingId, placement, points_awarded: cfg.points.pitch[placement] || 0 }).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      A.pitches.push(data);
      pitcher = null;
      pPick.clearValue();
      toast('Result saved', 'success');
      drawPitches();
    }));

    vAdd.addEventListener('click', () => busy(vAdd, async () => {
      const amt = Math.round(Number(vAmt.value));
      if (!A.meetingId) { toast('Pick a meeting.', 'error'); return; }
      if (!investor || !receiver) { toast('Pick both people.', 'error'); return; }
      if (investor.id === receiver.id) { toast('People can’t invest in themselves.', 'error'); return; }
      if (!(amt > 0)) { toast('Enter an amount.', 'error'); return; }
      const { data, error } = await sb.from('currency_votes').insert({ from_member_id: investor.id, to_member_id: receiver.id, meeting_id: A.meetingId, amount: amt }).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      A.votes.push(data);
      vAmt.value = '';
      drawVotes();
    }));

    function drawPitches() {
      clear(pList);
      const rows = A.pitches.filter(p => p.meeting_id === A.meetingId).sort((a, b) => (a.placement || 9) - (b.placement || 9));
      if (!rows.length) { pList.appendChild(h('p', { class: 'muted small' }, 'No results for this meeting yet.')); return; }
      rows.forEach(p => pList.appendChild(h('div', { class: 'entry' },
        h('span', { class: 'place-badge p' + (p.placement || 0) }, p.placement ? ordinal(p.placement) : '—'),
        h('span', { class: 'grow ellipsis' }, nameOf(p.member_id)),
        h('span', { class: 'mono accent' }, '+' + p.points_awarded),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Remove result', onclick: async () => {
          if (!(await confirmDialog({ title: 'Remove this result?', message: `${nameOf(p.member_id)} loses ${p.points_awarded} Bites.`, confirmText: 'Remove', danger: true }))) return;
          const { error } = await sb.from('pitch_entries').delete().eq('id', p.id);
          if (error) { toast(friendly(error), 'error'); return; }
          A.pitches = A.pitches.filter(x => x.id !== p.id);
          drawPitches();
        } }, icon('x', 14)))));
    }

    function drawVotes() {
      clear(vList);
      clear(vTotals);
      const rows = A.votes.filter(v => v.meeting_id === A.meetingId);
      if (!rows.length) { vList.appendChild(h('p', { class: 'muted small' }, 'No Shark Notes recorded for this meeting.')); return; }
      const totals = new Map();
      rows.forEach(v => totals.set(v.to_member_id, (totals.get(v.to_member_id) || 0) + Number(v.amount)));
      const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
      const max = ranked[0][1];
      vTotals.append(...ranked.map(([id, amt]) => h('div', { class: 'total-row' + (amt === max ? ' top' : '') },
        amt === max ? icon('crown', 14) : h('span', { class: 'ico-space' }),
        h('span', { class: 'grow ellipsis' }, nameOf(id)), h('span', { class: 'mono' }, String(amt)))));
      rows.forEach(v => vList.appendChild(h('div', { class: 'entry small' },
        h('span', { class: 'grow ellipsis' }, nameOf(v.from_member_id), h('span', { class: 'muted' }, ' → '), nameOf(v.to_member_id)),
        h('span', { class: 'mono' }, String(v.amount)),
        h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Remove', onclick: async () => {
          const { error } = await sb.from('currency_votes').delete().eq('id', v.id);
          if (error) { toast(friendly(error), 'error'); return; }
          A.votes = A.votes.filter(x => x.id !== v.id);
          drawVotes();
        } }, icon('x', 14)))));
    }

    drawPitches();
    drawVotes();
    return null;
  }

  // ---------------- badges ----------------
  function tabBadges(pane) {
    let who = null;
    const pick = memberPicker({ members: () => A.members, placeholder: 'Member', keepValue: true, onPick: m => { who = m; } });
    const sel = h('select', { class: 'input select', 'aria-label': 'Badge' });
    const cats = [...new Set(S.badges.map(b => b.category || 'Other'))];
    cats.forEach(c => sel.appendChild(h('optgroup', { label: c }, S.badges.filter(b => (b.category || 'Other') === c).map(b => h('option', { value: b.id }, b.name + (b.trigger_type === 'manual' ? '' : ' (normally automatic)'))))));
    const manualFirst = S.badges.find(b => b.trigger_type === 'manual');
    if (manualFirst) sel.value = manualFirst.id;
    const give = h('button', { class: 'btn btn-primary', type: 'button' }, icon('award', 16), 'Give badge');
    const list = h('div', { class: 'entry-list' });
    pane.append(
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Give a badge'), h('span', { class: 'muted small' }, 'Automatic badges (meetings, streaks, pitches) count up on their own.')),
        h('div', { class: 'form-grid' }, pick, sel),
        h('div', { class: 'row end' }, give)),
      h('div', { class: 'card' }, h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Given by officers'), h('span', { class: 'mono muted small' }, String(A.awards.length))), list));

    give.addEventListener('click', () => busy(give, async () => {
      if (!who) { toast('Pick a member.', 'error'); return; }
      const badge = S.badges.find(b => b.id === sel.value);
      const { data, error } = await sb.from('member_badges').insert({ member_id: who.id, badge_id: sel.value }).select().single();
      if (error) { toast(error.code === '23505' ? `${who.name} already has ${badge ? badge.name : 'that badge'}.` : friendly(error), 'error'); return; }
      A.awards.push(data);
      toast(`${badge ? badge.name : 'Badge'} given to ${who.name}`, 'success');
      draw();
    }));

    function draw() {
      clear(list);
      if (!A.awards.length) { list.appendChild(h('p', { class: 'muted small' }, 'No officer-given badges yet.')); return; }
      [...A.awards].sort((a, b) => new Date(b.earned_at) - new Date(a.earned_at)).forEach(a => {
        const b = S.badges.find(x => x.id === a.badge_id);
        list.appendChild(h('div', { class: 'entry' },
          h('span', { class: 'badge-icon sm burg' }, icon(RT.badgeIcon(b ? b.name : ''), 14)),
          h('span', { class: 'grow ellipsis' }, h('strong', null, b ? b.name : 'Badge'), h('span', { class: 'muted' }, ' · ' + nameOf(a.member_id))),
          h('span', { class: 'muted small' }, fmtDate(a.earned_at, { month: 'short', day: 'numeric' })),
          h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': 'Take back badge', onclick: async () => {
            if (!(await confirmDialog({ title: 'Take back this badge?', message: `${nameOf(a.member_id)} loses ${b ? b.name : 'this badge'}.`, confirmText: 'Take back', danger: true }))) return;
            const { error } = await sb.from('member_badges').delete().eq('id', a.id);
            if (error) { toast(friendly(error), 'error'); return; }
            A.awards = A.awards.filter(x => x.id !== a.id);
            draw();
          } }, icon('x', 14))));
      });
    }
    draw();
    return null;
  }
})();
