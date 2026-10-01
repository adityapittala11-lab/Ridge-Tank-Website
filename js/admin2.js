// More officer tools: Welcome queue, Bounties, Meetings & calendar (+ bite decay rules), Card station.
// Registered into the admin screen through RT.adminTabs; shares helpers from RT.adminKit (see admin.js).
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, confirmDialog, segmented, avatar, busy, friendly, fmtDate, fmtClock, timeAgo, localDateISO } = RT;
  const cfg = window.RT_CONFIG;
  const S = RT.state;
  const sb = RT.sb;
  const api = RT.api;
  const kit = () => RT.adminKit;

  RT.adminTabs = RT.adminTabs || {};

  // ---------------- message templates ----------------
  function nextMeeting() {
    const today = localDateISO();
    return S.meetings
      .filter(m => (m.kind || 'meeting') === 'meeting' && m.meeting_date >= today)
      .sort((a, b) => (a.meeting_date < b.meeting_date ? -1 : 1))[0] || null;
  }
  function links() {
    return { form: S.settings.form_link || (cfg.links && cfg.links.form) || '', site: S.settings.site_link || (cfg.links && cfg.links.site) || '' };
  }
  // {first} {officer} {date} {when} {form} {site}
  RT.fillTemplate = function (tpl, member) {
    const m = nextMeeting();
    let date = 'soon', when = 'soon';
    if (m) {
      date = fmtDate(m.meeting_date, { weekday: 'long', month: 'long', day: 'numeric' });
      when = [date, m.start_time ? fmtClock(m.start_time) : null, m.location].filter(Boolean).join(', ');
    }
    const l = links();
    const vars = {
      first: member ? String(member.name).split(' ')[0] : '[name]',
      officer: String((S.me && S.me.name) || 'an officer').split(' ')[0],
      date, when, form: l.form || '[form link]', site: l.site || '[website link]'
    };
    return String(tpl || '').replace(/\{(\w+)\}/g, (x, k) => (k in vars ? vars[k] : x));
  };

  // ---------------- Welcome queue ----------------
  RT.adminTabs.welcome = function (pane) {
    const { A } = kit();
    let filter = 'new';

    const linkForm = h('input', { class: 'input', type: 'url', placeholder: 'https://forms.gle/…', value: S.settings.form_link || '' });
    const linkSite = h('input', { class: 'input', type: 'url', placeholder: 'https://ridgetank.…', value: S.settings.site_link || '' });
    const saveLinks = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Save links');
    saveLinks.addEventListener('click', () => busy(saveLinks, async () => {
      const rows = [{ key: 'form_link', value: linkForm.value.trim() }, { key: 'site_link', value: linkSite.value.trim() }];
      const { error } = await sb.from('settings').upsert(rows);
      if (error) { toast(friendly(error), 'error'); return; }
      S.settings.form_link = rows[0].value;
      S.settings.site_link = rows[1].value;
      toast('Links saved. The messages below use them.', 'success');
      drawTemplate();
    }));

    // ----- templates -----
    const keys = [['welcomeText', 'First text'], ['reminderWeek', '1 week out'], ['reminderDay', 'Day before'], ['reminderToday', 'Day of'], ['fblaEmail', 'FBLA email']];
    let tplKey = 'welcomeText';
    const tplBox = h('textarea', { class: 'input textarea', rows: 7 });
    const tplSeg = segmented({ items: keys.map(([value, label]) => ({ value, label })), value: tplKey, className: 'seg-sm tpl-seg', ariaLabel: 'Message templates', onChange: v => { tplKey = v; drawTemplate(); } });
    const copyBtn = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => RT.copyText(tplBox.value, 'Copied') }, icon('copy', 14), 'Copy');
    const copySubj = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => RT.copyText(RT.fillTemplate(cfg.templates.fblaSubject), 'Subject copied') }, 'Copy subject');
    const tplHint = h('p', { class: 'muted small' });
    function drawTemplate() {
      tplBox.value = RT.fillTemplate(cfg.templates[tplKey]);
      copySubj.hidden = tplKey !== 'fblaEmail';
      const l = links();
      const missing = [];
      if (/\{form\}/.test(cfg.templates[tplKey]) && !l.form) missing.push('the form link');
      if (/\{site\}/.test(cfg.templates[tplKey]) && !l.site) missing.push('the website link');
      tplHint.textContent = (tplKey === 'fblaEmail'
        ? 'Send this to the FBLA advisor to email to everyone.'
        : 'The buttons in the list below fill in each person’s name for you. Use this copy for group chats.')
        + (missing.length ? ' Add ' + missing.join(' and ') + ' above and it fills in here.' : '');
    }

    pane.appendChild(h('div', { class: 'section-row' },
      h('div', null, h('h2', { class: 'h2' }, 'Welcome messages'),
        h('p', { class: 'muted small' }, 'New sign-ups get a text or WhatsApp from an officer. Tap a button, send it, and they move down the list.'))));

    pane.appendChild(h('div', { class: 'two-col' },
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Message templates'), h('div', { class: 'row gap-sm' }, copySubj, copyBtn)),
        h('div', { class: 'stack-sm' }, tplSeg, tplBox, tplHint)),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Sign-up links'), saveLinks),
        h('div', { class: 'stack-sm' },
          RT.field('Google Form', linkForm), RT.field('Website', linkSite),
          h('p', { class: 'muted small' }, 'Paste them once. The FBLA email and texts fill them in.')))));

    // ----- the list -----
    const seg = segmented({
      items: [{ value: 'new', label: 'To message' }, { value: 'messaged', label: 'Messaged' }, { value: 'done', label: 'Done' }, { value: 'nophone', label: 'No phone' }],
      value: filter, className: 'seg-sm', ariaLabel: 'Filter', onChange: v => { filter = v; draw(); }
    });
    const list = h('div', { class: 'request-list' });
    const toolbar = h('div', { class: 'toolbar welcome-bar' }, seg);
    pane.append(toolbar, list);

    const inGroup = m => m.contact_status === 'in_group' || m.contact_status === 'no_whatsapp';
    const buckets = () => ({
      new: A.members.filter(m => m.contact_status === 'new' && m.phone),
      messaged: A.members.filter(m => m.contact_status === 'messaged'),
      done: A.members.filter(inGroup),
      nophone: A.members.filter(m => !m.phone && m.contact_status === 'new')
    });

    async function setStatus(m, status) {
      const { data, error } = await sb.from('members').update({ contact_status: status }).eq('id', m.id).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      Object.assign(m, data);
      kit().syncPending();
      draw();
    }

    function person(m) {
      const msg = RT.fillTemplate(cfg.templates.welcomeText, m);
      const digits = (m.phone || '').replace(/\D/g, '');
      const sent = () => { if (m.contact_status === 'new') setTimeout(() => setStatus(m, 'messaged'), 500); };
      const acts = [];
      if (m.phone) {
        acts.push(h('a', { class: 'btn btn-ghost btn-sm', href: `sms:${m.phone}?&body=${encodeURIComponent(msg)}`, onclick: sent }, icon('chat', 14), 'Text'));
        acts.push(h('a', { class: 'btn btn-sm ' + (m.whatsapp_ok ? 'btn-primary' : 'btn-ghost'), href: `https://wa.me/${digits}?text=${encodeURIComponent(msg)}`, target: '_blank', rel: 'noopener', onclick: sent }, icon('whatsapp', 14), 'WhatsApp'));
        acts.push(h('button', { class: 'icon-btn sm', type: 'button', title: 'Copy message', 'aria-label': 'Copy message', onclick: () => RT.copyText(msg, 'Message copied') }, icon('copy', 14)));
      } else {
        acts.push(h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => kit().openMember(m, draw) }, icon('edit', 14), 'Add phone'));
      }
      const moves = [];
      if (m.contact_status === 'new' && m.phone) moves.push(['Mark messaged', 'messaged']);
      if (m.contact_status === 'messaged') moves.push(['Added to group', 'in_group'], ['Not on WhatsApp', 'no_whatsapp'], ['Back to new', 'new']);
      if (inGroup(m)) moves.push(['Back to new', 'new']);
      return h('div', { class: 'card request' },
        avatar(m.name, 44),
        h('div', { class: 'grow min0' },
          h('button', { class: 'req-name link-btn', type: 'button', onclick: () => kit().openMember(m, draw) }, m.name, m.grade ? h('span', { class: 'muted' }, ' · ' + m.grade + 'th') : null),
          h('div', { class: 'muted small ellipsis' }, [m.phone ? RT.fmtPhone(m.phone) : 'No phone yet', m.whatsapp_ok ? 'on WhatsApp' : null, m.source ? 'via ' + m.source : null, timeAgo(m.created_at)].filter(Boolean).join(' · ')),
          moves.length ? h('div', { class: 'move-row' }, moves.map(([label, st]) => h('button', { class: 'chip-btn', type: 'button', onclick: () => setStatus(m, st) }, label))) : null),
        h('div', { class: 'row gap-sm wrap end' }, acts));
    }

    function draw() {
      const b = buckets();
      seg.setBadge('new', b.new.length);
      seg.setBadge('messaged', 0);
      clear(list);
      const rows = b[filter] || [];
      if (!rows.length) {
        const msg = { new: 'No one is waiting for a welcome message.', messaged: 'Nobody is waiting on a reply.', done: 'Nobody here yet.', nophone: 'Everyone has a phone number on file.' }[filter];
        list.appendChild(h('div', { class: 'card empty' }, icon('check', 24, 'accent'), h('h3', null, 'All caught up'), h('p', { class: 'muted' }, msg)));
        return;
      }
      if (filter === 'new' && rows.length > 1) {
        toolbar.querySelector('.copy-all') || toolbar.appendChild(h('button', { class: 'btn btn-ghost btn-sm copy-all', type: 'button' }, icon('copy', 14), 'Copy all numbers'));
        toolbar.querySelector('.copy-all').onclick = () => RT.copyText(rows.map(m => `${m.name}: ${RT.fmtPhone(m.phone)}`).join('\n'), rows.length + ' numbers copied');
      } else {
        const c = toolbar.querySelector('.copy-all');
        if (c) c.remove();
      }
      rows.forEach(m => list.appendChild(person(m)));
    }

    drawTemplate();
    draw();
    // Candy for the first sign-ups and the cash draw (from the Tank Market code).
    if (RT.market && RT.market.rewardsCard) pane.appendChild(RT.market.rewardsCard());
    return null;
  };

  // ---------------- Bounties ----------------
  RT.adminTabs.bounties = function (pane) {
    const { A } = kit();
    const state = { bounties: [], claims: [], loaded: false };
    const who = id => (A.members.find(m => m.id === id) || {}).name || S.directory.get(id) || 'Member';

    const head = h('div', { class: 'section-row' },
      h('div', null, h('h2', { class: 'h2' }, 'Bounties'), h('p', { class: 'muted small' }, 'Challenges members can claim for bonus Bites. Approve a claim and the points land right away.')),
      h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => editBounty() }, icon('plus', 16), 'New bounty'));
    const queue = h('div', { class: 'request-list' });
    const list = h('div', { class: 'stack-sm' });
    const recent = h('div', { class: 'card claim-list' });
    pane.append(head,
      h('div', { class: 'card-label sec-label' }, 'To review'), queue,
      h('div', { class: 'card-label sec-label' }, 'All bounties'), list,
      h('div', { class: 'card-label sec-label' }, 'Recently reviewed'), recent);

    async function load() {
      const [b, c] = await Promise.all([
        sb.from('bounties').select('*').order('created_at', { ascending: false }),
        sb.from('bounty_claims').select('*').order('created_at', { ascending: false }).limit(300)
      ]);
      if (b.error || c.error) { toast(friendly(b.error || c.error), 'error'); return; }
      state.bounties = b.data;
      state.claims = c.data;
      state.loaded = true;
      S.adminCounts.claims = c.data.filter(x => x.status === 'pending').length;
      S.pendingCount = S.adminCounts.cards + S.adminCounts.welcome + S.adminCounts.claims;
      RT.updateAdminBadge();
      draw();
    }

    async function review(c, approve, note) {
      try {
        const row = await api.reviewClaim(c.id, approve, note);
        Object.assign(c, row);
        await RT.refreshBoard();
        S.adminCounts.claims = state.claims.filter(x => x.status === 'pending').length;
        S.pendingCount = S.adminCounts.cards + S.adminCounts.welcome + S.adminCounts.claims;
        RT.updateAdminBadge();
        toast(approve ? `Approved. ${who(c.member_id)} got +${row.points_awarded}.` : 'Marked not approved.', 'success');
        draw();
      } catch (e) { toast(friendly(e), 'error'); }
    }

    function rejectModal(c, b) {
      const reason = h('input', { class: 'input', type: 'text', maxlength: 120, placeholder: 'Reason (optional), e.g. “need a photo”', autofocus: true });
      const go = h('button', { class: 'btn btn-danger', type: 'button' }, 'Not approved');
      const m = modal({ title: 'Not approving this one?', subtitle: `${who(c.member_id)} · ${b ? b.title : ''}`, body: RT.field('Note to them', reason), actions: [go] });
      go.addEventListener('click', () => busy(go, async () => { await review(c, false, reason.value); m.close(); }));
    }

    function claimLine(c) {
      const b = state.bounties.find(x => x.id === c.bounty_id);
      return { b, title: b ? b.title : 'Bounty', note: c.note };
    }

    function draw() {
      clear(queue); clear(list); clear(recent);
      const pending = state.claims.filter(c => c.status === 'pending').sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
      if (!pending.length) {
        queue.appendChild(h('div', { class: 'card empty small' }, h('p', { class: 'muted' }, state.loaded ? 'Nothing waiting for review.' : 'Loading…')));
      }
      pending.forEach(c => {
        const { b, title, note } = claimLine(c);
        queue.appendChild(h('div', { class: 'card request' },
          avatar(who(c.member_id), 44),
          h('div', { class: 'grow min0' },
            h('div', { class: 'req-name' }, who(c.member_id), h('span', { class: 'muted' }, ' · ' + title)),
            note ? h('div', { class: 'small claim-note' }, /^https?:\/\//i.test(note) ? h('a', { href: note, target: '_blank', rel: 'noopener noreferrer' }, note) : '“' + note + '”') : h('div', { class: 'muted small' }, 'No note'),
            h('div', { class: 'muted small' }, timeAgo(c.created_at))),
          h('div', { class: 'row gap-sm wrap end' },
            h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: e => busy(e.currentTarget, () => review(c, true)) }, icon('check', 14), 'Approve +' + (b ? b.points : '')),
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => rejectModal(c, b) }, 'Not approved'))));
      });

      if (!state.bounties.length) list.appendChild(h('div', { class: 'card empty small' }, h('p', { class: 'muted' }, state.loaded ? 'No bounties yet. Make the first one.' : 'Loading…')));
      state.bounties.forEach(b => {
        const mine = state.claims.filter(c => c.bounty_id === b.id);
        const taken = mine.filter(c => c.status !== 'rejected').length;
        const pend = mine.filter(c => c.status === 'pending').length;
        const ended = b.ends_at && new Date(b.ends_at).getTime() < Date.now();
        const status = !b.active ? 'Closed' : ended ? 'Ended' : (b.max_total != null && taken >= b.max_total) ? 'Full' : 'Open';
        list.appendChild(h('div', { class: 'card bounty-row' },
          h('span', { class: 'reward mono' }, '+' + b.points),
          h('div', { class: 'grow min0' },
            h('div', { class: 'req-name' }, b.title, h('span', { class: 'tag sm ' + (status === 'Open' ? '' : 'muted') }, status)),
            h('div', { class: 'muted small ellipsis' }, [`${taken}${b.max_total != null ? '/' + b.max_total : ''} claimed`, pend ? pend + ' to review' : null, b.ends_at ? 'ends ' + fmtDate(b.ends_at, { month: 'short', day: 'numeric' }) : null, { none: 'no proof', note: 'note', link: 'link' }[b.proof]].filter(Boolean).join(' · '))),
          h('div', { class: 'row gap-sm' },
            h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: async () => {
              const { error } = await sb.from('bounties').update({ active: !b.active }).eq('id', b.id);
              if (error) { toast(friendly(error), 'error'); return; }
              b.active = !b.active; draw();
            } }, b.active ? 'Close' : 'Reopen'),
            h('button', { class: 'icon-btn sm', type: 'button', title: 'Edit', 'aria-label': 'Edit', onclick: () => editBounty(b) }, icon('edit', 14)),
            h('button', { class: 'icon-btn sm', type: 'button', title: 'Delete', 'aria-label': 'Delete', onclick: () => delBounty(b, mine.length) }, icon('trash', 14)))));
      });

      const done = state.claims.filter(c => c.status !== 'pending').sort((a, b) => new Date(b.reviewed_at || b.created_at) - new Date(a.reviewed_at || a.created_at)).slice(0, 8);
      if (!done.length) recent.appendChild(h('p', { class: 'muted small pad' }, 'Nothing reviewed yet.'));
      done.forEach(c => {
        const { title } = claimLine(c);
        recent.appendChild(h('div', { class: 'claim-row' },
          h('span', { class: 'tl-icon' + (c.status === 'approved' ? '' : ' burg') }, icon(c.status === 'approved' ? 'check' : 'x', 16)),
          h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis' }, who(c.member_id) + ' · ' + title), h('div', { class: 'muted small' }, (c.status === 'approved' ? 'Approved +' + c.points_awarded : 'Not approved') + ' · ' + timeAgo(c.reviewed_at || c.created_at))),
          h('button', { class: 'chip-btn', type: 'button', onclick: () => review(c, c.status !== 'approved') }, c.status === 'approved' ? 'Take back' : 'Approve instead')));
      });
    }

    function editBounty(b) {
      const title = h('input', { class: 'input', type: 'text', maxlength: 100, value: b ? b.title : '', placeholder: 'e.g. Bring a friend', autofocus: true });
      const desc = h('textarea', { class: 'input textarea', rows: 3, maxlength: 1000, placeholder: 'What do they have to do?' }, b ? b.description : '');
      const pts = h('input', { class: 'input mono', type: 'number', min: 1, max: 1000, value: b ? b.points : 10 });
      const proof = segmented({ items: [{ value: 'none', label: 'Just claim' }, { value: 'note', label: 'Note' }, { value: 'link', label: 'Link' }], value: b ? b.proof : 'note', className: 'seg-fill seg-sm', ariaLabel: 'What members send' });
      const each = h('input', { class: 'input mono', type: 'number', min: 1, value: b ? b.max_per_member : 1 });
      const total = h('input', { class: 'input mono', type: 'number', min: 1, placeholder: 'No limit', value: b && b.max_total != null ? b.max_total : '' });
      const ends = h('input', { class: 'input', type: 'date', value: b && b.ends_at ? localDateISO(new Date(b.ends_at)) : '' });
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, b ? 'Save changes' : 'Create bounty');
      const m = modal({
        title: b ? 'Edit bounty' : 'New bounty', wide: true,
        body: h('div', { class: 'stack' },
          RT.field('Title', title), RT.field('Details', desc),
          h('div', { class: 'form-grid' }, RT.field('Reward (Bites)', pts), h('div', { class: 'field' }, h('span', { class: 'label' }, 'What members send'), proof)),
          h('div', { class: 'form-grid three' }, RT.field('Per person', each, 'How many times one person can claim it.'), RT.field('Total spots', total, 'Leave empty for no limit.'), RT.field('Ends', ends, 'Optional.'))),
        actions: [save]
      });
      save.addEventListener('click', () => busy(save, async () => {
        const points = Math.round(Number(pts.value));
        if (!title.value.trim()) { toast('Give it a title.', 'error'); return; }
        if (!(points >= 1 && points <= 1000)) { toast('Reward must be between 1 and 1000.', 'error'); return; }
        const row = {
          title: title.value.trim(), description: desc.value.trim(), points, proof: proof.getValue(),
          max_per_member: Math.max(1, Math.round(Number(each.value) || 1)),
          max_total: total.value ? Math.max(1, Math.round(Number(total.value))) : null,
          ends_at: ends.value ? new Date(ends.value + 'T23:59:00').toISOString() : null
        };
        const { error } = b ? await sb.from('bounties').update(row).eq('id', b.id) : await sb.from('bounties').insert(row);
        if (error) { toast(friendly(error), 'error'); return; }
        m.close();
        toast(b ? 'Saved' : 'Bounty created', 'success');
        load();
      }));
    }

    async function delBounty(b, claimCount) {
      const ok = await confirmDialog({
        title: 'Delete “' + b.title + '”?',
        message: claimCount ? `This also deletes its ${claimCount} claim${claimCount === 1 ? '' : 's'}, and any Bites from them. To just stop new claims, use Close instead.` : 'No one has claimed it yet.',
        confirmText: 'Delete', danger: true
      });
      if (!ok) return;
      const { error } = await sb.from('bounties').delete().eq('id', b.id);
      if (error) { toast(friendly(error), 'error'); return; }
      await RT.refreshBoard();
      load();
    }

    draw();
    load();
    return null;
  };

  // ---------------- Meetings & calendar (+ bite decay rules) ----------------
  RT.adminTabs.meetings = function (pane) {
    const { A } = kit();
    const today = localDateISO();

    const date = h('input', { class: 'input', type: 'date', value: today });
    const name = h('input', { class: 'input', type: 'text', placeholder: 'Meeting', maxlength: 80 });
    const kind = segmented({ items: [{ value: 'meeting', label: 'Meeting' }, { value: 'event', label: 'Event' }], value: 'meeting', className: 'seg-fill seg-sm', ariaLabel: 'Type' });
    const start = h('input', { class: 'input', type: 'time' });
    const end = h('input', { class: 'input', type: 'time' });
    const where = h('input', { class: 'input', type: 'text', placeholder: 'Room (optional)', maxlength: 80 });
    const desc = h('textarea', { class: 'input textarea', rows: 2, maxlength: 500, placeholder: 'Anything people should know (optional)' });
    const add = h('button', { class: 'btn btn-primary', type: 'button' }, icon('plus', 16), 'Add to calendar');
    pane.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Schedule a meeting or event'), h('span', { class: 'muted small' }, 'Members see it on their calendar and home page. Only meetings count for bite decay.')),
      h('div', { class: 'stack-sm' },
        h('div', { class: 'form-grid three' }, RT.field('Date', date), RT.field('Name', name), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Type'), kind)),
        h('div', { class: 'form-grid three' }, RT.field('Starts', start), RT.field('Ends', end), RT.field('Where', where)),
        RT.field('Notes', desc),
        h('div', { class: 'row end' }, add))));
    const list = h('div', { class: 'meeting-list' });
    pane.appendChild(list);

    add.addEventListener('click', () => busy(add, async () => {
      if (!date.value) { toast('Pick a date.', 'error'); return; }
      const isEvent = kind.getValue() === 'event';
      const row = {
        meeting_date: date.value, name: name.value.trim() || (isEvent ? 'Event' : 'Meeting'), kind: kind.getValue(),
        start_time: start.value || null, end_time: end.value || null, location: where.value.trim() || null,
        description: desc.value.trim() || null, season: cfg.season
      };
      const { data, error } = await sb.from('meetings').insert(row).select().single();
      if (error) { toast(friendly(error), 'error'); return; }
      A.meetings.push(data);
      A.meetings.sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : -1));
      S.meetings = A.meetings;
      name.value = ''; where.value = ''; desc.value = ''; start.value = ''; end.value = '';
      toast('Added to the calendar', 'success');
      draw();
    }));

    function draw() {
      clear(list);
      if (!A.meetings.length) { list.appendChild(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, 'No meetings yet.'))); return; }
      A.meetings.forEach((m, i) => {
        const n = A.attendance.filter(a => a.meeting_id === m.id).length;
        const isEvent = m.kind === 'event';
        const upcoming = m.meeting_date > today;
        const details = [fmtDate(m.meeting_date, { weekday: 'long' }), m.start_time ? fmtClock(m.start_time) + (m.end_time ? '–' + fmtClock(m.end_time) : '') : null, m.location].filter(Boolean).join(' · ');
        list.appendChild(h('div', { class: 'card meeting-row', style: { '--i': Math.min(i, 10) } },
          h('div', { class: 'meet-date' + (m.meeting_date === today ? ' today' : '') }, fmtDate(m.meeting_date, { month: 'short', day: 'numeric' })),
          h('div', { class: 'grow min0' },
            h('div', { class: 'ellipsis' }, m.name || 'Meeting',
              isEvent ? h('span', { class: 'tag sm muted' }, 'Event') : null,
              m.meeting_date === today ? h('span', { class: 'tag sm' }, 'Today') : upcoming ? h('span', { class: 'tag sm muted' }, 'Upcoming') : null),
            h('div', { class: 'muted small ellipsis' }, details)),
          h('span', { class: 'mono muted small' }, n + ' checked in'),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { A.meetingId = m.id; RT.go('admin/checkin'); } }, 'Check-in'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Edit', title: 'Edit', onclick: () => editMeeting(m) }, icon('edit', 16)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete meeting', title: 'Delete', onclick: () => delMeeting(m, n) }, icon('trash', 16))));
      });
    }

    function editMeeting(m) {
      const d = h('input', { class: 'input', type: 'date', value: m.meeting_date });
      const nm = h('input', { class: 'input', type: 'text', maxlength: 80, value: m.name || '' });
      const kd = segmented({ items: [{ value: 'meeting', label: 'Meeting' }, { value: 'event', label: 'Event' }], value: m.kind || 'meeting', className: 'seg-fill seg-sm', ariaLabel: 'Type' });
      const st = h('input', { class: 'input', type: 'time', value: m.start_time ? String(m.start_time).slice(0, 5) : '' });
      const en = h('input', { class: 'input', type: 'time', value: m.end_time ? String(m.end_time).slice(0, 5) : '' });
      const wh = h('input', { class: 'input', type: 'text', maxlength: 80, value: m.location || '' });
      const ds = h('textarea', { class: 'input textarea', rows: 3, maxlength: 500 }, m.description || '');
      const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save changes');
      const md = modal({
        title: 'Edit ' + ((m.kind || 'meeting') === 'event' ? 'event' : 'meeting'), wide: true,
        body: h('div', { class: 'stack' },
          h('div', { class: 'form-grid three' }, RT.field('Date', d), RT.field('Name', nm), h('div', { class: 'field' }, h('span', { class: 'label' }, 'Type'), kd)),
          h('div', { class: 'form-grid three' }, RT.field('Starts', st), RT.field('Ends', en), RT.field('Where', wh)),
          RT.field('Notes', ds)),
        actions: [save]
      });
      save.addEventListener('click', () => busy(save, async () => {
        if (!d.value) { toast('Pick a date.', 'error'); return; }
        const row = { meeting_date: d.value, name: nm.value.trim() || 'Meeting', kind: kd.getValue(), start_time: st.value || null, end_time: en.value || null, location: wh.value.trim() || null, description: ds.value.trim() || null };
        const { data, error } = await sb.from('meetings').update(row).eq('id', m.id).select().single();
        if (error) { toast(friendly(error), 'error'); return; }
        Object.assign(m, data);
        A.meetings.sort((a, b) => (a.meeting_date < b.meeting_date ? 1 : -1));
        S.meetings = A.meetings;
        md.close();
        toast('Saved', 'success');
        draw();
      }));
    }

    async function delMeeting(m, n) {
      const ok = await confirmDialog({ title: 'Delete this meeting?', message: `${fmtDate(m.meeting_date)} · ${m.name || 'Meeting'}. ${n ? n + ' check-ins, plus any pitch results and bites from it, will be removed and those points taken back.' : 'No one has checked in yet.'}`, confirmText: 'Delete', danger: true });
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
        toast('Deleted', 'success');
        draw();
      } catch (e) { toast(friendly(e), 'error'); }
    }

    // ----- bite decay rules -----
    const grace = h('input', { class: 'input mono', type: 'number', min: 1, max: 365, value: S.settings.decay_grace_days });
    const pct = h('input', { class: 'input mono', type: 'number', min: 0, max: 100, step: 0.1, value: S.settings.decay_pct_per_day });
    const cap = h('input', { class: 'input mono', type: 'number', min: 0, max: 100, value: S.settings.decay_max_pct });
    const saveRules = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Save rules');
    const sentence = h('p', { class: 'rules-sentence' });
    const losing = h('p', { class: 'muted small' });
    function explain() {
      const g = Math.round(Number(grace.value)) || 30, p = Number(pct.value) || 0, c = Number(cap.value) || 0;
      const sixty = Math.min(c, Math.max(0, 60 - g) * p);
      sentence.textContent = `After ${g} days without a meeting, members lose ${p}% of their Bites every day until they come to one. They can never lose more than ${c}% in total. Example: someone with 100 points who skips 60 days loses about ${Math.round(sixty)}.`;
    }
    [grace, pct, cap].forEach(i => i.addEventListener('input', explain));
    saveRules.addEventListener('click', () => busy(saveRules, async () => {
      const g = Math.round(Number(grace.value)), p = Number(pct.value), c = Number(cap.value);
      if (!(g >= 1 && g <= 365) || !(p >= 0 && p <= 100) || !(c >= 0 && c <= 100)) { toast('Check the numbers: days 1–365, percents 0–100.', 'error'); return; }
      const { error } = await sb.from('settings').upsert([{ key: 'decay_grace_days', value: String(g) }, { key: 'decay_pct_per_day', value: String(p) }, { key: 'decay_max_pct', value: String(c) }]);
      if (error) { toast(friendly(error), 'error'); return; }
      Object.assign(S.settings, { decay_grace_days: g, decay_pct_per_day: p, decay_max_pct: c });
      await RT.refreshBoard();
      toast('Saved. The leaderboard updated.', 'success');
      countLosing();
    }));
    async function countLosing() {
      const { data } = await sb.from('member_points').select('decay_points').gt('decay_points', 0);
      losing.textContent = data ? (data.length ? `Right now ${data.length} member${data.length === 1 ? ' is' : 's are'} losing Bites to decay.` : 'Right now nobody is losing points to decay.') : '';
    }
    pane.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Bite decay'), saveRules),
      h('div', { class: 'stack-sm' },
        sentence,
        h('div', { class: 'form-grid three' }, RT.field('Days before it starts', grace), RT.field('% lost per day', pct), RT.field('Most anyone can lose (%)', cap)),
        losing)));

    explain();
    countLosing();
    draw();
    return null;
  };

  // ---------------- Card station ----------------
  // Tap blank cards one after another; each one is linked to the next person who still needs one.
  RT.adminKit2 = RT.adminKit2 || {};
  RT.adminKit2.cardStation = function (after) {
    const { A, assignCard, captureCards, beep, normalizeUid, syncPending } = kit();
    let order = 'signup';
    const history = [];
    let queue = [];
    let skipped = 0;
    function build() {
      const need = A.members.filter(m => m.card_status === 'pending' && !m.card_uid);
      queue = order === 'az'
        ? need.sort((a, b) => a.name.localeCompare(b.name))
        : need.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    build();
    const total0 = queue.length;

    const bar = h('span', { class: 'bar-track' }, h('span', { class: 'bar-fill' }));
    const progress = h('div', { class: 'row between small' }, h('span', { class: 'muted' }), h('span', { class: 'muted' }));
    const who = h('div', { class: 'station-who' });
    const flash = h('div', { class: 'station-flash', 'aria-live': 'polite' });
    const manual = h('input', { class: 'input mono', type: 'text', placeholder: 'Or type the card ID and press Enter', autocomplete: 'off', spellcheck: false });
    const skipBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Skip for now');
    const undoBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Undo last');
    const orderSeg = segmented({ items: [{ value: 'signup', label: 'Sign-up order' }, { value: 'az', label: 'A to Z' }], value: order, className: 'seg-sm', ariaLabel: 'Order', onChange: v => { order = v; build(); draw(); } });
    const body = h('div', { class: 'stack station' }, orderSeg, progress, bar, who, flash, manual, h('div', { class: 'row between' }, undoBtn, skipBtn));
    let stop = null;
    const md = modal({ title: 'Card station', subtitle: 'Tap a blank card, write the name on it, then tap the next one.', body, wide: true, onClose: () => { stop && stop(); after && after(); } });

    function shortName(m) {
      const p = String(m.name).trim().split(/\s+/);
      return p.length > 1 ? p[0] + ' ' + p[p.length - 1][0] + '.' : p[0];
    }
    function draw() {
      const done = total0 - queue.length;
      progress.firstChild.textContent = `${done} of ${total0} linked`;
      progress.lastChild.textContent = queue.length ? `${queue.length} to go` : '';
      bar.firstChild.style.width = (total0 ? Math.round((done / total0) * 100) : 100) + '%';
      undoBtn.disabled = !history.length;
      skipBtn.hidden = queue.length < 2;
      clear(who);
      if (!queue.length) {
        who.appendChild(h('div', { class: 'station-done' }, icon('check', 28, 'accent'), h('h3', null, total0 ? 'All cards linked' : 'No one needs a card'), h('p', { class: 'muted' }, 'Anyone who signs up later shows up in Card requests.')));
        return;
      }
      const m = queue[0];
      who.append(
        h('div', { class: 'station-ring' }, h('span', { class: 'ring r1' }), h('span', { class: 'ring r2' }), h('span', { class: 'scan-core' }, icon('nfc', 28))),
        h('div', { class: 'station-name' }, m.name),
        h('div', { class: 'muted' }, [m.grade ? m.grade + 'th grade' : null, 'login code ' + (m.login_code || '')].filter(Boolean).join(' · ')),
        h('div', { class: 'station-write' }, 'Write on the card:', h('strong', null, shortName(m))));
    }

    async function use(raw) {
      const uid = normalizeUid(raw);
      if (uid.length < 4 || !queue.length) return;
      const m = queue[0];
      try {
        await assignCard(m, uid);
        beep(true);
        history.push(m.id);
        queue.shift();
        flash.className = 'station-flash ok show';
        flash.textContent = `Linked to ${m.name}. Write “${shortName(m)}” on it.`;
        draw();
      } catch (e) {
        beep(false);
        flash.className = 'station-flash err show';
        flash.textContent = friendly(e);
      }
    }
    stop = captureCards(use, { inModal: true });
    manual.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = manual.value; manual.value = ''; use(v); } });
    skipBtn.addEventListener('click', () => { queue.push(queue.shift()); skipped++; draw(); });
    undoBtn.addEventListener('click', () => busy(undoBtn, async () => {
      const id = history.pop();
      const m = A.members.find(x => x.id === id);
      if (!m) return;
      const { data, error } = await sb.from('members').update({ card_uid: null, card_status: 'pending' }).eq('id', m.id).select().single();
      if (error) { toast(friendly(error), 'error'); history.push(id); return; }
      Object.assign(m, data);
      syncPending();
      queue.unshift(m);
      flash.className = 'station-flash show';
      flash.textContent = `Unlinked ${m.name}. Tap a different card for them.`;
      draw();
    }));
    draw();
  };
})();
