// Bounties (challenges): officers post them, members claim them, officers approve, points land automatically.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, segmented, busy, friendly, fmtDate, timeAgo } = RT;
  const S = RT.state;
  const api = RT.api;

  // Everything the screens need to know about one bounty, from this member's point of view.
  RT.bountyInfo = function (b) {
    const taken = S.bountyTaken.get(b.id) || 0;
    const mine = S.myClaims.filter(c => c.bounty_id === b.id);
    const used = mine.filter(c => c.status !== 'rejected').length;
    const ended = !!b.ends_at && new Date(b.ends_at).getTime() < Date.now();
    const full = b.max_total != null && taken >= b.max_total;
    const spotsLeft = b.max_total != null ? Math.max(0, b.max_total - taken) : null;
    const mineDone = used >= b.max_per_member;
    return { taken, mine, used, ended, full, spotsLeft, mineDone, open: !!b.active && !ended && !full && !mineDone };
  };

  RT.bountyMeta = function (b) {
    const i = RT.bountyInfo(b);
    const bits = [];
    if (i.spotsLeft != null) bits.push(i.spotsLeft + (i.spotsLeft === 1 ? ' spot left' : ' spots left'));
    if (b.ends_at) bits.push('ends ' + fmtDate(b.ends_at, { month: 'short', day: 'numeric' }));
    if (!bits.length) bits.push(b.max_per_member > 1 ? `up to ${b.max_per_member} times` : 'one per person');
    return bits.join(' · ');
  };

  const PROOF = { none: 'Just claim it', note: 'Add a note', link: 'Add a link' };
  const STATUS = {
    pending: { label: 'Waiting for officers', cls: 'wait' },
    approved: { label: 'Approved', cls: 'ok' },
    rejected: { label: 'Not approved', cls: 'no' }
  };

  async function refresh() {
    const [claims, counts, bounties] = await Promise.all([api.myClaims(S.me.id), api.bountyCounts(), api.bounties()]);
    S.myClaims = claims;
    S.bountyTaken = new Map(counts.map(c => [c.bounty_id, c.taken]));
    S.bounties = bounties;
  }
  RT.refreshBounties = refresh;

  RT.views.bounties = function (root, t) {
    let tab = t.tab;
    const seg = segmented({
      items: [{ value: 'open', label: 'Open' }, { value: 'mine', label: 'My claims' }],
      value: tab, ariaLabel: 'Bounties', onChange: v => RT.go('bounties' + (v === 'mine' ? '/mine' : ''))
    });
    root.appendChild(RT.pageHead('Bounties', 'Finish a challenge, earn bonus points. Officers check each one before the points land.', seg));
    const body = h('div', { class: 'reveal', style: { '--i': 1 } });
    root.appendChild(body);

    function draw() {
      clear(body);
      (tab === 'mine' ? drawMine : drawOpen)();
    }

    function drawOpen() {
      const rank = b => { const i = RT.bountyInfo(b); return i.open ? 0 : i.mineDone ? 1 : 2; };
      const list = S.bounties.filter(b => b.active || S.isAdmin)
        .sort((a, b) => rank(a) - rank(b) || b.points - a.points);
      if (!list.length) {
        body.appendChild(h('div', { class: 'card empty' }, icon('target', 26, 'muted'), h('h3', null, 'No bounties yet'), h('p', { class: 'muted' }, 'Officers will post challenges here. Check back soon.')));
        return;
      }
      body.appendChild(h('div', { class: 'bounty-grid' }, list.map((b, i) => bountyCard(b, i))));
    }

    function bountyCard(b, i) {
      const info = RT.bountyInfo(b);
      const latest = info.mine[0];
      let foot;
      if (info.open) {
        foot = h('button', { class: 'btn btn-primary btn-block', type: 'button', onclick: () => claimModal(b) }, 'Claim it');
      } else if (latest && info.mineDone) {
        const st = STATUS[latest.status];
        foot = h('div', { class: 'bounty-status' }, h('span', { class: 'status-pill ' + st.cls }, st.label + (latest.status === 'approved' ? ' +' + latest.points_awarded : '')),
          h('span', { class: 'muted small' }, timeAgo(latest.created_at)));
      } else {
        foot = h('div', { class: 'bounty-status' }, h('span', { class: 'status-pill wait' }, !b.active ? 'Not open' : info.ended ? 'Ended' : 'All spots taken'));
      }
      return h('article', { class: 'card bounty-card' + (info.open ? '' : ' is-done'), style: { '--i': Math.min(i, 8) } },
        h('div', { class: 'bounty-top' },
          h('span', { class: 'reward mono' }, '+' + b.points, h('small', null, ' pts')),
          h('span', { class: 'tag sm muted' }, PROOF[b.proof])),
        h('h3', null, b.title),
        b.description ? h('p', { class: 'muted' }, b.description) : null,
        h('div', { class: 'bounty-meta muted small' }, icon('clock', 14), RT.bountyMeta(b)),
        foot);
    }

    function drawMine() {
      const claims = S.myClaims;
      if (!claims.length) {
        body.appendChild(h('div', { class: 'card empty' }, icon('check', 26, 'muted'), h('h3', null, 'Nothing claimed yet'),
          h('p', { class: 'muted' }, 'Claim a bounty and it shows up here while the officers check it.'),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => RT.go('bounties') }, 'See open bounties')));
        return;
      }
      const won = claims.filter(c => c.status === 'approved').reduce((s, c) => s + (Number(c.points_awarded) || 0), 0);
      const waiting = claims.filter(c => c.status === 'pending').length;
      body.appendChild(h('div', { class: 'stat-strip' },
        strip('Points from bounties', '+' + won), strip('Approved', claims.filter(c => c.status === 'approved').length),
        strip('Waiting', waiting), strip('Not approved', claims.filter(c => c.status === 'rejected').length)));
      body.appendChild(h('div', { class: 'card claim-list' }, claims.map(c => {
        const b = S.bounties.find(x => x.id === c.bounty_id);
        const st = STATUS[c.status];
        return h('div', { class: 'claim-row' },
          h('span', { class: 'tl-icon' + (c.status === 'approved' ? '' : ' burg') }, icon(c.status === 'approved' ? 'check' : c.status === 'pending' ? 'clock' : 'x', 16)),
          h('div', { class: 'grow min0' },
            h('div', { class: 'ellipsis' }, b ? b.title : 'Bounty'),
            c.note ? h('div', { class: 'muted small ellipsis' }, '“' + c.note + '”') : null,
            c.reviewed_note ? h('div', { class: 'small accent' }, 'Officer note: ' + c.reviewed_note) : null),
          h('div', { class: 'claim-right' }, h('span', { class: 'status-pill sm ' + st.cls }, st.label), h('span', { class: 'muted small' }, timeAgo(c.created_at))));
      })));
    }
    function strip(label, value) { return h('div', { class: 'strip-stat' }, h('div', { class: 'mono strip-val' }, String(value)), h('div', { class: 'muted small' }, label)); }

    function claimModal(b) {
      const needs = b.proof !== 'none';
      const input = b.proof === 'link'
        ? h('input', { class: 'input', type: 'url', placeholder: 'https://…', autocomplete: 'off', autofocus: true })
        : h('textarea', { class: 'input textarea', rows: 3, maxlength: 500, placeholder: needs ? 'What did you do? Add names or details.' : 'Anything the officers should know? (optional)', autofocus: needs });
      const send = h('button', { class: 'btn btn-primary', type: 'button' }, 'Send to officers');
      const m = modal({
        title: b.title,
        subtitle: `+${b.points} points if approved`,
        body: h('div', { class: 'stack' },
          b.description ? h('p', { class: 'muted' }, b.description) : null,
          RT.field(b.proof === 'link' ? 'Link' : needs ? 'Your note' : 'Note (optional)', input),
          h('p', { class: 'muted small' }, 'Officers check every claim. Points show up on your profile once it’s approved.')),
        actions: [send]
      });
      send.addEventListener('click', () => busy(send, async () => {
        const val = input.value.trim();
        if (needs && !val) { toast(b.proof === 'link' ? 'Paste a link first.' : 'Add a short note first.', 'error'); return; }
        if (b.proof === 'link' && !/^https?:\/\/\S+\.\S+/i.test(val)) { toast('That link should start with http:// or https://', 'error'); return; }
        try {
          await api.claimBounty(b.id, val);
          await refresh();
          m.close();
          toast('Sent. Officers will take a look.', 'success');
          draw();
        } catch (e) {
          toast(friendly(e), 'error');
          refresh().then(draw).catch(() => {});
        }
      }));
    }

    draw();
    refresh().then(draw).catch(() => {});
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
