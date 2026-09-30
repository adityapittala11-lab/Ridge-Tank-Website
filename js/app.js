// App shell: auth, routing, top bar + nav, landing page, log in / sign up, onboarding, password reset.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, segmented, menuButton, avatar, busy, friendly } = RT;
  const cfg = window.RT_CONFIG;
  const sb = RT.sb;
  const S = RT.state;
  const api = RT.api;

  const appEl = document.getElementById('app');
  const topEl = document.getElementById('topbar');
  const bottomEl = document.getElementById('bottombar');
  const footerEl = document.getElementById('site-footer');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const MEMBER_ROUTES = new Set(['home', 'about', 'leaderboard', 'chat', 'profile']);
  const MESH_DIM = { landing: 1, about: 1, auth: 0.9, welcome: 0.85, reset: 0.85, home: 0.78, leaderboard: 0.75, profile: 0.75, chat: 0.65, admin: 0.65 };

  RT.views = RT.views || {};
  let current = null; // { key, target, handle }
  let navSeg = null, bottomSeg = null, menuBtn = null, menuPanel = null;

  // ---------------- routing ----------------
  function parseHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    if (/access_token=|error_description=|type=recovery/.test(raw)) return { base: '', sub: '' };
    const [base = '', ...rest] = raw.split('/');
    return { base: base.split('?')[0], sub: rest.join('/') };
  }

  function resolve(r) {
    if (S.recovery && S.user) return { key: 'reset' };
    const b = r.base;
    if (!S.user) {
      if (b === 'login' || b === 'signup') return { key: 'auth', mode: b };
      if (MEMBER_ROUTES.has(b) || b === 'admin' || b === 'welcome') return { key: 'auth', mode: 'login' };
      return { key: 'landing' };
    }
    if (!S.me) return { key: 'welcome' };
    if (b === 'admin') return S.isAdmin ? { key: 'admin', tab: r.sub || 'checkin' } : { key: 'home' };
    if (MEMBER_ROUTES.has(b)) return { key: b };
    return { key: 'home' };
  }

  function canonical(t) {
    if (t.key === 'landing') return '#/';
    if (t.key === 'auth') return '#/' + t.mode;
    if (t.key === 'admin') return '#/admin/' + t.tab;
    return '#/' + t.key;
  }

  function go(path) {
    const target = '#/' + String(path || '').replace(/^[#/]+/, '');
    if (location.hash !== target) location.hash = target;
    else route();
  }
  RT.go = go;

  function route() {
    if (!S.ready) return;
    const t = resolve(parseHash());
    const canon = canonical(t);
    if (location.hash !== canon) history.replaceState(null, '', canon);

    closeMenu();
    updateNav(t.key);
    showFooter(t.key);
    if (window.RTMesh) window.RTMesh.setDim(MESH_DIM[t.key] ?? 0.6);

    if (current && current.key === t.key && current.handle && current.handle.update) {
      current.handle.update(t);
      current.target = t;
      return;
    }
    if (current && current.handle && current.handle.cleanup) {
      try { current.handle.cleanup(); } catch (e) { console.warn(e); }
    }
    const container = h('div', { class: 'view view-' + t.key });
    clear(appEl).appendChild(container);
    window.scrollTo(0, 0);
    document.body.dataset.view = t.key;
    const fn = RT.views[t.key];
    let handle = null;
    try { handle = fn ? fn(container, t) : null; } catch (e) {
      console.error(e);
      container.appendChild(h('div', { class: 'card' }, 'This page hit an error. Try reloading.'));
    }
    current = { key: t.key, target: t, handle };
  }
  RT.route = route;
  RT.rerender = () => { current = null; route(); };

  // ---------------- auth lifecycle ----------------
  const queued = [];
  let booted = false;
  sb.auth.onAuthStateChange((event, session) => {
    // Never call Supabase inside this callback (it can deadlock the auth lock).
    setTimeout(() => {
      if (!booted) queued.push([event, session]);
      else onAuthEvent(event, session);
    }, 0);
  });

  async function applySession(session) {
    S.session = session || null;
    S.user = session ? session.user : null;
    S.me = null;
    S.isAdmin = false;
    if (!S.user) return;
    try {
      const [me, admin] = await Promise.all([api.myMember(S.user.id), api.isAdmin()]);
      S.me = me;
      S.isAdmin = admin;
    } catch (e) {
      toast(friendly(e), 'error');
    }
    if (!S.me) await autoOnboard();
    if (S.me) {
      await RT.loadShared();
      if (S.isAdmin) RT.refreshPending().then(updateAdminBadge);
    }
  }

  // Email sign-ups carry their answers (name, grade, card code) in user metadata; use them to finish
  // joining. Google sign-ins skip that form, so they go through the "One more step" screen instead.
  // US numbers: keep the digits, add +1 when it's a plain 10-digit number. Returns '' if it doesn't look like a phone number.
  function cleanPhone(raw) {
    const d = String(raw || '').replace(/\D/g, '');
    if (d.length === 10) return '+1' + d;
    if (d.length === 11 && d[0] === '1') return '+' + d;
    return d.length >= 8 && d.length <= 15 ? '+' + d : '';
  }
  RT.cleanPhone = cleanPhone;
  function phoneInput(value) {
    return h('input', { class: 'input', type: 'tel', placeholder: '(555) 123-4567', autocomplete: 'tel', inputmode: 'tel', maxlength: 20, value: value || '' });
  }
  const PHONE_HINT = 'We’ll text you once to add you to the club group chat (iMessage or WhatsApp). Only officers can see it.';
  // Saving the number is a bonus step: joining still works if it fails (e.g. the v3 database update isn't in yet).
  async function savePhone(phone) {
    if (!phone) return;
    try { const m = await api.setPhone(phone); if (m) S.me = m; } catch (e) { console.warn('Phone not saved', e); }
  }

  async function autoOnboard() {
    const meta = (S.user && S.user.user_metadata) || {};
    if (!meta.rt_signup) return;
    const key = 'rt_onboard_' + S.user.id;
    let tried = false;
    try { tried = sessionStorage.getItem(key) === '1'; sessionStorage.setItem(key, '1'); } catch (e) { /* ignore */ }
    if (tried) return;
    try {
      if (meta.card_code) {
        S.me = await api.claim(meta.card_code);
        await savePhone(meta.phone);
        toast('Card linked. Welcome back to the Tank.', 'success');
      } else if (meta.full_name) {
        S.me = await api.register(meta.full_name, meta.grade || '', meta.ref || '');
        await savePhone(meta.phone);
        toast('You’re in. Your card request went to the officers.', 'success');
      }
    } catch (e) {
      S.onboardError = friendly(e);
    }
  }

  async function onAuthEvent(event, session) {
    if (event === 'PASSWORD_RECOVERY') {
      S.recovery = true;
      await applySession(session);
      renderShell();
      go('reset');
      return;
    }
    if (event === 'SIGNED_OUT') {
      S.recovery = false;
      await applySession(null);
      renderShell();
      go('');
      return;
    }
    if (event === 'TOKEN_REFRESHED') { S.session = session; return; }
    const newId = session && session.user ? session.user.id : null;
    const oldId = S.user ? S.user.id : null;
    if (newId !== oldId) {
      await applySession(session);
      renderShell();
      route();
    }
  }

  async function signOut() {
    closeMenu();
    await sb.auth.signOut();
  }
  RT.signOut = signOut;

  // Reload the signed-in member (after onboarding or profile edits).
  RT.reloadMe = async function () {
    if (!S.user) return;
    const [me, admin] = await Promise.all([api.myMember(S.user.id), api.isAdmin()]);
    S.me = me;
    S.isAdmin = admin;
    if (S.me) {
      await RT.loadShared();
      if (S.isAdmin) await RT.refreshPending();
    }
    renderShell();
  };

  // ---------------- shell: top bar, nav, menu ----------------
  function navItems() {
    const items = [
      { value: 'home', label: 'Home', icon: 'home' },
      { value: 'about', label: 'About', icon: 'fin' },
      { value: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
      { value: 'chat', label: 'Chat', icon: 'chat' },
      { value: 'profile', label: 'Profile', icon: 'user' }
    ];
    if (S.isAdmin) items.push({ value: 'admin', label: 'Admin', icon: 'shield', badge: S.pendingCount || 0 });
    return items;
  }

  function renderShell() {
    clear(topEl);
    clear(bottomEl);
    navSeg = bottomSeg = null;
    document.body.classList.toggle('is-member', !!S.me);
    document.body.classList.toggle('is-signed-in', !!S.user);
    footerKey = null; // links depend on who is signed in, so rebuild the footer on the next route

    const brand = h('a', { class: 'brand', href: S.me ? '#/home' : '#/', 'aria-label': 'Ridge Tank home' },
      h('span', { class: 'brand-mark' }, icon('fin', 18)),
      h('span', { class: 'brand-name' }, 'Ridge Tank'));
    const left = h('div', { class: 'top-left' }, brand);
    const mid = h('div', { class: 'top-mid' });
    const right = h('div', { class: 'top-right' });

    const key = current ? current.key : 'home';
    if (S.me) {
      navSeg = segmented({ items: navItems(), value: key, className: 'nav-seg', ariaLabel: 'Main navigation', onChange: v => go(v) });
      mid.appendChild(navSeg);
      bottomSeg = segmented({ items: navItems(), value: key, vertical: true, className: 'bottom-seg', ariaLabel: 'Main navigation', onChange: v => go(v) });
      bottomEl.appendChild(bottomSeg);
    } else if (!S.user) {
      right.appendChild(h('a', { class: 'btn btn-ghost btn-sm hide-sm', href: '#/login' }, 'Log in'));
      right.appendChild(h('a', { class: 'btn btn-primary btn-sm hide-sm', href: '#/signup' }, 'Join', icon('arrowRight', 16)));
    }

    menuBtn = menuButton({ label: 'Open menu', onToggle: open => (open ? openMenu() : closeMenu()) });
    const chip = h('div', { class: 'menu-chip' + (S.user ? '' : ' only-sm') },
      S.me ? h('button', { class: 'chip-avatar', type: 'button', 'aria-label': 'Open menu', onclick: () => menuBtn.click() }, avatar(S.me.name, 30)) : null,
      menuBtn);
    const isLight = theme.get() === 'light';
    right.appendChild(h('button', { class: 'icon-btn theme-btn', type: 'button', 'aria-label': isLight ? 'Switch to dark mode' : 'Switch to light mode', title: isLight ? 'Dark mode' : 'Light mode', onclick: () => theme.toggle() }, icon(isLight ? 'moon' : 'sun', 18)));
    right.appendChild(chip);

    menuPanel = buildMenu();
    topEl.append(left, mid, right, menuPanel);
    requestAnimationFrame(() => topEl.classList.add('ready'));
  }
  RT.renderShell = renderShell;

  // Light / dark switch. The choice is saved in this browser.
  const theme = {
    get: () => (document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark'),
    set(t) {
      if (t === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      try { localStorage.setItem('rt_theme', t); } catch (e) { /* storage blocked */ }
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', t === 'light' ? '#cfdcd3' : '#030705');
      window.dispatchEvent(new CustomEvent('rt:theme', { detail: t }));
    },
    toggle() {
      theme.set(theme.get() === 'light' ? 'dark' : 'light');
      renderShell();   // button + menu labels
      RT.rerender();   // redraws the dotted headings in the new colour
    }
  };
  RT.theme = theme;

  // Top bar slides away while scrolling down and comes back on any scroll up (or near the top).
  (function () {
    let lastY = window.scrollY, ticking = false;
    function update() {
      ticking = false;
      const y = window.scrollY;
      const menuOpen = menuPanel && !menuPanel.hidden;
      if (y < 80 || y < lastY - 4 || menuOpen) topEl.classList.remove('nav-hidden');
      else if (y > lastY + 4) topEl.classList.add('nav-hidden');
      if (Math.abs(y - lastY) > 4) lastY = y;
    }
    window.addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  })();

  function buildMenu() {
    const items = [];
    const link = (href, label, ic, extra) => h('a', { class: 'menu-item', href, onclick: closeMenu }, icon(ic, 18), h('span', { class: 'grow' }, label), extra || null);
    if (S.me) {
      items.push(h('div', { class: 'menu-user' }, avatar(S.me.name, 40),
        h('div', { class: 'min0' }, h('div', { class: 'menu-name' }, S.me.name), h('div', { class: 'muted small ellipsis' }, S.user.email || ''))));
      items.push(link('#/home', 'Home', 'home'), link('#/about', 'About the club', 'fin'), link('#/leaderboard', 'Leaderboard', 'trophy'), link('#/chat', 'Club chat', 'chat'), link('#/profile', 'Profile & badges', 'user'));
      if (S.isAdmin) items.push(link('#/admin/checkin', 'Officer tools', 'shield', S.pendingCount ? h('span', { class: 'count-pill' }, String(S.pendingCount)) : null));
      items.push(h('div', { class: 'menu-sep' }));
      items.push(h('button', { class: 'menu-item', type: 'button', onclick: signOut }, icon('logout', 18), h('span', { class: 'grow' }, 'Sign out')));
    } else if (S.user) {
      items.push(h('div', { class: 'menu-user' }, avatar(S.user.email, 40), h('div', { class: 'min0' }, h('div', { class: 'menu-name' }, 'Signed in'), h('div', { class: 'muted small ellipsis' }, S.user.email || ''))));
      items.push(h('button', { class: 'menu-item', type: 'button', onclick: signOut }, icon('logout', 18), h('span', { class: 'grow' }, 'Sign out')));
    } else {
      items.push(link('#/', 'About the club', 'fin'));
      items.push(link('#/login', 'Log in', 'user'));
      items.push(h('a', { class: 'btn btn-primary btn-block', href: '#/signup', onclick: closeMenu }, 'Join Ridge Tank', icon('arrowRight', 16)));
    }
    return h('div', { class: 'menu-panel glass', role: 'menu', hidden: true }, items);
  }

  function openMenu() {
    if (!menuPanel) return;
    menuPanel.hidden = false;
    requestAnimationFrame(() => menuPanel.classList.add('open'));
    menuBtn.setOpen(true);
    setTimeout(() => {
      document.addEventListener('pointerdown', outside, true);
      document.addEventListener('keydown', escClose, true);
    }, 0);
  }
  function closeMenu() {
    if (!menuPanel || menuPanel.hidden) return;
    menuPanel.classList.remove('open');
    menuBtn.setOpen(false);
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', escClose, true);
    setTimeout(() => { if (!menuPanel.classList.contains('open')) menuPanel.hidden = true; }, 220);
  }
  function outside(e) {
    if (menuPanel.contains(e.target) || e.target.closest('.menu-chip')) return;
    closeMenu();
  }
  function escClose(e) { if (e.key === 'Escape') closeMenu(); }

  function updateNav(key) {
    const navKey = MEMBER_ROUTES.has(key) || key === 'admin' ? key : null;
    if (navSeg && navKey) navSeg.setValue(navKey);
    if (bottomSeg && navKey) bottomSeg.setValue(navKey);
  }

  function updateAdminBadge() {
    if (navSeg) navSeg.setBadge('admin', S.pendingCount);
    if (bottomSeg) bottomSeg.setBadge('admin', S.pendingCount);
    window.dispatchEvent(new CustomEvent('rt:pending', { detail: S.pendingCount }));
  }
  RT.updateAdminBadge = updateAdminBadge;
  setInterval(() => { if (S.isAdmin && !document.hidden) RT.refreshPending().then(updateAdminBadge); }, 60000);

  // ---------------- footer ----------------
  // Rounded glass panel with brand + link columns that blur/fade in one after another
  // (modeled on the Efferd "Footer Section" animation, in Ridge Tank colors).
  const NO_FOOTER = new Set(['chat', 'admin', 'auth', 'welcome', 'reset']);
  let footerKey = null;
  let footerIO = null;

  // Scroll to a landing-page section from anywhere (the router owns the URL hash, so anchors can't).
  function jump(id) {
    const scroll = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    };
    if (current && current.key === 'landing') scroll();
    else { go(''); setTimeout(scroll, 500); }
  }
  RT.jump = jump;

  function footerColumns() {
    if (!S.user) {
      return [
        { title: 'Explore', links: [
          { label: 'Overview', href: '#/' },
          { label: 'How it works', jump: 'how' },
          { label: 'Tiers', jump: 'tiers' },
          { label: 'Badges', jump: 'badges' }] },
        { title: 'Members', links: [
          { label: 'Log in', href: '#/login' },
          { label: 'Join Ridge Tank', href: '#/signup' },
          { label: 'Leaderboard', href: '#/leaderboard', lock: true },
          { label: 'Club chat', href: '#/chat', lock: true }] },
        { title: 'Club', links: [
          { label: 'Officers', jump: 'officers' },
          { label: 'Privacy', href: 'privacy.html' }] }
      ];
    }
    return [
      { title: 'Explore', links: [
        { label: 'Home', href: '#/home' },
        { label: 'Leaderboard', href: '#/leaderboard' },
        { label: 'Club chat', href: '#/chat' }] },
      { title: 'Account', links: [
        { label: 'Profile & badges', href: '#/profile' },
        { label: 'Sign out', onClick: signOut }] },
      { title: 'Club', links: [{ label: 'Privacy', href: 'privacy.html' }].concat(S.isAdmin
        ? [{ label: 'Officer tools', href: '#/admin/checkin' }, { label: 'Card requests', href: '#/admin/requests' }]
        : []) }
    ];
  }

  function footerLink(l) {
    const kids = [l.label, l.lock ? icon('lock', 12, 'f-lock') : null];
    if (l.onClick) return h('button', { class: 'f-link', type: 'button', onclick: l.onClick }, ...kids);
    if (l.jump) return h('a', { class: 'f-link', href: '#/', onclick: e => { e.preventDefault(); jump(l.jump); } }, ...kids);
    return h('a', { class: 'f-link', href: l.href }, ...kids);
  }

  function renderFooter() {
    if (!footerEl) return;
    clear(footerEl);
    const anim = (delay, cls, ...kids) => h('div', { class: 'f-anim ' + cls, style: { '--d': delay } }, ...kids);
    const social = (cfg.social || []).filter(s => s && s.href);

    const brand = anim(0.1, 'f-brand',
      h('a', { class: 'brand', href: S.me ? '#/home' : '#/', 'aria-label': 'Ridge Tank home' },
        h('span', { class: 'brand-mark' }, icon('fin', 18)), h('span', { class: 'brand-name' }, 'Ridge Tank')),
      h('p', { class: 'f-tag' }, 'Mountain Ridge’s Shark Tank club. Show up, pitch your ideas, and climb the leaderboard.'),
      social.length ? h('div', { class: 'f-social' }, social.map(s =>
        h('a', { class: 'icon-btn', href: s.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': s.label }, icon(s.icon || 'link', 18)))) : null);

    const cols = footerColumns().map((c, i) => anim(0.2 + i * 0.1, 'f-col',
      h('h3', null, c.title),
      h('ul', null, c.links.map(l => h('li', null, footerLink(l))))));

    const bar = anim(0.55, 'f-bar',
      h('span', null, `© ${new Date().getFullYear()} Ridge Tank · ${cfg.school}`),
      h('a', { class: 'f-top', href: '#/', onclick: e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); } },
        'Back to top', icon('arrowUp', 14)));

    footerEl.appendChild(h('div', { class: 'f-panel' },
      h('span', { class: 'f-glow', 'aria-hidden': 'true' }),
      h('div', { class: 'f-inner' }, brand, h('nav', { class: 'f-cols', 'aria-label': 'Footer' }, ...cols)),
      bar));

    // Each piece animates in the first time it scrolls into view.
    if (footerIO) footerIO.disconnect();
    const items = footerEl.querySelectorAll('.f-anim');
    if (reduceMotion || !('IntersectionObserver' in window)) { items.forEach(i => i.classList.add('in')); return; }
    footerIO = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); footerIO.unobserve(e.target); } });
    }, { threshold: 0.15 });
    items.forEach(i => footerIO.observe(i));
  }

  function showFooter(key) {
    if (!footerEl) return;
    const hide = NO_FOOTER.has(key);
    footerEl.hidden = hide;
    document.body.classList.toggle('has-footer', !hide);
    if (hide) { footerKey = null; return; }
    if (footerKey !== key) { footerKey = key; renderFooter(); } // replays the entrance on each page
  }

  // ---------------- shared bits ----------------
  function pageHead(title, sub, extra) {
    return h('header', { class: 'page-head reveal' },
      h('div', { class: 'min0' }, h('h1', { class: 'page-title' }, title), sub ? h('p', { class: 'page-sub' }, sub) : null),
      extra || null);
  }
  RT.pageHead = pageHead;

  function field(label, input, hint) {
    return h('label', { class: 'field' }, h('span', { class: 'label' }, label), input, hint ? h('span', { class: 'hint' }, hint) : null);
  }
  RT.field = field;

  function passwordInput(placeholder = 'Password', autocomplete = 'current-password') {
    const input = h('input', { class: 'input', type: 'password', placeholder, autocomplete, minlength: 8, required: true });
    const toggle = h('button', { class: 'input-action', type: 'button', 'aria-label': 'Show password' }, icon('eye', 18));
    toggle.addEventListener('click', () => {
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      toggle.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      clear(toggle).appendChild(icon(show ? 'eyeOff' : 'eye', 18));
    });
    const wrap = h('div', { class: 'input-wrap' }, input, toggle);
    wrap.input = input;
    return wrap;
  }

  const GOOGLE_G = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  // One tap with a Google account: no password, no confirmation email.
  function googleButton(label) {
    const btn = h('button', { class: 'btn btn-google btn-block btn-lg', type: 'button' },
      h('span', { class: 'g-logo', html: GOOGLE_G }), h('span', null, label));
    btn.addEventListener('click', () => busy(btn, async () => {
      const settings = await RT.authSettings();
      if (settings && settings.external && settings.external.google === false) {
        toast('Google sign-in isn’t switched on yet. Use email for now.', 'error', 5000);
        return;
      }
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname, queryParams: { prompt: 'select_account' } }
      });
      if (error) { toast(friendly(error), 'error'); return; }
      await new Promise(r => setTimeout(r, 4000)); // keep the spinner while the browser heads to Google
    }));
    return btn;
  }
  const orDivider = text => h('div', { class: 'or-divider', role: 'separator' }, h('span', null, text));

  function gradeSwitch(value) {
    return segmented({
      items: ['9', '10', '11', '12'].map(g => ({ value: g, label: g + 'th' })),
      value: value || '', className: 'seg-fill', ariaLabel: 'Grade'
    });
  }
  RT.gradeSwitch = gradeSwitch;

  // ---------------- landing ----------------
  // Members reach the same page from the About tab.
  RT.views.landing = function (root) {
    const title = h('h1', { class: 'hero-title' }, 'RIDGE TANK');

    const hero = h('section', { class: 'hero' },
      h('div', { class: 'hero-inner' },
        h('p', { class: 'eyebrow reveal', style: { '--i': 0 } }, cfg.school),
        title,
        h('p', { class: 'hero-sub reveal', style: { '--i': 3 } }, 'Mountain Ridge’s Shark Tank club. Pitch your ideas, back other people’s, and climb the leaderboard all year.'),
        h('div', { class: 'hero-cta reveal', style: { '--i': 4 } },
          S.me
            ? h('a', { class: 'btn btn-primary btn-lg', href: '#/home' }, 'Go to your dashboard', icon('arrowRight', 18))
            : [h('a', { class: 'btn btn-primary btn-lg', href: '#/signup' }, 'Join Ridge Tank', icon('arrowRight', 18)),
               h('a', { class: 'btn btn-ghost btn-lg', href: '#/login' }, 'Log in')]),
        (!S.me && cfg.promo) ? h('div', { class: 'promo reveal', style: { '--i': 5 } }, h('strong', null, cfg.promo.title), h('span', null, cfg.promo.text)) : null,
        h('div', { class: 'hero-meta reveal', style: { '--i': 5 } },
          h('span', null, icon('nfc', 16), 'Tap in with your card'),
          h('span', null, icon('trophy', 16), 'Season ' + cfg.season.replace('-', '–')),
          h('span', null, icon('award', 16), '19 badges'))),
      h('a', { class: 'scroll-hint', href: '#how', 'aria-label': 'Scroll down', onclick: e => { e.preventDefault(); document.getElementById('how').scrollIntoView({ behavior: 'smooth' }); } }, icon('chevronDown', 20)));

    const steps = [
      ['01', 'Tap in', 'nfc', 'Every meeting, tap your Ridge Tank card on the reader at the door. That earns you 100 Bites. No sign-in sheet.'],
      ['02', 'Pitch & invest', 'mic', 'Teams pitch in the Tank and everyone invests their Bites in the ideas they believe in. Back a winner and your money grows.'],
      ['03', 'Climb', 'trophy', 'Your net worth climbs four tiers and unlocks badges. Bounties pay extra, and idle Bites fade, so put them to work. Whoever finishes the year on top is King of the Tank.']
    ];
    const how = h('section', { class: 'section', id: 'how' },
      h('div', { class: 'section-head' }, h('p', { class: 'eyebrow' }, 'How it works'), h('h2', { class: 'section-title' }, 'Show up. Pitch. Climb.')),
      h('div', { class: 'grid-3' }, steps.map(([n, t, ic, d], i) =>
        h('article', { class: 'card step-card lift', style: { '--i': i } },
          h('div', { class: 'step-top' }, h('span', { class: 'step-num' }, n), h('span', { class: 'step-icon' }, icon(ic, 20))),
          h('h3', null, t), h('p', { class: 'muted' }, d)))));

    const tierInfo = [
      ['Reef Shark', 0, 'Where everyone starts.'],
      ['Tiger Shark', 1000, 'About 10 meetings in.'],
      ['Great White', 2500, 'Showing up and pitching.'],
      ['Megalodon', 5000, 'A full year, all in.']
    ];
    const tiers = h('section', { class: 'section', id: 'tiers' },
      h('div', { class: 'section-head' }, h('p', { class: 'eyebrow' }, 'Tiers'), h('h2', { class: 'section-title' }, 'From Reef Shark to Megalodon.')),
      h('div', { class: 'tier-track' }, tierInfo.map(([name, pts, d], i) =>
        h('div', { class: 'tier-stop ' + RT.tierClass(name), style: { '--i': i } },
          h('div', { class: 'tier-node' }), h('div', { class: 'tier-pts mono' }, pts + ' Bites'), h('div', { class: 'tier-name' }, name), h('p', { class: 'muted small' }, d)))));

    const sampleBadges = ['First Bite', 'Feeding Frenzy', 'On the Hunt', 'In the Tank', 'Tank Champion', 'Crowd Favorite', 'Headhunter', 'King of the Tank'];
    const badgeDesc = {
      'First Bite': 'Your first meeting', 'Feeding Frenzy': '10 meetings', 'On the Hunt': '5 meetings in a row',
      'In the Tank': 'Your first pitch', 'Tank Champion': 'Win a Tank competition', 'Crowd Favorite': 'Most Bites invested in you in a session',
      'Headhunter': 'Bring a friend who joins', 'King of the Tank': '#1 at the end of the year'
    };
    const badges = h('section', { class: 'section', id: 'badges' },
      h('div', { class: 'section-head' }, h('p', { class: 'eyebrow' }, 'Badges'), h('h2', { class: 'section-title' }, '19 badges. Some are easy. One is not.')),
      h('div', { class: 'badge-strip' }, sampleBadges.map((b, i) =>
        h('div', { class: 'badge-chip', style: { '--i': i } }, h('span', { class: 'badge-chip-icon' + (i % 3 === 2 ? ' burg' : '') }, icon(RT.badgeIcon(b), 18)),
          h('div', null, h('div', { class: 'badge-chip-name' }, b), h('div', { class: 'muted small' }, badgeDesc[b]))))));

    const locked = h('section', { class: 'section' },
      h('div', { class: 'card locked-card' },
        h('div', { class: 'locked-rows', 'aria-hidden': 'true' }, [1, 2, 3, 4, 5].map(i =>
          h('div', { class: 'locked-row' }, h('span', { class: 'mono muted' }, String(i)), h('span', { class: 'bar', style: { width: (78 - i * 9) + '%' } }), h('span', { class: 'bar short' })))),
        h('div', { class: 'locked-copy' },
          h('span', { class: 'lock-badge' }, icon('lock', 18)),
          h('h3', null, 'The leaderboard is members-only'),
          h('p', { class: 'muted' }, 'Join or log in to see where you rank, track your badges, and talk in the club chat.'),
          h('div', { class: 'row gap-sm wrap center' },
            h('a', { class: 'btn btn-primary', href: '#/signup' }, 'Join Ridge Tank'),
            h('a', { class: 'btn btn-ghost', href: '#/login' }, 'Log in')))));

    const officers = h('section', { class: 'section', id: 'officers' },
      h('div', { class: 'section-head' }, h('p', { class: 'eyebrow' }, 'Officers'), h('h2', { class: 'section-title' }, 'Who runs the Tank.')),
      h('div', { class: 'grid-4' }, cfg.officers.map((o, i) =>
        h('div', { class: 'card officer lift', style: { '--i': i } }, avatar(o.name, 52),
          h('div', null, h('div', { class: 'officer-name' }, o.name), h('div', { class: 'muted small' }, o.role + (o.note ? ' · ' + o.note : '')))))));

    root.append(hero, how, tiers, badges, ...(S.me ? [] : [locked]), officers);

    // Fade sections in as they scroll into view.
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { threshold: 0.12 });
    root.querySelectorAll('.section').forEach(s => io.observe(s));
    return { cleanup: () => io.disconnect() };
  };

  RT.views.about = RT.views.landing;

  // ---------------- log in / sign up ----------------
  RT.views.auth = function (root, t) {
    let mode = t.mode;
    const seg = segmented({
      items: [{ value: 'login', label: 'Log in' }, { value: 'signup', label: 'Sign up' }],
      value: mode, className: 'seg-fill', ariaLabel: 'Log in or sign up',
      onChange: v => go(v)
    });
    const title = h('h1', { class: 'auth-title' });
    const sub = h('p', { class: 'muted' });
    const formHost = h('div', { class: 'auth-forms' });
    const card = h('div', { class: 'card auth-card reveal' },
      h('div', { class: 'auth-brand' }, h('span', { class: 'brand-mark lg' }, icon('fin', 22))),
      title, sub, seg, formHost);
    root.appendChild(h('div', { class: 'auth-wrap' }, card));

    function show(m) {
      mode = m;
      seg.setValue(m);
      title.textContent = m === 'login' ? 'Welcome back' : 'Join Ridge Tank';
      sub.textContent = m === 'login' ? 'Log in to see your Bites, badges, and the leaderboard.' : 'Takes a minute. Your physical card gets made after you sign up.';
      const next = m === 'login' ? loginForm() : signupForm();
      next.classList.add('form-in');
      clear(formHost).appendChild(next);
      const first = next.querySelector('input');
      if (first && window.innerWidth > 720) first.focus({ preventScroll: true });
    }

    function loginForm() {
      const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', autocomplete: 'email', required: true });
      const pw = passwordInput('Your password', 'current-password');
      const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, 'Log in');
      const forgot = h('button', { class: 'link-btn', type: 'button', onclick: () => forgotModal(email.value) }, 'Forgot password?');
      const form = h('form', { class: 'stack', novalidate: true },
        googleButton('Continue with Google'),
        orDivider('or use email'),
        field('Email', email), field('Password', pw), h('div', { class: 'row between' }, h('span'), forgot), err, submit,
        h('p', { class: 'muted small center' }, 'New here? ', h('a', { href: '#/signup' }, 'Create an account')));
      form.addEventListener('submit', e => {
        e.preventDefault();
        err.hidden = true;
        if (!email.value.trim() || !pw.input.value) { err.textContent = 'Enter your email and password.'; err.hidden = false; return; }
        busy(submit, async () => {
          const { error } = await sb.auth.signInWithPassword({ email: email.value.trim(), password: pw.input.value });
          if (error) { err.textContent = friendly(error); err.hidden = false; return; }
          toast('Logged in', 'success', 1600);
        });
      });
      return form;
    }

    function signupForm() {
      const name = h('input', { class: 'input', type: 'text', placeholder: 'First and last name', autocomplete: 'name', required: true, maxlength: 60 });
      const grade = gradeSwitch('');
      const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', autocomplete: 'email', required: true });
      const phone = phoneInput();
      const pw = passwordInput('At least 8 characters', 'new-password');
      const code = h('input', { class: 'input mono', type: 'text', placeholder: 'e.g. Falcon4821', autocomplete: 'off', spellcheck: false, maxlength: 20 });
      const ref = h('input', { class: 'input mono', type: 'text', placeholder: 'Their code (optional)', autocomplete: 'off', spellcheck: false, maxlength: 20 });
      const codeField = field('Card code', code, 'It’s printed on your card, or ask an officer.');
      const refField = field('Invited by a member?', ref, 'Enter their code so they get credit.');
      codeField.hidden = true;
      const hasCard = segmented({
        items: [{ value: 'new', label: 'I’m new' }, { value: 'card', label: 'I have a card' }],
        value: 'new', className: 'seg-fill', ariaLabel: 'Do you already have a card?',
        onChange: v => { codeField.hidden = v !== 'card'; refField.hidden = v === 'card'; if (v === 'card') code.focus(); }
      });
      const agree = h('input', { type: 'checkbox', class: 'check' });
      const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, 'Create account');
      const form = h('form', { class: 'stack', novalidate: true },
        h('div', { class: 'stack-sm' }, googleButton('Sign up with Google'),
          h('p', { class: 'muted small center' }, 'Fastest way in. You’ll pick your grade on the next screen.')),
        orDivider('or sign up with email'),
        field('Name', name),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade),
        field('Email', email),
        field('Phone number', phone, PHONE_HINT),
        field('Password', pw),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Already have a Ridge Tank card?'), hasCard),
        codeField, refField,
        h('label', { class: 'check-row' }, agree, h('span', null, 'I understand my name and Bites will show on the club leaderboard, which only members can see.')),
        err, submit,
        h('p', { class: 'muted small center' }, 'Already joined? ', h('a', { href: '#/login' }, 'Log in')));

      form.addEventListener('submit', e => {
        e.preventDefault();
        err.hidden = true;
        const fail = m => { err.textContent = m; err.hidden = false; };
        const n = name.value.trim();
        const g = grade.getValue();
        const em = email.value.trim();
        const p = pw.input.value;
        const ph = cleanPhone(phone.value);
        const withCard = hasCard.getValue() === 'card';
        const c = code.value.trim();
        if (n.length < 2) return fail('Enter your name.');
        if (!g) return fail('Pick your grade.');
        if (!/^\S+@\S+\.\S+$/.test(em)) return fail('Enter a real email address.');
        if (!ph) return fail('Enter your phone number.');
        if (p.length < 8) return fail('Use a password with at least 8 characters.');
        if (withCard && !/^[A-Za-z]+\d{4}$/.test(c)) return fail('Card codes look like a word plus 4 numbers, e.g. Falcon4821.');
        if (!agree.checked) return fail('Check the box about the leaderboard to continue.');
        busy(submit, async () => {
          const meta = { rt_signup: true, full_name: n, grade: g, phone: ph };
          if (withCard) meta.card_code = c;
          else if (ref.value.trim()) meta.ref = ref.value.trim();
          const { data, error } = await sb.auth.signUp({
            email: em, password: p,
            options: { data: meta, emailRedirectTo: location.origin + location.pathname }
          });
          if (error) return fail(friendly(error));
          if (data && data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            return fail('That email already has an account. Try logging in.');
          }
          if (!data.session) {
            clear(formHost).appendChild(checkEmail(em));
            title.textContent = 'Check your email';
            sub.textContent = '';
          }
        });
      });
      return form;
    }

    function checkEmail(em) {
      return h('div', { class: 'stack center-text form-in' },
        h('div', { class: 'big-icon' }, icon('mail', 28)),
        h('p', null, 'We sent a confirmation link to ', h('strong', null, em), '.'),
        h('p', { class: 'muted small' }, 'Open it, then come back here and log in. Check spam if you don’t see it in a couple of minutes.'),
        h('button', { class: 'btn btn-ghost btn-block', type: 'button', onclick: () => go('login') }, 'Back to log in'));
    }

    function forgotModal(prefill) {
      const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', value: prefill || '', autocomplete: 'email' });
      const send = h('button', { class: 'btn btn-primary', type: 'button' }, 'Send reset link');
      const m = modal({ title: 'Reset your password', subtitle: 'We’ll email you a link to set a new one.', body: field('Email', email), actions: [send] });
      send.addEventListener('click', () => busy(send, async () => {
        const em = email.value.trim();
        if (!/^\S+@\S+\.\S+$/.test(em)) { toast('Enter your email address.', 'error'); return; }
        const { error } = await sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname });
        if (error) { toast(friendly(error), 'error'); return; }
        m.close();
        toast('If that email has an account, a reset link is on its way.', 'success', 5000);
      }));
    }

    show(mode);
    return { update: nt => { if (nt.mode !== mode) show(nt.mode); } };
  };

  // ---------------- onboarding (signed in, no member profile yet) ----------------
  RT.views.welcome = function (root) {
    const meta = (S.user && S.user.user_metadata) || {};
    const startMode = meta.card_code ? 'card' : 'new';
    const err = h('p', { class: 'form-error', role: 'alert', hidden: !S.onboardError }, S.onboardError || '');
    S.onboardError = null;

    const name = h('input', { class: 'input', type: 'text', placeholder: 'First and last name', value: meta.full_name || meta.name || '', maxlength: 60 });
    const grade = gradeSwitch(meta.grade || '');
    const ref = h('input', { class: 'input mono', type: 'text', placeholder: 'Their code (optional)', value: meta.ref || '', maxlength: 20 });
    // Email sign-ups already ticked this box on the sign-up form; Google sign-ins see it here for the first time.
    const agree = h('input', { type: 'checkbox', class: 'check', checked: !!meta.rt_signup });
    const code = h('input', { class: 'input mono', type: 'text', placeholder: 'e.g. Falcon4821', value: meta.card_code || '', maxlength: 20, spellcheck: false });
    const phone = phoneInput(meta.phone);
    const phoneField = field('Phone number', phone, PHONE_HINT);

    const newPane = h('div', { class: 'stack' },
      field('Name', name),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade),
      field('Invited by a member?', ref, 'Enter their code so they get credit.'),
      h('label', { class: 'check-row' }, agree, h('span', null, 'I understand my name and Bites will show on the members-only leaderboard.')));
    const cardPane = h('div', { class: 'stack' }, field('Card code', code, 'It’s printed on your card. Lost it? Ask an officer.'));

    const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button' });
    const panes = h('div');
    let mode = startMode;
    function show(m) {
      mode = m;
      clear(panes).appendChild(m === 'new' ? newPane : cardPane);
      panes.firstChild.insertBefore(phoneField, panes.firstChild.children[m === 'new' ? 2 : 1] || null);
      panes.firstChild.classList.add('form-in');
      submit.textContent = m === 'new' ? 'Join the club' : 'Link my card';
    }
    const seg = segmented({ items: [{ value: 'new', label: 'I’m new' }, { value: 'card', label: 'I have a card' }], value: mode, className: 'seg-fill', onChange: show });

    submit.addEventListener('click', () => busy(submit, async () => {
      err.hidden = true;
      try {
        const ph = cleanPhone(phone.value);
        if (!ph) throw new Error('Enter your phone number.');
        if (mode === 'new') {
          if (name.value.trim().length < 2) throw new Error('Enter your name.');
          if (!grade.getValue()) throw new Error('Pick your grade.');
          if (!agree.checked) throw new Error('Check the box about the leaderboard to continue.');
          await api.register(name.value.trim(), grade.getValue(), ref.value.trim());
          await savePhone(ph);
          toast('You’re in. Your card request went to the officers.', 'success');
        } else {
          if (!code.value.trim()) throw new Error('Enter the code from your card.');
          await api.claim(code.value.trim());
          await savePhone(ph);
          toast('Card linked. Welcome back to the Tank.', 'success');
        }
        await RT.reloadMe();
        if (S.isAdmin) RT.refreshPending().then(updateAdminBadge);
        RT.rerender();
      } catch (e) {
        err.textContent = friendly(e);
        err.hidden = false;
      }
    }));

    show(mode);
    root.appendChild(h('div', { class: 'auth-wrap' },
      h('div', { class: 'card auth-card reveal' },
        h('div', { class: 'auth-brand' }, h('span', { class: 'brand-mark lg' }, icon('fin', 22))),
        h('h1', { class: 'auth-title' }, 'One more step'),
        h('p', { class: 'muted' }, 'Signed in as ', h('strong', null, S.user.email || ''), '. Set up your member profile.'),
        seg, panes, err, submit,
        h('button', { class: 'link-btn center', type: 'button', onclick: signOut }, 'Use a different account'))));
    return {};
  };

  // ---------------- set a new password (from the email link) ----------------
  RT.views.reset = function (root) {
    const pw = passwordInput('New password (8+ characters)', 'new-password');
    const pw2 = passwordInput('Type it again', 'new-password');
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button' }, 'Save new password');
    submit.addEventListener('click', () => busy(submit, async () => {
      err.hidden = true;
      if (pw.input.value.length < 8) { err.textContent = 'Use at least 8 characters.'; err.hidden = false; return; }
      if (pw.input.value !== pw2.input.value) { err.textContent = 'Those passwords don’t match.'; err.hidden = false; return; }
      const { error } = await sb.auth.updateUser({ password: pw.input.value });
      if (error) { err.textContent = friendly(error); err.hidden = false; return; }
      S.recovery = false;
      toast('Password updated', 'success');
      renderShell();
      go('home');
    }));
    root.appendChild(h('div', { class: 'auth-wrap' },
      h('div', { class: 'card auth-card reveal' },
        h('div', { class: 'auth-brand' }, h('span', { class: 'brand-mark lg' }, icon('lock', 22))),
        h('h1', { class: 'auth-title' }, 'Set a new password'),
        h('p', { class: 'muted' }, 'You’re signed in from the reset link. Pick a new password.'),
        field('New password', pw), field('Confirm', pw2), err, submit)));
    return {};
  };

  // ---------------- boot ----------------
  async function boot() {
    let session = null;
    try {
      const res = await sb.auth.getSession();
      session = res.data.session;
    } catch (e) { console.warn(e); }
    if (RT.recoveryFromUrl && session) S.recovery = true;
    await applySession(session);
    renderShell();
    S.ready = true;
    booted = true;
    if (/access_token=|error_description=|type=recovery/.test(location.hash)) history.replaceState(null, '', S.recovery ? '#/reset' : '#/');
    // Tidy up anything Google/Supabase left in the query string after a sign-in round trip.
    if (/[?&](code|error|error_description)=/.test(location.search)) history.replaceState(null, '', location.pathname + (location.hash || '#/'));
    route();
    if (RT.authErrorFromUrl) toast(RT.authErrorFromUrl, 'error', 6000);
    queued.splice(0).forEach(([ev, se]) => onAuthEvent(ev, se));
    document.documentElement.classList.add('app-ready');
  }

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('hashchange', route);
  boot();
})();
