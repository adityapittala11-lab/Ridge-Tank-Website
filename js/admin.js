// Officer tools: check-in, members, meetings, pitch results + bites, badges.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, confirmDialog, segmented, avatar, memberPicker, busy, friendly, fmtDate, fmtTime, localDateISO, ordinal } = RT;
  const cfg = window.RT_CONFIG;
  const S = RT.state;
  const sb = RT.sb;

  const A = { members: [], meetings: [], attendance: [], pitches: [], votes: [], awards: [], loaded: false, meetingId: null };
  RT.adminData = A;

  const memberById = id => A.members.find(m => m.id === id);
  const nameOf = id => (memberById(id) || {}).name || S.directory.get(id) || 'Unknown';
  const meetingLabel = m => `${fmtDate(m.meeting_date)} · ${m.name || 'Meeting'}`;
  const pointsOf = id => { const r = S.board.find(b => b.member_id === id); return r ? r.total_points : 0; };

  // Shared with js/admin2.js (Welcome queue, Bounties, Meetings).
  RT.adminKit = {
    A, memberById, nameOf, beep, syncPending, codeModal, stripStat, loadAll, openMember: (m, onChange) => memberModal(m, onChange || (() => {}))
  };

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

  // What officers still owe: cards to make, people to welcome (bounty claims are counted by their own tab).
  function syncPending() {
    S.adminCounts.welcome = A.members.filter(m => m.contact_status === 'new' && m.phone).length;
    S.adminCounts.approvals = A.members.filter(m => m.status === 'pending').length;
    S.pendingCount = S.adminCounts.welcome + S.adminCounts.claims + S.adminCounts.approvals;
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

  // ---------------- view ----------------
  RT.views.admin = function (root, t) {
    const tabs = [
      { value: 'checkin', label: 'Check-in', icon: 'check' },
      { value: 'approvals', label: 'Approvals', icon: 'check', badge: S.adminCounts.approvals || 0 },
      { value: 'welcome', label: 'Welcome', icon: 'send', badge: S.adminCounts.welcome || 0 },
      { value: 'members', label: 'Members', icon: 'users' },
      { value: 'meetings', label: 'Calendar', icon: 'calendar' },
      { value: 'pitches', label: 'Pitches', icon: 'mic' },
      { value: 'bounties', label: 'Bounties', icon: 'target', badge: S.adminCounts.claims || 0 },
      { value: 'badges', label: 'Badges', icon: 'award' },
      { value: 'fairplay', label: 'Fair play', icon: 'shield' },
      { value: 'assistant', label: 'Assistant', icon: 'sparkle' }
    ];
    const seg = segmented({ items: tabs, value: t.tab, className: 'admin-seg', ariaLabel: 'Officer tools', onChange: v => RT.go('admin/' + v) });
    const refreshBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Reload data', title: 'Reload data' }, icon('refresh', 18));
    root.appendChild(RT.pageHead('Officer tools', 'Only officers can see this page.', refreshBtn));
    root.appendChild(h('div', { class: 'admin-nav reveal', style: { '--i': 1 } }, seg));
    const host = h('div', { class: 'admin-body' });
    root.appendChild(host);

    const onPending = () => {
      seg.setBadge('approvals', S.adminCounts.approvals);
      seg.setBadge('welcome', S.adminCounts.welcome);
      seg.setBadge('bounties', S.adminCounts.claims);
    };
    window.addEventListener('rt:pending', onPending);

    let tab = t.tab;
    let tabCleanup = null;
    // welcome, bounties, and meetings (the calendar) live in admin2.js
    const TABS = Object.assign({ checkin: tabCheckin, members: tabMembers, pitches: tabPitches, badges: tabBadges }, RT.adminTabs);

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
    const scanner = h('div', { class: 'card scanner' }, status, result);

    const count = h('span', { class: 'count-big mono' }, '0');
    const list = h('ul', { class: 'checked-list' });
    const picker = memberPicker({
      members: () => A.members,
      placeholder: 'Check someone in by name',
      describe: m => (checkedIds().has(m.id) ? 'Checked in' : ''),
      onPick: m => checkIn(m)
    });
    scanner.append(h('div', { class: 'checkin-pick' }, picker));
    const side = h('div', { class: 'card checked-card' },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Checked in'), count),
      list);

    pane.append(
      h('div', { class: 'card meeting-bar' }, h('div', { class: 'grow min0' }, h('span', { class: 'card-label' }, 'Meeting'), sel), h('div', { class: 'row gap-sm wrap' }, startBtn, soundBtn)),
      h('div', { class: 'checkin-grid' }, scanner, side));

    function checkedIds() { return new Set(A.attendance.filter(a => a.meeting_id === A.meetingId).map(a => a.member_id)); }
    function drawStatus() {
      clear(status);
      if (!A.meetingId) status.append(h('strong', null, 'No meeting selected'), h('span', { class: 'muted' }, 'Start today’s meeting to begin checking people in.'));
      else status.append(h('strong', null, 'Ready to check people in'), h('span', { class: 'muted' }, 'Search a name below and tap it. Each person gets their Bites once.'));
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

    async function undo(a) {
      const ok = await confirmDialog({ title: 'Undo check-in?', message: `${nameOf(a.member_id)} loses the ${a.points_awarded} Bites from this meeting.`, confirmText: 'Undo', danger: true });
      if (!ok) return;
      const { error } = await sb.from('attendance').delete().eq('id', a.id);
      if (error) { toast(friendly(error), 'error'); return; }
      A.attendance = A.attendance.filter(x => x.id !== a.id);
      drawList();
    }

    drawList();
    return null;
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
    const withAcct = A.members.filter(m => m.user_id).length;
    pane.append(
      h('div', { class: 'stat-strip' },
        stripStat('Members', A.members.length), stripStat('Have accounts', withAcct), stripStat('Waiting to join', A.members.length - withAcct)),
      h('div', { class: 'toolbar' }, h('div', { class: 'input-icon grow' }, icon('search', 16), search), phonesBtn, addBtn));
    const table = h('div', { class: 'card table-card' });
    pane.appendChild(table);

    function draw() {
      const q = search.value.trim().toLowerCase();
      const digits = q.replace(/\D/g, '');
      const rows = A.members.filter(m => !q || m.name.toLowerCase().includes(q) || (m.email || '').toLowerCase().includes(q) || (m.login_code || '').toLowerCase().includes(q) || (digits.length >= 3 && (m.phone || '').includes(digits)));
      clear(table);
      table.appendChild(h('div', { class: 'trow thead' }, h('span', null, 'Name'), h('span', null, 'Grade'), h('span', null, 'Bites'), h('span', null, 'Account'), h('span')));
      if (!rows.length) { table.appendChild(h('div', { class: 'empty small' }, h('p', { class: 'muted' }, A.members.length ? 'No matches.' : 'No members yet. Add the roster to get started.'))); return; }
      rows.forEach(m => table.appendChild(h('button', { class: 'trow', type: 'button', onclick: () => memberModal(m, draw) },
        h('span', { class: 'cell-name' }, avatar(m.name, 30), h('span', { class: 'ellipsis' }, m.name), m.banned ? h('span', { class: 'status-pill sm wait' }, 'Banned') : null),
        h('span', { class: 'muted' }, m.grade ? m.grade + 'th' : '—'),
        h('span', { class: 'mono' }, String(pointsOf(m.id))),
        h('span', { class: m.user_id ? 'accent' : 'muted' }, m.user_id ? icon('check', 16) : '—'),
        h('span', { class: 'muted' }, icon('chevronRight', 16)))));
    }
    search.addEventListener('input', RT.debounce(draw, 120));
    draw();

    // Reads pasted lines: typed by hand ("Jordan Lee, 10") or copied straight from the Google Form sheet
    // (timestamp, name, grade, email, phone, WhatsApp yes/no…). Each cell is recognized by what it looks like.
    function splitCells(line) {
      if (line.includes('\t')) return line.split('\t');
      const out = [];
      let cur = '', q = false;
      for (const ch of line) {
        if (ch === '"') q = !q;
        else if (ch === ',' && !q) { out.push(cur); cur = ''; }
        else cur += ch;
      }
      out.push(cur);
      return out;
    }
    function parsePasted(text) {
      const rows = [];
      text.split(/\r?\n/).forEach(line => {
        if (!line.trim()) return;
        const rest = [];
        const row = { name: '', grade: null, email: null, phone: null, whatsapp_ok: false };
        const cells = splitCells(line).map(c => c.trim().replace(/^"|"$/g, '').trim()).filter(Boolean);
        if (cells.some(c => /^(timestamp|name|full name)$/i.test(c))) return; // the sheet's header row
        cells.forEach(c => {
          if (/^\d{1,2}\/\d{1,2}\/\d{2,4}/.test(c) || /^\d{4}-\d{2}-\d{2}/.test(c)) return; // form timestamp
          if (/^\S+@\S+\.\S+$/.test(c)) { row.email = row.email || c.toLowerCase(); return; }
          if (/^(9|10|11|12)(th)?( grade)?$/i.test(c)) { row.grade = c.match(/\d+/)[0]; return; }
          if (/^[\d\s().+-]{7,}$/.test(c) && RT.cleanPhone(c)) { row.phone = row.phone || RT.cleanPhone(c); return; }
          if (/^(yes|y)$/i.test(c)) { row.whatsapp_ok = true; return; }
          if (/^(no|n)$/i.test(c)) return;
          rest.push(c);
        });
        row.name = (rest[0] || '').slice(0, 60);
        if (row.name.length >= 2) rows.push(row);
      });
      return rows;
    }

    function bulkAdd() {
      const ta = h('textarea', { class: 'input textarea', rows: 9, placeholder: 'Jordan Lee, 10\nPriya Shah, 11, priya@school.org, 480-555-0123\n\nOr paste rows straight from the Google Form sheet.' });
      const found = h('p', { class: 'muted small' }, 'Nothing pasted yet.');
      ta.addEventListener('input', () => {
        const r = parsePasted(ta.value);
        found.textContent = r.length ? `Found ${r.length} ${r.length === 1 ? 'person' : 'people'}` + (r.filter(x => x.phone).length ? `, ${r.filter(x => x.phone).length} with a phone number.` : '.') : 'Nothing pasted yet.';
      });
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Add members');
      const md = modal({ title: 'Add members', subtitle: 'One person per line. Grade, email and phone are picked up automatically if they’re there.', body: h('div', { class: 'stack-sm' }, ta, found), actions: [save], wide: true });
      save.addEventListener('click', () => busy(save, async () => {
        const rows = parsePasted(ta.value).map(r => ({
          name: r.name, grade: r.grade, email: r.email, phone: r.phone, whatsapp_ok: r.whatsapp_ok,
          source: r.email || r.phone ? 'form' : 'officer'
        }));
        if (!rows.length) { toast('Add at least one name.', 'error'); return; }
        const existing = new Set(A.members.map(m => m.name.toLowerCase()));
        const emails = new Set(A.members.map(m => (m.email || '').toLowerCase()).filter(Boolean));
        const dupes = rows.filter(r => existing.has(r.name.toLowerCase()) || (r.email && emails.has(r.email)));
        if (dupes.length && !(await confirmDialog({ title: 'Some people already exist', message: dupes.map(d => d.name).join(', ') + ' are already members. Add them again anyway?', confirmText: 'Add anyway' }))) return;
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
    const codeBox = h('div', { class: 'detail-box' });
    const phoneF = RT.phoneFields({ phone: m.phone || '', whatsapp: m.whatsapp_ok, required: false });
    const reach = h('div', { class: 'row gap-sm wrap' });
    function drawReach() {
      clear(reach);
      if (!m.phone) return;
      const msg = RT.fillTemplate(cfg.templates.welcomeText, m);
      reach.append(
        h('a', { class: 'btn btn-ghost btn-sm', href: `sms:${m.phone}?&body=${encodeURIComponent(msg)}` }, icon('chat', 14), 'Text ' + RT.fmtPhone(m.phone)),
        h('a', { class: 'btn btn-ghost btn-sm', href: `https://wa.me/${m.phone.replace(/\D/g, '')}?text=${encodeURIComponent(msg)}`, target: '_blank', rel: 'noopener' }, icon('whatsapp', 14), 'WhatsApp'));
    }

    function drawCode() {
      clear(codeBox).append(
        h('div', { class: 'card-label' }, 'Login code'),
        h('div', { class: 'row between wrap gap-sm' },
          h('span', { class: 'mono code-pill lg' }, m.login_code || '—'),
          h('div', { class: 'row gap-sm' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => RT.copyText(m.login_code, 'Code copied') }, icon('copy', 14), 'Copy'),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: newCode }, icon('refresh', 14), 'New code'))),
        m.phone ? h('p', { class: 'small' }, 'Phone: ', h('a', { href: 'tel:' + m.phone, class: 'mono' }, m.phone)) : '',
        m.user_id && m.email ? h('div', { class: 'row' }, h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: setPassword }, icon('lock', 14), 'Set a new password')) : '',
        h('p', { class: 'muted small' }, m.user_id ? 'Their account is linked' + (m.email ? ' (' + m.email + ')' : '') + '.' : 'No account yet. They enter this code when they sign up.'));
    }
    // For a member who forgot their password (there is no reset email): the officer picks a temporary one.
    function setPassword() {
      const pw = h('input', { class: 'input', type: 'text', placeholder: 'At least 8 characters', autocomplete: 'off', maxlength: 100 });
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Set password');
      const md = modal({ title: 'New password for ' + m.name, subtitle: 'Tell them the password. They can change it later from their profile.', body: RT.field('Temporary password', pw), actions: [go] });
      go.addEventListener('click', () => busy(go, async () => {
        const { error } = await sb.auth.adminSetPassword(m.email, pw.value);
        if (error) { toast(friendly(error), 'error'); return; }
        md.close();
        toast('Password changed. Give it to ' + m.name.split(' ')[0] + '.', 'success');
      }));
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
      if (phoneF.error()) { toast(phoneF.error(), 'error'); return; }
      const { data, error } = await sb.from('members').update({
        name: name.value.trim(), grade: grade.getValue() || null,
        phone: phoneF.raw() ? phoneF.value() : null, whatsapp_ok: phoneF.whatsapp()
      }).eq('id', m.id).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      Object.assign(m, data);
      S.directory.set(m.id, m.name);
      syncPending();
      drawReach();
      toast('Saved', 'success');
      onChange();
    }));

    // ---- Bites: add or remove, with a reason, and see what officers changed before ----
    const bitesBox = h('div', { class: 'detail-box' });
    async function drawBites() {
      const amt = h('input', { class: 'input mono', type: 'number', min: 1, step: 1, inputmode: 'numeric', placeholder: 'Bites', 'aria-label': 'Amount' });
      const why = h('input', { class: 'input', type: 'text', maxlength: 200, placeholder: 'Why? (optional)', 'aria-label': 'Reason' });
      const hist = h('ul', { class: 'timeline' });
      const apply = async (sign, btn) => {
        const n = Math.floor(Number(amt.value));
        if (!(n >= 1)) { toast('Enter how many Bites.', 'error'); return; }
        if (sign < 0 && n > pointsOf(m.id)) { toast(m.name.split(' ')[0] + ' only has ' + pointsOf(m.id) + ' Bites.', 'error'); return; }
        await busy(btn, async () => {
          const { error } = await sb.from('bite_adjustments').insert({ member_id: m.id, amount: sign * n, reason: why.value.trim() });
          if (error) { toast(friendly(error), 'error'); return; }
          await RT.refreshBoard();
          const sub = document.querySelector('#modal-root [role="dialog"] h3 + p, #modal-root .modal h3 + p');
          if (sub) sub.textContent = sub.textContent.replace(/^\d+ Bites/, pointsOf(m.id) + ' Bites');
          toast((sign > 0 ? 'Added ' : 'Removed ') + n + ' Bites ' + (sign > 0 ? 'to ' : 'from ') + m.name.split(' ')[0], 'success');
          onChange();
          drawBites();
        });
      };
      const addB = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, icon('plus', 14), 'Add');
      const subB = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Remove');
      addB.addEventListener('click', () => apply(1, addB));
      subB.addEventListener('click', () => apply(-1, subB));
      clear(bitesBox).append(
        h('div', { class: 'row between wrap gap-sm' }, h('div', { class: 'card-label' }, 'Bites'), h('span', { class: 'mono' }, pointsOf(m.id) + ' now')),
        h('div', { class: 'row gap-sm wrap' }, h('div', { style: { width: '110px' } }, amt), h('div', { class: 'grow' }, why), addB, subB),
        hist);
      const { data } = await sb.from('bite_adjustments').select('id, amount, reason, created_at').eq('member_id', m.id).order('created_at', { ascending: false }).limit(8);
      (data || []).forEach(a => hist.appendChild(h('li', null,
        h('span', { class: 'tl-icon' + (a.amount < 0 ? ' burg' : '') }, icon(a.amount < 0 ? 'x' : 'plus', 14)),
        h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis' }, a.reason || (a.amount < 0 ? 'Removed by an officer' : 'Added by an officer')), h('div', { class: 'muted small' }, fmtDate(a.created_at, { month: 'short', day: 'numeric' }))),
        h('span', { class: 'pts-gain mono' }, (a.amount > 0 ? '+' : '') + a.amount))));
    }

    // ---- Chat: mute for a while, or ban (removes the person from the site entirely) ----
    const banBox = h('div', { class: 'detail-box danger-zone' });
    function drawBan() {
      const isOfficer = !!m.user_id && A.officerIds && A.officerIds.has(m.user_id);
      if (!A.officerIds) { A.officerIds = new Set(); sb.from('admins').select('user_id').then(r => { (r.data || []).forEach(x => A.officerIds.add(x.user_id)); drawBan(); }); }
      if (isOfficer) { clear(banBox).append(h('div', null, h('div', { class: 'card-label' }, 'Chat'), h('p', { class: 'muted small' }, 'Officers can’t be muted or banned.'))); return; }
      const mod = RT.moderation;
      const muteRow = h('div', { class: 'row gap-sm wrap' }, mod.MUTE_CHOICES.map(c => {
        const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, c.label);
        b.addEventListener('click', () => busy(b, async () => {
          try { const row = await mod.setMute(m.id, c.min); m.muted_until = row.muted_until; toast(m.name + ' is muted for ' + c.label, 'success'); drawBan(); onChange(); } catch (e) { toast(friendly(e), 'error'); }
        }));
        return b;
      }));
      const unmute = mod.isMuted(m) ? h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Unmute') : null;
      if (unmute) unmute.addEventListener('click', () => busy(unmute, async () => {
        try { const row = await mod.setMute(m.id, 0); m.muted_until = row.muted_until; toast(m.name + ' is unmuted', 'success'); drawBan(); onChange(); } catch (e) { toast(friendly(e), 'error'); }
      }));
      const ban = h('button', { class: 'btn btn-danger btn-sm', type: 'button' }, icon('x', 14), 'Ban and remove');
      ban.addEventListener('click', async () => { if (await mod.banMember(m)) { md.close(); onChange(true); } });
      clear(banBox).append(
        h('div', null, h('div', { class: 'card-label' }, 'Chat'),
          h('p', { class: 'muted small' }, mod.isMuted(m) ? 'Muted for ' + mod.mutedFor(m) + '. They can read the chat but not post.' : 'Mute stops them posting for a while. They can still read.')),
        h('div', { class: 'row between wrap gap-sm' }, muteRow, unmute),
        h('div', { class: 'row between wrap gap-sm mod-ban' }, h('p', { class: 'muted small' }, 'Ban deletes their account and everything they did, and blocks their email.'), ban));
    }

    const delBtn = h('button', { class: 'btn btn-danger btn-sm', type: 'button' }, icon('trash', 14), 'Delete member');
    let md = null;
    md = modal({
      title: m.name,
      subtitle: `${pointsOf(m.id)} Bites · ${attended} meeting${attended === 1 ? '' : 's'} · joined ${fmtDate(m.join_date || m.created_at, { month: 'short', day: 'numeric', year: 'numeric' })}`,
      wide: true,
      body: h('div', { class: 'stack' },
        h('div', { class: 'detail-box' }, h('div', { class: 'card-label' }, 'Profile'),
          h('div', { class: 'form-grid' }, RT.field('Name', name), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade)),
          phoneF.el, reach,
          h('div', { class: 'row end' }, saveBtn)),
        bitesBox, codeBox, banBox,
        h('div', { class: 'detail-box' }, h('div', { class: 'card-label' }, 'Officer-given badges'),
          myAwards.length ? h('div', { class: 'row wrap gap-sm' }, myAwards.map(a => { const b = S.badges.find(x => x.id === a.badge_id); return h('span', { class: 'tag' }, icon(RT.badgeIcon(b ? b.name : ''), 14), b ? b.name : 'Badge'); })) : h('p', { class: 'muted small' }, 'None yet. Use the Badges tab to give one.')),
        h('div', { class: 'detail-box danger-zone' }, h('div', null, h('div', { class: 'card-label' }, 'Danger zone'), h('p', { class: 'muted small' }, 'Deletes their check-ins, pitches, badges, and messages too.')), delBtn))
    });
    drawCode();
    drawReach();
    drawBites();
    drawBan();
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

  // ---------------- pitches + bites ----------------
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

    // Bites
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
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Bites'), h('span', { class: 'muted small' }, 'Who invested in whom')),
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
      if (!rows.length) { vList.appendChild(h('p', { class: 'muted small' }, 'No bites recorded for this meeting.')); return; }
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
