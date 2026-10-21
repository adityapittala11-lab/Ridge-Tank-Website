// Moderation: approving new sign-ups, muting people in chat, and banning (which removes a person entirely).
// The rules themselves are enforced by the server and database (db/100_moderation.sql); this is the officer-facing side.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, busy, friendly, fmtDate, confirmDialog, avatar } = RT;
  const S = RT.state;
  const sb = RT.sb;

  const MUTE_CHOICES = [
    { label: '10 minutes', min: 10 }, { label: '1 hour', min: 60 }, { label: '1 day', min: 1440 }, { label: '1 week', min: 10080 }
  ];

  const isMuted = m => !!(m && m.muted_until && new Date(m.muted_until) > new Date());
  const mutedFor = m => {
    const ms = new Date(m.muted_until) - Date.now();
    if (ms <= 0) return '';
    const mins = Math.ceil(ms / 60000);
    return mins < 60 ? mins + ' min' : mins < 1440 ? Math.round(mins / 60) + ' hr' : Math.round(mins / 1440) + ' day' + (mins >= 2880 ? 's' : '');
  };

  // minutes = 0 clears the mute.
  async function setMute(memberId, minutes) {
    const until = minutes > 0 ? new Date(Date.now() + minutes * 60000).toISOString() : null;
    const { data, error } = await sb.from('members').update({ muted_until: until }).eq('id', memberId).select('id, muted_until').single();
    if (error) throw error;
    return data;
  }

  // Removes the person entirely and blocks their email from signing up again.
  async function banMember(m) {
    const reason = h('input', { class: 'input', type: 'text', maxlength: 200, placeholder: 'Reason (only officers see this)' });
    const ok = await confirmDialog({
      title: 'Ban ' + m.name + '?',
      message: 'This removes them from the site entirely: their account, messages, check-ins and Bites are deleted, and their email can’t sign up again. You can lift the email block later.',
      confirmText: 'Ban and remove', danger: true, body: reason
    });
    if (!ok) return false;
    const { error } = await sb.rpc('ban_member', { p_member: m.id, p_reason: reason.value.trim() || null });
    if (error) { toast(friendly(error), 'error'); return false; }
    S.directory.delete(m.id);
    const A = RT.adminData;
    if (A && A.members) { const i = A.members.findIndex(x => x.id === m.id); if (i >= 0) A.members.splice(i, 1); }
    toast(m.name + ' was removed and banned', 'success');
    return true;
  }

  // A little menu of mute lengths. onDone runs after a change so the caller can redraw.
  function muteMenu(m, onDone) {
    const wrap = h('span', { class: 'mod-menu' });
    const btn = h('button', { class: 'mod-btn' + (isMuted(m) ? ' on' : ''), type: 'button', 'aria-label': 'Mute or ban ' + m.name, title: isMuted(m) ? 'Muted for ' + mutedFor(m) : 'Mute or ban' }, icon(isMuted(m) ? 'volumeOff' : 'shield', 13));
    const panel = h('div', { class: 'mod-panel', hidden: true });
    function close() { panel.hidden = true; document.removeEventListener('pointerdown', away, true); }
    function away(e) { if (!wrap.contains(e.target)) close(); }
    const choose = async min => {
      close();
      try {
        const row = await setMute(m.id, min);
        m.muted_until = row.muted_until;
        toast(min ? m.name + ' is muted for ' + (MUTE_CHOICES.find(c => c.min === min) || {}).label : m.name + ' is unmuted', 'success');
        onDone && onDone();
      } catch (e) { toast(friendly(e), 'error'); }
    };
    MUTE_CHOICES.forEach(c => panel.appendChild(h('button', { class: 'mod-item', type: 'button', onclick: () => choose(c.min) }, 'Mute ' + c.label)));
    if (isMuted(m)) panel.appendChild(h('button', { class: 'mod-item', type: 'button', onclick: () => choose(0) }, 'Unmute (' + mutedFor(m) + ' left)'));
    panel.appendChild(h('button', { class: 'mod-item danger', type: 'button', onclick: async () => { close(); if (await banMember(m)) onDone && onDone(true); } }, 'Ban and remove…'));
    btn.addEventListener('click', e => {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      if (!panel.hidden) setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
    });
    wrap.append(btn, panel);
    return wrap;
  }

  RT.moderation = { MUTE_CHOICES, isMuted, mutedFor, setMute, banMember, muteMenu };

  // ---------------- Officer tools > Approvals ----------------
  RT.adminTabs = RT.adminTabs || {};
  RT.adminTabs.approvals = function (pane) {
    const list = h('div', { class: 'stack' }, RT.skeleton(3));
    const bannedBox = h('section', { class: 'card' });
    pane.append(
      h('section', { class: 'card' },
        h('h3', null, 'Approvals'),
        h('p', { class: 'muted' }, 'New sign-ups wait here until you approve them. Check the name against your roster. Anything that looks fake, tap Ban and they’re removed.')),
      list, bannedBox);

    let rows = [];
    let dupes = new Map();   // member id -> [{ other_name, kind }]
    async function load() {
      const [p, b, d] = await Promise.all([
        sb.from('members').select('*').eq('status', 'pending').order('created_at', { ascending: true }),
        sb.from('banned_emails').select('*').order('banned_at', { ascending: false }),
        sb.rpc('duplicate_signals')
      ]);
      if (p.error) throw p.error;
      rows = p.data || [];
      dupes = new Map();
      (d.data || []).forEach(x => { if (!dupes.has(x.member_id)) dupes.set(x.member_id, []); dupes.get(x.member_id).push(x); });
      S.adminCounts.approvals = rows.length;
      S.pendingCount = (S.adminCounts.welcome || 0) + (S.adminCounts.claims || 0) + rows.length;
      RT.updateAdminBadge();
      draw();
      drawBanned(b.data || []);
    }

    function draw() {
      clear(list);
      if (!rows.length) { list.appendChild(h('div', { class: 'card empty' }, icon('check', 22, 'muted'), h('p', { class: 'muted' }, 'No one is waiting.'))); return; }
      if (rows.length > 1) {
        const all = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Approve everyone (' + rows.length + ')');
        all.addEventListener('click', () => busy(all, async () => {
          if (!(await confirmDialog({ title: 'Approve all ' + rows.length + '?', message: 'Only do this if you recognize every name on the list.', confirmText: 'Approve all' }))) return;
          const { error } = await sb.from('members').update({ status: 'approved' }).eq('status', 'pending');
          if (error) { toast(friendly(error), 'error'); return; }
          toast('Everyone approved', 'success');
          load().catch(e => toast(friendly(e), 'error'));
        }));
        list.appendChild(h('div', { class: 'row end' }, all));
      }
      rows.forEach(m => {
        const ok = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, icon('check', 14), 'Approve');
        const no = h('button', { class: 'btn btn-danger btn-sm', type: 'button' }, icon('x', 14), 'Fake / ban');
        ok.addEventListener('click', () => busy(ok, async () => {
          const { error } = await sb.from('members').update({ status: 'approved' }).eq('id', m.id);
          if (error) { toast(friendly(error), 'error'); return; }
          toast(m.name + ' approved', 'success');
          load().catch(e => toast(friendly(e), 'error'));
        }));
        no.addEventListener('click', async () => { if (await banMember(m)) load().catch(e => toast(friendly(e), 'error')); });
        list.appendChild(h('div', { class: 'card approval' },
          avatar(m.name, 40),
          h('div', { class: 'grow min0' },
            h('div', { class: 'approval-name' }, m.name, m.grade ? h('span', { class: 'muted' }, ' · ' + m.grade + 'th') : null),
            h('div', { class: 'muted small ellipsis' }, [m.email, m.phone ? RT.fmtPhone(m.phone) : null, 'signed up ' + fmtDate(m.created_at, { month: 'short', day: 'numeric' })].filter(Boolean).join(' · ')),
            dupeLine(m)),
          h('div', { class: 'row gap-sm' }, no, ok)));
      });
    }

    // "Same device" is a strong hint of one person with two accounts. "Same network" is weak: the whole school shares Wi-Fi.
    function dupeLine(m) {
      const list = dupes.get(m.id) || [];
      const dev = list.filter(x => x.kind === 'device');
      const net = list.filter(x => x.kind === 'network' && !dev.some(y => y.other_id === x.other_id));
      if (!dev.length && !net.length) return null;
      const names = arr => arr.slice(0, 3).map(x => x.other_name).join(', ') + (arr.length > 3 ? ' +' + (arr.length - 3) : '');
      return h('div', null,
        dev.length ? h('div', { class: 'dup-line strong' }, 'Same device as: ' + names(dev)) : null,
        net.length ? h('div', { class: 'dup-line muted', title: 'Everyone on the same Wi-Fi shares a network, so this alone proves nothing.' }, 'Same network as: ' + names(net) + ' (could just be school Wi-Fi)') : null);
    }

    function drawBanned(items) {
      clear(bannedBox);
      if (!items.length) { bannedBox.hidden = true; return; }
      bannedBox.hidden = false;
      bannedBox.append(h('h3', null, 'Blocked emails'), h('p', { class: 'muted small' }, 'These emails can’t sign up. Lift the block if a ban was a mistake (they’ll have to make a new account).'),
        h('div', { class: 'entry-list' }, items.map(b => {
          const un = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Lift block');
          un.addEventListener('click', () => busy(un, async () => {
            const { error } = await sb.rpc('unban_email', { p_email: b.email });
            if (error) { toast(friendly(error), 'error'); return; }
            load().catch(e => toast(friendly(e), 'error'));
          }));
          return h('div', { class: 'entry' }, h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis' }, b.email), b.reason ? h('div', { class: 'muted small ellipsis' }, b.reason) : null), un);
        })));
    }

    load().catch(e => { clear(list); list.appendChild(h('div', { class: 'card empty' }, h('p', { class: 'muted' }, friendly(e)))); });
    return null;
  };
})();
