// November Meeting Activity Submission: members upload a picture, officers review them and open them full screen.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, busy, friendly, confirmDialog } = RT;
  const sb = RT.sb;
  const S = RT.state;
  const TITLE = 'November Meeting Activity Submission';
  const MAX_PICK = 25 * 1024 * 1024; // biggest file we will even try to shrink
  const OK_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

  const stamp = v => {
    const d = new Date(v);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  };
  const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';

  // Shrinks a picture in the browser so the upload is small and always goes through.
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('We could not read that picture. Try a JPG or PNG.')); };
      img.src = url;
    });
  }
  function draw(img, max, quality) {
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k));
    c.height = Math.max(1, Math.round(img.naturalHeight * k));
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', quality);
  }
  async function prepare(file) {
    if (!file) throw new Error('Pick a picture first.');
    if (!OK_TYPES.includes(file.type)) throw new Error('Please pick a JPG, PNG or WebP picture.');
    if (file.size > MAX_PICK) throw new Error('That file is over 25 MB. Pick a smaller picture.');
    const img = await loadImage(file);
    let image = draw(img, 1800, 0.84);
    if (image.length > 2000000) image = draw(img, 1400, 0.7);
    return { image, thumb: draw(img, 420, 0.72), mime: 'image/jpeg' };
  }

  // ---------------- full screen viewer ----------------
  function lightbox(items, start) {
    let i = start;
    const img = h('img', { class: 'lb-img', alt: '' });
    const cap = h('div', { class: 'lb-cap' });
    const count = h('div', { class: 'lb-count' });
    const prev = h('button', { class: 'lb-nav lb-prev', type: 'button', 'aria-label': 'Previous picture' }, '‹');
    const next = h('button', { class: 'lb-nav lb-next', type: 'button', 'aria-label': 'Next picture' }, '›');
    const close = h('button', { class: 'lb-close icon-btn', type: 'button', 'aria-label': 'Close' }, icon('x', 22));
    const dl = h('a', { class: 'btn btn-ghost btn-sm lb-dl', download: 'submission.jpg' }, icon('download', 14), 'Save');
    const wrap = h('div', { class: 'lightbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Submission picture' },
      h('div', { class: 'lb-bar' }, count, h('div', { class: 'lb-actions' }, dl, close)),
      h('div', { class: 'lb-stage' }, prev, img, next), cap);
    const cache = new Map();
    async function show() {
      const it = items[i];
      count.textContent = (i + 1) + ' of ' + items.length;
      cap.replaceChildren(...[h('strong', null, it.name), h('span', { class: 'muted' }, stamp(it.created_at)), it.note ? h('span', { class: 'lb-note' }, '“' + it.note + '”') : null].filter(Boolean));
      prev.hidden = next.hidden = items.length < 2;
      img.src = it.thumb; // blurry preview right away
      img.classList.add('loading');
      let full = cache.get(it.id);
      if (!full) {
        const r = await sb.from('submissions').select('image').eq('id', it.id).maybeSingle();
        full = r.data && r.data.image;
        if (full) cache.set(it.id, full);
      }
      if (items[i] !== it) return;
      if (full) { img.src = full; dl.href = full; }
      img.classList.remove('loading');
    }
    function go(d) { i = (i + d + items.length) % items.length; show(); }
    function end() { document.removeEventListener('keydown', onKey, true); wrap.remove(); document.body.classList.remove('lb-open'); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(); }
      else if (e.key === 'ArrowLeft' && items.length > 1) go(-1);
      else if (e.key === 'ArrowRight' && items.length > 1) go(1);
    }
    prev.onclick = () => go(-1);
    next.onclick = () => go(1);
    close.onclick = end;
    wrap.addEventListener('click', e => { if (e.target === wrap || e.target.classList.contains('lb-stage')) end(); });
    document.addEventListener('keydown', onKey, true);
    document.body.classList.add('lb-open');
    document.body.appendChild(wrap);
    close.focus();
    show();
  }

  // ---------------- member side ----------------
  RT.submissionView = function (body) {
    let mine = null;
    let picked = null;
    const box = h('div', { class: 'card sub-card' });
    body.appendChild(box);

    async function load() {
      const r = await sb.from('submissions').select('id, note, created_at, thumb').eq('member_id', S.me.id).order('created_at', { ascending: false });
      mine = r.error ? null : (r.data || [])[0] || null;
      paint();
    }

    function paint() {
      clear(box);
      box.appendChild(h('div', { class: 'sub-head' },
        h('span', { class: 'eyebrow' }, 'Meeting activity'),
        h('h2', { class: 'h2' }, TITLE),
        h('p', { class: 'muted' }, 'Upload one picture of your work from the meeting activity. Officers look at every submission.')));

      if (mine) {
        box.appendChild(h('div', { class: 'sub-done' },
          h('img', { class: 'sub-thumb', src: mine.thumb, alt: 'Your submission' }),
          h('div', null,
            h('div', { class: 'sub-ok' }, icon('check', 16), 'Submitted'),
            h('div', { class: 'muted small' }, stamp(mine.created_at)),
            mine.note ? h('p', { class: 'small' }, '“' + mine.note + '”') : null,
            h('p', { class: 'muted small' }, 'Need to change it? Upload a new picture below and it replaces this one.'))));
      }

      const input = h('input', { type: 'file', accept: 'image/jpeg,image/png,image/webp,image/*', class: 'sub-file', id: 'sub-file' });
      const preview = h('div', { class: 'sub-preview', hidden: true });
      const err = h('p', { class: 'sub-err', role: 'alert', hidden: true });
      const note = h('textarea', { class: 'input', rows: 2, maxlength: 300, placeholder: 'Add a short note (optional)' });
      const send = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, icon('send', 16), mine ? 'Replace my picture' : 'Submit picture');
      const drop = h('label', { class: 'sub-drop', for: 'sub-file' }, icon('plus', 22),
        h('strong', null, 'Choose or take a picture'), h('span', { class: 'muted small' }, 'JPG, PNG or WebP. We shrink big photos for you.'), input);

      const showErr = m => { err.textContent = m; err.hidden = !m; };
      async function pick(file) {
        showErr('');
        picked = null;
        send.disabled = true;
        preview.hidden = true;
        if (!file) return;
        try {
          picked = await prepare(file);
          clear(preview);
          preview.appendChild(h('img', { src: picked.thumb, alt: 'Preview' }));
          preview.appendChild(h('div', { class: 'small muted' }, file.name + ' · ready (' + kb(picked.image.length) + ')'));
          preview.hidden = false;
          send.disabled = false;
        } catch (e) { showErr(e.message || 'Could not use that picture.'); }
      }
      input.addEventListener('change', () => pick(input.files[0]));
      ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
      ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
      drop.addEventListener('drop', e => { if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });

      send.addEventListener('click', () => busy(send, async () => {
        if (!picked) return;
        showErr('');
        const ins = await sb.from('submissions').insert({ mime: picked.mime, bytes: 0, image: picked.image, thumb: picked.thumb, note: note.value.trim() || null });
        if (ins.error) { showErr(friendly(ins.error)); return; }
        if (mine) await sb.from('submissions').delete().eq('id', mine.id); // the old one goes only after the new one is safe
        picked = null;
        toast('Submitted. Thanks!', 'success');
        await load();
      }));

      box.appendChild(drop);
      box.appendChild(err);
      box.appendChild(preview);
      box.appendChild(note);
      box.appendChild(h('div', { class: 'sub-actions' }, send));
    }

    paint();
    load();
  };

  // ---------------- officer side ----------------
  RT.adminTabs = RT.adminTabs || {};
  RT.adminTabs.submissions = function (pane) {
    let rows = [];
    const grid = h('div', { class: 'sub-grid' });
    const sum = h('p', { class: 'muted small' });
    pane.appendChild(h('div', { class: 'section-row' },
      h('div', null, h('h2', { class: 'h2' }, 'Submissions'), h('p', { class: 'muted small' }, TITLE + '. Tap a picture to see it full screen.')),
      sum));
    pane.appendChild(grid);

    async function load() {
      grid.replaceChildren(h('p', { class: 'muted' }, 'Loading…'));
      const r = await sb.from('submissions').select('id, member_id, note, created_at, bytes, thumb').order('created_at', { ascending: false });
      if (r.error) { grid.replaceChildren(h('p', { class: 'sub-err' }, friendly(r.error))); return; }
      rows = (r.data || []).map(x => Object.assign(x, { name: S.directory.get(x.member_id) || 'Member' }));
      sum.textContent = rows.length + (rows.length === 1 ? ' submission' : ' submissions');
      if (!rows.length) { grid.replaceChildren(h('div', { class: 'card empty' }, icon('target', 26, 'muted'), h('h3', null, 'Nothing yet'), h('p', { class: 'muted' }, 'Pictures show up here the moment members upload them.'))); return; }
      grid.replaceChildren(...rows.map((x, i) => {
        const del = h('button', { class: 'icon-btn sub-del', type: 'button', 'aria-label': 'Delete submission' }, icon('trash', 15));
        del.addEventListener('click', async e => {
          e.stopPropagation();
          if (!await confirmDialog({ title: 'Delete this submission?', message: x.name + '’s picture will be removed.', confirmText: 'Delete', danger: true })) return;
          const d = await sb.from('submissions').delete().eq('id', x.id);
          if (d.error) { toast(friendly(d.error), 'error'); return; }
          load();
        });
        const tile = h('div', { class: 'sub-tile', role: 'button', tabindex: 0, 'aria-label': 'Open ' + x.name + '’s picture full screen' },
          h('img', { src: x.thumb, alt: x.name + '’s submission', loading: 'lazy' }), del,
          h('div', { class: 'sub-meta' }, h('strong', null, x.name), h('span', { class: 'muted small' }, stamp(x.created_at))));
        const open = () => lightbox(rows, i);
        tile.addEventListener('click', open);
        tile.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
        return tile;
      }));
    }
    load();
  };
})();
