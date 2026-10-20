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
  const MEMBER_ROUTES = new Set(['home', 'academy', 'about', 'leaderboard', 'bounties', 'updates', 'chat', 'profile']);
  const MESH_DIM = { landing: 1, about: 1, auth: 0.9, welcome: 0.85, reset: 0.85, home: 0.78, academy: 0.72, leaderboard: 0.75, bounties: 0.72, updates: 0.72, profile: 0.75, chat: 0.65, admin: 0.65 };

  RT.views = RT.views || {};
  let current = null; // { key, target, handle }
  let navSeg = null, bottomSeg = null, menuBtn = null, menuPanel = null, chipBadge = null;

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
    if (b === 'updates') return { key: 'updates', tab: r.sub === 'calendar' ? 'calendar' : 'news' };
    if (b === 'bounties') return { key: 'bounties', tab: r.sub === 'mine' ? 'mine' : 'open' };
    if (b === 'academy') return { key: 'academy', sub: /^(edges|panel|level\/\d{1,2})$/.test(r.sub) ? r.sub : '' };
    if (b === 'sharks') return { key: 'academy', sub: 'panel' }; // old link: The Sharks now lives inside the Academy
    if (MEMBER_ROUTES.has(b)) return { key: b };
    return { key: 'home' };
  }

  function canonical(t) {
    if (t.key === 'landing') return '#/';
    if (t.key === 'auth') return '#/' + t.mode;
    if (t.key === 'admin') return '#/admin/' + t.tab;
    if (t.key === 'updates') return t.tab === 'calendar' ? '#/updates/calendar' : '#/updates';
    if (t.key === 'bounties') return t.tab === 'mine' ? '#/bounties/mine' : '#/bounties';
    if (t.key === 'academy') return '#/academy' + (t.sub ? '/' + t.sub : '');
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
    // Keep this callback light: do the loading after it returns.
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

  // Email sign-ups carry their answers (name, grade, member code) in user metadata; use them to finish
  // joining. Google sign-ins skip that form, so they go through the "One more step" screen instead.

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
        if (meta.phone) S.me = await api.updateProfile(S.me.name, S.me.grade || meta.grade || '', meta.phone, !!meta.whatsapp);
        toast('You’re linked. Welcome back to the Tank.', 'success');
      } else if (meta.full_name) {
        S.me = await api.register(meta.full_name, meta.grade || '', meta.ref || '', meta.phone || '', !!meta.whatsapp);
        toast('You’re in. Welcome to the Tank.', 'success');
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
  // Five places, same on every screen size. Everything else lives one tap away on those pages or in the avatar menu.
  function navItems() {
    const items = [
      { value: 'home', label: 'Home', icon: 'home' },
      { value: 'academy', label: 'Academy', icon: 'map' },
      { value: 'bounties', label: 'Bounties', icon: 'target' },
      { value: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
      { value: 'chat', label: 'Chat', icon: 'chat' }
    ];
    if (S.isAdmin) items.push({ value: 'admin', label: 'Officers', icon: 'shield', badge: S.pendingCount || 0 });
    return items;
  }
  // Phones show the same five; Officer tools ride in the avatar menu.
  const BOTTOM_TABS = ['home', 'academy', 'bounties', 'leaderboard', 'chat'];

  // Number on the avatar: new updates, plus officer to-dos for officers.
  function chipCount() { return (S.unseenAnn || 0) + (S.isAdmin ? (S.pendingCount || 0) : 0); }

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
      bottomSeg = segmented({ items: navItems().filter(i => BOTTOM_TABS.includes(i.value)), value: key, vertical: true, className: 'bottom-seg', ariaLabel: 'Main navigation', onChange: v => go(v) });
      bottomEl.appendChild(bottomSeg);
    } else if (!S.user) {
      right.appendChild(h('a', { class: 'btn btn-ghost btn-sm hide-sm', href: '#/', onclick: e => { e.preventDefault(); RT.jump('faq'); } }, 'FAQ'));
      right.appendChild(h('a', { class: 'btn btn-ghost btn-sm hide-sm', href: '#/login' }, 'Log in'));
      right.appendChild(h('a', { class: 'btn btn-primary btn-sm hide-sm', href: '#/signup' }, 'Join'));
    }

    menuBtn = menuButton({ label: 'Open menu', onToggle: open => (open ? openMenu() : closeMenu()) });
    // On phones the Admin tab isn't in the bottom bar, so the to-do count rides on the avatar instead.
    chipBadge = h('span', { class: 'chip-badge', hidden: !chipCount() }, String(chipCount() || ''));
    const chip = h('div', { class: 'menu-chip' + (S.user ? '' : ' only-sm') },
      S.me ? h('button', { class: 'chip-avatar', type: 'button', 'aria-label': 'Open menu', onclick: () => menuBtn.click() }, avatar(S.me.name, 30), chipBadge) : null,
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
      // Only what isn't already in the main bar, so nothing shows up twice.
      items.push(link('#/profile', 'Profile & badges', 'user'),
        link('#/updates', 'Updates & calendar', 'megaphone', S.unseenAnn ? h('span', { class: 'count-pill' }, String(S.unseenAnn)) : null),
        link('#/about', 'About & FAQ', 'fin'));
      if (S.isAdmin) items.push(link('#/admin/checkin', 'Officer tools', 'shield', S.pendingCount ? h('span', { class: 'count-pill' }, String(S.pendingCount)) : null));
      items.push(h('div', { class: 'menu-sep' }));
      items.push(h('button', { class: 'menu-item', type: 'button', onclick: signOut }, icon('logout', 18), h('span', { class: 'grow' }, 'Sign out')));
    } else if (S.user) {
      items.push(h('div', { class: 'menu-user' }, avatar(S.user.email, 40), h('div', { class: 'min0' }, h('div', { class: 'menu-name' }, 'Signed in'), h('div', { class: 'muted small ellipsis' }, S.user.email || ''))));
      items.push(h('button', { class: 'menu-item', type: 'button', onclick: signOut }, icon('logout', 18), h('span', { class: 'grow' }, 'Sign out')));
    } else {
      items.push(link('#/', 'About the program', 'fin'));
      items.push(h('a', { class: 'menu-item', href: '#/', onclick: e => { e.preventDefault(); closeMenu(); RT.jump('faq'); } }, icon('chat', 18), h('span', { class: 'grow' }, 'FAQ')));
      items.push(link('#/login', 'Log in', 'user'));
      items.push(h('a', { class: 'btn btn-primary btn-block', href: '#/signup', onclick: closeMenu }, 'Join Ridge Tank'));
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

  // Refreshes every little count: the Admin to-do number and the Updates "new" number.
  function updateAdminBadge() {
    [navSeg, bottomSeg].forEach(sg => {
      if (!sg) return;
      sg.setBadge('admin', S.pendingCount);
      sg.setBadge('updates', S.unseenAnn);
    });
    if (chipBadge) {
      chipBadge.textContent = String(chipCount() || '');
      chipBadge.hidden = !chipCount();
    }
    window.dispatchEvent(new CustomEvent('rt:pending', { detail: S.pendingCount }));
  }
  RT.updateAdminBadge = updateAdminBadge;
  setInterval(() => { if (S.isAdmin && !document.hidden) RT.refreshPending().then(updateAdminBadge); }, 60000);

  // ---------------- footer ----------------
  // Rounded panel with brand + link columns that blur/fade in one after another
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
    if (current && (current.key === 'landing' || current.key === 'about')) scroll();
    else { go(S.me ? 'about' : ''); setTimeout(scroll, 500); }
  }
  RT.jump = jump;

  // One short row of links. The main bar already covers every page, so the footer doesn't repeat it.
  function footerLinks() {
    if (!S.user) return [
      { label: 'How it works', jump: 'how' },
      { label: 'FAQ', jump: 'faq' },
      { label: 'Log in', href: '#/login' },
      { label: 'Privacy', href: 'privacy.html' }];
    return [{ label: 'Privacy', href: 'privacy.html' }];
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
      social.length ? h('div', { class: 'f-social' }, social.map(s =>
        h('a', { class: 'icon-btn', href: s.href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': s.label }, icon(s.icon || 'link', 18)))) : null);

    const links = anim(0.2, 'f-links', h('nav', { 'aria-label': 'Footer' }, footerLinks().map(footerLink)));

    const bar = anim(0.3, 'f-bar',
      h('span', null, `© ${new Date().getFullYear()} Ridge Tank · ${cfg.school}`),
      h('a', { class: 'f-top', href: '#/', onclick: e => { e.preventDefault(); window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' }); } },
        'Back to top', icon('arrowUp', 14)));

    footerEl.appendChild(h('div', { class: 'f-panel f-slim' },
      h('span', { class: 'f-glow', 'aria-hidden': 'true' }),
      h('div', { class: 'f-inner' }, brand, links),
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
        title,
        h('p', { class: 'hero-sub' }, 'Mountain Ridge’s Shark Tank program. Pitch your ideas, back other people’s, and climb the leaderboard all year.'),
        S.me ? null : h('div', { class: 'hero-cta' },
          h('a', { class: 'btn btn-primary btn-lg', href: '#/signup' }, 'Join Ridge Tank'),
          h('a', { class: 'hero-link', href: '#/login' }, 'Already a member? Log in')),
        (!S.me && cfg.promo) ? h('div', { class: 'promo' }, h('strong', null, cfg.promo.title), h('span', null, cfg.promo.text)) : null));

    const steps = [
      ['Show up and check in', 'Come to a meeting and check in at the door. That earns you 100 Bites, the program’s money.'],
      ['Learn and pitch', 'Tank Academy’s AI sharks coach you from your first idea to a full pitch. Then pitch in the Tank and invest your Bites in the ideas you believe in.'],
      ['Climb the leaderboard', 'Bites move you up four tiers and unlock badges. Whoever finishes the year on top is King of the Tank.']
    ];
    const how = h('section', { class: 'section', id: 'how' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'How it works')),
      h('ol', { class: 'how-list how-3' }, steps.map(([t, d], i) => h('li', null, h('span', { class: 'how-num mono' }, '0' + (i + 1)), h('h3', null, t), h('p', null, d)))));

    const tierInfo = [
      ['Reef Shark', 0, 'Where everyone starts.'],
      ['Tiger Shark', 1000, 'About 10 meetings in.'],
      ['Great White', 2500, 'Showing up and pitching.'],
      ['Megalodon', 5000, 'A full year, all in.']
    ];
    const tiers = h('section', { class: 'section', id: 'tiers' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'What you earn'), h('p', { class: 'section-sub' }, 'Your Bites decide your tier. Everyone starts as a Reef Shark, and there are 19 badges to collect along the way.')),
      h('div', { class: 'tier-track' }, tierInfo.map(([name, pts, d]) =>
        h('div', { class: 'tier-stop ' + RT.tierClass(name) },
          h('div', { class: 'tier-node' }), h('div', { class: 'tier-pts mono' }, pts + ' Bites'), h('div', { class: 'tier-name' }, name), h('p', { class: 'muted small' }, d)))));

    const closer = h('section', { class: 'section closer' },
      h('div', { class: 'card locked-card' },
        h('div', { class: 'locked-copy' }, h('h3', null, 'Ready to jump in?'),
          h('p', { class: 'muted' }, 'Make an account to track your Bites, rank and badges.')),
        h('a', { class: 'btn btn-primary', href: '#/signup' }, 'Join Ridge Tank')));

    // Questions new people ask. Answers are in plain words on purpose.
    const faqs = [
      ['What is Ridge Tank?', 'A Shark Tank program at ' + cfg.school + '. You pitch ideas, invest in other people’s pitches, and climb a leaderboard all year.'],
      ['Who can join?', 'Any ' + cfg.school + ' student, grades 9 to 12. No experience needed. Just walk in to a meeting.'],
      ['How do I sign up?', 'Just show up to a meeting. To track your Bites and rank online, hit “Join Ridge Tank” and make an account. It takes under a minute.'],
      ['Why do you want my phone number?', 'Only to add you to the program group chat (iMessage or WhatsApp) for meeting updates. Only officers can see it.'],
      ['When is the first meeting?', cfg.nextMeeting + '. Just walk in, and we’ll show you how everything works.'],
      ['Is there a reward for bringing a friend?', 'Yes. Bring a friend and you both get candy.'],
      ['What are Bites?', 'Bites are the program’s money. You earn 100 every time you check in at a meeting, and more for pitching and for bounties. You can invest them, and your Bites plus your winnings make up your net worth.'],
      ['How do I check in?', 'An officer checks you in at the door when you walk into a meeting. You earn 100 Bites each time.'],
      ['How do pitching and investing work?', 'Teams pitch in the Tank. During the meeting you put your Bites into the pitches you believe in. First place pays 3x, second 2x, third 1.5x, and a pitch that flops pays half. You don’t have to pitch to invest.'],
      ['What are bounties?', 'Side challenges the officers post for extra Bites, like bringing a friend. Tap “I did it” and an officer checks it.'],
      ['Why do my Bites fade?', 'Unspent Bites lose 10% at the start of each month. It keeps the game moving: put your Bites to work instead of sitting on them.'],
      ['How do I see my Bites and rank?', 'Log in with your email and password. Your Home page shows your Bites, rank and badges. Your Profile shows your full history. If an officer already added you to the roster, enter the member code they gave you when you sign up.'],
      ['What are tiers and badges?', 'Your net worth moves you through four tiers: Reef Shark, Tiger Shark, Great White and Megalodon. Badges are rewards for things like showing up, pitching and bringing friends.'],
      ['Who can see my information?', 'Members see names, Bites and tiers on the leaderboard. Officers see a bit more so they can run check-in. Read the full details on the privacy page.']
    ];
    // Visitors see the questions that matter before joining; members get the full list on the About page.
    const SHORT = ['What is Ridge Tank?', 'Who can join?', 'When is the first meeting?', 'Is there a reward for bringing a friend?', 'What are Bites?', 'Why do you want my phone number?', 'Who can see my information?'];
    const shown = S.me ? faqs : faqs.filter(([q]) => SHORT.includes(q));
    const faq = h('section', { class: 'section', id: 'faq' },
      h('div', { class: 'section-head' }, h('p', { class: 'eyebrow' }, 'FAQ'), h('h2', { class: 'section-title' }, 'Questions, answered.')),
      h('div', { class: 'faq-list' }, shown.map(([q, a]) => h('details', { class: 'faq-item' },
        h('summary', null, h('span', null, q), icon('chevronDown', 18)),
        h('p', { class: 'muted' }, a)))),
      h('p', { class: 'muted small faq-foot' }, 'Still stuck? Ask any officer at a meeting, or read the ', h('a', { href: 'privacy.html' }, 'privacy page'), '.'));

    const officers = h('section', { class: 'section', id: 'officers' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, 'Officers')),
      h('div', { class: 'officer-list' }, cfg.officers.map(o =>
        h('div', { class: 'officer' }, avatar(o.name, 48),
          h('div', null, h('div', { class: 'officer-name' }, o.name), h('div', { class: 'muted small' }, o.role + (o.note ? ' · ' + o.note : '')))))));

    root.append(S.me ? pageHead('About', 'How Ridge Tank works, plus answers to common questions.') : hero, how, tiers, faq, ...(S.me ? [] : [closer]), officers);
    return {};
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
      title.textContent = m === 'login' ? 'Log in to Ridge Tank' : 'Join Ridge Tank';
      sub.textContent = m === 'login' ? 'Log in to see your Bites, badges, and the leaderboard.' : 'Takes a minute.';
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
      const forgot = h('button', { class: 'link-btn', type: 'button', onclick: () => forgotModal() }, 'Forgot password?');
      const form = h('form', { class: 'stack', novalidate: true },
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
      const phoneF = RT.phoneFields();
      const pw = passwordInput('At least 8 characters', 'new-password');
      const code = h('input', { class: 'input mono', type: 'text', placeholder: 'e.g. Falcon4821', autocomplete: 'off', spellcheck: false, maxlength: 20 });
      const ref = h('input', { class: 'input mono', type: 'text', placeholder: 'Their code (optional)', autocomplete: 'off', spellcheck: false, maxlength: 20 });
      const codeField = field('Member code', code, 'An officer gave you this. Ask one if you lost it.');
      const refField = field('Invited by a member?', ref, 'Enter their code so they get credit.');
      codeField.hidden = true;
      const hasCard = segmented({
        items: [{ value: 'new', label: 'I’m new' }, { value: 'card', label: 'I have a code' }],
        value: 'new', className: 'seg-fill', ariaLabel: 'Did an officer already add you?',
        onChange: v => { codeField.hidden = v !== 'card'; refField.hidden = v === 'card'; if (v === 'card') code.focus(); }
      });
      const agree = h('input', { type: 'checkbox', class: 'check' });
      const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
      const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, 'Create account');
      const form = h('form', { class: 'stack', novalidate: true },
        field('Name', name),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade),
        field('Email', email),
        phoneF.el,
        field('Password', pw),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Did an officer already add you to the roster?'), hasCard),
        codeField, refField,
        h('label', { class: 'check-row' }, agree, h('span', null, 'I understand my name and Bites will show on the program leaderboard, which only members can see.')),
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
        const withCard = hasCard.getValue() === 'card';
        const c = code.value.trim();
        if (n.length < 2) return fail('Enter your name.');
        if (!g) return fail('Pick your grade.');
        if (!/^\S+@\S+\.\S+$/.test(em)) return fail('Enter a real email address.');
        const pe = phoneF.error();
        if (pe) return fail(pe);
        if (p.length < 8) return fail('Use a password with at least 8 characters.');
        if (withCard && !/^[A-Za-z]+\d{4}$/.test(c)) return fail('Member codes look like a word plus 4 numbers, e.g. Falcon4821.');
        if (!agree.checked) return fail('Check the box about the leaderboard to continue.');
        busy(submit, async () => {
          const meta = { rt_signup: true, full_name: n, grade: g, phone: phoneF.value(), whatsapp: phoneF.whatsapp() };
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

    function forgotModal() {
      const ok = h('button', { class: 'btn btn-primary', type: 'button' }, 'Got it');
      const m = modal({
        title: 'Forgot your password?',
        subtitle: 'Ask any officer. They can set a new password for you, then you can log in and change it from your profile.',
        body: h('p', { class: 'muted' }, 'Tell them the email you signed up with.'),
        actions: [ok]
      });
      ok.addEventListener('click', () => m.close());
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
    const newPane = h('div', { class: 'stack' },
      field('Name', name),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Grade'), grade),
      field('Invited by a member?', ref, 'Enter their code so they get credit.'),
      h('label', { class: 'check-row' }, agree, h('span', null, 'I understand my name and Bites will show on the members-only leaderboard.')));
    const cardPane = h('div', { class: 'stack' }, field('Member code', code, 'An officer gave you this. Lost it? Ask one.'));
    const phoneF = RT.phoneFields({ phone: meta.phone || '', whatsapp: !!meta.whatsapp });

    const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'button' });
    const panes = h('div');
    let mode = startMode;
    function show(m) {
      mode = m;
      clear(panes).appendChild(m === 'new' ? newPane : cardPane);
      panes.firstChild.classList.add('form-in');
      submit.textContent = m === 'new' ? 'Join the program' : 'Link my account';
    }
    const seg = segmented({ items: [{ value: 'new', label: 'I’m new' }, { value: 'card', label: 'I have a code' }], value: mode, className: 'seg-fill', onChange: show });

    submit.addEventListener('click', () => busy(submit, async () => {
      err.hidden = true;
      try {
        if (mode === 'new') {
          if (name.value.trim().length < 2) throw new Error('Enter your name.');
          if (!grade.getValue()) throw new Error('Pick your grade.');
          if (!agree.checked) throw new Error('Check the box about the leaderboard to continue.');
          if (phoneF.error()) throw new Error(phoneF.error());
          await api.register(name.value.trim(), grade.getValue(), ref.value.trim(), phoneF.value(), phoneF.whatsapp());
          toast('You’re in. Welcome to the Tank.', 'success');
        } else {
          if (!code.value.trim()) throw new Error('Enter the member code an officer gave you.');
          if (phoneF.error()) throw new Error(phoneF.error());
          const me = await api.claim(code.value.trim());
          await api.updateProfile(me.name, me.grade || '', phoneF.value(), phoneF.whatsapp());
          toast('You’re linked. Welcome back to the Tank.', 'success');
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
        seg, panes, phoneF.el, err, submit,
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
    // Tidy up anything left in the query string.
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
