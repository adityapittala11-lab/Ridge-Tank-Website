// Sponsors: the public sign-up page (#/sponsor), the sponsor's own dashboard (#/sponsor/dashboard), and the officers'
// Sponsors tab. Sponsor logins are separate from member logins: they use /api/sponsor and their own saved token.
(function () {
  const RT = window.RT;
  const { h, clear, icon, toast, modal, segmented, busy, friendly, confirmDialog } = RT;
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
  const levelCards = v => choiceCards(cfg.levels, v, l => [h('span', { class: 'sp-choice-top' }, h('strong', null, l.label), h('span', { class: 'sp-price mono' }, l.price)), h('span', { class: 'muted small' }, l.text)]);
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
      h('p', { class: 'muted small center sp-foot' }, 'Questions? Email ', h('a', { href: 'mailto:' + cfg.contact }, cfg.contact), '. Payments always go through Mountain Ridge High School. Our students never take cash.'));

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

    function signupForm() {
      const business = input({ type: 'text', placeholder: 'e.g. Zoyo Frozen Yogurt', autocomplete: 'organization', maxlength: 80 });
      const name = input({ type: 'text', placeholder: 'First and last name', autocomplete: 'name', maxlength: 60 });
      const email = input({ type: 'email', placeholder: 'you@yourbusiness.com', autocomplete: 'email' });
      const phone = input({ type: 'tel', placeholder: '(602) 555-0142', autocomplete: 'tel', maxlength: 25 });
      const site = input({ type: 'url', placeholder: 'yourbusiness.com', autocomplete: 'url', maxlength: 200 });
      const level = levelCards('meeting');
      const meeting = meetingCards(cfg.meetings[0].value);
      const logo = logoPicker(null);
      const note = h('textarea', { class: 'input', rows: 3, maxlength: 500, placeholder: 'Anything we should know? (optional)' });
      const pw = pwInput('At least 8 characters', 'new-password');
      const agree = h('input', { type: 'checkbox', class: 'check' });
      const err = errLine();
      const submit = h('button', { class: 'btn btn-primary btn-block btn-lg', type: 'submit' }, 'Create my sponsor account');
      const step = (n, title, ...kids) => h('fieldset', { class: 'sp-step' }, h('legend', null, h('span', { class: 'sp-step-n mono' }, n), title), ...kids);

      const form = h('form', { class: 'stack', novalidate: true },
        step('1', 'Your business',
          h('div', { class: 'form-grid' }, RT.field('Business name', business), RT.field('Your name', name)),
          h('div', { class: 'form-grid' }, RT.field('Email', email, 'Your dashboard login. Any email works.'), RT.field('Phone (optional)', phone)),
          RT.field('Website (optional)', site)),
        step('2', 'How you’d like to help', level),
        step('3', 'Which meeting', meeting),
        step('4', 'Your logo', logo.el, h('span', { class: 'hint' }, 'You can add it later from your dashboard.')),
        step('5', 'Finish up', RT.field('Note', note), RT.field('Password', pw),
          h('label', { class: 'check-row' }, agree, h('span', null, 'I understand officers review every sponsor first, and that no money changes hands until Mountain Ridge High School sends payment details.'))),
        err, submit);

      form.addEventListener('submit', e => {
        e.preventDefault();
        err.hidden = true;
        const em = email.value.trim();
        if (business.value.trim().length < 2) return showErr(err, 'Enter your business name.');
        if (name.value.trim().length < 2) return showErr(err, 'Enter your name.');
        if (!/^\S+@\S+\.\S+$/.test(em)) return showErr(err, 'Enter a real email address.');
        const digits = phone.value.replace(/\D/g, '');
        if (digits && (digits.length < 10 || digits.length > 15)) return showErr(err, 'Enter a 10-digit phone number, or leave it empty.');
        if (pw.input.value.length < 8) return showErr(err, 'Use a password with at least 8 characters.');
        if (!agree.checked) return showErr(err, 'Check the box to continue.');
        busy(submit, async () => {
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
        { title: 'Payment', text: acct.level === 'inkind' ? 'We’ll plan a drop-off time for your snacks or gift cards.' : 'Through Mountain Ridge High School. We’ll email the details.', state: approved ? 'now' : 'later' },
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

    // Left empty on purpose: payments open once the school approves how sponsor money is handled.
    function paymentsPane(pane) {
      pane.appendChild(h('section', { class: 'card empty sp-pay-empty' },
        h('span', { class: 'sp-perk-ico lg' }, icon('card', 26)),
        h('h3', null, 'Payments aren’t open yet'),
        h('p', { class: 'muted' }, 'Please don’t send money yet. All sponsor payments go through Mountain Ridge High School, and we’ll email you when it’s ready.'),
        h('a', { class: 'btn btn-ghost btn-sm', href: 'mailto:' + cfg.contact }, icon('mail', 15), 'Email us')));
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
          x.pitch_note ? h('p', { class: 'small sp-quote' }, '“' + x.pitch_note + '”') : null,
          x.message ? h('p', { class: 'small muted' }, 'They see: ' + x.message) : null,
          x.officer_note ? h('p', { class: 'small muted' }, 'Officer note: ' + x.officer_note) : null),
        h('div', { class: 'sp-admin-actions' }, approve, decline, notes, del));
    }

    load();
  };
})();
