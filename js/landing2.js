// The poster-look landing page (index.html sets data-look="v2"). It keeps the original page's sections
// (how it works, tiers, FAQ, officers) and adds: a hero with the next-meeting ticket, the year in three
// phases, the mystery event, and the hoodie. Everything it shows comes from js/config.js.
// With data-look="v1" this file does nothing and the original landing page is used as it was.
(function () {
  const RT = window.RT;
  if (!RT || !RT.views || !RT.views.landing) return;
  if (document.documentElement.dataset.look !== 'v2') return;
  const { h, icon } = RT;
  const S = RT.state;
  const cfg = window.RT_CONFIG || {};
  const original = RT.views.landing;

  const money = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));

  // ---------- the next meeting, as a ticket ----------
  function nextMeeting() {
    const c = cfg.countdown || {};
    const today = RT.localDateISO();
    const cal = (S.meetings || []).filter(x => (x.kind || 'meeting') === 'meeting' && x.meeting_date >= today)
      .sort((a, b) => (a.meeting_date < b.meeting_date ? -1 : 1))[0];
    const date = cal ? cal.meeting_date : c.date;
    if (!date || date < today) return null;
    const d = RT.parseLocalDate(date);
    return {
      days: Math.round((d - RT.parseLocalDate(today)) / 86400000),
      weekday: d.toLocaleDateString('en-US', { weekday: 'long' }),
      day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: c.time && (!cal || date === c.date) ? c.time : '',
      place: (cal && cal.location) || c.place || '',
      what: (cal && cal.name) || c.text || ''
    };
  }

  function ticket() {
    const m = nextMeeting();
    if (!m) return null;
    const count = m.days === 0 ? ['Today', 'See you there'] : [String(m.days), m.days === 1 ? 'day to go' : 'days to go'];
    return h('div', { class: 'ticket', role: 'group', 'aria-label': 'Next meeting' },
      h('div', { class: 'ticket-main' },
        h('p', { class: 'ticket-kicker' }, 'Next meeting'),
        h('p', { class: 'ticket-date' }, m.weekday, h('br'), m.day),
        h('p', { class: 'ticket-where' }, [m.time, m.place].filter(Boolean).join(', ')),
        m.what ? h('p', { class: 'ticket-what' }, m.what) : null,
        h('p', { class: 'ticket-free' }, 'Any MRHS student. No sign-up. Just walk in.')),
      h('div', { class: 'ticket-stub' },
        h('span', { class: 'ticket-count' + (m.days === 0 ? ' is-today' : '') }, count[0]),
        h('span', { class: 'ticket-count-label' }, count[1])));
  }

  function hero() {
    return h('section', { class: 'hero2' },
      h('div', { class: 'hero2-copy' },
        h('h1', { class: 'hero-title' }, 'Ridge', h('br'), 'Tank'),
        h('p', { class: 'hero2-sub' }, 'Mountain Ridge’s student startup club. Build a real business this year, then pitch it to the Sharks.'),
        S.me ? null : h('div', { class: 'hero-cta' },
          h('a', { class: 'btn btn-primary btn-lg', href: '#/signup' }, 'Join Ridge Tank'),
          h('a', { class: 'hero-link', href: '#/login' }, 'Already a member? Log in'))),
      ticket());
  }

  // ---------- the year: Spark, Build, Sell ----------
  function phases() {
    const list = cfg.phases || [];
    if (!list.length) return null;
    const today = RT.localDateISO();
    const nowIdx = list.findIndex(p => today >= p.from && today <= p.to);
    return h('section', { class: 'section in', id: 'year' },
      h('div', { class: 'section-head' },
        h('h2', { class: 'section-title' }, 'One year. One real business.'),
        h('p', { class: 'section-sub' }, 'Tank Academy walks you from a blank page to your first sale, one level at a time.')),
      h('ol', { class: 'phase-list' }, list.map((p, i) =>
        h('li', { class: 'phase' + (i === nowIdx ? ' is-now' : '') },
          h('div', { class: 'phase-top' },
            h('span', { class: 'phase-num' }, 'Phase ' + (i + 1)),
            i === nowIdx ? h('span', { class: 'phase-now' }, 'Now') : null),
          h('h3', { class: 'phase-name' }, p.name),
          h('p', { class: 'phase-when' }, p.when),
          h('p', { class: 'phase-text' }, p.text)))),
      cfg.leaderboardPrize ? h('p', { class: 'prize-line' }, icon('trophy', 20), h('span', null, cfg.leaderboardPrize)) : null);
  }

  // ---------- the mystery event ----------
  function mystery() {
    const m = cfg.mystery;
    if (!m || !m.show) return null;
    return h('section', { class: 'section in mystery', id: 'mystery' },
      h('div', { class: 'mystery-mark', 'aria-hidden': 'true' }, '???'),
      h('div', { class: 'mystery-copy' },
        h('h2', { class: 'section-title' }, m.title),
        h('p', { class: 'mystery-text' }, m.text),
        m.reveal ? h('p', { class: 'mystery-reveal' }, m.reveal) : null,
        (cfg.hoodie && cfg.hoodie.show) ? h('p', { class: 'mystery-note' }, 'Everyone can come. Hoodie owners get the front row.') : null));
  }

  // ---------- the hoodie ----------
  function hoodie() {
    const c = cfg.hoodie;
    if (!c || !c.show) return null;
    const price = Math.round(c.was * (100 - c.percentOff)) / 100;
    const off = c.percentOff > 0;
    return h('section', { class: 'section in hoodie', id: 'hoodie' },
      h('div', { class: 'hoodie-photos' },
        h('img', { src: 'marketing/hoodie-front.jpg', alt: 'The Ridge Tank hoodie, front: forest green with the fin logo', width: 742, height: 761 }),
        h('img', { src: 'marketing/hoodie-back.jpg', alt: 'The Ridge Tank hoodie, back', width: 658, height: 716 })),
      h('div', { class: 'hoodie-copy' },
        h('h2', { class: 'section-title' }, 'The Ridge Tank hoodie'),
        h('p', { class: 'hoodie-pitch' }, 'High quality, heavy, and green. We’re taking a group photo in them. Be in the photo.'),
        h('p', { class: 'hoodie-price', 'aria-label': off ? `${money(price)}, was ${money(c.was)}, ${c.percentOff}% off` : money(price) },
          h('strong', { 'aria-hidden': 'true' }, money(price)),
          off ? h('s', { 'aria-hidden': 'true' }, money(c.was)) : null,
          off ? h('span', { class: 'hoodie-off', 'aria-hidden': 'true' }, c.percentOff + '% off') : null),
        off && c.priceNote ? h('p', { class: 'hoodie-note' }, c.priceNote + '. Goes back to ' + money(c.was) + ' after.') : null,
        (c.perks && c.perks.length) ? h('ul', { class: 'hoodie-perks' }, c.perks.map(p => h('li', null, icon('check', 18), h('span', null, p)))) : null,
        h('p', { class: 'hoodie-fair' }, 'Every meeting and event stays open to everyone. The hoodie just gets you the good seats.'),
        c.orderUrl
          ? h('a', { class: 'btn btn-primary btn-lg', href: c.orderUrl }, 'Get the hoodie')
          : h('p', { class: 'hoodie-soon' }, 'Orders open soon')));
  }

  RT.views.landing = RT.views.about = function (root, t) {
    const handle = original(root, t);
    const oldHero = root.querySelector('.hero');
    const how = root.querySelector('#how');
    const tiers = root.querySelector('#tiers');
    const put = (node, before) => { if (node && before && before.parentNode) before.parentNode.insertBefore(node, before); };
    if (oldHero) oldHero.replaceWith(hero());
    else if (how) { const tk = ticket(); if (tk) { tk.classList.add('ticket-inline'); put(tk, how); } } // members reach this page as "About": they still see the next meeting
    put(phases(), how);
    put(mystery(), how);
    put(hoodie(), tiers);
    return handle;
  };

  // If the page was already drawn before this file loaded, draw it again with the new sections.
  const view = document.body.dataset.view;
  if ((view === 'landing' || view === 'about') && RT.rerender) RT.rerender();
})();
