// Sponsors: the public sign-up page (#/sponsor), the sponsor's own dashboard (#/sponsor/dashboard), and the officers'
// Sponsors tab. Sponsor logins are separate from member logins: they use /api/sponsor and their own saved token.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, segmented, busy, friendly, confirmDialog, fmtDate } = RT;
  const cfg = window.RT_CONFIG.sponsor;
  const S = RT.state;
  const KEY = 'rt_sponsor_v1';
  const ENDPOINT = '/api/sponsor';

  // ---------------- session + server calls ----------------
  const store = {
    get() {
      try {
        const s = JSON.parse(localStorage.getItem(KEY) || 'null');
        if (s && s.token && s.expires_at * 1000 > Date.now()) return s;
      } catch (e) { /* storage blocked */ }
      return null;
    },
    set(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify({ token: s.token, expires_at: s.expires_at })); else localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  };

  async function call(action, body = {}) {
    const s = store.get();
    let res;
    try {
      res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, s ? { Authorization: 'Bearer ' + s.token } : {}),
        body: JSON.stringify(Object.assign({ action }, body))
      });
    } catch (e) { throw new Error('Can’t reach Ridge Tank right now. Check your internet and try again.'); }
    let out = null;
    try { out = await res.json(); } catch (e) { /* not json */ }
    if (!out) throw new Error('Something went wrong. Try again in a moment.');
    if (out.error) {
      if (out.error.code === 'signed_out') { store.set(null); RT.go('sponsor'); }
      const err = new Error(out.error.message || 'Something went wrong.');
      err.code = out.error.code;
      throw err;
    }
    return out.data;
  }
  RT.sponsorSignedIn = () => !!store.get();

  // The confirmation email's link logs the sponsor in the first time: take the session from the URL and wipe it.
  try {
    const m = /[?&]confirmed=auto&s=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (m) {
      const s = JSON.parse(atob(m[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (s && s.token && s.expires_at * 1000 > Date.now()) { store.set(s); RT.sponsorAutoLogin = true; }
      history.replaceState(null, '', location.pathname + (RT.sponsorAutoLogin ? '#/sponsor/dashboard' : '#/sponsor/login'));
    }
  } catch (e) { /* bad link: the normal log in page still works */ }

  const meetingLabel = v => { if (v === '2026-11-13') v = '2026-11-19'; /* sign-ups made before the date moved */ const m = cfg.meetings.find(x => x.value === v); return m ? m.label + (m.note ? ' · ' + m.note : '') : 'Any meeting'; };
  const levelOf = v => cfg.levels.find(x => x.value === v) || cfg.levels[0];
  const catOf = level => cfg.categories.find(c => c.value === levelOf(level).cat) || cfg.categories[0];
  const catByValue = v => cfg.categories.find(c => c.value === v) || cfg.categories[0];
  const spotTag = (c, spots) => {
    const sp = c.spots && spots && spots[c.value];
    if (!sp) return null;
    return h('span', { class: 'sp-spots mono' + (sp.left ? '' : ' out') }, sp.left ? sp.left + ' of ' + sp.total + ' spot' + (sp.total === 1 ? '' : 's') + ' left' : 'Sold out');
  };
  // The 4 category cards. A sold-out category can't be picked (unless it's already theirs).
  function categoryCards(value, spots, onPick) {
    let cur = value;
    const grid = h('div', { class: 'sp-cats', role: 'radiogroup', 'aria-label': 'Choose a sponsorship' });
    const cards = cfg.categories.map(c => {
      const sp = c.spots && spots && spots[c.value];
      const out = !!(sp && !sp.left && c.value !== value);
      const el = h('button', { class: 'sp-cat' + (out ? ' out' : ''), type: 'button', role: 'radio', disabled: out, 'data-cat': c.value },
        c.badge ? h('span', { class: 'sp-badge mono' }, c.badge) : null,
        h('span', { class: 'sp-cat-ico' }, icon(c.icon, 22)),
        h('strong', { class: 'sp-cat-name' }, c.label),
        h('span', { class: 'sp-cat-price' }, c.price),
        h('span', { class: 'muted small' }, c.text),
        spotTag(c, spots));
      el.addEventListener('click', () => { cur = c.value; paint(); if (onPick) onPick(cur); });
      return el;
    });
    function paint() { cards.forEach((el, i) => el.setAttribute('aria-checked', String(cfg.categories[i].value === cur))); }
    grid.append(...cards);
    paint();
    const wrap = h('div', { class: 'stack-sm' }, grid, h('p', { class: 'sp-inkind muted small' }, icon('info', 14), cfg.inkindNote));
    wrap.getValue = () => cur;
    return wrap;
  }
  let spotsCache = null;
  async function loadSpots() {
    try { spotsCache = await call('spots'); } catch (e) { spotsCache = spotsCache || null; }
    return spotsCache;
  }
  const STATUS = {
    pending: { label: 'Under review', cls: 'wait' },
    approved: { label: 'Approved partner', cls: 'ok' },
    declined: { label: 'Not this time', cls: 'no' }
  };
  const statusPill = st => { const s = STATUS[st] || STATUS.pending; return h('span', { class: 'status-pill sp-status ' + s.cls }, s.label); };

  // ---------------- logo: shrink in the browser, keep see-through backgrounds ----------------
  function readLogo(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Pick a logo first.'));
      if (!/^image\/(png|jpeg|webp|svg\+xml)$/.test(file.type)) return reject(new Error('Use a PNG, JPG, WebP or SVG logo.'));
      if (file.size > 5 * 1024 * 1024) return reject(new Error('That logo is over 5 MB. Try a smaller file.'));
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        const w = img.naturalWidth || 600, hgt = img.naturalHeight || 600;
        const k = Math.min(1, 640 / Math.max(w, hgt));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(w * k));
        c.height = Math.max(1, Math.round(hgt * k));
        const g = c.getContext('2d');
        g.drawImage(img, 0, 0, c.width, c.height);
        let out = c.toDataURL('image/png');                       // keeps a see-through background
        if (out.length > 600000) out = c.toDataURL('image/webp', 0.9);
        if (out.length > 600000 || !/^data:image\/(png|webp)/.test(out)) {
          // Last resort: JPG on white (JPG can't be see-through).
          const w2 = document.createElement('canvas');
          w2.width = c.width; w2.height = c.height;
          const g2 = w2.getContext('2d');
          g2.fillStyle = '#fff'; g2.fillRect(0, 0, w2.width, w2.height); g2.drawImage(c, 0, 0);
          out = w2.toDataURL('image/jpeg', 0.85);
        }
        resolve(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('We couldn’t read that picture. Try a PNG or JPG.')); };
      img.src = url;
    });
  }

  // A logo picker: preview box + button. getValue() gives undefined (unchanged), null (removed) or a data: address.
  function logoPicker(current) {
    let value; // undefined = untouched
    const file = h('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/svg+xml', hidden: true });
    const box = h('div', { class: 'sp-logo-box' });
    const removeBtn = h('button', { class: 'link-btn', type: 'button' }, 'Remove');
    const pickBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => file.click() }, icon('plus', 15), 'Upload logo');
    function show(src) {
      clear(box).appendChild(src ? h('img', { src, alt: 'Your logo' }) : h('span', { class: 'muted small' }, 'No logo yet'));
      removeBtn.hidden = !src;
      pickBtn.lastChild.textContent = src ? 'Change logo' : 'Upload logo';
    }
    removeBtn.addEventListener('click', () => { value = null; show(null); });
    file.addEventListener('change', async () => {
      try { value = await readLogo(file.files[0]); show(value); } catch (e) { toast(e.message, 'error'); }
      file.value = '';
    });
    show(current || null);
    const el = h('div', { class: 'sp-logo-pick' }, box, h('div', { class: 'stack-sm' }, pickBtn, removeBtn,
      h('span', { class: 'hint' }, 'PNG with a see-through background looks best on posters.')), file);
    return { el, getValue: () => value };
  }

  // Pick-one cards (how they want to help, which meeting).
  function choiceCards(items, value, render) {
    let cur = value;
    const wrap = h('div', { class: 'sp-choices', role: 'radiogroup' });
    const btns = items.map(it => {
      const b = h('button', { class: 'sp-choice', type: 'button', role: 'radio', 'aria-checked': String(it.value === cur) }, render(it));
      b.addEventListener('click', () => { cur = it.value; btns.forEach((x, i) => x.setAttribute('aria-checked', String(items[i].value === cur))); });
      return b;
    });
    wrap.append(...btns);
    wrap.getValue = () => cur;
    return wrap;
  }
  const meetingCards = v => choiceCards(cfg.meetings, v, m => [h('strong', null, m.label), h('span', { class: 'muted small' }, m.note || '')]);

  const input = (props) => h('input', Object.assign({ class: 'input' }, props));
  function pwInput(placeholder, autocomplete) {
    const el = input({ type: 'password', placeholder, autocomplete, minlength: 8 });
    const t = h('button', { class: 'input-action', type: 'button', 'aria-label': 'Show password' }, icon('eye', 18));
    t.addEventListener('click', () => { const show = el.type === 'password'; el.type = show ? 'text' : 'password'; clear(t).appendChild(icon(show ? 'eyeOff' : 'eye', 18)); });
    const wrap = h('div', { class: 'input-wrap' }, el, t);
    wrap.input = el;
    return wrap;
  }
  const errLine = () => h('p', { class: 'form-error', role: 'alert', hidden: true });
  const showErr = (el, m) => { el.textContent = m; el.hidden = false; };

  // ---------------- public page: pitch + sign up / log in ----------------
  function publicPage(root, t) {
    const go = () => { const f = document.getElementById('sponsor-form'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    const hero = h('section', { class: 'sp-hero reveal' },
      h('span', { class: 'sp-kicker mono' }, icon('fin', 14), 'Sponsor Ridge Tank'),
      h('h1', { class: 'sp-title' }, 'Be the name they remember when they start their first company.'),
      h('p', { class: 'sp-lead' }, 'In a few years, these students will be hiring, building and buying. Ridge Tank is where Mountain Ridge High School students build real startups and pitch them Shark Tank-style. Back them now, and your business grows up with them.'),
      h('div', { class: 'sp-cta-row' },
        h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: go }, 'Sponsor a meeting for $100'),
        h('span', { class: 'muted small' }, 'Your $100 pays for the food, prizes and activities at one full meeting.')),
      h('div', { class: 'sp-backed' },
        h('span', { class: 'muted small' }, 'Already backing us'),
        h('strong', null, 'Lund Mortgage Team'), h('strong', null, 'Sylvan Learning')),
      h('div', { class: 'sp-hero-stats' },
        stat('49', 'students at meeting one'),
        stat('~$2', 'per student'),
        stat('1', 'meeting, fully funded')));

    const perks = h('section', { class: 'sp-perks reveal', style: { '--i': 1 } },
      cfg.perks.map(p => h('div', { class: 'card sp-perk' }, h('span', { class: 'sp-perk-ico' }, icon(p.icon, 20)), h('h3', null, p.title), h('p', { class: 'muted' }, p.text))));

    const formHost = h('div');
    const seg = segmented({
      items: [{ value: 'signup', label: 'Become a sponsor' }, { value: 'login', label: 'Sponsor log in' }],
      value: t.mode === 'login' ? 'login' : 'signup', className: 'seg-fill', ariaLabel: 'Sign up or log in',
      onChange: v => show(v)
    });
    const card = h('section', { class: 'card sp-form-card reveal', style: { '--i': 2 }, id: 'sponsor-form' }, seg, formHost);
    root.append(hero, perks, card,
      h('p', { class: 'muted small center sp-foot' }, 'Questions? Email ', h('a', { href: 'mailto:' + cfg.contact }, cfg.contact), '. Payments are handled securely by Stripe, and our students never handle cash.'));

    // Back from Stripe after the pay-first sign-up (not logged in yet): confirm the payment with Stripe now,
    // so the dashboard already says PAID the first time they open it.
    (function confirmOnReturn() {
      const cs = (location.hash.match(/[?&]cs=(cs_[A-Za-z0-9_]+)/) || [])[1];
      if (!cs || !/[?&]paid=1/.test(location.hash)) return;
      call('confirmPay', { session: cs }).then(out => {
        if (out && out.recorded) toast('Paid. Thank you! Confirm your email and your dashboard will already show it as paid.', 'success', 9000);
      }).catch(() => {});
    })();
    if (t.confirmed === '1') toast('Email confirmed. Log in to open your dashboard.', 'success', 5000);
    if (t.confirmed === 'expired') toast('That link expired. Log in and we’ll help you send a new one.', 'error', 5000);
    show(seg.getValue());
    loadSpots();

    function show(m) {
      seg.setValue(m);
      clear(formHost).appendChild(m === 'login' ? loginForm() : signupForm());
    }

    function loginForm() {
      const email = input({ type: 'email', placeholder: 'you@yourbusiness.com', autocomplete: 'email' });
      const pw = pwInput('Your password', 'current-password');
      const err = errLine();
      const extra = h('div', { class: 'row center' });
      const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, 'Open my dashboard');
      const form = h('form', { class: 'stack', novalidate: true }, RT.field('Email', email), RT.field('Password', pw), err, extra, submit,
        h('p', { class: 'muted small center' }, 'Forgot your password? Email ', h('a', { href: 'mailto:' + cfg.contact }, cfg.contact), ' and we’ll reset it.'));
      form.addEventListener('submit', e => {
        e.preventDefault();
        err.hidden = true;
        clear(extra);
        if (!email.value.trim() || !pw.input.value) return showErr(err, 'Enter your email and password.');
        busy(submit, async () => {
          try {
            const s = await call('signIn', { email: email.value.trim(), password: pw.input.value });
            store.set(s);
            toast('Welcome back, ' + (s.account.contact_name || '').split(' ')[0] + '!', 'success');
            RT.go('sponsor/dashboard');
          } catch (ex) {
            showErr(err, ex.message);
            if (ex.code === 'email_not_confirmed') {
              const em = email.value.trim();
              extra.appendChild(h('button', { class: 'link-btn', type: 'button', onclick: ev => busy(ev.currentTarget, async () => { await call('resend', { email: em }); toast('Sent. Check your inbox and spam.', 'success'); }) }, 'Send the confirmation email again'));
            }
          }
        });
      });
      return form;
    }

    // One question at a time. Each step slides in, and the bar at the top shows how far along they are.
    function signupForm() {
      const business = input({ type: 'text', placeholder: 'e.g. Zoyo Frozen Yogurt', autocomplete: 'organization', maxlength: 80 });
      const name = input({ type: 'text', placeholder: 'First and last name', autocomplete: 'name', maxlength: 60 });
      const email = input({ type: 'email', placeholder: 'you@yourbusiness.com', autocomplete: 'email' });
      const phone = input({ type: 'tel', placeholder: '(602) 555-0142', autocomplete: 'tel', maxlength: 25 });
      const site = input({ type: 'url', placeholder: 'yourbusiness.com', autocomplete: 'url', maxlength: 200 });
      // Built when the step is first shown, so the spots count has had time to load.
      let picker = null;
      const level = { getValue: () => picker ? picker.getValue() : 'meeting', el: () => picker || (picker = categoryCards('meeting', spotsCache)) };
      const meeting = meetingCards(cfg.meetings[0].value);
      const isMeeting = () => level.getValue() === 'meeting';
      const logo = logoPicker(null);
      const note = h('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Anything we should know? (optional)' });
      const pw = pwInput('At least 8 characters', 'new-password');
      const agree = h('input', { type: 'checkbox', class: 'check' });
      const err = errLine();

      const first = () => (name.value.trim().split(/\s+/)[0] || '');
      const steps = [
        { title: 'Who are we thanking?', sub: 'Your business name goes on the posters. Your email is your login.', body: () => [RT.field('Business name', business), RT.field('Email', email)], focus: business,
          check: () => business.value.trim().length < 2 ? 'Enter your business name.' : !/^\S+@\S+\.\S+$/.test(email.value.trim()) ? 'Enter a real email address.' : '' },
        { title: 'How would you like to back us?', sub: 'Pick one. You pay on the next screen.', body: () => [level.el()], wide: true,
          check: () => { const c = catByValue(level.getValue()); const sp = c.spots && spotsCache && spotsCache[c.value]; return sp && !sp.left ? 'That one is sold out. Pick another.' : ''; } },
        { title: 'Pick a password, then pay.', sub: 'Logo, phone and meeting date come after payment, from your dashboard.', body: () => [RT.field('Password', pw),
          h('label', { class: 'check-row' }, agree, h('span', null, 'I understand I’ll pay on the next screen, by card through Stripe.'))],
          focus: pw.input, last: true, check: () => pw.input.value.length < 8 ? 'Use a password with at least 8 characters.' : !agree.checked ? 'Check the box to continue.' : '' }
      ];
      let i = 0;
      const bar = h('div', { class: 'sp-bar', role: 'progressbar', 'aria-valuemin': 1, 'aria-valuemax': steps.length }, h('span', { class: 'sp-bar-fill' }));
      const count = h('span', { class: 'sp-count mono' });
      const stage = h('div', { class: 'sp-stage' });
      const back = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Back');
      const next = h('button', { class: 'btn btn-primary btn-lg sp-next', type: 'submit' }, 'Continue');
      const skip = h('button', { class: 'link-btn', type: 'button' }, 'Skip for now');
      const form = h('form', { class: 'sp-wiz', novalidate: true }, h('div', { class: 'sp-wiz-top' }, count, bar), stage, err, h('div', { class: 'sp-nav' }, back, skip, next));

      function draw(dir) {
        const st = steps[i];
        err.hidden = true;
        const live = steps.filter(x => !(x.skip && x.skip()));
        const at = live.indexOf(st) + 1;
        count.textContent = 'Step ' + at + ' of ' + live.length;
        bar.setAttribute('aria-valuenow', at);
        bar.setAttribute('aria-valuemax', live.length);
        bar.firstChild.style.width = Math.round((at / live.length) * 100) + '%';
        back.hidden = i === 0;
        skip.hidden = !st.optional;
        next.textContent = st.last ? 'Pay now' : 'Continue';
        const title = typeof st.title === 'function' ? st.title() : st.title;
        const panel = h('div', { class: 'sp-panel' + (st.wide ? ' wide' : '') + (dir ? ' from-' + dir : '') },
          h('h2', { class: 'sp-q' }, title), h('p', { class: 'muted sp-sub' }, st.sub), ...st.body());
        stage.replaceChildren(panel);
        if (st.focus && window.innerWidth > 720) setTimeout(() => st.focus.focus({ preventScroll: true }), 220);
        if (dir) form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      const step = d => { do { i += d; } while (steps[i] && steps[i].skip && steps[i].skip()); };
      back.addEventListener('click', () => { if (i > 0) { step(-1); draw('back'); } });
      skip.addEventListener('click', () => { step(1); draw('fwd'); });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const st = steps[i];
        const msg = st.check();
        if (msg) return showErr(err, msg);
        if (!st.last) { step(1); draw('fwd'); return; }
        for (let k = 0; k < steps.length; k++) { if (steps[k].skip && steps[k].skip()) continue; const m = steps[k].check(); if (m) { i = k; draw('back'); return showErr(err, m); } }
        const em = email.value.trim();
        busy(next, async () => {
          try {
            const out = await call('signUp', {
              email: em, password: pw.input.value, business: business.value, contact_name: business.value.trim(),
              level: catByValue(level.getValue()).plans[0], meeting: 'any'
            });
            // Payment comes before login: go straight to the Stripe page. The confirmation email is already on its way.
            if (out.payUrl) { if (!out.confirm) store.set(out); location.href = out.payUrl; return; }
            if (out.confirm) { clear(formHost).appendChild(checkEmail(out.email)); return; }
            store.set(out);
            toast('You’re in! Welcome to Ridge Tank.', 'success');
            RT.go('sponsor/dashboard');
          } catch (ex) { showErr(err, ex.message); }
        });
      });
      draw(null);
      return form;
    }

    function checkEmail(em) {
      const again = h('button', { class: 'btn btn-ghost btn-block', type: 'button' }, 'Send the email again');
      again.addEventListener('click', () => busy(again, async () => { await call('resend', { email: em }); toast('Sent. Check your inbox and spam.', 'success'); }));
      return h('div', { class: 'stack center-text sp-check' },
        h('span', { class: 'sp-perk-ico lg' }, icon('mail', 26)),
        h('h2', { class: 'h2' }, 'Check your email'),
        h('p', { class: 'muted' }, 'We sent a link to ', h('strong', null, em), '. Tap it to confirm, then log in to see your dashboard.'),
        again);
    }
    return {};
  }

  function stat(n, label) { return h('div', { class: 'sp-stat' }, h('span', { class: 'sp-stat-n' }, n), h('span', { class: 'muted small' }, label)); }

  // ---------------- dashboard ----------------
  const TABS = [
    { value: 'overview', label: 'Overview', icon: 'home' },
    { value: 'profile', label: 'Business info', icon: 'edit' },
    { value: 'payments', label: 'Payments', icon: 'card' }
  ];

  function dashboard(root, t) {
    let acct = null;
    let tab = t.tab;
    const head = h('div', { class: 'sp-dash-head reveal' }, RT.skeleton(2));
    const seg = segmented({ items: TABS, value: tab, className: 'admin-seg sp-tabs', ariaLabel: 'Sponsor dashboard', onChange: v => RT.go('sponsor/dashboard/' + v) });
    const body = h('div', { class: 'sp-dash-body' }, h('div', { class: 'card' }, RT.skeleton(4)));
    root.append(head, h('div', { class: 'admin-nav reveal', style: { '--i': 1 } }, seg), body);

    function drawHead() {
      clear(head).append(
        h('div', { class: 'sp-dash-logo' }, acct.logo ? h('img', { src: acct.logo, alt: acct.business + ' logo' }) : h('span', null, (acct.business || '?').slice(0, 1).toUpperCase())),
        h('div', { class: 'min0 grow' },
          h('span', { class: 'sp-kicker mono' }, 'Sponsor dashboard'),
          h('h1', { class: 'page-title ellipsis' }, acct.business),
          h('div', { class: 'row sp-dash-meta' }, statusPill(acct.status), h('span', { class: 'muted small' }, acct.contact_name + ' · ' + acct.email))),
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: signOut }, icon('logout', 15), 'Log out'));
    }

    function show(name) {
      tab = TABS.some(x => x.value === name) ? name : 'overview';
      seg.setValue(tab);
      const pane = h('div', { class: 'stack view-pane' });
      clear(body).appendChild(pane);
      if (tab === 'profile') profilePane(pane);
      else if (tab === 'payments') paymentsPane(pane);
      else overviewPane(pane);
    }

    function overviewPane(pane) {
      const lvl = levelOf(acct.level);
      const c = catOf(acct.level);
      const approved = acct.status === 'approved';
      const pay = acct.pay || {};
      const paid = (pay.payments || []).length > 0 || acct.subscribed;
      const todo = [];
      if (!acct.logo) todo.push({ t: 'Add your logo', n: 'It goes on the posters.', go: 'profile' });
      if (!acct.phone) todo.push({ t: 'Add a phone number', n: 'So we can reach you on meeting day.', go: 'profile' });
      if (c.value === 'meeting' && (!acct.meeting || acct.meeting === 'any')) todo.push({ t: 'Pick your meeting', n: 'Choose which one we feature you at.', go: 'profile' });
      if (acct.message) pane.appendChild(h('div', { class: 'card sp-message' }, h('span', { class: 'card-label' }, 'Message from Ridge Tank'), h('p', null, acct.message)));
      const rows = [
        ['Sponsorship', c.label],
        ['Plan', lvl.label],
        c.value === 'meeting' ? ['Meeting', meetingLabel(acct.meeting)] : null,
        ['Amount', lvl.price]
      ].filter(Boolean);
      const status = acct.level === 'inkind' ? 'In-kind' : paid ? 'Paid' : 'Payment due';
      pane.appendChild(h('section', { class: 'sp-receipt' },
        h('div', { class: 'sp-receipt-top' },
          h('div', null, h('span', { class: 'card-label' }, 'Receipt'), h('h2', { class: 'sp-receipt-h' }, lvl.price.replace(' once', ''))),
          h('span', { class: 'sp-receipt-stamp ' + (paid ? 'is-paid' : 'is-due') }, status)),
        h('dl', { class: 'sp-receipt-rows' }, rows.map(r => [h('dt', null, r[0]), h('dd', null, r[1])])),
        !paid && acct.level !== 'inkind'
          ? h('div', { class: 'sp-receipt-pay' }, h('p', { class: 'muted small' }, lvl.pay), h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => RT.go('sponsor/dashboard/payments') }, icon('card', 16), 'Pay ' + lvl.price.replace(' once', '')))
          : h('p', { class: 'sp-receipt-thanks' }, paid ? 'Thank you. You’re backing the next founders.' : lvl.pay)));
      if (todo.length) pane.appendChild(h('section', { class: 'card sp-todo' },
        h('span', { class: 'card-label' }, 'Finish up'),
        todo.map(x => h('button', { class: 'sp-todo-row', type: 'button', onclick: () => RT.go('sponsor/dashboard/' + x.go) }, h('span', null, h('strong', null, x.t), h('span', { class: 'muted small' }, ' ' + x.n)), icon('chevronRight', 16)))));
      pane.appendChild(h('div', { class: 'sp-overview' },
        h('section', { class: 'card' },
          h('span', { class: 'card-label' }, 'What happens next'),
          h('p', null, !approved ? 'We’re looking over your sign-up and will email you shortly.' : 'You’re an official partner. We put your name on the posters before the meeting, and send you photos from the day.')),
        h('section', { class: 'card' },
          h('span', { class: 'card-label' }, 'What you get'),
          h('ul', { class: 'sp-get' }, (lvl.gets || cfg.perks.map(p => p.title)).map(x => h('li', null, icon('check', 15, 'accent'), h('span', null, x)))))));
    }

    function profilePane(pane) {
      const business = input({ type: 'text', value: acct.business, maxlength: 80 });
      const name = input({ type: 'text', value: acct.contact_name, maxlength: 60 });
      const phone = input({ type: 'tel', value: acct.phone || '', maxlength: 25 });
      const site = input({ type: 'url', value: acct.website || '', maxlength: 200, placeholder: 'yourbusiness.com' });
      const startCat = catOf(acct.level).value;
      const meetingField = h('div', { class: 'field' }, h('span', { class: 'label' }, 'Which meeting'));
      const level = categoryCards(startCat, (acct.pay || {}).spots, v => { meetingField.hidden = v !== 'meeting'; });
      const meeting = meetingCards(acct.meeting);
      meetingField.appendChild(meeting);
      meetingField.hidden = startCat !== 'meeting';
      const logo = logoPicker(acct.logo);
      const err = errLine();
      const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save changes');
      const form = h('form', { class: 'card stack', novalidate: true },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Business info')),
        h('div', { class: 'form-grid' }, RT.field('Business name', business), RT.field('Your name', name)),
        h('div', { class: 'form-grid' }, RT.field('Phone', phone), RT.field('Website', site)),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Logo'), logo.el),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Sponsorship category'), level),
        meetingField,
        err, h('div', { class: 'row' }, save));
      form.addEventListener('submit', e => {
        e.preventDefault();
        err.hidden = true;
        const changes = { business: business.value, contact_name: name.value, phone: phone.value, website: site.value, meeting: meeting.getValue() };
        if (level.getValue() !== startCat) changes.level = catByValue(level.getValue()).plans[0];
        const lg = logo.getValue();
        if (lg !== undefined) changes.logo = lg;
        busy(save, async () => {
          try { await call('update', changes); acct = await call('me'); drawHead(); toast('Saved', 'success'); } catch (ex) { showErr(err, ex.message); }
        });
      });

      const cur = pwInput('Current password', 'current-password');
      const next = pwInput('At least 8 characters', 'new-password');
      const perr = errLine();
      const pbtn = h('button', { class: 'btn btn-ghost', type: 'submit' }, 'Change password');
      const pform = h('form', { class: 'card stack', novalidate: true },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Password')),
        h('div', { class: 'form-grid' }, RT.field('Current password', cur), RT.field('New password', next)), perr, h('div', { class: 'row' }, pbtn));
      pform.addEventListener('submit', e => {
        e.preventDefault();
        perr.hidden = true;
        if (next.input.value.length < 8) return showErr(perr, 'Use a password with at least 8 characters.');
        busy(pbtn, async () => {
          try { await call('password', { current: cur.input.value, password: next.input.value }); cur.input.value = next.input.value = ''; toast('Password changed', 'success'); }
          catch (ex) { showErr(perr, ex.message); }
        });
      });
      pane.append(form, pform);
    }

    const money = c => '$' + (c / 100).toFixed(c % 100 ? 2 : 0);
    const KIND = { deposit: 'First half', balance: 'Final half', monthly: 'Monthly payment', meeting: 'Meeting sponsor', hoodie: 'Hoodie sponsor', event: 'Event sponsor' };
    function paymentsPane(pane) {
      const pay = acct.pay || { configured: false, payments: [], options: [] };
      const cat = catOf(acct.level);
      const paidKinds = new Set(pay.paidKinds || pay.payments.map(x => x.kind));
      const toStripe = async (kind, btn) => busy(btn, async () => {
        try { const out = await call('pay', { kind }); location.href = out.url; }
        catch (ex) { toast(ex.message, 'error'); }
      });
      // Switch to another plan in the same category, then go straight to Stripe.
      const choose = (plan, btn) => busy(btn, async () => {
        try {
          if (plan !== acct.level) { await call('update', { level: plan }); acct = await call('me'); }
          const o = (acct.pay.options || [])[0];
          if (!o) { show('payments'); return toast(acct.pay.soldOut ? 'Sorry, that just sold out.' : 'Nothing is due on that plan.', 'error'); }
          const out = await call('pay', { kind: o.kind });
          location.href = out.url;
        } catch (ex) { toast(ex.message, 'error'); }
      });

      pane.appendChild(h('section', { class: 'card sp-pay-card stack' },
        h('div', { class: 'row' }, h('span', { class: 'sp-cat-ico' }, icon(cat.icon, 22)),
          h('div', { class: 'grow min0' }, h('span', { class: 'card-label' }, 'Your category'), h('h3', null, cat.label)),
          h('button', { class: 'link-btn', type: 'button', onclick: () => RT.go('sponsor/dashboard/profile') }, 'Change')),
        spotTag(cat, pay.spots)));

      let note = '';
      if (acct.level === 'inkind') note = 'You’re giving snacks, drinks, or gift cards, so there’s nothing to pay here. We’ll set up a drop-off with you.';
      else if (acct.status !== 'approved') note = 'Payments aren’t open for this account. Email us and we’ll sort it out.';
      else if (!pay.configured) note = 'Card payments aren’t switched on yet. Email us at ' + cfg.contact + ' and we’ll sort it out.';
      if (note) pane.appendChild(h('div', { class: 'card' }, h('p', { class: 'muted' }, note)));
      else {
        const plans = h('div', { class: 'sp-plans' });
        cat.plans.forEach(id => {
          const l = levelOf(id);
          const current = id === acct.level;
          const isPaid = l.monthly ? current && acct.subscribed : paidKinds.has(id);
          const opt = current ? (pay.options || []).find(o => o.kind === id || o.kind === 'monthly' || o.kind === 'balance') : null;
          let action;
          if (isPaid) action = h('span', { class: 'sp-paid' }, icon('check', 15), l.monthly ? 'Active. Thank you!' : 'Paid. Thank you!');
          else if (current && pay.soldOut) action = h('span', { class: 'sp-spots out mono' }, 'Sold out');
          else if (current && !opt && paidKinds.has('deposit')) action = h('span', { class: 'muted small' }, acct.balance_due ? '' : 'First half received. We’ll open the final $50 after your meeting.');
          else if (acct.subscribed && !current) action = h('span', { class: 'muted small' }, 'Use “Manage billing” to change your monthly plan first.');
          else {
            const btn = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, icon('card', 16),
              opt && opt.kind === 'balance' ? 'Pay final $50' : l.monthly ? 'Start · ' + l.price : 'Pay ' + l.price.replace(' once', ''));
            btn.addEventListener('click', () => opt ? toStripe(opt.kind, btn) : choose(id, btn));
            action = btn;
          }
          plans.appendChild(h('div', { class: 'sp-plan' + (current ? ' featured' : '') },
            l.badge ? h('span', { class: 'sp-badge mono' }, l.badge) : null,
            h('strong', { class: 'sp-plan-name' }, l.label),
            h('span', { class: 'sp-plan-price' }, l.big || l.price, l.unit ? h('span', { class: 'sp-plan-unit' }, ' ' + l.unit) : null),
            h('span', { class: 'sp-plan-per small' }, l.per || ''),
            h('ul', { class: 'sp-gets small' }, (l.gets || []).map(g => h('li', null, icon('check', 13, 'accent'), g))),
            h('span', { class: 'sp-pay small' }, l.pay),
            action));
        });
        pane.appendChild(h('section', { class: 'card stack' },
          h('span', { class: 'card-label' }, cat.plans.length > 1 ? 'Pick your plan' : 'Your plan'), plans,
          h('p', { class: 'sp-inkind muted small' }, icon('info', 14), cfg.inkindNote)));
      }
      if (pay.canManage) {
        const m = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Manage billing and receipts');
        m.addEventListener('click', () => busy(m, async () => { try { const out = await call('portal'); location.href = out.url; } catch (ex) { toast(ex.message, 'error'); } }));
        pane.appendChild(h('div', { class: 'row' }, m));
      }
      pane.appendChild(h('p', { class: 'muted small' }, 'Payments are handled securely by Stripe. We never see or store your card.'));
      if (pay.payments.length) {
        pane.appendChild(h('section', { class: 'card stack-sm' }, h('span', { class: 'card-label' }, 'Payment history'),
          h('ul', { class: 'sp-history' }, pay.payments.map(x => h('li', null, h('span', null, KIND[x.kind] || 'Payment'), h('span', { class: 'muted small' }, fmtDate(x.created_at, { month: 'short', day: 'numeric', year: 'numeric' })), h('strong', null, money(x.amount_cents)))))));
      }
      if (/[?&]paid=1/.test(location.hash) && !pane.dataset.thanked) {
        pane.dataset.thanked = '1';
        if (pay.payments.length) toast('Paid. Thank you for backing Ridge Tank!', 'success', 6000);
        else { toast('Thanks! Checking with Stripe for your payment…', 'success', 5000); setTimeout(() => { if (pane.isConnected) load(); }, 4000); }
      }
    }

    async function load() {
      try {
        // Back from Stripe? The address carries the session id; the server confirms it with Stripe right away.
        const cs = (location.hash.match(/[?&]cs=(cs_[A-Za-z0-9_]+)/) || [])[1];
        acct = await call('me', cs ? { session: cs } : {});
        if (RT.sponsorAutoLogin) { RT.sponsorAutoLogin = false; toast('Email confirmed. Welcome, ' + (acct.contact_name || '').split(' ')[0] + '!', 'success', 5000); }
        drawHead();
        show(tab);
      } catch (e) {
        if (e.code !== 'signed_out') clear(body).appendChild(h('div', { class: 'card' }, h('p', { class: 'form-error' }, e.message)));
      }
    }
    load();
    return { update(nt) { if (acct) show(nt.tab); else tab = nt.tab; } };
  }

  function signOut() {
    store.set(null);
    toast('Logged out', 'info', 1600);
    RT.go('sponsor');
  }

  RT.views.sponsor = function (root, t) {
    const signedIn = !!store.get();
    if (t.sub === 'dashboard' && !signedIn) { setTimeout(() => RT.go('sponsor/login'), 0); return {}; }
    if (t.sub !== 'dashboard' && signedIn && t.mode !== 'login') { setTimeout(() => RT.go('sponsor/dashboard'), 0); return {}; }
    let handle = t.sub === 'dashboard' ? dashboard(root, t) : publicPage(root, t);
    let sub = t.sub;
    return {
      update(nt) {
        if (nt.sub === sub && sub === 'dashboard' && handle && handle.update) return handle.update(nt);
        RT.rerender();
      }
    };
  };

  // ---------------- officer side: Officer tools > Sponsors ----------------
  RT.adminTabs = RT.adminTabs || {};
  RT.adminTabs.sponsors = function (pane) {
    const sb = RT.sb;
    let rows = [];
    let filter = 'all';
    let pays = {};
    const list = h('div', { class: 'stack-sm' });
    const sum = h('p', { class: 'muted small' });
    const filt = segmented({
      items: [{ value: 'all', label: 'All' }, { value: 'pending', label: 'Waiting' }, { value: 'approved', label: 'Approved' }, { value: 'declined', label: 'Declined' }],
      value: 'all', ariaLabel: 'Filter sponsors', onChange: v => { filter = v; draw(); }
    });
    pane.append(
      h('div', { class: 'section-row' },
        h('div', null, h('h2', { class: 'h2' }, 'Sponsors'), h('p', { class: 'muted small' }, 'Businesses that signed up at ', h('a', { href: '#/sponsor' }, '#/sponsor'), '. Approve them before anything goes on posters.')),
        sum),
      h('div', { class: 'row sp-admin-bar' }, filt,
        h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => RT.copyText(location.origin + location.pathname + '#/sponsor', 'Link copied') }, icon('copy', 14), 'Copy sign-up link')),
      list);

    async function load() {
      list.replaceChildren(h('div', { class: 'card' }, RT.skeleton(3)));
      const r = await sb.rpc('sponsor_admin_list');
      const pr = await sb.rpc('sponsor_admin_payments');
      pays = pr.error || !pr.data ? {} : pr.data;
      if (r.error) { list.replaceChildren(h('div', { class: 'card' }, h('p', { class: 'form-error' }, friendly(r.error)))); return; }
      rows = Array.isArray(r.data) ? r.data : [];
      draw();
    }

    function draw() {
      const n = s => rows.filter(x => x.status === s).length;
      sum.textContent = rows.length + (rows.length === 1 ? ' sponsor' : ' sponsors') + ' · ' + n('pending') + ' waiting · ' + n('approved') + ' approved';
      filt.setBadge && filt.setBadge('pending', n('pending'));
      const shown = rows.filter(x => filter === 'all' || x.status === filter);
      if (!shown.length) {
        list.replaceChildren(h('div', { class: 'card empty' }, icon('coins', 26, 'muted'), h('h3', null, rows.length ? 'None here' : 'No sponsors yet'),
          h('p', { class: 'muted' }, rows.length ? 'Try another filter.' : 'Share the sign-up link with businesses you visit.')));
        return;
      }
      list.replaceChildren(...shown.map(row));
    }

    function row(x) {
      const lvl = levelOf(x.level);
      const set = (status, msg, note) => async btn => busy(btn, async () => {
        const r = await sb.rpc('sponsor_admin_set', { p_id: x.id, p_status: status, p_message: msg === undefined ? x.message : msg, p_note: note === undefined ? x.officer_note : note });
        if (r.error) { toast(friendly(r.error), 'error'); return; }
        toast(status === 'approved' ? x.business + ' approved' : status === 'declined' ? x.business + ' declined' : 'Saved', 'success');
        load();
      });
      const approve = h('button', { class: 'btn btn-primary btn-sm', type: 'button', hidden: x.status === 'approved' }, icon('check', 14), 'Approve');
      approve.addEventListener('click', () => set('approved')(approve));
      const decline = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: x.status === 'declined' }, 'Decline');
      decline.addEventListener('click', async () => { if (await confirmDialog({ title: 'Decline ' + x.business + '?', message: 'They’ll see “Not this time” on their dashboard. Add a kind note with “Notes” first if you want.', confirmText: 'Decline', danger: true })) set('declined')(decline); });
      const notes = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('edit', 14), 'Notes');
      notes.addEventListener('click', () => {
        const msg = h('textarea', { class: 'input', rows: 3, maxlength: 600, value: x.message || '', placeholder: 'e.g. Thanks! We’ll email payment details by Friday.' });
        const note = h('textarea', { class: 'input', rows: 3, maxlength: 600, value: x.officer_note || '', placeholder: 'Only officers see this.' });
        const save = h('button', { class: 'btn btn-primary', type: 'button' }, 'Save');
        const m = modal({ title: x.business, subtitle: 'Notes', body: h('div', { class: 'stack' }, RT.field('Message the sponsor sees on their dashboard', msg), RT.field('Officer note (private)', note)), actions: [save] });
        save.addEventListener('click', async () => { await set(x.status, msg.value, note.value)(save); m.close(); });
      });
      const payBtn = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', hidden: x.level === 'inkind' }, icon('card', 14), 'Payments');
      payBtn.addEventListener('click', () => paymentsModal(x));
      const del = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Delete sponsor', title: 'Delete' }, icon('trash', 15));
      del.addEventListener('click', async () => {
        if (!await confirmDialog({ title: 'Delete ' + x.business + '?', message: 'Their account and logo are removed for good.', confirmText: 'Delete', danger: true })) return;
        const r = await sb.rpc('sponsor_admin_delete', { p_id: x.id });
        if (r.error) { toast(friendly(r.error), 'error'); return; }
        load();
      });
      const logo = x.logo
        ? h('a', { class: 'sp-admin-logo', href: x.logo, download: (x.business || 'logo').replace(/[^\w-]+/g, '-').toLowerCase() + '-logo', title: 'Download logo' }, h('img', { src: x.logo, alt: x.business + ' logo' }))
        : h('div', { class: 'sp-admin-logo empty-logo', title: 'No logo yet' }, h('span', null, (x.business || '?').slice(0, 1).toUpperCase()));
      return h('div', { class: 'card sp-admin-row' },
        logo,
        h('div', { class: 'min0 grow stack-sm' },
          h('div', { class: 'row wrap' }, h('strong', { class: 'sp-admin-name' }, x.business), statusPill(x.status), x.email_confirmed ? null : h('span', { class: 'tag sm muted' }, 'email not confirmed')),
          h('div', { class: 'muted small' }, x.contact_name, ' · ', h('a', { href: 'mailto:' + x.email }, x.email), x.phone ? ' · ' + x.phone : '', x.website ? [' · ', h('a', { href: x.website, target: '_blank', rel: 'noopener noreferrer' }, x.website.replace(/^https?:\/\//, ''))] : ''),
          h('div', { class: 'small' }, h('span', { class: 'accent' }, catOf(x.level).label + ': ' + lvl.label + ' · ' + lvl.price), catOf(x.level).value === 'meeting' ? ' · ' + meetingLabel(x.meeting) : '', ' · signed up ', RT.timeAgo(x.created_at)),
          payLine(x),
          x.pitch_note ? h('p', { class: 'small sp-quote' }, '“' + x.pitch_note + '”') : null,
          x.message ? h('p', { class: 'small muted' }, 'They see: ' + x.message) : null,
          x.officer_note ? h('p', { class: 'small muted' }, 'Officer note: ' + x.officer_note) : null),
        h('div', { class: 'sp-admin-actions' }, approve, decline, notes, payBtn, del));
    }

    // Every payment on one sponsor's record, plus "record a payment" for a check through the school or a Stripe
    // payment the webhook missed, and "remove" for a line that should not be there (a refund, a mistake).
    async function paymentsModal(x) {
      const lvl = levelOf(x.level);
      const planKind = lvl.monthly ? 'monthly' : x.level;
      const planCents = lvl.cents || 0;
      const list = h('div', { class: 'stack-sm' }, RT.skeleton(2));
      const kind = h('select', { class: 'input' }, ['meeting', 'hoodie', 'event', 'deposit', 'balance', 'monthly', 'manual'].map(k => h('option', { value: k, selected: k === planKind }, k)));
      const amount = h('input', { class: 'input', type: 'number', min: 1, step: '0.01', value: (planCents / 100).toFixed(2) });
      const ref = h('input', { class: 'input', type: 'text', maxlength: 120, placeholder: 'Stripe id (cs_… or ch_…) or check number. Leave empty to auto-make one.' });
      const add = h('button', { class: 'btn btn-primary', type: 'button' }, icon('plus', 14), 'Record payment');
      const m = modal({ title: x.business, subtitle: 'Payments on record',
        body: h('div', { class: 'stack' }, list, h('hr'), h('p', { class: 'card-label' }, 'Record a payment by hand'),
          h('p', { class: 'muted small' }, 'Use this for a check through the school, or a Stripe payment that didn’t show up. Check Stripe first so nothing is counted twice.'),
          RT.field('Kind', kind), RT.field('Amount (USD)', amount), RT.field('Reference', ref)),
        actions: [add] });
      async function refresh() {
        const r = await sb.rpc('sponsor_admin_payment_lines', { p_id: x.id });
        if (r.error) { clear(list).appendChild(h('p', { class: 'form-error' }, friendly(r.error))); return; }
        const rows = r.data || [];
        clear(list);
        if (!rows.length) { list.appendChild(h('p', { class: 'muted' }, 'Nothing on record yet.')); return; }
        rows.forEach(l => {
          const rm = h('button', { class: 'link-btn', type: 'button' }, 'Remove');
          rm.addEventListener('click', async () => {
            if (!await confirmDialog({ title: 'Remove this payment line?', message: 'This only changes our record. It does not refund anything in Stripe. Use it after a refund, or for a mistake.', confirmText: 'Remove', danger: true })) return;
            const d = await sb.rpc('sponsor_admin_remove_payment', { p_ref: l.ref });
            if (d.error) { toast(friendly(d.error), 'error'); return; }
            toast('Removed.', 'success'); refresh(); load();
          });
          list.appendChild(h('div', { class: 'row between wrap small' },
            h('span', null, h('strong', null, '$' + (l.amount_cents / 100).toFixed(2)), ' · ' + l.kind + ' · ' + fmtDate(l.created_at, { month: 'short', day: 'numeric', year: 'numeric' })),
            h('span', { class: 'row gap-sm' }, h('code', { class: 'muted', title: l.ref }, String(l.ref).slice(0, 22) + (String(l.ref).length > 22 ? '…' : '')), rm)));
        });
      }
      add.addEventListener('click', () => busy(add, async () => {
        const cents = Math.round(parseFloat(amount.value || '0') * 100);
        if (!(cents > 0)) { toast('Enter an amount.', 'error'); return; }
        const r = await sb.rpc('sponsor_admin_record_payment', { p_id: x.id, p_kind: kind.value, p_cents: cents, p_ref: ref.value.trim() || null });
        if (r.error) { toast(friendly(r.error), 'error'); return; }
        toast('Recorded.', 'success'); ref.value = ''; refresh(); load();
      }));
      refresh();
      return m;
    }

    function payLine(x) {
      if (x.level === 'inkind') return null;
      const p = pays[x.id] || { paid_cents: 0, kinds: [] };
      const paid = '$' + (p.paid_cents / 100).toFixed(p.paid_cents % 100 ? 2 : 0);
      const bits = [h('span', { class: p.paid_cents ? 'accent' : 'muted' }, p.paid_cents ? 'Paid ' + paid : 'Nothing paid yet')];
      if (x.level === 'meeting' && p.kinds.includes('deposit') && !p.kinds.includes('balance')) {
        const b = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, p.balance_due ? 'Final $50 is open (tap to close)' : 'Meeting done: open the final $50');
        b.addEventListener('click', async () => {
          const r = await sb.rpc('sponsor_admin_balance', { p_id: x.id, p_due: !p.balance_due });
          if (r.error) { toast(friendly(r.error), 'error'); return; }
          toast(p.balance_due ? 'Final payment closed.' : 'Final $50 is now open for them.', 'success');
          load();
        });
        bits.push(b);
      }
      if (p.subscribed) bits.push(h('span', { class: 'tag sm' }, 'subscription active'));
      return h('div', { class: 'row wrap small' }, bits);
    }

    load();
  };
})();
