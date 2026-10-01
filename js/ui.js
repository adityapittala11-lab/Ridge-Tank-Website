// Small UI toolkit: element builder, icons, toasts, modals, segmented switches,
// the morphing menu button, a member search picker, and date helpers.
(function () {
  const RT = (window.RT = window.RT || {});

  // ---------- element builder ----------
  // h('div', { class: 'x', onclick: fn }, 'text', child, [more])
  // Strings always become text nodes, so user content can never inject HTML.
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    if (props) {
      for (const k in props) {
        const v = props[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') {
          // Custom properties (--i, --d) only take effect through setProperty.
          for (const p in v) { if (p.startsWith('--')) el.style.setProperty(p, String(v[p])); else el.style[p] = v[p]; }
        }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k === 'html') el.innerHTML = v; // trusted markup only (icons)
        else if (k === 'value') el.value = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (k in el && typeof v !== 'string') el[k] = v;
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    for (const c of kids) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) append(el, c);
      else if (c instanceof Node) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    }
  }
  function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  // Like el.append(), but skips null/false (plain append would print them as text).
  function put(el, ...kids) { append(el, kids); return el; }

  // ---------- icons (Lucide-style strokes) ----------
  const ICONS = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9.5V20.5h13V9.5"/><path d="M10 20.5v-5.5h4v5.5"/>',
    trophy: '<path d="M8 21h8"/><path d="M12 16.5V21"/><path d="M7 3.5h10V9a5 5 0 0 1-10 0V3.5Z"/><path d="M17 5.5h3v1.5a3.5 3.5 0 0 1-3.2 3.5"/><path d="M7 5.5H4v1.5a3.5 3.5 0 0 0 3.2 3.5"/>',
    chat: '<path d="M20.5 11.5a8 8 0 0 1-11.7 7.1L3.5 20l1.5-4.8a8 8 0 1 1 15.5-3.7Z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5a8 8 0 0 1 16 0"/>',
    shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z"/><path d="m9 12 2 2 4-4"/>',
    logout: '<path d="M14.5 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="m9.5 16.5-4.5-4.5 4.5-4.5"/><path d="M5 12h10"/>',
    arrowUp: '<path d="M12 19V5"/><path d="m5.5 11.5 6.5-6.5 6.5 6.5"/>',
    arrowRight: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    checks: '<path d="m2 12.5 4.5 4.5L16 7.5"/><path d="m12.5 16 1 1L23 7.5"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><path d="M12 16.3v.2"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 0 1 7.5 4H15"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4-4"/>',
    nfc: '<path d="M7.5 9a4.5 4.5 0 0 1 0 6"/><path d="M11 6.5a8.5 8.5 0 0 1 0 11"/><path d="M14.5 4a12.5 12.5 0 0 1 0 16"/><path d="M18 3a16 16 0 0 1 0 18"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m13.5 6.5 4 4"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    crown: '<path d="M3.5 8.5 7.5 12 12 5.5l4.5 6.5 4-3.5-2 10.5h-13l-2-10.5Z"/>',
    flame: '<path d="M12 21c3.9 0 7-2.7 7-6.5 0-3.3-2.2-5.4-3.7-7.2-.4 2-1.4 3.3-2.8 3.9C13 8.3 11.6 5.4 9 3c.2 3.1-1.7 5.2-3.2 7C4.7 11.4 5 13 5 14.5 5 18.3 8.1 21 12 21Z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14a6.5 6.5 0 0 1 3 6"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><path d="M12 17.5V21"/>',
    award: '<circle cx="12" cy="9" r="6"/><path d="m8.5 13.9-1.5 7.1 5-2.5 5 2.5-1.5-7.1"/>',
    eye: '<path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-2.6 3.5"/><path d="M6.6 6.6C3.9 8.3 2.5 12 2.5 12S6 19 12 19a9.5 9.5 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L4 8"/><path d="M4 3.5V8h4.5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L20 16"/><path d="M20 20.5V16h-4.5"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19"/><path d="M6 15h4"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v4c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 14v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4c0-1.7-2.7-3-6-3"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    fin: '<path d="M2.5 18.5c3.4-.7 6.4-3.2 8.2-7.4.9-2.2 1.4-4.6 1.6-7.1 3.2 3.9 6.1 9.2 9.2 14.5"/><path d="M2.5 18.5h19"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/>',
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="0.8"/>',
    sparkle: '<path d="M12 3.5 13.8 10 20.5 12l-6.7 2L12 20.5 10.2 14 3.5 12l6.7-2Z"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 7.8v.2"/>',
    map: '<path d="M9 4.5 3.5 6.5v13l5.5-2 6 2 5.5-2v-13l-5.5 2-6-2Z"/><path d="M9 4.5v13M15 6.5v13"/>',
    dots: '<circle cx="5.5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="18.5" cy="12" r="1.2"/>',
    instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="0.7"/>',
    megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l5 4V5L7 9H5a1 1 0 0 0-1 1Z"/><path d="M16 9a4 4 0 0 1 0 6"/><path d="M19 6.5a8 8 0 0 1 0 11"/>',
    phone: '<path d="M6.5 3.5h3l1.5 4-2 1.3a11 11 0 0 0 5.2 5.2l1.3-2 4 1.5v3a2 2 0 0 1-2 2A15.5 15.5 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z"/>',
    pin: '<path d="M12 17v5"/><path d="M8 3.5h8l-1 6 3 3.5H6l3-3.5-1-6Z"/>',
    download: '<path d="M12 4v11"/><path d="m7 11 5 5 5-5"/><path d="M5 20h14"/>',
    chevronLeft: '<path d="m15 6-6 6 6 6"/>',
    send: '<path d="M21 3 10.5 13.5"/><path d="M21 3 14.5 21l-4-7.5L3 9.5 21 3Z"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r="0.8"/><circle cx="4" cy="12" r="0.8"/><circle cx="4" cy="18" r="0.8"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z"/>',
    whatsapp: '<path d="M3.5 20.5 5 16a8.5 8.5 0 1 1 3.3 3.2L3.5 20.5Z"/><path d="M9 8.5c0 3.6 2.9 6.5 6.5 6.5l1-1.6-1.9-1-0.9 0.7c-0.9-0.4-1.6-1.1-2-2l0.7-0.9-1-1.9L9 8.5Z"/>'
  };
  function icon(name, size = 18, extraClass = '') {
    const s = document.createElement('span');
    s.className = 'ico ' + extraClass;
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
    return s;
  }

  // ---------- toasts ----------
  function toast(message, type = 'info', ms = 3400) {
    let wrap = document.getElementById('toasts');
    if (!wrap) { wrap = h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.appendChild(wrap); }
    const ic = type === 'success' ? 'check' : type === 'error' ? 'alert' : 'info';
    const t = h('div', { class: `toast toast-${type}`, role: type === 'error' ? 'alert' : 'status' }, icon(ic, 16), h('span', null, message));
    wrap.appendChild(t);
    requestAnimationFrame(() => t.classList.add('in'));
    const kill = () => { t.classList.remove('in'); t.classList.add('out'); setTimeout(() => t.remove(), 300); };
    const timer = setTimeout(kill, ms);
    t.addEventListener('click', () => { clearTimeout(timer); kill(); });
  }

  // ---------- modal ----------
  let openModals = 0;
  function modal({ title, subtitle, body, actions, wide, onClose, dismissible = true } = {}) {
    const root = document.getElementById('modal-root') || document.body;
    const closeBtn = dismissible ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, icon('x', 18)) : null;
    const titleId = 'm-' + Math.random().toString(36).slice(2, 8);
    const panel = h('div', { class: 'modal glass' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId },
      h('header', { class: 'modal-head' },
        h('div', null, h('h3', { id: titleId }, title || ''), subtitle ? h('p', { class: 'muted small' }, subtitle) : null),
        closeBtn),
      h('div', { class: 'modal-body' }, body),
      actions && actions.length ? h('footer', { class: 'modal-foot' }, actions) : null
    );
    const backdrop = h('div', { class: 'modal-backdrop' });
    const wrap = h('div', { class: 'modal-wrap' }, backdrop, panel);
    const prevFocus = document.activeElement;
    let closed = false;
    function close(result) {
      if (closed) return;
      closed = true;
      wrap.classList.remove('open');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => {
        wrap.remove();
        openModals = Math.max(0, openModals - 1);
        if (!openModals) document.body.classList.remove('modal-open');
        if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
      }, 260);
      if (onClose) onClose(result);
    }
    function onKey(e) {
      if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(); }
      if (e.key === 'Tab') {
        const f = panel.querySelectorAll('button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea, select, [tabindex]:not([tabindex="-1"])');
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    if (closeBtn) closeBtn.addEventListener('click', () => close());
    if (dismissible) backdrop.addEventListener('click', () => close());
    document.addEventListener('keydown', onKey, true);
    root.appendChild(wrap);
    openModals++;
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => {
      wrap.classList.add('open');
      const auto = panel.querySelector('[autofocus]') || panel.querySelector('input, textarea, select');
      if (auto) auto.focus({ preventScroll: true });
    });
    return { el: panel, close };
  }

  function confirmDialog({ title = 'Are you sure?', message = '', confirmText = 'Confirm', danger = false, requireText } = {}) {
    return new Promise(resolve => {
      let input = null;
      const okBtn = h('button', { class: 'btn ' + (danger ? 'btn-danger' : 'btn-primary'), type: 'button' }, confirmText);
      const cancelBtn = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Cancel');
      const bodyKids = [h('p', { class: 'muted' }, message)];
      if (requireText) {
        input = h('input', { class: 'input', type: 'text', placeholder: requireText, autocomplete: 'off', spellcheck: false });
        okBtn.disabled = true;
        input.addEventListener('input', () => { okBtn.disabled = input.value.trim() !== requireText; });
        bodyKids.push(h('label', { class: 'field' }, h('span', { class: 'label' }, `Type "${requireText}" to confirm`), input));
      }
      let answered = false;
      const m = modal({
        title, body: h('div', { class: 'stack-sm' }, bodyKids), actions: [cancelBtn, okBtn],
        onClose: () => { if (!answered) resolve(false); }
      });
      cancelBtn.addEventListener('click', () => m.close());
      okBtn.addEventListener('click', () => { answered = true; resolve(true); m.close(); });
      if (!requireText) setTimeout(() => okBtn.focus(), 60);
    });
  }

  // ---------- segmented switch with a sliding, stretching indicator ----------
  // items: [{ value, label, icon?, badge? }]
  function segmented({ items, value, onChange, className = '', ariaLabel = 'Switch view', vertical = false }) {
    const ind = h('span', { class: 'seg-ind', 'aria-hidden': 'true' });
    // Hover highlight that slides to whichever tab the pointer is over (desktop only).
    const hov = h('span', { class: 'seg-hover', 'aria-hidden': 'true' });
    const wrap = h('div', { class: 'seg ' + className + (vertical ? ' seg-vertical' : ''), role: 'tablist', 'aria-label': ariaLabel }, hov, ind);
    wrap.addEventListener('pointerleave', () => { hov.style.opacity = '0'; });
    const buttons = new Map();
    let current = value;
    let placed = false;

    items.forEach(it => {
      const badge = h('span', { class: 'seg-badge', hidden: !it.badge }, it.badge ? String(it.badge) : '');
      const b = h('button', {
        class: 'seg-btn', type: 'button', role: 'tab',
        'aria-selected': String(it.value === value),
        'data-value': it.value,
        onclick: () => select(it.value, true)
      }, it.icon ? icon(it.icon, vertical ? 20 : 16) : null, h('span', { class: 'seg-label' }, it.label), badge);
      b._badge = badge;
      b.addEventListener('pointerenter', e => {
        if (e.pointerType === 'touch') return;
        if (hov.style.opacity !== '1') hov.classList.add('no-anim');
        hov.style.left = b.offsetLeft + 'px';
        hov.style.width = b.offsetWidth + 'px';
        void hov.offsetWidth;
        hov.classList.remove('no-anim');
        hov.style.opacity = '1';
      });
      buttons.set(it.value, b);
      wrap.appendChild(b);
    });

    function place(animate) {
      const b = buttons.get(current);
      if (!b || !wrap.isConnected || !wrap.clientWidth) { ind.style.opacity = '0'; return; }
      const left = b.offsetLeft;
      const right = wrap.clientWidth - (b.offsetLeft + b.offsetWidth);
      const prevLeft = parseFloat(ind.style.left || '0');
      const movingRight = left > prevLeft;
      if (!animate || !placed) ind.classList.add('no-anim');
      ind.style.setProperty('--dl', movingRight ? '0.07s' : '0s');
      ind.style.setProperty('--dr', movingRight ? '0s' : '0.07s');
      ind.style.left = left + 'px';
      ind.style.right = right + 'px';
      ind.style.opacity = '1';
      if (!animate || !placed) { void ind.offsetWidth; ind.classList.remove('no-anim'); }
      placed = true;
    }

    function select(v, fromUser) {
      if (!buttons.has(v)) {
        // A page that isn't one of these tabs (e.g. Profile on the phone bar): show nothing selected.
        current = v;
        buttons.forEach(b => b.setAttribute('aria-selected', 'false'));
        place(false);
        return;
      }
      const changed = v !== current;
      current = v;
      buttons.forEach((b, key) => b.setAttribute('aria-selected', String(key === v)));
      place(true);
      if (fromUser && changed && onChange) onChange(v);
    }

    const ro = new ResizeObserver(() => place(false));
    ro.observe(wrap);
    requestAnimationFrame(() => place(false));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => place(false));

    wrap.setValue = v => select(v, false);
    wrap.getValue = () => current;
    wrap.setBadge = (v, n) => {
      const b = buttons.get(v);
      if (!b) return;
      b._badge.textContent = n ? String(n) : '';
      b._badge.hidden = !n;
      place(false);
    };
    wrap.reposition = () => place(false);
    return wrap;
  }

  // ---------- morphing menu button (hamburger <-> X) ----------
  function menuButton({ label = 'Menu', onToggle } = {}) {
    const btn = h('button', { class: 'menu-btn', type: 'button', 'aria-label': label, 'aria-expanded': 'false', html:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M4 12H20"/><path d="M4 12H20"/><path d="M4 12H20"/></svg>' });
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      if (onToggle) onToggle(open);
    });
    btn.setOpen = open => btn.setAttribute('aria-expanded', String(!!open));
    return btn;
  }

  // ---------- member search picker ----------
  function memberPicker({ members, placeholder = 'Search members…', onPick, describe, autofocus = false, keepValue = false }) {
    const input = h('input', { class: 'input', type: 'search', placeholder, autocomplete: 'off', spellcheck: false, autofocus, role: 'combobox', 'aria-expanded': 'false' });
    const list = h('div', { class: 'picker-list', role: 'listbox', hidden: true });
    const wrap = h('div', { class: 'picker' }, h('div', { class: 'input-icon' }, icon('search', 16), input), list);
    let matches = [];
    let active = 0;
    const source = () => (typeof members === 'function' ? members() : members) || [];

    function render() {
      const q = input.value.trim().toLowerCase();
      clear(list);
      if (!q) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
      matches = source().filter(m => (m.name || '').toLowerCase().includes(q)).slice(0, 8);
      if (!matches.length) {
        list.appendChild(h('div', { class: 'picker-empty' }, 'No one matches that name'));
      } else {
        matches.forEach((m, i) => {
          list.appendChild(h('button', {
            class: 'picker-item' + (i === active ? ' active' : ''), type: 'button', role: 'option',
            onmousedown: e => e.preventDefault(),
            onclick: () => pick(m)
          }, avatar(m.name, 28), h('span', { class: 'grow' }, m.name), describe ? h('span', { class: 'muted small' }, describe(m)) : null));
        });
      }
      list.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function pick(m) {
      if (onPick) onPick(m);
      input.value = keepValue ? m.name : '';
      active = 0;
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      if (!keepValue) input.focus();
    }
    input.addEventListener('input', () => { active = 0; render(); });
    input.addEventListener('keydown', e => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); active = Math.min(active + 1, matches.length - 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(active - 1, 0); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); if (matches[active]) pick(matches[active]); }
      else if (e.key === 'Escape') { list.hidden = true; }
    });
    input.addEventListener('blur', () => setTimeout(() => { list.hidden = true; }, 120));
    wrap.input = input;
    wrap.clearValue = () => { input.value = ''; render(); };
    return wrap;
  }

  // ---------- phone number + WhatsApp box (sign-up, onboarding, profile) ----------
  function phoneFields({ phone = '', whatsapp = false, required = true } = {}) {
    const input = h('input', { class: 'input', type: 'tel', inputmode: 'tel', placeholder: '(480) 555-0123', autocomplete: 'tel', maxlength: 24, value: fmtPhone(phone) || phone });
    const wa = h('input', { type: 'checkbox', class: 'check', checked: !!whatsapp });
    const el = h('div', { class: 'stack-sm' },
      h('label', { class: 'field' },
        h('span', { class: 'label' }, required ? 'Phone number' : 'Phone number (optional)'), input,
        h('span', { class: 'hint' }, 'Officers text club updates here. Only officers can see it.')),
      h('label', { class: 'check-row' }, wa, h('span', null, 'I’m on WhatsApp (add me to the club group chat)')));
    return {
      el, input,
      value: () => cleanPhone(input.value),   // tidy "+14805550123", or null
      raw: () => input.value.trim(),
      whatsapp: () => wa.checked,
      error() {
        const r = input.value.trim();
        if (!r) return required ? 'Add your phone number so officers can text you updates.' : '';
        return cleanPhone(r) ? '' : 'That phone number doesn’t look right. Use 10 digits, like (480) 555-0123.';
      }
    };
  }

  // ---------- avatars ----------
  function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function hashHue(str) {
    let x = 0;
    for (let i = 0; i < str.length; i++) x = (x * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(x);
  }
  // Avatars alternate between the two club colors so the lists feel varied without new hues.
  function avatar(name, size = 36, extra = '') {
    const n = hashHue(String(name || ''));
    const variant = ['av-g1', 'av-g2', 'av-b1', 'av-b2', 'av-g3'][n % 5];
    return h('span', { class: `avatar ${variant} ${extra}`, style: { width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px' }, 'aria-hidden': 'true' }, initials(name));
  }

  // ---------- dates (always local time; never let UTC shift a meeting day) ----------
  const pad = n => String(n).padStart(2, '0');
  function localDateISO(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function parseLocalDate(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const DAY = 86400000;
  function fmtDate(value, opts = { weekday: 'short', month: 'short', day: 'numeric' }) {
    const d = typeof value === 'string' && value.length === 10 ? parseLocalDate(value) : new Date(value);
    return d ? d.toLocaleDateString(undefined, opts) : '';
  }
  function fmtTime(value) { return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); }
  function dayLabel(value) {
    const d = new Date(value);
    const today = parseLocalDate(localDateISO());
    const that = parseLocalDate(localDateISO(d));
    const diff = Math.round((today - that) / DAY);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return d.toLocaleDateString(undefined, { weekday: 'long' });
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined });
  }
  function daysUntil(isoDate) {
    const d = parseLocalDate(isoDate);
    const today = parseLocalDate(localDateISO());
    return Math.round((d - today) / DAY);
  }

  function fmtClock(t) {
    if (!t) return '';
    const [hh, mm] = String(t).split(':').map(Number);
    const d = new Date(2000, 0, 1, hh, mm || 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  function timeAgo(value) {
    const t = new Date(value).getTime();
    if (isNaN(t)) return '';
    const s = Math.round((Date.now() - t) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60);
    if (m < 60) return m + ' min ago';
    const hr = Math.round(m / 60);
    if (hr < 24) return hr + (hr === 1 ? ' hour ago' : ' hours ago');
    const d = Math.round(hr / 24);
    if (d < 7) return d + (d === 1 ? ' day ago' : ' days ago');
    return fmtDate(value, { month: 'short', day: 'numeric' });
  }

  // ---------- phone numbers ----------
  // "(555) 010-0199", "555-010-0199", "+1 555 010 0199" -> "+15550100199". Not a real number -> null.
  function cleanPhone(raw) {
    const s = String(raw || '').trim();
    if (!s) return null;
    const d = s.replace(/\D/g, '');
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d[0] === '1') return '+' + d;
    if (s.startsWith('+') && d.length >= 8 && d.length <= 15) return '+' + d;
    return null;
  }
  function fmtPhone(p) {
    if (!p) return '';
    const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(p);
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : p;
  }

  // Turns plain text into nodes where web addresses become links (never raw HTML).
  function linkify(text) {
    const parts = String(text || '').split(/(https?:\/\/[^\s<>()]+[^\s<>().,!?;:'"])/gi);
    return parts.map((p, i) => (i % 2 ? h('a', { href: p, target: '_blank', rel: 'noopener noreferrer' }, p) : p));
  }

  // ---------- add to calendar (.ics file) ----------
  function downloadICS(ev) {
    const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const ymd = s => String(s).slice(0, 10).replace(/-/g, '');
    const hms = t => String(t).slice(0, 8).replace(/:/g, '').padEnd(6, '0');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ridge Tank//EN', 'BEGIN:VEVENT',
      'UID:' + ymd(ev.date) + '-' + Math.random().toString(36).slice(2, 10) + '@ridgetank',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '')];
    if (ev.start) {
      lines.push('DTSTART:' + ymd(ev.date) + 'T' + hms(ev.start));
      lines.push('DTEND:' + ymd(ev.date) + 'T' + hms(ev.end || ev.start));
    } else {
      const next = parseLocalDate(ev.date);
      next.setDate(next.getDate() + 1);
      lines.push('DTSTART;VALUE=DATE:' + ymd(ev.date), 'DTEND;VALUE=DATE:' + ymd(localDateISO(next)));
    }
    lines.push('SUMMARY:' + esc(ev.title));
    if (ev.location) lines.push('LOCATION:' + esc(ev.location));
    if (ev.description) lines.push('DESCRIPTION:' + esc(ev.description));
    lines.push('END:VEVENT', 'END:VCALENDAR');
    const blob = new Blob([lines.join('\r\n')], { type: 'text/calendar' });
    const a = h('a', { href: URL.createObjectURL(blob), download: 'ridge-tank.ics' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  // ---------- misc ----------
  function debounce(fn, ms = 200) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  async function copyText(text, label = 'Copied') {
    try {
      await navigator.clipboard.writeText(text);
      toast(label, 'success', 1800);
    } catch (e) {
      const ta = h('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); toast(label, 'success', 1800); } catch (err) { toast('Could not copy', 'error'); }
      ta.remove();
    }
  }
  function skeleton(lines = 3, cls = '') {
    return h('div', { class: 'skeleton-group ' + cls }, Array.from({ length: lines }, (_, i) => h('div', { class: 'skeleton', style: { width: (92 - i * 13) + '%' } })));
  }
  function spinner(size = 16) { return h('span', { class: 'spinner', style: { width: size + 'px', height: size + 'px' }, 'aria-hidden': 'true' }); }
  // Swap a button into a loading state while a promise runs.
  async function busy(btn, fn) {
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    const wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.classList.add('is-busy');
    try { return await fn(); } finally {
      delete btn.dataset.busy;
      btn.disabled = wasDisabled;
      btn.classList.remove('is-busy');
    }
  }
  function countUp(el, to, ms = 900) {
    const from = 0;
    const start = performance.now();
    // Update the text node in place so anything drawn on top of the element (the dot canvas) stays put.
    let textNode = [...el.childNodes].find(n => n.nodeType === 3);
    if (!textNode) { textNode = document.createTextNode(''); el.insertBefore(textNode, el.firstChild); }
    const step = now => {
      const p = Math.min(1, (now - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      textNode.nodeValue = Math.round(from + (to - from) * e).toLocaleString();
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  Object.assign(RT, {
    h, clear, put, icon, toast, modal, confirmDialog, segmented, menuButton, memberPicker,
    avatar, initials, localDateISO, parseLocalDate, fmtDate, fmtTime, fmtClock, timeAgo, dayLabel, daysUntil,
    cleanPhone, fmtPhone, linkify, downloadICS, phoneFields,
    debounce, copyText, skeleton, spinner, busy, countUp, ordinal
  });
})();
