// Forms (Bounties > Forms): crew team applications, 3 spots per team. Officers review them in Officer tools > Applications.
// Also: the red meeting countdown banner on Home.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, busy, friendly, confirmDialog } = RT;
  const sb = RT.sb;
  const S = RT.state;
  const CFG = () => (window.RT_CONFIG && window.RT_CONFIG.teams) || { list: [], seats: 3, open: false };
  const teamOf = v => CFG().list.find(t => t.value === v);
  const teamName = v => (teamOf(v) || {}).label || v || '—';
  const STATUS = {
    pending: { label: 'Waiting for officers', cls: 'wait' },
    accepted: { label: 'Accepted', cls: 'ok' },
    waitlist: { label: 'Waitlist', cls: 'wait' },
    rejected: { label: 'Not this time', cls: 'no' }
  };
  const stamp = v => new Date(v).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + new Date(v).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  async function spots() {
    const r = await sb.rpc('team_spots');
    const map = new Map();
    (Array.isArray(r.data) ? r.data : r.data ? [r.data] : []).forEach(x => map.set(x.team, { accepted: Number(x.accepted) || 0, applied: Number(x.applied) || 0 }));
    return map;
  }

  // ---------------- member side ----------------
  RT.formsView = function (body) {
    const cfg = CFG();
    const box = h('div', { class: 'stack forms-wrap' });
    body.appendChild(box);
    let mine = null;
    let taken = new Map();
    let editing = false;
    let pick = null;

    async function load() {
      const [r, s] = await Promise.all([
        sb.from('team_applications').select('*').eq('member_id', S.me.id).maybeSingle(),
        spots().catch(() => new Map())
      ]);
      mine = r.error ? null : r.data;
      taken = s;
      pick = pick || (mine && mine.team) || null;
      paint();
    }

    function left(v) { const t = taken.get(v); return Math.max(0, (cfg.seats || 3) - (t ? t.accepted : 0)); }

    function paint() {
      clear(box);
      box.appendChild(h('div', { class: 'card forms-hero' },
        h('span', { class: 'eyebrow' }, 'Crew applications'),
        h('h2', { class: 'h2' }, 'Join the Ridge Tank crew'),
        h('p', { class: 'muted' }, `Each team takes only ${cfg.seats || 3} people.` + (cfg.closes ? ` Applications close ${cfg.closes}.` : '')),
        cfg.deal ? h('div', { class: 'forms-deal' }, icon('flame', 16), h('span', null, cfg.deal)) : null));

      if (mine && !editing) { box.appendChild(statusCard()); return; }
      if (!cfg.open) { box.appendChild(h('div', { class: 'card empty' }, icon('clock', 26, 'muted'), h('h3', null, 'Applications are closed'), h('p', { class: 'muted' }, 'Watch Updates for the next round.'))); return; }
      box.appendChild(teamPicker());
      box.appendChild(form());
    }

    function statusCard() {
      const st = STATUS[mine.status] || STATUS.pending;
      return h('div', { class: 'card forms-status' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Your application'), h('span', { class: 'status-pill ' + st.cls }, st.label)),
        h('h3', null, teamName(mine.team)),
        mine.team2 ? h('p', { class: 'muted small' }, '2nd choice: ' + teamName(mine.team2)) : null,
        h('p', { class: 'muted small' }, 'Sent ' + stamp(mine.created_at) + (mine.updated_at && mine.updated_at !== mine.created_at ? ' · updated ' + stamp(mine.updated_at) : '')),
        mine.officer_note ? h('p', { class: 'small accent' }, 'Officer note: ' + mine.officer_note) : null,
        mine.status === 'accepted' ? h('p', null, 'You’re in. An officer will add you to the team chat.') : null,
        mine.status === 'pending'
          ? h('div', { class: 'forms-actions' },
              h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { editing = true; pick = mine.team; paint(); } }, icon('edit', 16), 'Edit my answers'),
              h('button', { class: 'btn btn-ghost', type: 'button', onclick: withdraw }, icon('trash', 16), 'Withdraw'))
          : null);
    }

    async function withdraw() {
      if (!await confirmDialog({ title: 'Withdraw your application?', message: 'Your answers will be deleted. You can apply again while the form is open.', confirmText: 'Withdraw', danger: true })) return;
      const d = await sb.from('team_applications').delete().eq('id', mine.id);
      if (d.error) { toast(friendly(d.error), 'error'); return; }
      mine = null; editing = false; pick = null;
      toast('Withdrawn.', 'success');
      load();
    }

    function teamPicker() {
      return h('div', { class: 'team-grid' }, cfg.list.map(t => {
        const n = left(t.value);
        const card = h('button', { class: 'card team-card' + (pick === t.value ? ' is-picked' : ''), type: 'button', 'aria-pressed': String(pick === t.value) },
          h('div', { class: 'team-top' }, h('span', { class: 'team-icon' }, icon(t.icon || 'users', 20)),
            h('span', { class: 'status-pill sm ' + (n ? 'ok' : 'wait') }, n ? `${n} of ${cfg.seats || 3} spots left` : 'Full · waitlist')),
          h('h3', null, t.label),
          h('p', { class: 'muted small' }, t.text),
          t.rules && t.rules.length ? h('ul', { class: 'team-rules' }, t.rules.map(x => h('li', null, icon('check', 14), h('span', null, x)))) : null,
          h('span', { class: 'team-pick small' }, pick === t.value ? 'First choice ✓' : 'Tap to pick'));
        card.addEventListener('click', () => { pick = t.value; paint(); });
        return card;
      }));
    }

    function form() {
      const m = editing && mine ? mine : {};
      const team2 = h('select', { class: 'input select', 'aria-label': 'Second choice' },
        h('option', { value: '' }, 'No second choice'),
        cfg.list.filter(t => t.value !== pick).map(t => h('option', { value: t.value, selected: m.team2 === t.value }, t.label)));
      const grade = h('select', { class: 'input select', 'aria-label': 'Grade' },
        ['9th', '10th', '11th', '12th'].map(g => h('option', { value: g, selected: (m.grade || S.me.grade || '').replace(/\D/g, '') === g.replace(/\D/g, '') }, g)));
      const why = h('textarea', { class: 'input textarea', rows: 3, maxlength: 600, placeholder: 'Why this team? What will you get done?' });
      why.value = m.why || '';
      const exp = h('textarea', { class: 'input textarea', rows: 3, maxlength: 800, placeholder: 'Clubs, jobs, leadership, DECA/FBLA, sales, editing, posting… “None yet” is fine.' });
      exp.value = m.experience || '';
      const built = h('textarea', { class: 'input textarea', rows: 2, maxlength: 600, placeholder: 'A business, a page, a side hustle, anything you made or sold (optional)' });
      built.value = m.built || '';
      const hours = h('select', { class: 'input select', 'aria-label': 'Hours per week' },
        ['1–2 hours', '3–4 hours', '5+ hours'].map(x => h('option', { value: x, selected: m.hours === x }, x)));
      const parent = h('input', { class: 'input', type: 'email', placeholder: 'parent@example.com (optional)', autocomplete: 'off' });
      parent.value = m.parent_email || '';
      const agree = h('input', { type: 'checkbox', class: 'check', checked: !!m.agree });
      const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const send = h('button', { class: 'btn btn-primary btn-lg', type: 'button' }, icon('send', 16), editing ? 'Save changes' : 'Send application');

      send.addEventListener('click', () => busy(send, async () => {
        err.hidden = true;
        const fail = t => { err.textContent = t; err.hidden = false; };
        if (!pick) return fail('Pick a team above first.');
        if (why.value.trim().length < 10) return fail('Tell us why you want this team (at least one sentence).');
        if (exp.value.trim().length < 3) return fail('Add your experience. “None yet” is fine.');
        if (!agree.checked) return fail('Check the box to agree to the team rules.');
        const row = { team: pick, team2: team2.value || null, grade: grade.value, why: why.value.trim(), experience: exp.value.trim(),
          built: built.value.trim() || null, hours: hours.value, parent_email: parent.value.trim() || null, agree: true };
        const r = editing && mine ? await sb.from('team_applications').update(row).eq('id', mine.id) : await sb.from('team_applications').insert(row);
        if (r.error) return fail(friendly(r.error));
        editing = false;
        toast(mine ? 'Saved.' : 'Application sent. Officers will get back to you.', 'success');
        load();
      }));

      return h('div', { class: 'card forms-card' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Your answers'), pick ? h('span', { class: 'tag sm' }, teamName(pick)) : h('span', { class: 'muted small' }, 'Pick a team above')),
        h('div', { class: 'stack' },
          h('div', { class: 'form-grid' },
            h('div', { class: 'field' }, h('span', { class: 'label' }, 'Second choice'), team2),
            h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade)),
          RT.field('Why this team?', why),
          RT.field('Your experience', exp),
          RT.field('Anything you’ve built or sold?', built),
          h('div', { class: 'form-grid' },
            h('div', { class: 'field' }, h('span', { class: 'label' }, 'Time you can give each week'), hours),
            RT.field('Parent or guardian email', parent, 'Only used to send your acceptance letter.')),
          h('label', { class: 'check-row' }, agree, h('span', null, 'I’ll do my team’s weekly work on time. I understand that missing it means I’m off the team.')),
          err,
          h('div', { class: 'forms-actions' }, send,
            editing ? h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => { editing = false; paint(); } }, 'Cancel') : null)));
    }

    paint();
    load().catch(e => toast(friendly(e), 'error'));
  };

  // ---------------- officer side ----------------
  RT.adminTabs = RT.adminTabs || {};
  RT.adminTabs.applications = function (pane) {
    const cfg = CFG();
    let rows = [];
    let filter = 'all';
    const sum = h('p', { class: 'muted small' });
    const filt = RT.segmented({
      items: [{ value: 'all', label: 'All' }].concat(cfg.list.map(t => ({ value: t.value, label: t.label.replace(' Team', '') }))),
      value: 'all', ariaLabel: 'Team', onChange: v => { filter = v; draw(); }
    });
    const list = h('div', { class: 'stack' });
    pane.appendChild(h('div', { class: 'section-row' },
      h('div', null, h('h2', { class: 'h2' }, 'Crew applications'), h('p', { class: 'muted small' }, `Accept up to ${cfg.seats || 3} per team. The site blocks a 4th.`)), sum));
    pane.appendChild(filt);
    pane.appendChild(list);

    async function load() {
      list.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
      const r = await sb.from('team_applications').select('*').order('created_at', { ascending: true });
      if (r.error) { list.replaceChildren(h('p', { class: 'form-error' }, friendly(r.error))); return; }
      rows = (r.data || []).map(x => Object.assign(x, { name: S.directory.get(x.member_id) || 'Member' }));
      draw();
    }

    async function setStatus(x, status) {
      let note = x.officer_note || null;
      if (status === 'rejected') {
        const ok = await confirmDialog({ title: 'Turn down ' + x.name + '?', message: 'They’ll see “Not this time” on their form.', confirmText: 'Turn down', danger: true });
        if (!ok) return;
      }
      const u = await sb.from('team_applications').update({ status, officer_note: note }).eq('id', x.id);
      if (u.error) { toast(friendly(u.error), 'error'); return; }
      toast(x.name + ': ' + STATUS[status].label, 'success');
      load();
    }
    async function move(x, team) {
      const u = await sb.from('team_applications').update({ team, team2: x.team2 === team ? x.team : x.team2 }).eq('id', x.id);
      if (u.error) { toast(friendly(u.error), 'error'); return; }
      load();
    }
    async function del(x) {
      if (!await confirmDialog({ title: 'Delete this application?', message: x.name + '’s answers will be removed.', confirmText: 'Delete', danger: true })) return;
      const d = await sb.from('team_applications').delete().eq('id', x.id);
      if (d.error) { toast(friendly(d.error), 'error'); return; }
      load();
    }

    function draw() {
      const counts = cfg.list.map(t => t.label.replace(' Team', '') + ' ' + rows.filter(x => x.team === t.value && x.status === 'accepted').length + '/' + (cfg.seats || 3));
      sum.textContent = rows.length + (rows.length === 1 ? ' application' : ' applications') + ' · ' + counts.join(' · ');
      const shown = rows.filter(x => filter === 'all' || x.team === filter);
      if (!shown.length) { list.replaceChildren(h('div', { class: 'card empty' }, icon('users', 26, 'muted'), h('h3', null, 'No applications yet'), h('p', { class: 'muted' }, 'They show up here the moment members send them.'))); return; }
      list.replaceChildren(...shown.map(x => {
        const st = STATUS[x.status] || STATUS.pending;
        const other = x.team2 && teamOf(x.team2) ? h('button', { class: 'chip-btn', type: 'button', onclick: () => move(x, x.team2) }, 'Move to ' + teamName(x.team2)) : null;
        return h('article', { class: 'card app-card' },
          h('div', { class: 'card-head' },
            h('div', null, h('strong', null, x.name), h('span', { class: 'muted small' }, ' · ' + (x.grade || 'grade ?') + ' · ' + stamp(x.created_at))),
            h('span', { class: 'status-pill sm ' + st.cls }, st.label)),
          h('div', { class: 'app-teams small' }, h('span', { class: 'tag sm' }, '1st: ' + teamName(x.team)), x.team2 ? h('span', { class: 'tag sm muted' }, '2nd: ' + teamName(x.team2)) : null, x.hours ? h('span', { class: 'tag sm muted' }, x.hours + '/week') : null),
          h('dl', { class: 'app-qa' },
            h('dt', null, 'Why'), h('dd', null, x.why),
            h('dt', null, 'Experience'), h('dd', null, x.experience),
            x.built ? h('dt', null, 'Built or sold') : null, x.built ? h('dd', null, x.built) : null,
            x.parent_email ? h('dt', null, 'Parent email') : null, x.parent_email ? h('dd', null, h('a', { href: 'mailto:' + x.parent_email }, x.parent_email)) : null),
          h('div', { class: 'forms-actions' },
            x.status !== 'accepted' ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => setStatus(x, 'accepted') }, icon('check', 14), 'Accept') : null,
            x.status !== 'waitlist' ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => setStatus(x, 'waitlist') }, 'Waitlist') : null,
            x.status !== 'pending' ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => setStatus(x, 'pending') }, 'Back to waiting') : null,
            x.status !== 'rejected' ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => setStatus(x, 'rejected') }, 'Turn down') : null,
            other,
            h('button', { class: 'icon-btn sm', type: 'button', title: 'Delete', 'aria-label': 'Delete', onclick: () => del(x) }, icon('trash', 14))));
      }));
    }
    load();
  };

  // ---------------- Home: red meeting countdown ----------------
  RT.meetingBanner = function () {
    const c = (window.RT_CONFIG && window.RT_CONFIG.countdown) || {};
    const today = RT.localDateISO();
    const cal = (S.meetings || []).filter(x => (x.kind || 'meeting') === 'meeting' && x.meeting_date >= today)
      .sort((a, b) => (a.meeting_date < b.meeting_date ? -1 : 1))[0];
    const date = cal ? cal.meeting_date : c.date;
    if (!date || date < today) return null;
    const days = Math.round((RT.parseLocalDate(date) - RT.parseLocalDate(today)) / 86400000);
    const big = days === 0 ? 'TODAY' : days === 1 ? '1 DAY' : days + ' DAYS';
    const when = RT.parseLocalDate(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    const place = (cal && cal.location) || c.place;
    const time = c.time && (!cal || date === c.date) ? c.time : '';
    const what = (cal && cal.name) || c.text || 'Next meeting';
    return h('a', { class: 'countdown-banner reveal', href: '#/updates/calendar', role: 'status', 'aria-label': `${big} until the next meeting` },
      h('div', { class: 'cd-num' }, h('span', { class: 'cd-big mono' }, big), h('span', { class: 'cd-sub' }, days === 0 ? 'Meeting day' : 'until the next meeting')),
      h('div', { class: 'cd-info' },
        h('span', { class: 'cd-eyebrow' }, icon('megaphone', 14), 'Big announcement'),
        h('strong', { class: 'cd-what' }, what),
        h('span', { class: 'cd-when' }, [when, time, place].filter(Boolean).join(' · ')),
        h('span', { class: 'cd-cta small' }, 'Bring a friend. Walk in, no sign-up.')));
  };
})();
