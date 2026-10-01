// Updates: announcements from the officers + a month calendar of meetings, events, and bounty deadlines.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, confirmDialog, segmented, busy, friendly, fmtDate, fmtClock, timeAgo, localDateISO, parseLocalDate } = RT;
  const S = RT.state;
  const api = RT.api;
  const sb = RT.sb;

  async function refreshAnnouncements() {
    S.announcements = await api.announcements();
    RT.countUnseenAnnouncements();
  }

  RT.views.updates = function (root, t) {
    let tab = t.tab;
    const seg = segmented({
      items: [{ value: 'news', label: 'Announcements', icon: 'megaphone' }, { value: 'calendar', label: 'Calendar', icon: 'calendar' }],
      value: tab, ariaLabel: 'Updates', onChange: v => RT.go('updates' + (v === 'calendar' ? '/calendar' : ''))
    });
    root.appendChild(RT.pageHead('Updates', 'News from the officers and what’s coming up.', seg));
    const body = h('div', { class: 'reveal', style: { '--i': 1 } });
    root.appendChild(body);

    let calMonth = firstOfMonth(new Date());
    let calPick = localDateISO();

    function draw() {
      clear(body);
      if (tab === 'calendar') drawCalendar();
      else drawNews();
    }

    // ---------------- announcements ----------------
    function drawNews() {
      RT.markAnnouncementsSeen();
      RT.updateAdminBadge();
      if (S.isAdmin) {
        body.appendChild(h('div', { class: 'toolbar news-bar' },
          h('p', { class: 'muted small grow' }, 'Only officers can post here. Members see new posts in this tab and on their home page.'),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => composer() }, icon('plus', 16), 'New announcement')));
      }
      if (!S.announcements.length) {
        body.appendChild(h('div', { class: 'card empty' }, icon('megaphone', 26, 'muted'), h('h3', null, 'No announcements yet'),
          h('p', { class: 'muted' }, S.isAdmin ? 'Post the first one: meeting details, a welcome, anything members should know.' : 'When the officers post news, it shows up here.')));
        return;
      }
      body.appendChild(h('div', { class: 'news-list' }, S.announcements.map((a, i) => newsCard(a, i))));
    }

    function newsCard(a, i) {
      const who = a.author_id ? S.directory.get(a.author_id) : null;
      return h('article', { class: 'card news-card' + (a.pinned ? ' is-pinned' : ''), style: { '--i': Math.min(i, 8) } },
        h('header', { class: 'news-head' },
          h('div', { class: 'min0' },
            a.pinned ? h('span', { class: 'tag sm pin-tag' }, icon('pin', 12), 'Pinned') : null,
            h('h3', null, a.title),
            h('p', { class: 'muted small' }, (who ? who + ' · ' : '') + timeAgo(a.created_at))),
          h('div', { class: 'news-actions' },
            h('button', { class: 'icon-btn sm', type: 'button', title: 'Copy for WhatsApp', 'aria-label': 'Copy for WhatsApp', onclick: () => RT.copyText(`*${a.title}*\n${a.body || ''}`.trim(), 'Copied. Paste it into WhatsApp.') }, icon('copy', 14)),
            S.isAdmin ? [
              h('button', { class: 'icon-btn sm', type: 'button', title: a.pinned ? 'Unpin' : 'Pin to top', 'aria-label': 'Pin', onclick: () => pin(a) }, icon('pin', 14)),
              h('button', { class: 'icon-btn sm', type: 'button', title: 'Edit', 'aria-label': 'Edit', onclick: () => composer(a) }, icon('edit', 14)),
              h('button', { class: 'icon-btn sm', type: 'button', title: 'Delete', 'aria-label': 'Delete', onclick: () => del(a) }, icon('trash', 14))
            ] : null)),
        a.body ? h('div', { class: 'news-body' }, RT.linkify(a.body)) : null);
    }

    async function pin(a) {
      const { error } = await sb.from('announcements').update({ pinned: !a.pinned }).eq('id', a.id);
      if (error) { toast(friendly(error), 'error'); return; }
      await refreshAnnouncements();
      draw();
    }

    async function del(a) {
      if (!(await confirmDialog({ title: 'Delete this announcement?', message: a.title, confirmText: 'Delete', danger: true }))) return;
      const { error } = await sb.from('announcements').delete().eq('id', a.id);
      if (error) { toast(friendly(error), 'error'); return; }
      await refreshAnnouncements();
      draw();
    }

    function composer(existing) {
      const title = h('input', { class: 'input', type: 'text', maxlength: 120, placeholder: 'e.g. First meeting is Wednesday', value: existing ? existing.title : '', autofocus: true });
      const text = h('textarea', { class: 'input textarea', rows: 7, maxlength: 4000, placeholder: 'Details, links, what to bring…' }, existing ? existing.body : '');
      const pinBox = h('input', { type: 'checkbox', class: 'check', checked: !!(existing && existing.pinned) });
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, existing ? 'Save changes' : 'Post');
      const m = modal({
        title: existing ? 'Edit announcement' : 'New announcement', wide: true,
        body: h('div', { class: 'stack' }, RT.field('Title', title), RT.field('Message', text),
          h('label', { class: 'check-row' }, pinBox, h('span', null, 'Pin to the top'))),
        actions: [go]
      });
      go.addEventListener('click', () => busy(go, async () => {
        if (!title.value.trim()) { toast('Give it a title.', 'error'); return; }
        const row = { title: title.value.trim(), body: text.value.trim(), pinned: pinBox.checked };
        const { error } = existing
          ? await sb.from('announcements').update(row).eq('id', existing.id)
          : await sb.from('announcements').insert({ ...row, author_id: S.me.id });
        if (error) { toast(friendly(error), 'error'); return; }
        await refreshAnnouncements();
        m.close();
        toast(existing ? 'Saved' : 'Posted', 'success');
        draw();
      }));
    }

    // ---------------- calendar ----------------
    function firstOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

    function itemsByDate() {
      const map = new Map();
      const add = (date, item) => { if (!map.has(date)) map.set(date, []); map.get(date).push({ ...item, date }); };
      S.meetings.forEach(m => add(String(m.meeting_date).slice(0, 10), {
        type: m.kind === 'event' ? 'event' : 'meeting',
        title: m.name || (m.kind === 'event' ? 'Event' : 'Meeting'),
        start: m.start_time, end: m.end_time, location: m.location, description: m.description
      }));
      S.bounties.filter(b => b.active && b.ends_at).forEach(b => add(localDateISO(new Date(b.ends_at)), {
        type: 'deadline', title: 'Bounty ends: ' + b.title, description: `+${b.points} Bites. Claim it before it closes.`
      }));
      map.forEach(list => list.sort((a, b) => String(a.start || '99').localeCompare(String(b.start || '99'))));
      return map;
    }

    const TYPE = { meeting: { label: 'Meeting', cls: 'm' }, event: { label: 'Event', cls: 'e' }, deadline: { label: 'Deadline', cls: 'd' } };

    function drawCalendar() {
      const map = itemsByDate();
      const today = localDateISO();
      const monthLabel = calMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

      const nav = h('div', { class: 'cal-nav' },
        h('h2', { class: 'cal-title' }, monthLabel),
        h('div', { class: 'row gap-sm' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Previous month', onclick: () => shift(-1) }, icon('chevronLeft', 18)),
          h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { calMonth = firstOfMonth(new Date()); calPick = today; draw(); } }, 'Today'),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Next month', onclick: () => shift(1) }, icon('chevronRight', 18))));

      const grid = h('div', { class: 'cal-grid', role: 'grid', 'aria-label': monthLabel },
        ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => h('div', { class: 'cal-dow', role: 'columnheader' }, d)));
      const start = new Date(calMonth);
      start.setDate(1 - start.getDay());
      for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
        const iso = localDateISO(d);
        const items = map.get(iso) || [];
        const other = d.getMonth() !== calMonth.getMonth();
        const types = [...new Set(items.map(x => x.type))];
        grid.appendChild(h('button', {
          class: 'cal-cell' + (other ? ' other' : '') + (iso === today ? ' today' : '') + (iso === calPick ? ' picked' : ''),
          type: 'button', role: 'gridcell',
          'aria-label': d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) + (items.length ? `, ${items.length} item${items.length === 1 ? '' : 's'}` : ''),
          onclick: () => { calPick = iso; if (other) calMonth = firstOfMonth(d); draw(); }
        }, h('span', { class: 'cal-num mono' }, String(d.getDate())),
          types.length ? h('span', { class: 'cal-dots' }, types.map(tp => h('i', { class: 'dot ' + TYPE[tp].cls }))) : null));
      }

      const legend = h('div', { class: 'cal-legend muted small' },
        h('span', null, h('i', { class: 'dot m' }), 'Meeting'), h('span', null, h('i', { class: 'dot e' }), 'Event'), h('span', null, h('i', { class: 'dot d' }), 'Deadline'));

      // The picked day, then what's coming up.
      const picked = map.get(calPick) || [];
      const dayHead = parseLocalDate(calPick).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
      const dayCard = h('section', { class: 'card day-card' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, dayHead), calPick === today ? h('span', { class: 'tag sm' }, 'Today') : null),
        picked.length ? h('div', { class: 'stack-sm' }, picked.map(eventRow)) : h('p', { class: 'muted' }, 'Nothing on this day.'));

      const upcoming = [];
      [...map.keys()].sort().forEach(k => { if (k >= today) map.get(k).forEach(it => upcoming.push(it)); });
      const upCard = h('section', { class: 'card day-card' },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Coming up')),
        upcoming.length
          ? h('ul', { class: 'timeline' }, upcoming.slice(0, 6).map(it => h('li', { class: 'pick-li', onclick: () => { calPick = it.date; calMonth = firstOfMonth(parseLocalDate(it.date)); draw(); } },
              h('span', { class: 'tl-icon' + (it.type === 'meeting' ? '' : ' burg') }, icon(it.type === 'deadline' ? 'target' : 'calendar', 16)),
              h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis' }, it.title), h('div', { class: 'muted small ellipsis' }, fmtDate(it.date, { weekday: 'short', month: 'short', day: 'numeric' }) + (it.start ? ' · ' + fmtClock(it.start) : ''))))))
          : h('p', { class: 'muted' }, 'Nothing scheduled yet. Officers add meetings and events here.'),
        S.isAdmin ? h('a', { class: 'link-sm', href: '#/admin/meetings' }, 'Add or edit in officer tools', icon('chevronRight', 14)) : null);

      body.appendChild(h('div', { class: 'cal-layout' },
        h('section', { class: 'card cal-card' }, nav, grid, legend),
        h('div', { class: 'cal-side' }, dayCard, upCard)));
    }

    function shift(n) {
      calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + n, 1);
      draw();
    }

    function eventRow(it) {
      const info = [];
      if (it.start) info.push(fmtClock(it.start) + (it.end ? '–' + fmtClock(it.end) : ''));
      if (it.location) info.push(it.location);
      return h('div', { class: 'event-row' },
        h('div', { class: 'min0' },
          h('div', { class: 'event-title' }, it.title, h('span', { class: 'tag sm ' + (it.type === 'meeting' ? '' : 'muted') }, TYPE[it.type].label)),
          info.length ? h('div', { class: 'muted small' }, info.join(' · ')) : null,
          it.description ? h('p', { class: 'muted small event-desc' }, it.description) : null),
        it.type === 'deadline' ? null : h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => RT.downloadICS(it) }, icon('download', 14), 'Add to calendar'));
    }

    draw();
    // Fresh copy in the background so a just-posted announcement or event shows up.
    Promise.all([api.announcements(), api.meetings()]).then(([anns, meetings]) => {
      S.announcements = anns;
      S.meetings = meetings;
      RT.countUnseenAnnouncements();
      draw();
    }).catch(() => {});

    return {
      update(nt) {
        if (nt.tab === tab) return;
        tab = nt.tab;
        seg.setValue(tab);
        draw();
      }
    };
  };
})();
