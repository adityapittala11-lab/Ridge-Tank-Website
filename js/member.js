// Member screens: home dashboard, leaderboard, profile & badges.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, segmented, avatar, busy, friendly, fmtDate, daysUntil, countUp, ordinal } = RT;
  const cfg = window.RT_CONFIG;
  const S = RT.state;
  const api = RT.api;

  const tierChip = name => h('span', { class: 'tier-chip ' + RT.tierClass(name) }, name || 'Reef Shark');

  // Everything a member's own screens need, loaded in one go.
  async function loadMine() {
    const id = S.me.id;
    const [attendance, pitches, awarded, votes, referrals] = await Promise.all([
      api.myAttendance(id).catch(() => []),
      api.myPitches(id).catch(() => []),
      api.myBadges(id).catch(() => []),
      api.votes().catch(() => []),
      api.referralCount().catch(() => 0),
      RT.refreshBoard()
    ]);
    const stats = RT.computeStats({ memberId: id, meetings: S.meetings, attendance, pitches, votes, referrals });
    const progress = RT.badgeProgress(S.badges, stats, awarded);
    const mine = S.board.find(r => r.member_id === id) || { total_points: 0, rank: S.board.length + 1, current_tier: (S.tiers[0] || {}).name };
    return { attendance, pitches, awarded, votes, stats, progress, mine };
  }
  RT.loadMine = loadMine;

  function meetingById(id) { return S.meetings.find(m => m.id === id); }

  function progressBar(value, max, cls = '') {
    const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
    const fill = h('span', { class: 'bar-fill' });
    requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.width = pct + '%'; }));
    return h('span', { class: 'bar-track ' + cls, role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': max, 'aria-valuenow': value }, fill);
  }
  RT.progressBar = progressBar;

  // ---------------- home ----------------
  RT.views.home = function (root) {
    const me = S.me;
    const hour = new Date().getHours();
    const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    const first = String(me.name).split(' ')[0];
    const subLine = h('span');
    root.appendChild(RT.pageHead(`${greet}, ${first}`, subLine));

    const grid = h('div', { class: 'dash-grid' },
      h('section', { class: 'card span-7 reveal', style: { '--i': 1 } }, RT.skeleton(4)),
      h('section', { class: 'card span-5 reveal', style: { '--i': 2 } }, RT.skeleton(4)),
      h('section', { class: 'card span-4 reveal', style: { '--i': 3 } }, RT.skeleton(3)),
      h('section', { class: 'card span-8 reveal', style: { '--i': 4 } }, RT.skeleton(5)),
      h('section', { class: 'card span-6 reveal', style: { '--i': 5 } }, RT.skeleton(4)),
      h('section', { class: 'card span-6 reveal', style: { '--i': 6 } }, RT.skeleton(5)));
    root.appendChild(grid);
    const [cPoints, cCard, cNext, cActivity, cBadges, cBoard] = grid.children;

    loadMine().then(d => {
      const { cur, next } = RT.tierFor(d.mine.total_points, S.tiers);
      subLine.textContent = `${cur ? cur.name : 'Reef Shark'} · #${d.mine.rank} of ${S.board.length} · ${d.mine.total_points} Bites`;
      renderPoints(cPoints, d, cur, next);
      renderCardStatus(cCard);
      renderNext(cNext);
      renderActivity(cActivity, d);
      renderBadgesMini(cBadges, d);
      renderBoardMini(cBoard);
    }).catch(e => toast(friendly(e), 'error'));
    return {};
  };

  function renderPoints(el, d, cur, next) {
    const num = h('span', { class: 'big-num mono' }, '0');
    const need = next ? next.point_threshold - d.mine.total_points : 0;
    const span = next ? next.point_threshold - (cur ? cur.point_threshold : 0) : 1;
    const into = next ? d.mine.total_points - (cur ? cur.point_threshold : 0) : 1;
    el.classList.add('points-card');
    clear(el).append(
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Your Bites'), tierChip(cur && cur.name)),
      h('div', { class: 'points-row' }, num, h('span', { class: 'pts-unit' }, 'Bites'),
        h('span', { class: 'rank-pill' }, icon('trophy', 14), '#' + d.mine.rank, h('span', { class: 'muted' }, ' of ' + S.board.length))),
      h('div', { class: 'tier-progress' },
        progressBar(into, span, 'bar-lg'),
        h('div', { class: 'row between small' },
          h('span', { class: 'muted' }, cur ? cur.name : ''),
          h('span', null, next ? h('span', null, h('strong', null, String(need)), ' more to ', next.name) : h('span', { class: 'accent' }, 'Top tier. Nothing above you.')))),
      h('div', { class: 'mini-stats' },
        miniStat('Meetings', d.stats.attendance, 'calendar'),
        miniStat('Streak', d.stats.streak, 'flame'),
        miniStat('Pitches', d.stats.pitches, 'mic'),
        miniStat('Badges', d.progress.filter(b => b.earned).length + '/' + d.progress.length, 'award')));
    countUp(num, d.mine.total_points);
  }

  function miniStat(label, value, ic) {
    return h('div', { class: 'mini-stat' }, h('span', { class: 'mini-icon' }, icon(ic, 16)), h('div', null, h('div', { class: 'mini-val mono' }, String(value)), h('div', { class: 'muted small' }, label)));
  }

  function renderCardStatus(el) {
    const linked = S.me.card_status === 'linked';
    const steps = [
      ['Account created', true],
      ['Card requested', true],
      ['Card made & linked', linked],
      ['Tap in at meetings', linked]
    ];
    clear(el).append(
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Your card'),
        h('span', { class: 'status-pill ' + (linked ? 'ok' : 'wait') }, linked ? 'Linked' : 'Physical card pending')),
      h('div', { class: 'nfc-card ' + (linked ? 'is-linked' : '') },
        h('div', { class: 'nfc-top' }, h('span', { class: 'brand-name small' }, 'Ridge Tank'), icon('nfc', 20)),
        h('div', { class: 'nfc-name' }, S.me.name),
        h('div', { class: 'nfc-foot mono' }, linked ? 'Member card' : 'Being made')),
      h('ol', { class: 'steps' }, steps.map(([label, doneStep]) => h('li', { class: doneStep ? 'done' : '' }, h('span', { class: 'step-dot' }, doneStep ? icon('check', 12) : null), label))),
      h('p', { class: 'muted small' }, linked
        ? 'Tap your card on the reader when you walk in. Your Bites show up here right away.'
        : 'An officer is making your card. Until you have it, they can check you in by name.'));
  }

  function renderNext(el) {
    const today = RT.localDateISO();
    const upcoming = S.meetings.filter(m => m.meeting_date >= today).sort((a, b) => (a.meeting_date < b.meeting_date ? -1 : 1));
    const m = upcoming[0];
    clear(el).appendChild(h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Next meeting'), icon('calendar', 18, 'muted')));
    if (!m) {
      el.appendChild(h('div', { class: 'empty-mini' }, h('p', { class: 'muted' }, 'Nothing on the calendar yet. Officers will post the next date here.')));
      return;
    }
    const days = daysUntil(m.meeting_date);
    const when = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
    const later = upcoming.slice(1, 4);
    RT.put(el,
      h('div', { class: 'next-date' },
        h('div', { class: 'cal-tile' }, h('span', { class: 'cal-mon' }, fmtDate(m.meeting_date, { month: 'short' })), h('span', { class: 'cal-day mono' }, fmtDate(m.meeting_date, { day: 'numeric' }))),
        h('div', null, h('div', { class: 'next-when' }, when), h('div', { class: 'muted small' }, fmtDate(m.meeting_date, { weekday: 'long', month: 'long', day: 'numeric' })))),
      h('div', { class: 'next-meta' },
        h('div', null, h('span', { class: 'muted small' }, 'What'), h('div', null, m.name || 'Meeting')),
        m.location ? h('div', null, h('span', { class: 'muted small' }, 'Where'), h('div', null, m.location)) : null),
      later.length ? h('div', { class: 'later' },
        h('div', { class: 'card-label' }, 'After that'),
        h('ul', null, later.map(x => h('li', null,
          h('span', { class: 'mono small later-date' }, fmtDate(x.meeting_date, { month: 'short', day: 'numeric' })),
          h('span', { class: 'grow ellipsis' }, x.name || 'Meeting'),
          x.location ? h('span', { class: 'muted small' }, x.location) : null)))) : null);
  }

  function renderActivity(el, d) {
    const items = [];
    d.attendance.forEach(a => {
      const m = meetingById(a.meeting_id);
      items.push({ at: a.tapped_at || (m && m.meeting_date), icon: 'nfc', title: 'Checked in' + (m ? ' · ' + (m.name || 'Meeting') : ''), pts: Number(a.points_awarded) || 0 });
    });
    d.pitches.forEach(p => {
      const m = meetingById(p.meeting_id);
      const place = Number(p.placement) || 0;
      items.push({ at: p.created_at, icon: place === 1 ? 'trophy' : 'mic', title: place ? `Pitched · ${ordinal(place)} place` : 'Pitched in the Tank', sub: m ? m.name : '', pts: Number(p.points_awarded) || 0, burg: place === 1 });
    });
    d.progress.filter(b => b.awardedAt).forEach(b => items.push({ at: b.awardedAt, icon: RT.badgeIcon(b.badge.name), title: 'Badge · ' + b.badge.name, pts: null, burg: true }));
    items.sort((a, b) => new Date(b.at) - new Date(a.at));

    clear(el).appendChild(h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Recent activity'), h('span', { class: 'muted small' }, items.length ? items.length + ' total' : '')));
    if (!items.length) {
      el.appendChild(h('div', { class: 'empty-mini' }, icon('nfc', 22, 'muted'), h('p', { class: 'muted' }, 'Nothing yet. Tap your card at the next meeting for your first 10 Bites.')));
      return;
    }
    el.appendChild(h('ul', { class: 'timeline' }, items.slice(0, 6).map(it =>
      h('li', null,
        h('span', { class: 'tl-icon' + (it.burg ? ' burg' : '') }, icon(it.icon, 16)),
        h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis' }, it.title), h('div', { class: 'muted small' }, it.at ? RT.dayLabel(String(it.at).length === 10 ? RT.parseLocalDate(it.at) : it.at) : '')),
        it.pts != null ? h('span', { class: 'pts-gain mono' }, '+' + it.pts) : null))));
  }

  function renderBadgesMini(el, d) {
    const earned = d.progress.filter(b => b.earned);
    const nextUp = d.progress
      .filter(b => !b.earned && !b.manual && b.need > 1)
      .sort((a, b) => b.have / b.need - a.have / a.need)[0];
    RT.put(clear(el),
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Badges'), h('a', { class: 'link-sm', href: '#/profile' }, 'See all', icon('chevronRight', 14))),
      h('div', { class: 'badge-count' }, h('span', { class: 'big-num sm mono' }, String(earned.length)), h('span', { class: 'muted' }, ' of ' + d.progress.length + ' earned')),
      earned.length
        ? h('div', { class: 'badge-row' }, earned.slice(0, 7).map(b => h('span', { class: 'badge-dot', title: b.badge.name }, icon(RT.badgeIcon(b.badge.name), 18))))
        : h('p', { class: 'muted small' }, 'Your first badge comes with your first meeting.'),
      nextUp ? h('div', { class: 'next-badge' },
        h('div', { class: 'row between small' }, h('span', null, 'Next: ', h('strong', null, nextUp.badge.name)), h('span', { class: 'mono muted' }, nextUp.have + '/' + nextUp.need)),
        progressBar(nextUp.have, nextUp.need)) : null);
  }

  function renderBoardMini(el) {
    const top = S.board.slice(0, 5);
    const mineIdx = S.board.findIndex(r => r.member_id === S.me.id);
    const rows = [...top];
    if (mineIdx >= 5) rows.push(S.board[mineIdx]);
    clear(el).appendChild(h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Leaderboard'), h('a', { class: 'link-sm', href: '#/leaderboard' }, 'Full list', icon('chevronRight', 14))));
    if (!rows.length) { el.appendChild(h('p', { class: 'muted' }, 'No Bites yet this season.')); return; }
    el.appendChild(h('ol', { class: 'mini-board' }, rows.map((r, i) =>
      h('li', { class: (r.member_id === S.me.id ? 'me' : '') + (i === 5 ? ' gap-above' : '') },
        h('span', { class: 'mono rank' }, String(r.rank)), avatar(r.name, 28), h('span', { class: 'grow ellipsis' }, r.name),
        h('span', { class: 'mono' }, String(r.total_points))))));
  }

  // ---------------- leaderboard ----------------
  RT.views.leaderboard = function (root) {
    const search = h('input', { class: 'input', type: 'search', placeholder: 'Find a member', autocomplete: 'off' });
    const tools = h('div', { class: 'head-tools' }, h('div', { class: 'input-icon' }, icon('search', 16), search));
    const sub = h('span', null, 'Season ' + cfg.season.replace('-', '–'));
    root.appendChild(RT.pageHead('Leaderboard', sub, tools));

    let grades = null;
    let gradeFilter = 'all';
    if (S.isAdmin) {
      const gSeg = segmented({
        items: [{ value: 'all', label: 'All' }, { value: '9', label: '9th' }, { value: '10', label: '10th' }, { value: '11', label: '11th' }, { value: '12', label: '12th' }],
        value: 'all', className: 'seg-sm', ariaLabel: 'Filter by grade',
        onChange: v => { gradeFilter = v; draw(); }
      });
      tools.appendChild(gSeg);
      RT.sb.from('members').select('id, grade').then(({ data }) => {
        grades = new Map((data || []).map(m => [m.id, m.grade]));
        draw();
      });
    }

    const podium = h('div', { class: 'podium reveal', style: { '--i': 1 } });
    const list = h('ol', { class: 'board card reveal', style: { '--i': 2 } }, RT.skeleton(6));
    root.append(podium, list);

    function rows() {
      let r = S.board;
      if (gradeFilter !== 'all' && grades) r = r.filter(x => grades.get(x.member_id) === gradeFilter);
      const q = search.value.trim().toLowerCase();
      if (q) r = r.filter(x => String(x.name).toLowerCase().includes(q));
      return r;
    }

    function draw() {
      const all = rows();
      const filtered = !!search.value.trim() || gradeFilter !== 'all';
      sub.textContent = `Season ${cfg.season.replace('-', '–')} · ${S.board.length} member${S.board.length === 1 ? '' : 's'}`;
      clear(podium);
      clear(list);
      if (!all.length) {
        list.appendChild(h('div', { class: 'empty' }, icon('search', 22, 'muted'), h('p', { class: 'muted' }, S.board.length ? 'No one matches that.' : 'No members on the board yet.')));
        return;
      }
      let rest = all;
      if (!filtered && all.length >= 1) {
        const top = all.slice(0, 3);
        const order = [top[1], top[0], top[2]].filter(Boolean);
        order.forEach(r => podium.appendChild(podiumSlot(r)));
        rest = all.slice(3);
      }
      podium.hidden = filtered;
      rest.forEach((r, i) => list.appendChild(boardRow(r, i)));
      if (!rest.length) list.appendChild(h('div', { class: 'empty small' }, h('p', { class: 'muted' }, 'Everyone’s on the podium. For now.')));
    }

    function podiumSlot(r) {
      const place = r.rank;
      const me = r.member_id === S.me.id;
      return h('div', { class: `podium-slot p${Math.min(place, 3)}${me ? ' me' : ''}` },
        place === 1 ? h('span', { class: 'crown' }, icon('crown', 22)) : null,
        h('div', { class: 'podium-avatar' }, avatar(r.name, place === 1 ? 76 : 60)),
        h('div', { class: 'podium-name ellipsis' }, r.name, me ? h('span', { class: 'you-tag' }, 'You') : null),
        h('div', { class: 'podium-pts mono' }, String(r.total_points), h('span', { class: 'muted' }, ' Bites')),
        tierChip(r.current_tier),
        h('div', { class: 'podium-base' }, h('span', { class: 'mono' }, ordinal(place))));
    }

    function boardRow(r, i) {
      const me = r.member_id === S.me.id;
      return h('li', { class: 'board-row' + (me ? ' me' : ''), style: { '--i': Math.min(i, 12) } },
        h('span', { class: 'rank mono' }, String(r.rank)),
        avatar(r.name, 36),
        h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis name' }, r.name, me ? h('span', { class: 'you-tag' }, 'You') : null)),
        tierChip(r.current_tier),
        h('span', { class: 'pts mono' }, String(r.total_points), h('span', { class: 'muted' }, ' Bites')));
    }

    search.addEventListener('input', RT.debounce(draw, 120));
    if (S.board.length) draw();
    RT.refreshBoard().then(draw);
    return {};
  };

  // ---------------- profile ----------------
  RT.views.profile = function (root) {
    const me = S.me;
    const editBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: editProfile }, icon('edit', 16), 'Edit');
    const tierSlot = h('span');
    const heroCard = h('section', { class: 'card profile-hero reveal', style: { '--i': 0 } },
      h('div', { class: 'profile-avatar' }, avatar(me.name, 84)),
      h('div', { class: 'grow min0' },
        h('h1', { class: 'profile-name' }, me.name),
        h('div', { class: 'profile-meta' },
          h('span', null, me.grade ? `${me.grade}th grade` : 'Grade not set'),
          h('span', { class: 'sep' }, '·'),
          h('span', null, 'Joined ' + fmtDate(me.join_date || me.created_at, { month: 'short', day: 'numeric', year: 'numeric' })),
          tierSlot)),
      editBtn);

    const refCount = h('span', { class: 'mono' }, '–');
    const codeCard = h('section', { class: 'card span-4 reveal code-card', style: { '--i': 1 } },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Your code'), icon('link', 18, 'muted')),
      h('div', { class: 'code-display mono' }, me.login_code || '—'),
      h('p', { class: 'muted small' }, 'Friends enter this when they sign up so you get credit toward Headhunter.'),
      h('div', { class: 'ref-stat' }, h('span', { class: 'mini-icon' }, icon('users', 16)),
        h('div', null, h('div', { class: 'mini-val' }, refCount), h('div', { class: 'muted small' }, 'friends joined and showed up'))),
      h('button', { class: 'btn btn-ghost btn-sm code-copy', type: 'button', onclick: () => RT.copyText(me.login_code || '', 'Code copied') }, icon('copy', 16), 'Copy code'));
    const statsCard = h('section', { class: 'card span-4 reveal', style: { '--i': 2 } }, RT.skeleton(5));
    const ladderCard = h('section', { class: 'card span-4 reveal', style: { '--i': 3 } }, RT.skeleton(4));
    const badgesWrap = h('section', { class: 'reveal', style: { '--i': 4 } }, RT.skeleton(3));
    const account = h('section', { class: 'card account-card reveal', style: { '--i': 5 } },
      h('div', { class: 'min0' }, h('div', { class: 'card-label' }, 'Account'), h('div', { class: 'ellipsis' }, S.user.email || '')),
      h('div', { class: 'row gap-sm wrap' },
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: changePassword }, icon('lock', 16), 'Change password'),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: RT.signOut }, icon('logout', 16), 'Sign out')));

    root.append(heroCard, h('div', { class: 'dash-grid' }, codeCard, statsCard, ladderCard), badgesWrap, account);

    loadMine().then(d => {
      const { cur, next } = RT.tierFor(d.mine.total_points, S.tiers);
      clear(tierSlot).append(h('span', { class: 'sep' }, '·'), tierChip(cur && cur.name));
      refCount.textContent = String(d.stats.referrals);

      clear(statsCard).append(
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Stats'), h('span', { class: 'mono muted small' }, d.mine.total_points + ' Bites')),
        h('dl', { class: 'stat-list' },
          statRow('Meetings attended', d.stats.attendance),
          statRow('Current streak', d.stats.streak + (d.stats.bestStreak > d.stats.streak ? ` (best ${d.stats.bestStreak})` : '')),
          statRow('Pitches', d.stats.pitches),
          statRow('Best finish', d.stats.bestPlacement ? ordinal(d.stats.bestPlacement) : '—'),
          statRow('Friends brought in', d.stats.referrals)));

      clear(ladderCard).append(
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Tier ladder'), next ? h('span', { class: 'muted small' }, (next.point_threshold - d.mine.total_points) + ' to go') : null),
        h('ol', { class: 'ladder' }, [...S.tiers].reverse().map(t => {
          const reached = d.mine.total_points >= t.point_threshold;
          const isCur = cur && cur.id === t.id;
          return h('li', { class: (reached ? 'reached ' : '') + (isCur ? 'current' : ''), 'data-tier': RT.tierClass(t.name).replace('tier-', '') },
            h('span', { class: 'ladder-node' }), h('div', { class: 'grow min0' }, h('div', { class: 'ladder-name' }, t.name), h('div', { class: 'muted small' }, t.perks || '')),
            h('span', { class: 'mono small nowrap' }, t.point_threshold + ' Bites'));
        })));

      renderBadges(badgesWrap, d.progress);
    }).catch(e => toast(friendly(e), 'error'));

    function statRow(label, value) { return h('div', { class: 'stat-row' }, h('dt', { class: 'muted' }, label), h('dd', { class: 'mono' }, String(value))); }

    function editProfile() {
      const name = h('input', { class: 'input', type: 'text', value: me.name, maxlength: 60 });
      const grade = RT.gradeSwitch(me.grade || '');
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
      const m = modal({ title: 'Edit profile', body: h('div', { class: 'stack' }, RT.field('Name', name), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade)), actions: [save] });
      save.addEventListener('click', () => busy(save, async () => {
        if (name.value.trim().length < 2) { toast('Enter your name.', 'error'); return; }
        try {
          await api.updateProfile(name.value.trim(), grade.getValue());
          await RT.reloadMe();
          m.close();
          toast('Profile saved', 'success');
          RT.rerender();
        } catch (e) { toast(friendly(e), 'error'); }
      }));
    }

    function changePassword() {
      const pw = h('input', { class: 'input', type: 'password', placeholder: 'At least 8 characters', autocomplete: 'new-password' });
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Update password');
      const m = modal({ title: 'Change password', body: RT.field('New password', pw), actions: [save] });
      save.addEventListener('click', () => busy(save, async () => {
        if (pw.value.length < 8) { toast('Use at least 8 characters.', 'error'); return; }
        const { error } = await RT.sb.auth.updateUser({ password: pw.value });
        if (error) { toast(friendly(error), 'error'); return; }
        m.close();
        toast('Password updated', 'success');
      }));
    }
    return {};
  };

  function renderBadges(wrap, progress) {
    const cats = [];
    progress.forEach(p => {
      const c = p.badge.category || 'Other';
      let g = cats.find(x => x.name === c);
      if (!g) cats.push(g = { name: c, items: [] });
      g.items.push(p);
    });
    const earned = progress.filter(p => p.earned).length;
    clear(wrap).append(
      h('div', { class: 'section-row' }, h('h2', { class: 'h2' }, 'Badges'), h('span', { class: 'muted' }, `${earned} of ${progress.length} earned`)),
      ...cats.map(g => h('div', { class: 'badge-group' },
        h('div', { class: 'card-label' }, g.name),
        h('div', { class: 'badge-grid' }, g.items.map((p, i) => badgeTile(p, i))))));
  }

  function badgeTile(p, i) {
    const b = p.badge;
    let foot;
    if (p.earned) foot = h('span', { class: 'earned-tag' }, icon('check', 12), p.awardedAt ? 'Earned ' + fmtDate(p.awardedAt, { month: 'short', day: 'numeric' }) : 'Earned');
    else if (p.manual) foot = h('span', { class: 'muted small' }, 'Given by officers');
    else if (b.trigger_type === 'placement') foot = h('span', { class: 'muted small' }, 'Not yet');
    else foot = h('div', { class: 'tile-progress' }, progressBar(p.have, p.need), h('span', { class: 'mono small muted' }, `${p.have}/${p.need}`));
    return h('div', { class: 'badge-tile' + (p.earned ? ' earned' : ''), style: { '--i': i } },
      h('span', { class: 'badge-icon' + (b.category === 'Exec' || b.category === 'Season' || b.category === 'Currency' ? ' burg' : '') }, icon(RT.badgeIcon(b.name), 20)),
      h('div', { class: 'badge-name' }, b.name),
      h('div', { class: 'muted small badge-desc' }, b.description || ''),
      foot);
  }
})();
