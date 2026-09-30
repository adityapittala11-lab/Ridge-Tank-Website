// The Tank Market: invest Bites in pitches, bounties, and monthly decay.
// Needs supabase/migration_v4.sql. Until that has been run, nothing here shows (the old leaderboard keeps working).
// Member side: two cards on Home. Officer side: the "Market" tab and a few switches on the Pitches tab.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, confirmDialog, memberPicker, busy, friendly, fmtDate, avatar } = RT;
  const S = RT.state;
  const api = RT.api;
  const sb = RT.sb;

  const fmt = n => Number(n || 0).toLocaleString();
  const today = () => RT.localDateISO();

  // ---------------- member side ----------------
  // Returns the two cards for Home, or null when the market isn't switched on yet.
  async function memberCards(d) {
    if (!(RT.market && RT.market.live)) return null;
    const me = S.me;
    const [meeting, bounties, claims] = await Promise.all([api.openMeeting(), api.bounties(), api.myClaims(me.id)]);
    const stakes = meeting ? (await api.myStakes(me.id)).filter(v => v.meeting_id === meeting.id) : [];
    return [investCard(d, meeting, stakes), bountyCard(bounties, claims)];
  }

  function investCard(d, meeting, stakes) {
    const mine = d.mine;
    const available = Math.max(0, Number(mine.available != null ? mine.available : mine.total_points) || 0);
    const locked = Math.max(0, Number(mine.locked) || 0);
    const card = h('section', { class: 'card span-6 market-card' },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Invest in the Tank'), icon('coins', 18, 'muted')));
    const wallet = h('div', { class: 'wallet' },
      h('div', null, h('div', { class: 'mono wallet-val' }, fmt(available)), h('div', { class: 'muted small' }, 'Available')),
      h('div', null, h('div', { class: 'mono wallet-val' }, fmt(locked)), h('div', { class: 'muted small' }, 'In open bets')),
      h('div', null, h('div', { class: 'mono wallet-val' }, fmt(mine.total_points)), h('div', { class: 'muted small' }, 'Net worth')));
    card.appendChild(wallet);

    if (!meeting) {
      card.appendChild(h('p', { class: 'muted' }, 'Investing opens during the meeting. Back the pitches you believe in: 1st pays 3x, 2nd 2x, 3rd 1.5x. A pitch that flops pays half.'));
    } else {
      let target = null;
      const people = () => [...S.directory].filter(([id]) => id !== S.me.id).map(([id, name]) => ({ id, name }));
      const pick = memberPicker({ members: people, placeholder: 'Who are you backing?', keepValue: true, onPick: m => { target = m; } });
      const amt = h('input', { class: 'input mono', type: 'number', min: 1, step: 1, placeholder: 'Bites', inputmode: 'numeric' });
      const quick = h('div', { class: 'row gap-sm wrap' }, [25, 50, 100].map(p => h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { amt.value = Math.floor(available * p / 100) || ''; } }, p + '%')));
      const go = h('button', { class: 'btn btn-primary', type: 'button' }, icon('coins', 16), 'Invest');
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
    card.appendChild(h('p', { class: 'muted small decay-note' }, icon('clock', 14), ' Idle Bites fade 10% on the 1st of each month. Invest them or lose them.'));
    return card;
  }

  function bountyCard(bounties, claims) {
    const card = h('section', { class: 'card span-6 market-card' },
      h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Bounties'), icon('target', 18, 'muted')));
    const live = bounties.filter(b => !b.expires_on || b.expires_on >= today());
    if (!live.length) {
      card.appendChild(h('div', { class: 'empty-mini' }, icon('target', 22, 'muted'), h('p', { class: 'muted' }, 'No bounties right now. Officers post side challenges here for extra Bites.')));
      return card;
    }
    const byBounty = new Map(claims.map(c => [c.bounty_id, c]));
    const list = h('div', { class: 'bounty-list' });
    live.forEach(b => {
      const c = byBounty.get(b.id);
      const btn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'I did it');
      if (c) {
        btn.disabled = true;
        btn.textContent = c.status === 'approved' ? 'Paid' : c.status === 'rejected' ? 'Not approved' : 'Waiting on an officer';
      } else {
        btn.addEventListener('click', () => busy(btn, async () => {
          try { await api.claimBounty(b.id); } catch (e) { toast(friendly(e), 'error'); return; }
          toast('Sent to the officers. They’ll check it.', 'success');
          RT.rerender();
        }));
      }
      list.appendChild(h('div', { class: 'bounty' },
        h('div', { class: 'grow min0' }, h('div', { class: 'bounty-title' }, b.title),
          b.details ? h('div', { class: 'muted small' }, b.details) : null,
          b.expires_on ? h('div', { class: 'muted small' }, 'Ends ' + fmtDate(b.expires_on, { month: 'short', day: 'numeric' })) : null),
        h('div', { class: 'bounty-side' }, h('span', { class: 'mono reward' }, '+' + fmt(b.reward)), btn)));
    });
    card.appendChild(list);
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

  // Market tab: bounties (create, approve), monthly decay.
  function adminTab(pane) {
    const A = RT.adminData;
    const nameOf = id => ((A.members || []).find(m => m.id === id) || {}).name || S.directory.get(id) || 'Unknown';
    const claimsBox = h('div', { class: 'card' });
    const bountyBox = h('div', { class: 'card' });
    const decayBox = h('div', { class: 'card' });
    pane.append(h('div', { class: 'two-col' }, bountyBox, claimsBox), decayBox);

    let bounties = [], claims = [];
    async function load() {
      const [b, c] = await Promise.all([sb.from('bounties').select('*').order('created_at', { ascending: false }), sb.from('bounty_claims').select('*').order('created_at', { ascending: false })]);
      if (b.error || c.error) {
        clear(pane).appendChild(h('div', { class: 'card empty' }, icon('alert', 24), h('h3', null, 'Market not switched on'),
          h('p', { class: 'muted' }, 'Run supabase/migration_v4.sql in the Supabase SQL Editor, then reload.')));
        return;
      }
      bounties = b.data; claims = c.data;
      drawBounties(); drawClaims(); drawDecay();
    }

    function drawBounties() {
      const title = h('input', { class: 'input', type: 'text', placeholder: 'e.g. Bring a friend to the meeting', maxlength: 80 });
      const details = h('input', { class: 'input', type: 'text', placeholder: 'How it’s checked (optional)', maxlength: 160 });
      const reward = h('input', { class: 'input mono', type: 'number', min: 1, step: 1, placeholder: 'Bites', value: 100 });
      const ends = h('input', { class: 'input', type: 'date' });
      const add = h('button', { class: 'btn btn-primary', type: 'button' }, icon('plus', 16), 'Post bounty');
      add.addEventListener('click', () => busy(add, async () => {
        const t = title.value.trim(), r = Math.floor(Number(reward.value));
        if (t.length < 2) { toast('Give it a title.', 'error'); return; }
        if (!(r >= 1)) { toast('Set a reward.', 'error'); return; }
        const { error } = await sb.from('bounties').insert({ title: t, details: details.value.trim() || null, reward: r, expires_on: ends.value || null });
        if (error) { toast(friendly(error), 'error'); return; }
        toast('Bounty posted', 'success');
        load();
      }));
      clear(bountyBox).append(
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Bounties'), h('span', { class: 'muted small' }, 'Side challenges for extra Bites')),
        h('div', { class: 'stack-sm' }, title, details, h('div', { class: 'row gap-sm' }, reward, ends), h('div', { class: 'row end' }, add)),
        h('div', { class: 'entry-list' }, bounties.length ? bounties.map(b => {
          const off = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, b.active ? 'End' : 'Reopen');
          off.addEventListener('click', () => busy(off, async () => {
            const { error } = await sb.from('bounties').update({ active: !b.active }).eq('id', b.id);
            if (error) { toast(friendly(error), 'error'); return; }
            load();
          }));
          return h('div', { class: 'entry' + (b.active ? '' : ' muted') }, h('span', { class: 'grow ellipsis' }, b.title), h('span', { class: 'mono' }, '+' + fmt(b.reward)), off);
        }) : h('p', { class: 'muted small' }, 'No bounties yet.')));
    }

    function drawClaims() {
      const titleOf = id => (bounties.find(b => b.id === id) || {}).title || 'Bounty';
      const pending = claims.filter(c => c.status === 'pending');
      clear(claimsBox).append(
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Claims to check'), h('span', { class: 'count-pill' }, String(pending.length))),
        pending.length ? h('div', { class: 'entry-list' }, pending.map(c => {
          const ok = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, 'Approve');
          const no = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'No');
          const decide = (good, btn) => busy(btn, async () => {
            const { error } = await sb.rpc('decide_claim', { p_claim: c.id, p_ok: good });
            if (error) { toast(friendly(error), 'error'); return; }
            toast(good ? 'Paid out' : 'Declined', 'success');
            await RT.refreshBoard();
            load();
          });
          ok.addEventListener('click', () => decide(true, ok));
          no.addEventListener('click', () => decide(false, no));
          return h('div', { class: 'entry' }, avatar(nameOf(c.member_id), 28), h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis' }, nameOf(c.member_id)), h('div', { class: 'muted small ellipsis' }, titleOf(c.bounty_id))), no, ok);
        })) : h('p', { class: 'muted small' }, 'Nothing waiting. Members tap “I did it” and it shows up here.'));
    }

    function drawDecay() {
      const d = new Date();
      const period = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      const pct = h('input', { class: 'input mono', type: 'number', min: 1, max: 50, step: 1, value: 10 });
      const run = h('button', { class: 'btn btn-primary', type: 'button' }, 'Apply ' + period + ' decay');
      run.addEventListener('click', () => busy(run, async () => {
        const p = Number(pct.value);
        if (!(p >= 1 && p <= 50)) { toast('Use 1 to 50 percent.', 'error'); return; }
        if (!(await confirmDialog({ title: 'Apply monthly decay?', message: `Everyone loses ${p}% of their unspent Bites. It can only run once per month per member.`, confirmText: 'Apply' }))) return;
        const { data, error } = await sb.rpc('apply_decay', { p_period: period, p_pct: p });
        if (error) { toast(friendly(error), 'error'); return; }
        await RT.refreshBoard();
        toast(data ? `Decay applied to ${data} members` : 'Already applied this month', data ? 'success' : 'info');
      }));
      clear(decayBox).append(
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Monthly decay'), h('span', { class: 'muted small' }, 'Run on the 1st')),
        h('p', { class: 'muted small' }, 'Takes a percent of each member’s unspent Bites (not Bites locked in open bets). Running it twice in a month does nothing the second time.'),
        h('div', { class: 'row gap-sm' }, h('div', { class: 'grow' }, pct), run));
    }

    load();
    return null;
  }

  RT.market = Object.assign(RT.market || {}, { memberCards, meetingSwitches, adminTab });
})();
