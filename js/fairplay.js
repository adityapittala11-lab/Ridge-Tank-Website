// Officer tools > Fair play: Academy rounds the server flagged as possibly pasted, AI-written or machine-typed.
// Only the reasons and a few numbers are stored, never what the student wrote, so talk to the student before deciding.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, busy, friendly, fmtDate } = RT;
  RT.adminTabs = RT.adminTabs || {};

  RT.adminTabs.fairplay = function (pane) {
    const list = h('div', { class: 'stack' }, RT.skeleton(4));
    pane.append(
      h('section', { class: 'card' },
        h('h3', null, 'Fair play'),
        h('p', { class: 'muted' }, 'Academy rounds that looked pasted, AI-written or typed by a program. “Didn’t count” rounds earned nothing until you approve them. Answers are never stored, so ask the student before you decide.')),
      list);

    async function load() {
      const [rounds, members] = await Promise.all([
        RT.sb.from('course_rounds').select('*').eq('flagged', true).order('created_at', { ascending: false }).limit(200),
        RT.sb.from('member_directory').select('*')
      ]);
      if (rounds.error) throw rounds.error;
      const names = new Map(((members.data) || []).map(m => [m.id || m.member_id, m.name]));
      draw(rounds.data || [], names);
    }

    function draw(rows, names) {
      clear(list);
      if (!rows.length) { list.appendChild(h('div', { class: 'card empty' }, icon('check', 22, 'muted'), h('p', { class: 'muted' }, 'Nothing flagged. Nice.'))); return; }
      rows.forEach(r => {
        const f = r.flags || {}, held = !!f.held, b = r.breakdown || {};
        const what = r.kind === 'level' ? 'Level ' + r.item : 'Weekly challenge ' + (r.item + 1);
        const approve = h('button', { class: 'btn btn-primary btn-sm', type: 'button' }, held ? 'Count it' : 'Looks fine');
        const remove = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, 'Delete round');
        approve.addEventListener('click', () => busy(approve, async () => {
          const patch = { flagged: false };
          if (held) { patch.passed = !!b.would_pass; patch.stars = Number(b.would_stars) || 0; patch.flags = Object.assign({}, f, { held: false, approved: true }); }
          const { error } = await RT.sb.from('course_rounds').update(patch).eq('id', r.id);
          if (error) { toast(friendly(error), 'error'); return; }
          toast(held ? 'Round counted' : 'Flag cleared', 'success');
          load().catch(e => toast(friendly(e), 'error'));
        }));
        remove.addEventListener('click', () => busy(remove, async () => {
          const { error } = await RT.sb.from('course_rounds').delete().eq('id', r.id);
          if (error) { toast(friendly(error), 'error'); return; }
          toast('Round deleted', 'success');
          load().catch(e => toast(friendly(e), 'error'));
        }));
        list.appendChild(h('section', { class: 'card fp-row' },
          h('div', { class: 'row between wrap gap-sm' },
            h('div', { class: 'min0' }, h('b', null, names.get(r.member_id) || 'Member'), h('div', { class: 'muted small' }, what + ' · ' + r.score + '/20 · ' + fmtDate(r.created_at, { month: 'short', day: 'numeric' }))),
            h('span', { class: 'status-pill ' + (held ? 'wait' : 'ok') }, held ? 'Didn’t count' : 'Counted, flagged')),
          (f.reasons && f.reasons.length) ? h('ul', { class: 'fp-reasons' }, f.reasons.map(x => h('li', null, x))) : null,
          (f.notes && f.notes.length) ? h('p', { class: 'muted small' }, f.notes.join(' · ')) : null,
          h('div', { class: 'row gap-sm wrap' }, approve, remove)));
      });
    }

    load().catch(e => { clear(list).appendChild(h('div', { class: 'card' }, h('p', { class: 'muted' }, friendly(e)))); });
  };
})();
