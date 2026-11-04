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

  const meetingLabel = v => { const m = cfg.meetings.find(x => x.value === v); return m ? m.label + (m.note ? ' · ' + m.note : '') : 'Any meeting'; };
  const levelOf = v => cfg.levels.find(x => x.value === v) || cfg.levels[0];
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
  // Plans are grouped (One time / Monthly) and each one lists what it includes.
  function levelCards(v) {
    const wrap = h('div', { class: 'sp-levels' });
    const cards = choiceCards(cfg.levels, v, l => [
      h('span', { class: 'sp-choice-top' }, h('strong', null, l.label), h('span', { class: 'sp-price mono' }, l.price)),
      h('span', { class: 'muted small' }, l.text),
      l.gets ? h('ul', { class: 'sp-gets small' }, l.gets.map(g => h('li', null, icon('check', 13, 'accent'), g))) : null,
      l.pay ? h('span', { class: 'sp-pay small' }, l.pay) : null]);
    const btns = [...cards.children];
    [...new Set(cfg.levels.map(l => l.group || 'Plans'))].forEach(g => {
      wrap.appendChild(h('div', { class: 'sp-group-label' }, g));
      const row = h('div', { class: 'sp-choices' });
      cfg.levels.forEach((l, i) => { if ((l.group || 'Plans') === g) row.appendChild(btns[i]); });
      wrap.appendChild(row);
    });
    wrap.getValue = cards.getValue;
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
    const hero = h('section', { class: 'sp-hero reveal' },
      h('span', { class: 'sp-kicker mono' }, icon('fin', 14), 'Sponsor Ridge Tank'),
      h('h1', { class: 'sp-title' }, 'Back the next generation of founders.'),
      h('p', { class: 'sp-lead' }, 'Ridge Tank is Mountain Ridge High School’s Shark Tank-style startup program. Students build real businesses and pitch them to judges. Over 40 students came to our first meeting.'),
      h('div', { class: 'sp-hero-stats' },
        stat('40+', 'students at meeting one'),
        stat('$100', 'covers a whole meeting'),
        stat('~$2', 'per student')));

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

    if (t.confirmed === '1') toast('Email confirmed. Log in to open your dashboard.', 'success', 5000);
    if (t.confirmed === 'expired') toast('That link expired. Log in and we’ll help you send a new one.', 'error', 5000);
    show(seg.getValue());

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
    function planPicker(v) {
      let cur = v;
      const by = id => cfg.levels.find(l => l.value === id);
      const wrap = h('div', { class: 'sp-plans-wrap' });
      const grid = h('div', { class: 'sp-plans', role: 'radiogroup', 'aria-label': 'Choose a plan' });
      const alt = h('button', { class: 'sp-alt', type: 'button' });
      const cards = {};
      const pick = id => { cur = id; paint(); };
      ['basic', 'full', 'meeting'].forEach(id => {
        const l = by(id);
        const up = id === 'basic' ? h('button', { class: 'sp-up', type: 'button' }, 'Want your logo across the school and the club repost chain? Full is $69.99 more →') : null;
        if (up) up.addEventListener('click', e => { e.stopPropagation(); pick('full'); });
        const c = h('div', { class: 'sp-plan' + (id === 'full' ? ' featured' : ''), role: 'radio', tabindex: 0, 'data-plan': id },
          l.badge ? h('span', { class: 'sp-badge mono' }, l.badge) : null,
          h('strong', { class: 'sp-plan-name' }, l.label),
          h('span', { class: 'sp-plan-price' }, l.big || l.price, l.unit ? h('span', { class: 'sp-plan-unit' }, ' ' + l.unit) : null),
          h('span', { class: 'sp-plan-per small' }, l.per || ''),
          h('ul', { class: 'sp-gets small' }, l.gets.map(g => h('li', null, icon('check', 13, 'accent'), g))),
          h('span', { class: 'sp-pay small' }, l.pay),
          up);
        c.addEventListener('click', () => pick(id));
        c.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(id); } });
        cards[id] = c;
        grid.appendChild(c);
      });
      alt.addEventListener('click', () => pick(cur === 'inkind' ? 'full' : 'inkind'));
      function paint() {
        Object.keys(cards).forEach(id => cards[id].setAttribute('aria-checked', String(id === cur)));
        alt.textContent = cur === 'inkind' ? 'In-kind partner selected (snacks or gift cards). Switch to a paid plan' : 'No cash? Give snacks, drinks, or gift cards instead';
        alt.classList.toggle('on', cur === 'inkind');
      }
      paint();
      wrap.append(grid, alt);
      wrap.getValue = () => cur;
      return wrap;
    }

    function signupForm() {
      const business = input({ type: 'text', placeholder: 'e.g. Zoyo Frozen Yogurt', autocomplete: 'organization', maxlength: 80 });
      const name = input({ type: 'text', placeholder: 'First and last name', autocomplete: 'name', maxlength: 60 });
      const email = input({ type: 'email', placeholder: 'you@yourbusiness.com', autocomplete: 'email' });
      const phone = input({ type: 'tel', placeholder: '(602) 555-0142', autocomplete: 'tel', maxlength: 25 });
      const site = input({ type: 'url', placeholder: 'yourbusiness.com', autocomplete: 'url', maxlength: 200 });
      const level = planPicker('full');
      const meeting = meetingCards(cfg.meetings[0].value);
      const logo = logoPicker(null);
      const note = h('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Anything we should know? (optional)' });
      const pw = pwInput('At least 8 characters', 'new-password');
      const agree = h('input', { type: 'checkbox', class: 'check' });
      const err = errLine();

      const first = () => (name.value.trim().split(/\s+/)[0] || '');
      const steps = [
        { title: 'What’s your business called?', sub: 'This is how we’ll say it on posters and on screen.', body: () => [RT.field('Business name', business)], focus: business,
          check: () => business.value.trim().length < 2 ? 'Enter your business name.' : '' },
        { title: 'Nice to meet you. Who are we talking to?', sub: 'So we know who to thank.', body: () => [RT.field('Your name', name)], focus: name,
          check: () => name.value.trim().length < 2 ? 'Enter your name.' : '' },
        { title: () => (first() ? first() + ', where should we send your updates?' : 'Where should we send your updates?'), sub: 'This is also your dashboard login.',
          body: () => [RT.field('Email', email, 'Any email works.'), RT.field('Phone (optional)', phone)], focus: email,
          check: () => {
            if (!/^\S+@\S+\.\S+$/.test(email.value.trim())) return 'Enter a real email address.';
            const d = phone.value.replace(/\D/g, '');
            return d && (d.length < 10 || d.length > 15) ? 'Enter a 10-digit phone number, or leave it empty.' : '';
          } },
        { title: 'How would you like to back us?', sub: 'Officers review every sponsor first. Nothing is charged when you sign up.', body: () => [level], wide: true, check: () => '' },
        { title: 'Which meeting should we feature you at?', sub: 'You can change this later.', body: () => [meeting], check: () => '' },
        { title: 'Add your logo', sub: 'Optional. It goes on the posters, so the sooner the better.', body: () => [logo.el, RT.field('Website (optional)', site)], optional: true, check: () => '' },
        { title: 'Last step. Make your password.', sub: 'Then you’re in.', body: () => [RT.field('Password', pw), RT.field('Note', note),
          h('label', { class: 'check-row' }, agree, h('span', null, 'I understand officers review every sponsor first, and that nothing is charged until I approve a payment on my dashboard.'))],
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
        count.textContent = 'Step ' + (i + 1) + ' of ' + steps.length;
        bar.setAttribute('aria-valuenow', i + 1);
        bar.firstChild.style.width = Math.round(((i + 1) / steps.length) * 100) + '%';
        back.hidden = i === 0;
        skip.hidden = !st.optional;
        next.textContent = st.last ? 'Create my sponsor account' : 'Continue';
        const title = typeof st.title === 'function' ? st.title() : st.title;
        const panel = h('div', { class: 'sp-panel' + (st.wide ? ' wide' : '') + (dir ? ' from-' + dir : '') },
          h('h2', { class: 'sp-q' }, title), h('p', { class: 'muted sp-sub' }, st.sub), ...st.body());
        stage.replaceChildren(panel);
        if (st.focus && window.innerWidth > 720) setTimeout(() => st.focus.focus({ preventScroll: true }), 220);
        if (dir) form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
      back.addEventListener('click', () => { if (i > 0) { i--; draw('back'); } });
      skip.addEventListener('click', () => { i++; draw('fwd'); });
      form.addEventListener('submit', e => {
        e.preventDefault();
        const st = steps[i];
        const msg = st.check();
        if (msg) return showErr(err, msg);
        if (!st.last) { i++; draw('fwd'); return; }
        for (let k = 0; k < steps.length; k++) { const m = steps[k].check(); if (m) { i = k; draw('back'); return showErr(err, m); } }
        const em = email.value.trim();
        busy(next, async () => {
          try {
            const out = await call('signUp', {
              email: em, password: pw.input.value, business: business.value, contact_name: name.value, phone: phone.value,
              website: site.value, level: level.getValue(), meeting: meeting.getValue(), pitch_note: note.value, logo: logo.getValue() || null
            });
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
      const approved = acct.status === 'approved';
      const steps = [
        { title: 'Signed up', text: 'Thanks for backing Ridge Tank.', state: 'done' },
        { title: 'Approved by our officers', text: approved ? 'You’re an official partner.' : acct.status === 'declined' ? 'Not this time. See the note below.' : 'We usually reply within 2 school days.', state: approved ? 'done' : acct.status === 'declined' ? 'stop' : 'now' },
        { title: 'Payment', text: (acct.level === 'inkind' ? lvl.pay : 'Pay securely by card from the Payments tab once you’re approved.') + '', state: approved ? 'now' : 'later' },
        { title: 'Meeting day', text: meetingLabel(acct.meeting), state: 'later' },
        { title: 'Thank-you photos', text: 'We send you photos from the meeting as proof.', state: 'later' }
      ];
      if (acct.message) pane.appendChild(h('div', { class: 'card sp-message' }, h('span', { class: 'card-label' }, 'Message from Ridge Tank'), h('p', null, acct.message)));
      pane.appendChild(h('div', { class: 'sp-overview' },
        h('section', { class: 'card' },
          h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Your progress')),
          h('ol', { class: 'sp-steps' }, steps.map((s, i) => h('li', { class: 'sp-steps-li is-' + s.state },
            h('span', { class: 'sp-dot' }, s.state === 'done' ? icon('check', 14) : s.state === 'stop' ? icon('x', 14) : String(i + 1)),
            h('div', null, h('strong', null, s.title), h('p', { class: 'muted small' }, s.text)))))),
        h('div', { class: 'stack' },
          h('section', { class: 'card' },
            h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Your sponsorship'), h('button', { class: 'link-btn', type: 'button', onclick: () => RT.go('sponsor/dashboard/profile') }, 'Change')),
            h('dl', { class: 'sp-kv' },
              h('dt', null, 'Level'), h('dd', null, lvl.label + ' · ' + lvl.price),
              h('dt', null, 'Meeting'), h('dd', null, meetingLabel(acct.meeting)),
              h('dt', null, 'Logo'), h('dd', null, acct.logo ? 'Uploaded' : h('button', { class: 'link-btn', type: 'button', onclick: () => RT.go('sponsor/dashboard/profile') }, 'Add your logo')))),
          h('section', { class: 'card' },
            h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'What you get')),
            h('ul', { class: 'sp-get' }, cfg.perks.map(p => h('li', null, icon('check', 15, 'accent'), h('span', null, p.title))))))));
    }

    function profilePane(pane) {
      const business = input({ type: 'text', value: acct.business, maxlength: 80 });
      const name = input({ type: 'text', value: acct.contact_name, maxlength: 60 });
      const phone = input({ type: 'tel', value: acct.phone || '', maxlength: 25 });
      const site = input({ type: 'url', value: acct.website || '', maxlength: 200, placeholder: 'yourbusiness.com' });
      const level = levelCards(acct.level);
      const meeting = meetingCards(acct.meeting);
      const logo = logoPicker(acct.logo);
      const err = errLine();
      const save = h('button', { class: 'btn btn-primary', type: 'submit' }, 'Save changes');
      const form = h('form', { class: 'card stack', novalidate: true },
        h('div', { class: 'card-head' }, h('span', { class: 'card-label' }, 'Business info')),
        h('div', { class: 'form-grid' }, RT.field('Business name', business), RT.field('Your name', name)),
        h('div', { class: 'form-grid' }, RT.field('Phone', phone), RT.field('Website', site)),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Logo'), logo.el),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'How you’d like to help'), level),
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Which meeting'), meeting),
        err, h('div', { class: 'row' }, save));
      form.addEventListener('submit', e => {
        e.preventDefault();
        err.hidden = true;
        const changes = { business: business.value, contact_name: name.value, phone: phone.value, website: site.value, level: level.getValue(), meeting: meeting.getValue() };
        const lg = logo.getValue();
        if (lg !== undefined) changes.logo = lg;
        busy(save, async () => {
          try { acct = await call('update', changes); drawHead(); toast('Saved', 'success'); } catch (ex) { showErr(err, ex.message); }
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
    const KIND = { deposit: 'First half', balance: 'Final half', monthly: 'Monthly payment' };
    function paymentsPane(pane) {
      const pay = acct.pay || { configured: false, payments: [], options: [] };
      const lvl = levelOf(acct.level);
      const go = async (action, kind, btn) => busy(btn, async () => {
        try { const out = await call(action, { kind }); location.href = out.url; }
        catch (ex) { toast(ex.message, 'error'); }
      });
      const status = (() => {
        if (acct.level === 'inkind') return 'You’re giving snacks, drinks, or gift cards, so there’s nothing to pay here. We’ll set up a drop-off with you.';
        if (acct.status !== 'approved') return 'Payments open as soon as an officer approves you. We usually reply within 2 school days.';
        if (!pay.configured) return 'Payments aren’t switched on yet. Email us and we’ll sort it out.';
        if (acct.level === 'meeting') {
          const kinds = new Set(pay.payments.map(x => x.kind));
          if (kinds.has('deposit') && kinds.has('balance')) return 'All paid. Thank you for backing Ridge Tank!';
          if (kinds.has('deposit') && !acct.balance_due) return 'First half received. The final $50 opens after your meeting, and we’ll email you.';
          return 'Meeting partner is $100: half now, half after the meeting.';
        }
        return acct.subscribed ? 'Your ' + lvl.label + ' plan is active. Thank you!' : lvl.label + ' is ' + lvl.price + '. Cancel any time from the billing page.';
      })();
      const buttons = pay.options.map(o => {
        const btn = h('button', { class: 'btn btn-primary btn-lg', type: 'button' }, icon('card', 16), o.kind === 'monthly' ? 'Start ' + lvl.label + ' · ' + money(o.cents) + ' / month' : (o.kind === 'deposit' ? 'Pay first half' : 'Pay final half') + ' · ' + money(o.cents));
        btn.addEventListener('click', () => go('pay', o.kind, btn));
        return btn;
      });
      if (pay.canManage) {
        const m = h('button', { class: 'btn btn-ghost', type: 'button' }, 'Manage billing and receipts');
        m.addEventListener('click', () => go('portal', '', m));
        buttons.push(m);
      }
      pane.appendChild(h('section', { class: 'card sp-pay-card stack' },
        h('div', { class: 'row' }, h('span', { class: 'sp-perk-ico lg' }, icon('card', 26)), h('div', null, h('h3', null, 'Payments'), h('p', { class: 'muted' }, status))),
        buttons.length ? h('div', { class: 'row wrap' }, buttons) : null,
        h('p', { class: 'muted small' }, 'Payments are handled securely by Stripe. We never see or store your card.')));
      if (pay.payments.length) {
        pane.appendChild(h('section', { class: 'card stack-sm' }, h('span', { class: 'card-label' }, 'Payment history'),
          h('ul', { class: 'sp-history' }, pay.payments.map(x => h('li', null, h('span', null, KIND[x.kind] || 'Payment'), h('span', { class: 'muted small' }, fmtDate(x.created_at, { month: 'short', day: 'numeric', year: 'numeric' })), h('strong', { class: 'mono' }, money(x.amount_cents)))))));
      }
      if (/[?&]paid=1/.test(location.hash) && !pane.dataset.thanked) {
        pane.dataset.thanked = '1';
        toast('Thank you! Your payment can take a few seconds to show up.', 'success', 5000);
        setTimeout(() => { if (pane.isConnected) load(); }, 4000);
      }
    }

    async function load() {
      try {
        acct = await call('me');
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
          h('div', { class: 'small' }, h('span', { class: 'accent' }, lvl.label + ' · ' + lvl.price), ' · ', meetingLabel(x.meeting), ' · signed up ', RT.timeAgo(x.created_at)),
          payLine(x),
          x.pitch_note ? h('p', { class: 'small sp-quote' }, '“' + x.pitch_note + '”') : null,
          x.message ? h('p', { class: 'small muted' }, 'They see: ' + x.message) : null,
          x.officer_note ? h('p', { class: 'small muted' }, 'Officer note: ' + x.officer_note) : null),
        h('div', { class: 'sp-admin-actions' }, approve, decline, notes, del));
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
