// The Tank Market: invest Bites in pitches, and the sign-up rewards draw.
// Needs supabase/migration_v5_market.sql. Until that has been run, nothing here shows (the plain leaderboard keeps working).
// Bounties live in bounties.js and admin2.js. Bite decay is automatic (see member_points in migration_v3.sql).
// Member side: one card on Home. Officer side: switches on the Pitches tab and the rewards card on the Welcome tab.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, confirmDialog, memberPicker, busy, friendly, fmtDate, avatar } = RT;
  const S = RT.state;
  const api = RT.api;
  const sb = RT.sb;

  const fmt = n => Number(n || 0).toLocaleString();
  const today = () => RT.localDateISO();

  // ---------------- member side ----------------
  // Returns the invest card for Home, or null when the market isn't switched on yet.
  async function memberCards(d) {
    if (!(RT.market && RT.market.live)) return null;
    const meeting = await api.openMeeting();
    const stakes = meeting ? (await api.myStakes(S.me.id)).filter(v => v.meeting_id === meeting.id) : [];
    return [investCard(d, meeting, stakes)];
  }

  function investCard(d, meeting, stakes) {
    const mine = d.mine;
    const available = Math.max(0, Number(mine.available != null ? mine.available : mine.total_points) || 0);
    const locked = Math.max(0, Number(mine.locked) || 0);
    const card = h('section', { class: 'card span-12 market-card', 'data-open': meeting ? '1' : '0' },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Invest in the Tank'), icon('coins', 18, 'muted')));
    card.appendChild(h('div', { class: 'wallet' },
      h('div', null, h('div', { class: 'mono wallet-val' }, fmt(available)), h('div', { class: 'muted small' }, 'Available')),
      h('div', null, h('div', { class: 'mono wallet-val' }, fmt(locked)), h('div', { class: 'muted small' }, 'In open bets')),
      h('div', null, h('div', { class: 'mono wallet-val' }, fmt(mine.total_points)), h('div', { class: 'muted small' }, 'Net worth'))));

    if (!meeting) {
      card.appendChild(h('p', { class: 'muted' }, 'Investing opens during the meeting. Back the pitches you believe in: 1st pays 3x, 2nd 2x, 3rd 1.5x. A pitch that flops pays half.'));
    } else {
      let target = null;
      const people = () => [...S.directory].filter(([id]) => id !== S.me.id).map(([id, name]) => ({ id, name }));
      const pick = memberPicker({ members: people, placeholder: 'Who are you backing?', keepValue: true, onPick: m => { target = m; } });
      const amt = h('input', { class: 'input mono', type: 'number', min: 1, step: 1, placeholder: 'Bites', inputmode: 'numeric' });
      const quick = h('div', { class: 'row gap-sm wrap' }, [25, 50, 100].map(p => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { amt.value = Math.floor(available * p / 100) || ''; } }, p + '%')));
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, 'Invest');
      go.addEventListener('click', () => busy(go, async () => {
        const n = Math.floor(Number(amt.value));
        if (!target) { toast('Pick who you’re backing.', 'error'); return; }
        if (!(n >= 1)) { toast('Enter how many Bites.', 'error'); return; }
        if (n > available) { toast('You only have ' + fmt(available) + ' Bites available.', 'error'); return; }
        try { await api.invest(target.id, n); } catch (e) { toast(friendly(e), 'error'); return; }
        toast(`Invested ${fmt(n)} Bites in ${target.name}`, 'success');
        RT.rerender();
      }));
      card.append(
        h('p', { class: 'muted small' }, 'Investing is open for ' + (meeting.name || 'today’s meeting') + '. Stakes are locked until officers post the results.'),
        h('div', { class: 'stack-sm' }, pick, h('div', { class: 'row gap-sm' }, amt, go), quick));
      if (stakes.length) {
        card.appendChild(h('div', { class: 'entry-list' }, stakes.map(v => h('div', { class: 'entry' },
          avatar(S.directory.get(v.to_member_id) || '?', 28), h('span', { class: 'grow ellipsis' }, S.directory.get(v.to_member_id) || 'Unknown'),
          h('span', { class: 'mono' }, fmt(v.amount) + ' Bites')))));
      }
    }
    const st = S.settings || {};
    card.appendChild(h('p', { class: 'muted small decay-note' },
      `Bites you have earned slowly fade if you skip meetings for ${st.decay_grace_days || 30} days. Coming to a meeting stops it.`));
    return card;
  }

  // ---------------- officer side ----------------
  // Switches for the meeting picked on the Pitches tab: open/close investing, lock in results.
  function meetingSwitches(meetingId) {
    const A = RT.adminData;
    const m = A.meetings.find(x => x.id === meetingId);
    const box = h('div', { class: 'card' });
    if (!m) return box;
    function draw() {
      clear(box).append(
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Tank Market'), h('span', { class: 'muted small' }, 'Turn these on during the meeting')),
        h('div', { class: 'row between wrap gap-sm' },
          h('div', { class: 'min0' }, h('strong', null, m.investing_open ? 'Investing is open' : 'Investing is closed'),
            h('div', { class: 'muted small' }, 'Members can put their Bites into pitchers from their Home screen.')),
          toggle(m.investing_open ? 'Close investing' : 'Open investing', { investing_open: !m.investing_open })),
        h('div', { class: 'row between wrap gap-sm market-row' },
          h('div', { class: 'min0' }, h('strong', null, m.results_final ? 'Results are final. Bets have paid out.' : 'Results not final'),
            h('div', { class: 'muted small' }, 'Finalizing pays stakes: 1st 3x, 2nd 2x, 3rd 1.5x, pitched 0.5x, no pitch 0x. Do this after every placement is entered.')),
          toggle(m.results_final ? 'Reopen results' : 'Finalize results', { results_final: !m.results_final }, !m.results_final)));
    }
    function toggle(label, patch, needsConfirm) {
      const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, label);
      b.addEventListener('click', () => busy(b, async () => {
        if (needsConfirm && !(await confirmDialog({ title: 'Finalize results?', message: 'Every open stake for this meeting pays out now, and members see their new net worth.', confirmText: 'Finalize' }))) return;
        const { data, error } = await sb.from('meetings').update(patch).eq('id', m.id).select().single();
        if (error) { toast(friendly(error), 'error'); return; }
        Object.assign(m, data);
        await RT.refreshBoard();
        draw();
      }));
      return b;
    }
    draw();
    return box;
  }

  // Sign-up rewards: who gets the candy (first 10 to sign up) and a random cash-prize draw. Shown on the Welcome tab.
  function rewardsCard() {
    const A = RT.adminData;
    const box = h('div', { class: 'card' });
    const members = [...(A.members || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    const first = members.slice(0, 10);
    const nextMeeting = (A.meetings || []).filter(m => m.meeting_date >= today()).sort((a, b) => (a.meeting_date < b.meeting_date ? -1 : 1))[0];
    const cutoff = h('input', { class: 'input', type: 'date', value: nextMeeting ? nextMeeting.meeting_date : today() });
    const winner = h('div', { class: 'winner', hidden: true });
    const draw = h('button', { class: 'btn btn-primary', type: 'button' }, 'Draw a winner');
    draw.addEventListener('click', () => {
      const limit = cutoff.value ? new Date(cutoff.value + 'T23:59:59') : new Date();
      const pool = members.filter(m => new Date(m.created_at) <= limit);
      if (!pool.length) { toast('No one signed up by that date.', 'error'); return; }
      const pick = pool[Math.floor(Math.random() * pool.length)];
      clear(winner).append(h('div', { class: 'muted small' }, 'Winner (' + pool.length + ' entered)'), h('div', { class: 'winner-name' }, pick.name));
      winner.hidden = false;
    });
    box.append(
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Sign-up rewards'), h('span', { class: 'muted small' }, 'Candy + cash draw')),
      h('p', { class: 'muted small' }, 'First 10 sign-ups get candy. Everyone signed up by the cutoff is entered in the cash draw. Do the draw live at the meeting.'),
      h('div', { class: 'entry-list' }, first.length ? first.map((m, i) => h('div', { class: 'entry' },
        h('span', { class: 'mono muted', style: { width: '22px' } }, String(i + 1)), avatar(m.name, 26), h('span', { class: 'grow ellipsis' }, m.name),
        h('span', { class: 'muted small' }, fmtDate(m.created_at, { month: 'short', day: 'numeric' })))) : h('p', { class: 'muted small' }, 'No sign-ups yet.')),
      h('div', { class: 'stack-sm reward-draw' }, h('label', { class: 'muted small' }, 'Entered if signed up by'), h('div', { class: 'row gap-sm' }, h('div', { class: 'grow' }, cutoff), draw), winner));
    return box;
  }

  RT.market = Object.assign(RT.market || {}, { memberCards, meetingSwitches, rewardsCard });
})();
