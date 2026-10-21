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

  // ---------------- Officer tools > Accounts ----------------
  // Possible duplicate accounts (same browser or network) and the list of banned emails.
  RT.adminTabs = RT.adminTabs || {};
  RT.adminTabs.accounts = function (pane) {
    const dupBox = h('section', { class: 'card' });
    const bannedBox = h('section', { class: 'card' });
    pane.append(
      h('section', { class: 'card' },
        h('h3', null, 'Accounts'),
        h('p', { class: 'muted' }, 'Everyone confirms their email before they can log in, so every account is a real inbox. Here is who might be using two accounts, and who is banned.')),
      dupBox, bannedBox);

    async function load() {
      const [d, b] = await Promise.all([sb.rpc('duplicate_signals'), sb.from('banned_emails').select('*').order('banned_at', { ascending: false })]);
      const pairs = d.data || [];
      let people = new Map();
      if (pairs.length) {
        const ids = [...new Set(pairs.flatMap(x => [x.member_id, x.other_id]))];
        const r = await sb.from('members').select('id, name, email, created_at').in('id', ids);
        people = new Map((r.data || []).map(x => [x.id, x]));
      }
      drawDupes(pairs, people);
      drawBanned(b.data || []);
    }

    // "Same device" is a strong hint of one person with two accounts. "Same network" is weak: the whole school shares Wi-Fi.
    function drawDupes(pairs, people) {
      clear(dupBox);
      const by = new Map();
      pairs.forEach(x => { if (!by.has(x.member_id)) by.set(x.member_id, []); by.get(x.member_id).push(x); });
      const rows = [...by.entries()].map(([id, list]) => ({ id, list, strong: list.some(x => x.kind === 'device') })).sort((a, b) => b.strong - a.strong);
      dupBox.append(h('h3', null, 'Possible duplicate accounts'));
      if (!rows.length) { dupBox.append(h('p', { class: 'muted small' }, 'No matches. Nobody shares a browser or network.')); return; }
      dupBox.append(h('p', { class: 'muted small' }, 'Same device = same phone or laptop (strong hint). Same network = same internet connection (weak, the school Wi-Fi does this to everyone).'));
      const list = h('div', { class: 'entry-list' });
      rows.forEach(r => {
        const m = people.get(r.id); if (!m) return;
        const dev = r.list.filter(x => x.kind === 'device');
        const net = r.list.filter(x => x.kind === 'network' && !dev.some(y => y.other_id === x.other_id));
        const names = arr => arr.slice(0, 3).map(x => x.other_name).join(', ') + (arr.length > 3 ? ' +' + (arr.length - 3) : '');
        const ban = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Ban…');
        ban.addEventListener('click', async () => { if (await banMember(m)) load().catch(() => {}); });
        list.appendChild(h('div', { class: 'entry' }, avatar(m.name, 32),
          h('div', { class: 'grow min0' }, h('div', { class: 'ellipsis' }, m.name, h('span', { class: 'muted small' }, ' · ' + (m.email || ''))),
            dev.length ? h('div', { class: 'dup-line strong' }, 'Same device as: ' + names(dev)) : null,
            net.length ? h('div', { class: 'dup-line muted' }, 'Same network as: ' + names(net)) : null),
          ban));
      });
      dupBox.append(list);
    }

    function drawBanned(items) {
      clear(bannedBox);
      bannedBox.append(h('h3', null, 'Blocked emails'));
      if (!items.length) { bannedBox.append(h('p', { class: 'muted small' }, 'No one is banned.')); return; }
      bannedBox.append(h('p', { class: 'muted small' }, 'These emails can’t sign up. Lift the block if a ban was a mistake (they’ll have to make a new account).'),
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

    load().catch(e => { clear(dupBox); dupBox.append(h('p', { class: 'muted' }, friendly(e))); });
    return null;
  };
})();
