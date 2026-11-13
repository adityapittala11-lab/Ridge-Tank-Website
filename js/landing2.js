// Pages for the poster looks (index.html sets data-look to "v2" or "v3").
//
// Landing page: keeps the original sections (how it works, tiers, FAQ, officers) and adds a hero with the
// next-meeting ticket, the first-meeting photo, the year in three phases, the mystery event and the hoodie.
// Look v3 ("the Tank") also gets the sharks: water inside the word TANK, a fin on the waterline, a bite out of
// the ticket, a shark for every tier, a depth gauge, and the scroll motion in js/tank.js.
// In v3 the log in page and the sponsor page get a poster side too.
//
// Everything shown here comes from js/config.js. With data-look="v1" this file does nothing.
(function () {
  const RT = window.RT;
  if (!RT || !RT.views || !RT.views.landing) return;
  const look = document.documentElement.dataset.look;
  if (look !== 'v2' && look !== 'v3') return;
  const V3 = look === 'v3';
  const { h, icon, toast, modal, busy } = RT;
  const S = RT.state;
  const cfg = window.RT_CONFIG || {};
  const original = RT.views.landing;

  const money = n => '$' + (Number.isInteger(n) ? n : n.toFixed(2));

  // ---------- drawings ----------
  const NS = 'http://www.w3.org/2000/svg';
  function svg(cls, viewBox, inner) {
    const el = document.createElementNS(NS, 'svg');
    el.setAttribute('class', cls);
    el.setAttribute('viewBox', viewBox);
    el.setAttribute('aria-hidden', 'true');
    el.setAttribute('focusable', 'false');
    el.innerHTML = inner;
    return el;
  }
  // A shark seen from the side, swimming right. It is cut into three overlapping pieces (front, rear, tail)
  // so the back half can sway and the tail can beat. It takes its colour from the text colour.
  // Simple countershading: a lighter wash along the back, a darker one along the belly, plus an eye. The washes are
  // black/white with low opacity, so they read as light-from-above on any tier colour. markings adds tier detail
  // (tiger stripes, a great white's pale belly). All of it rides inside the moving pieces so it swims with the body.
  const SHARK = markings =>
    '<g fill="currentColor">' +
    '<g class="sk-rear"><path d="M106 23.6C94 25.6 83 28 74 30L63 23L66 32C58 34 52 36 46 38L46 46C60 49 72 53 84 55L80 64L95 57C98 57.6 101 58 104 58.4Z"/>' +
    '<path fill="#000" opacity="0.2" d="M46 44C64 50 86 54 104 52L104 58.4C86 56 66 52 48 48Z"/>' +
    '<g class="sk-tail"><path d="M50 37L4 2C14 20 21 31 26 42C22 50 19 58 16 67L50 46.6Z"/><path fill="#000" opacity="0.16" d="M26 42C21 31 14 20 4 2C16 14 26 28 33 42Z"/></g></g>' +
    '<g class="sk-front"><path d="M198 45C188 36 164 26 138 23L114 1C113 11 110 19 103 24L98 25L97 57.4C108 59.2 119 60 130 60L113 82C128 77 141 69 150 60C166 59 184 55 192 50Z"/>' +
    '<path fill="#fff" opacity="0.16" d="M112 6C140 10 168 24 196 44C170 32 146 27 124 28C117 28 113 20 112 6Z"/>' +
    '<path fill="#000" opacity="0.22" d="M98 51C120 60 150 60 192 50C176 57 150 61 130 60C118 59.4 108 57 98 55Z"/>' +
    (markings || '') +
    '<circle cx="180" cy="40" r="3.1" fill="#0b1a13"/><circle cx="181" cy="39" r="1" fill="#eaf5ee"/></g>' +
    '</g>';
  const MARKS = {
    'tier-tiger': '<g fill="#000" opacity="0.26"><path d="M150 26L153 50"/><path d="M160 27L162 50" /><path d="M140 26L143 52"/><path d="M130 27L133 54"/><path d="M120 28L123 54"/></g>'.replace(/<path d="M(\d+) (\d+)L(\d+) (\d+)"\s*\/>/g, (m,x1,y1,x2,y2)=>`<path d="M${x1} ${y1}Q${(+x1+ +x2)/2-3} ${(+y1+ +y2)/2} ${x2} ${y2}L${+x2+3} ${y2}Q${(+x1+ +x2)/2} ${(+y1+ +y2)/2} ${+x1+3} ${y1}Z"/>`),
    'tier-white': '<path fill="#fff" opacity="0.34" d="M97 52C120 61 150 61 191 51C176 58 150 62 130 61C118 60 108 57 98 55Z"/>'
      + '<path fill="#000" opacity="0.5" d="M178 47C184 47 190 48 196 49C190 52 184 53 178 53C176 51 176 49 178 47Z"/>'
      + '<g fill="#f4f7f5"><path d="M179 48l1.6 4 1.6-4z"/><path d="M184 48.4l1.6 4.2 1.6-4.2z"/><path d="M189 49l1.5 4 1.5-4z"/><path d="M181.5 53l1.5-3.4 1.5 3.4z" opacity="0.9"/><path d="M186.5 53.2l1.4-3.4 1.4 3.4z" opacity="0.9"/></g>'
      + '<circle cx="176" cy="41.5" r="3.4" fill="#0a0f0c"/>'
  };
  const shark = (cls, variant) => svg('shark ' + cls, '0 0 200 84', SHARK(MARKS[variant]));
  // Just the fin, for anything riding along a waterline.
  const fin = cls => svg(cls, '0 0 64 44', '<path fill="currentColor" d="M2 44C18 40 30 26 34 0C44 12 54 28 62 44Z"/>');

  // A photo shown as a print pinned to the wall (the first-meeting photo).
  function print(cls, caption) {
    const c = cfg.crowd || {};
    const img = h('img', { src: c.photo, alt: c.alt || 'Ridge Tank members at the first meeting', width: 1600, height: 1188, loading: 'lazy', decoding: 'async' });
    if (c.photoSmall) { img.srcset = c.photoSmall + ' 900w, ' + c.photo + ' 1600w'; img.sizes = '(max-width: 899px) 92vw, 620px'; }
    return h('figure', { class: 'print ' + cls }, img, caption ? h('figcaption', null, caption) : null);
  }

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
      short: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
      day: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      time: c.time && (!cal || date === c.date) ? c.time : '',
      place: (cal && cal.location) || c.place || '',
      what: (cal && cal.name) || c.text || ''
    };
  }

  function ticket(extra) {
    const m = nextMeeting();
    if (!m) return null;
    const count = m.days === 0 ? ['Today', 'See you there'] : [String(m.days), m.days === 1 ? 'day to go' : 'days to go'];
    return h('div', { class: 'ticket' + (extra ? ' ' + extra : ''), role: 'group', 'aria-label': 'Next meeting' },
      h('div', { class: 'ticket-paper' },
        h('div', { class: 'ticket-main' },
          h('p', { class: 'ticket-kicker' }, 'Next meeting'),
          h('p', { class: 'ticket-date' }, m.weekday, h('br'), m.day),
          h('p', { class: 'ticket-where' }, [m.time, m.place].filter(Boolean).join(', ')),
          m.what ? h('p', { class: 'ticket-what' }, m.what) : null,
          h('p', { class: 'ticket-free' }, 'Any MRHS student. No sign-up. Just walk in.')),
        h('div', { class: 'ticket-stub' },
          h('span', { class: 'ticket-count' + (m.days === 0 ? ' is-today' : '') }, count[0]),
          h('span', { class: 'ticket-count-label' }, count[1]))));
  }

  function hero() {
    // In v3 the word TANK is part full of water: two more copies of the word, cut off by rolling waves,
    // with bubbles rising inside the letters. The water climbs as you scroll down (js/tank.js).
    const title = V3
      ? h('h1', { class: 'hero-title', 'aria-label': 'Ridge Tank' },
        h('span', { class: 'ht-line', 'aria-hidden': 'true' }, 'Ridge'),
        h('span', { class: 'ht-line ht-tank', 'aria-hidden': 'true' }, 'Tank',
          h('span', { class: 'ht-water ht-water-back' }, 'Tank'),
          h('span', { class: 'ht-water ht-water-front' }, 'Tank')))
      : h('h1', { class: 'hero-title' }, 'Ridge', h('br'), 'Tank');
    const tk = ticket();
    if (tk && V3) { tk.dataset.px = '0.05'; tk.dataset.swing = '1'; }
    return h('section', { class: 'hero2', 'data-play': '1' },
      h('div', { class: 'hero2-copy' },
        title,
        h('p', { class: 'hero2-sub' }, 'Mountain Ridge’s student startup club. Build a real business this year, then pitch it to the Sharks.'),
        S.me ? null : h('div', { class: 'hero-cta' },
          h('a', { class: 'btn btn-primary btn-lg', href: '#/signup' }, 'Join Ridge Tank'),
          h('a', { class: 'hero-link', href: '#/login' }, 'Already a member? Log in')),
        (V3 && cfg.proof && cfg.proof.length) ? h('ul', { class: 'proof' }, cfg.proof.map(p => h('li', null, p))) : null),
      tk,
      // The waterline at the foot of the hero: two wave lines, and a fin that cruises, dives and comes back up.
      V3 ? h('div', { class: 'waterline', 'aria-hidden': 'true' },
        h('div', { class: 'wl-wave wl-wave-back' }), h('div', { class: 'wl-wave' }),
        h('div', { class: 'wl-clip' }, h('div', { class: 'wl-swimmer' }, fin('wl-fin')))) : null);
  }

  // ---------- the first meeting, in one photo ----------
  function crowd() {
    const c = cfg.crowd;
    if (!c || !c.show || !c.photo) return null;
    const pic = print('crowd-photo', c.caption);
    const num = h('span', null, String(c.count) + (c.countSuffix || ''));
    if (V3) {
      pic.dataset.px = '0.04'; pic.dataset.swing = '0.7';
    }
    return h('section', { class: 'section in crowd', id: 'crowd' },
      pic,
      h('div', { class: 'crowd-copy' },
        h('p', { class: 'crowd-num', 'aria-hidden': 'true' }, num),
        h('h2', { class: 'section-title', 'aria-label': c.count + (c.countSuffix || '') + ' ' + c.title }, c.title),
        h('p', { class: 'section-sub' }, c.text),
        S.me ? null : h('a', { class: 'btn btn-primary btn-lg', href: '#/signup' }, 'Come to the next one')));
  }

  // ---------- the year: Spark, Build, Sell ----------
  function phases() {
    const list = cfg.phases || [];
    if (!list.length) return null;
    const today = RT.localDateISO();
    const nowIdx = list.findIndex(p => today >= p.from && today <= p.to);
    // How far along the year's track we are, for the line the fin rides on (v3).
    let along = 0;
    if (nowIdx >= 0) {
      const p = list[nowIdx];
      const span = Math.max(1, RT.parseLocalDate(p.to) - RT.parseLocalDate(p.from));
      along = (nowIdx + Math.min(1, Math.max(0.08, (RT.parseLocalDate(today) - RT.parseLocalDate(p.from)) / span))) / list.length;
    } else if (today > list[list.length - 1].to) along = 1;
    const track = V3 ? h('div', { class: 'year-track', 'aria-hidden': 'true', style: { '--along': along.toFixed(3) } },
      h('div', { class: 'year-fill' }), h('div', { class: 'year-swimmer' }, fin('year-fin'))) : null;
    return h('section', { class: 'section in', id: 'year' },
      h('div', { class: 'section-head' },
        h('h2', { class: 'section-title' }, 'One year. One real business.'),
        h('p', { class: 'section-sub' }, 'Tank Academy walks you from a blank page to your first sale, one level at a time.')),
      track,
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

  // The back wave of a colour block. The block itself is the front wave; this one rolls the other way behind it.
  const waterLayer = () => h('div', { class: 'water-layer', 'aria-hidden': 'true' });

  // ---------- the mystery event ----------
  function mystery() {
    const m = cfg.mystery;
    if (!m || !m.show) return null;
    const mark = h('div', { class: 'mystery-mark', 'aria-hidden': 'true' }, h('span', { class: 'q' }, '?'), h('span', { class: 'q' }, '?'), h('span', { class: 'q' }, '?'));
    if (V3) mark.dataset.px = '0.06';
    const block = h('section', { class: 'section in mystery' + (V3 ? ' wave-top' : ''), id: 'mystery' },
      V3 ? waterLayer() : null,
      V3 ? shark('mystery-shark') : null,
      mark,
      h('div', { class: 'mystery-copy' },
        h('h2', { class: 'section-title' }, m.title),
        h('p', { class: 'mystery-text' }, m.text),
        // When, where and what are blacked out until the reveal.
        h('dl', { class: 'mystery-file' }, [['When', 7.5], ['Where', 10], ['What', 13]].flatMap(([k, w]) => [
          h('dt', null, k),
          h('dd', { 'aria-label': 'Secret for now' }, h('span', { class: 'redact', style: { width: w + 'em' } }))])),
        m.reveal ? h('p', { class: 'mystery-reveal' }, m.reveal) : null,
        (cfg.hoodie && cfg.hoodie.show) ? h('p', { class: 'mystery-note' }, 'Everyone can come. Hoodie owners get the front row.') : null));
    if (!V3) return block;
    block.dataset.play = '1';
    // A fin rides along the top edge of the block as you scroll. It sits in its own lane just above the block.
    const rider = fin('edge-fin');
    rider.dataset.ride = '1';
    const both = document.createDocumentFragment();
    both.append(h('div', { class: 'fin-lane', 'aria-hidden': 'true' }, rider), block);
    return both;
  }

  // ---------- the hoodie ----------
  function hoodie() {
    const c = cfg.hoodie;
    if (!c || !c.show) return null;
    const price = Math.round(c.was * (100 - c.percentOff)) / 100;
    const off = c.percentOff > 0;
    const front = h('img', { src: 'marketing/hoodie-front.jpg', alt: 'The Ridge Tank hoodie, front: forest green with the fin logo', width: 742, height: 761 });
    const back = h('img', { src: 'marketing/hoodie-back.jpg', alt: 'The Ridge Tank hoodie, back', width: 658, height: 716 });
    const big = h('strong', { 'aria-hidden': 'true' }, money(price));
    if (V3) {
      front.dataset.px = '0.05'; back.dataset.px = '-0.04';
      front.dataset.swing = '0.8'; back.dataset.swing = '0.6'; // both prints swing the same way, the back one a little less
      // The price ticks down from the old one when it scrolls into view (js/tank.js).
      if (off) { big.dataset.countFrom = String(c.was); big.dataset.countTo = String(price); big.dataset.countPrefix = '$'; }
    }
    return h('section', { class: 'section in hoodie' + (V3 ? ' wave-top' : ''), id: 'hoodie', 'data-play': '1' },
      V3 ? waterLayer() : null,
      h('div', { class: 'hoodie-photos' }, front, back),
      h('div', { class: 'hoodie-copy' },
        h('h2', { class: 'section-title' }, 'The Ridge Tank hoodie'),
        h('p', { class: 'hoodie-pitch' }, 'High quality, heavy, and green. We’re taking the next group photo in them. Be in the photo.'),
        h('p', { class: 'hoodie-price', 'aria-label': off ? `${money(price)}, was ${money(c.was)}, ${c.percentOff}% off` : money(price) },
          big,
          off ? h('s', { 'aria-hidden': 'true' }, money(c.was)) : null,
          off ? h('span', { class: 'hoodie-off', 'aria-hidden': 'true' }, c.percentOff + '% off') : null),
        off && c.priceNote ? h('p', { class: 'hoodie-note' }, c.priceNote + '. Goes back to ' + money(c.was) + ' after.') : null,
        (c.perks && c.perks.length) ? h('ul', { class: 'hoodie-perks' }, c.perks.map(p => h('li', null, icon('check', 18), h('span', null, p)))) : null,
        h('p', { class: 'hoodie-fair' }, 'Every meeting and event stays open to everyone. The hoodie just gets you the good seats.'),
        c.orders
          ? h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => orderHoodie(price) }, 'Get the hoodie')
          : h('p', { class: 'hoodie-soon' }, 'Orders open soon')));
  }

  // The order form: name, email, size, how many. Paying happens on Stripe's page (api/hoodie.js sets the real price).
  function orderHoodie(price) {
    const c = cfg.hoodie || {};
    const name = h('input', { class: 'input', type: 'text', placeholder: 'First and last name', autocomplete: 'name', maxlength: 80 });
    const email = h('input', { class: 'input', type: 'email', placeholder: 'you@example.com', autocomplete: 'email' });
    let size = '', qty = 1;
    const total = h('strong', { class: 'order-total' }, money(price));
    const sizes = h('div', { class: 'order-sizes', role: 'radiogroup', 'aria-label': 'Size' }, (c.sizes || ['S', 'M', 'L', 'XL']).map(sz => {
      const b = h('button', { class: 'order-size', type: 'button', role: 'radio', 'aria-checked': 'false' }, sz);
      b.addEventListener('click', () => { size = sz; sizes.querySelectorAll('.order-size').forEach(x => x.setAttribute('aria-checked', String(x === b))); });
      return b;
    }));
    const count = h('span', { class: 'order-count', 'aria-live': 'polite' }, '1');
    const step = d => { qty = Math.min(4, Math.max(1, qty + d)); count.textContent = String(qty); total.textContent = money(price * qty); };
    const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const pay = h('button', { class: 'btn btn-primary btn-lg btn-block', type: 'submit' }, 'Pay with card');
    const lab = (t, el) => h('label', { class: 'field' }, h('span', { class: 'label' }, t), el);
    const form = h('form', { class: 'stack order-form', novalidate: true },
      lab('Name', name), lab('Email (your receipt goes here)', email),
      h('div', { class: 'field' }, h('span', { class: 'label' }, 'Size'), sizes),
      h('div', { class: 'order-row' },
        h('div', { class: 'order-qty' },
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One less', onclick: () => step(-1) }, '−'), count,
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'One more', onclick: () => step(1) }, '+')),
        h('p', { class: 'order-sum' }, 'Total ', total)),
      err, pay,
      h('p', { class: 'muted small' }, 'You pay on Stripe’s secure page. We never see your card. Pick up your hoodie at a meeting.'));
    form.addEventListener('submit', e => {
      e.preventDefault();
      err.hidden = true;
      busy(pay, async () => {
        let out = null;
        try {
          const r = await fetch('/api/hoodie', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'order', name: name.value, email: email.value, size, qty }) });
          out = await r.json();
        } catch (ex) { out = null; }
        if (out && out.data && out.data.url) { location.href = out.data.url; return; }
        err.textContent = (out && out.error && out.error.message) || 'That didn’t go through. Check your connection and try again.';
        err.hidden = false;
      });
    });
    modal({ title: 'The Ridge Tank hoodie', subtitle: money(price) + ' each. Up to 4 per order.', body: form, actions: [] });
    setTimeout(() => name.focus(), 120);
  }

  // ---------- pitches and photos from the first meeting ----------
  function pitches() {
    const c = cfg.pitches;
    if (!c || !c.show || !(c.clips || []).length) return null;
    const clip = (x, i) => {
      const v = h('video', { src: x.src, poster: x.poster, preload: 'none', playsinline: true, 'aria-label': x.label });
      const play = h('button', { class: 'clip-play', type: 'button', 'aria-label': 'Play ' + x.label }, fin('clip-fin'), h('span', null, 'Play'));
      const box = h('div', { class: 'clip' }, v, play);
      play.addEventListener('click', () => {
        document.querySelectorAll('.clip video').forEach(o => { if (o !== v) o.pause(); });
        box.classList.add('on'); v.controls = true; v.play().catch(() => {});
      });
      if (V3) box.dataset.swing = String(0.5 + i * 0.12);
      return box;
    };
    const photos = (c.photos || []).map((p, i) => {
      const f = h('figure', { class: 'print pitch-print' }, h('img', { src: p.src, alt: p.alt || '', loading: 'lazy', decoding: 'async' }), p.caption ? h('figcaption', null, p.caption) : null);
      if (V3) { f.dataset.swing = i ? '-0.5' : '0.6'; f.dataset.px = i ? '-0.03' : '0.04'; }
      return f;
    });
    return h('section', { class: 'section in pitches', id: 'pitches' },
      h('div', { class: 'section-head' }, h('h2', { class: 'section-title' }, c.title), h('p', { class: 'section-sub' }, c.text)),
      h('div', { class: 'pitch-wall' },
        h('div', { class: 'clip-row' }, c.clips.map(clip)),
        photos.length ? h('div', { class: 'pitch-prints' }, photos) : null));
  }

  // ---------- v3: a shark for each tier, bigger as you climb ----------
  function tierSharks(tiers) {
    if (!tiers) return;
    tiers.classList.add('tiers-sharks');
    tiers.dataset.play = '1';
    const sizes = [46, 68, 120, 138];
    const beats = ['0.85s', '1.15s', '1.6s', '2.3s']; // bigger sharks beat their tails slower
    tiers.querySelectorAll('.tier-stop').forEach((stop, i) => {
      const node = stop.querySelector('.tier-node');
      if (i === 3 && RT.megalodon) {               // the top tier IS the Megalodon: show the boss, not a swimmer
        const m = RT.megalodon('tier-meg');
        if (node) node.replaceWith(m); else stop.prepend(m);
        stop.classList.add('is-meg');
        return;
      }
      const variant = ['tier-reef', 'tier-tiger', 'tier-white', 'tier-mega'][i];
      const s = shark('tier-shark', variant);
      s.style.width = (sizes[i] || 60) + 'px';
      s.style.setProperty('--beat', beats[i] || '1.4s');
      if (node) node.replaceWith(s); else stop.prepend(s);
    });
  }

  // ---------- v3: the slim bar that follows you down the page ----------
  function nudgeBar() {
    if (S.me) return null;
    try { if (sessionStorage.getItem('rt_nudge_closed') === '1') return null; } catch (e) { /* storage blocked */ }
    const m = nextMeeting();
    const bar = h('div', { class: 'nudge', role: 'complementary', 'aria-label': 'Join Ridge Tank' },
      fin('nudge-fin'),
      h('p', { class: 'nudge-text' },
        m ? (m.days === 0 ? h('strong', null, 'Meeting today') : h('strong', null, h('span', { class: 'nudge-pre' }, 'Next meeting '), m.short)) : h('strong', null, 'Ridge Tank'),
        m ? h('span', null, [m.time, m.place].filter(Boolean).join(', ')) : h('span', null, 'Any MRHS student can join.')),
      h('a', { class: 'btn btn-primary', href: '#/signup' }, 'Join Ridge Tank'),
      h('button', { class: 'nudge-close', type: 'button', 'aria-label': 'Hide this bar' }, icon('x', 18)));
    bar.querySelector('.nudge-close').addEventListener('click', () => {
      bar.remove();
      try { sessionStorage.setItem('rt_nudge_closed', '1'); } catch (e) { /* ignore */ }
    });
    return bar;
  }

  // ---------- v3: the depth gauge down the right side. Each mark is a section; tap one to dive to it. ----------
  function depthGauge(root) {
    const stops = [['.hero2', 'Surface'], ['#crowd', 'Meeting one'], ['#pitches', 'Pitches'], ['#year', 'The year'], ['#mystery', 'Mystery'], ['#how', 'How it works'],
      ['#hoodie', 'Hoodie'], ['#tiers', 'Tiers'], ['#faq', 'Questions']]
      .map(([sel, label]) => ({ el: root.querySelector(sel), label })).filter(s => s.el);
    const nav = h('nav', { class: 'depth', 'aria-label': 'Jump to a section' },
      h('div', { class: 'depth-track' }, h('div', { class: 'depth-fill' })),
      stops.map(s => {
        const b = h('button', { class: 'depth-stop', type: 'button' }, h('span', { class: 'depth-label' }, s.label));
        b.addEventListener('click', () => {
          const y = s.el.getBoundingClientRect().top + window.scrollY - 84;
          window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        });
        s.btn = b;
        return b;
      }),
      h('div', { class: 'depth-diver', 'aria-hidden': 'true' }, shark('depth-shark')));
    nav.stops = stops;
    return nav;
  }

  RT.views.landing = RT.views.about = function (root, t) {
    const handle = original(root, t) || {};
    const oldHero = root.querySelector('.hero');
    const how = root.querySelector('#how');
    const tiers = root.querySelector('#tiers');
    const put = (node, before) => { if (node && before && before.parentNode) before.parentNode.insertBefore(node, before); };
    if (oldHero) oldHero.replaceWith(hero());
    else if (how) put(ticket('ticket-inline'), how); // members reach this page as "About": they still see the next meeting
    put(crowd(), how);
    put(pitches(), how);
    put(phases(), how);
    put(mystery(), how);
    put(hoodie(), tiers);
    if (!V3) return handle;

    tierSharks(tiers);
    document.querySelectorAll('body > .nudge, body > .depth, body > .scrollbar').forEach(el => el.remove()); // left over from a redraw
    const extras = [nudgeBar(), depthGauge(root), h('div', { class: 'scrollbar', 'aria-hidden': 'true' }, h('div', { class: 'scrollbar-fill' }))].filter(Boolean);
    extras.forEach(el => document.body.appendChild(el));
    if (RT.tank) RT.tank.start(root, extras);
    const inner = handle.cleanup;
    handle.cleanup = function () {
      if (RT.tank) RT.tank.stop();
      extras.forEach(el => el.remove());
      if (inner) inner();
    };
    return handle;
  };

  // ---------- v3: log in and sign up get a poster beside the form ----------
  if (V3 && RT.views.auth) {
    const authOriginal = RT.views.auth;
    const WORDS = {
      login: ['Welcome back.', 'Your Bites, your badges and your next Academy level are right where you left them.'],
      signup: ['Get in the Tank.', 'Free for any MRHS student. It takes about a minute, and you can start Tank Academy tonight.']
    };
    RT.views.auth = function (root, t) {
      const handle = authOriginal(root, t) || {};
      const wrap = root.querySelector('.auth-wrap');
      if (!wrap) return handle;
      wrap.classList.add('auth-split');
      const big = h('h2', { class: 'auth-big' });
      const line = h('p', { class: 'auth-line' });
      // Logging in: the next meeting. Signing up: the people you would be joining.
      const tk = ticket();
      const pic = (cfg.crowd && cfg.crowd.show && cfg.crowd.photo) ? print('auth-photo', cfg.crowd.caption) : null;
      const say = mode => {
        const up = mode === 'signup';
        const w = WORDS[up ? 'signup' : 'login'];
        big.textContent = w[0]; line.textContent = w[1];
        if (tk) tk.hidden = up && !!pic;
        if (pic) pic.hidden = !up;
      };
      say(t && t.mode);
      wrap.insertBefore(h('aside', { class: 'auth-side' }, big, line, tk, pic), wrap.firstChild);
      const inner = handle.update;
      handle.update = nt => { if (inner) inner(nt); say(nt && nt.mode); };
      return handle;
    };
  }

  // ---------- v3: the sponsor page shows the real room next to the pitch ----------
  if (V3 && RT.views.sponsor && cfg.crowd && cfg.crowd.show && cfg.crowd.photo) {
    const sponsorOriginal = RT.views.sponsor;
    RT.views.sponsor = function (root, t) {
      const handle = sponsorOriginal(root, t);
      const heroEl = root.querySelector('.sp-hero');
      if (heroEl && !heroEl.querySelector('.print')) {
        const copy = h('div', { class: 'sp-hero-copy' }, ...heroEl.childNodes);
        heroEl.append(copy, print('sp-photo', cfg.crowd.caption));
        heroEl.classList.add('sp-hero-split');
      }
      return handle;
    };
  }

  // ---------- v3: the member dashboard gets labels for its groups, a shark that swims, and numbers that count up ----------
  if (V3 && RT.views.home) {
    const homeOriginal = RT.views.home;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const label = t => h('h2', { class: 'dash-label' }, fin('dash-label-fin'), h('span', null, t));
    function dress(root) {
      const banner = root.querySelector('.countdown-banner'), top = root.querySelector('.home-top'), grid = root.querySelector('.home-grid');
      const first = banner || top;
      if (first && !root.querySelector('.dash-label')) {
        first.parentNode.insertBefore(label('Up next'), first);
        if (grid) grid.parentNode.insertBefore(label('Your numbers'), grid);
        const head = root.querySelector('.page-head');
        // Back wave, then the fin, then the front water: the surface passes in front of the fin's base, so it cuts through the water.
        if (head) head.after(h('div', { class: 'dash-water', 'aria-hidden': 'true' }, h('div', { class: 'dw-back' }), h('div', { class: 'dash-swimmer' }, fin('dw-fin')), h('div', { class: 'dw-front' })));
      }
      const main = root.querySelector('.points-card .stand-main');
      if (main && !main.querySelector('.my-shark')) {
        const chip = root.querySelector('.points-card .tier-chip');
        const tier = ['tier-reef', 'tier-tiger', 'tier-white', 'tier-mega'].findIndex(c => chip && chip.classList.contains(c));
        const s = (tier >= 3 && RT.megalodon) ? RT.megalodon('my-shark t3 my-meg') : shark('my-shark t' + Math.max(0, tier), ['tier-reef','tier-tiger','tier-white'][Math.max(0, tier)]);
        if (!s.classList.contains('my-meg')) s.style.setProperty('--beat', ['0.9s', '1.2s', '1.6s', '2.2s'][Math.max(0, tier)]);
        main.appendChild(s);
        main.classList.add('has-shark');
        const num = main.querySelector('.big-num'), fill = main.querySelector('.bar-fill');
        const to = num ? parseInt(num.textContent.replace(/[^0-9]/g, ''), 10) : 0;
        if (!still && num && to > 0) {
          const t0 = performance.now();
          (function tick(now) { const k = Math.min(1, (now - t0) / 1300), e = 1 - Math.pow(1 - k, 4); num.textContent = Math.round(to * e).toLocaleString(); if (k < 1) requestAnimationFrame(tick); })(t0);
        }
        if (!still && fill) { const w = fill.style.width; fill.style.transition = 'none'; fill.style.width = '0%'; requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transition = 'width 1.5s cubic-bezier(0.3, 0, 0.2, 1) 0.3s'; fill.style.width = w; })); }
      }
    }
    RT.views.home = function (root, t) {
      const handle = homeOriginal(root, t);
      dress(root);
      const mo = new MutationObserver(() => dress(root));
      mo.observe(root, { childList: true, subtree: true });
      setTimeout(() => mo.disconnect(), 15000);
      return handle;
    };
  }

  // Coming back from Stripe: say thanks once.
  (function thanks() {
    const from = String(window.RT_ARRIVED || '');
    if (/[?&]hoodie=paid/.test(from)) setTimeout(() => toast('Paid. Your hoodie is ordered! The receipt is in your email.', 'success', 7000), 900);
    else if (/#\/sponsor\?paid=1/.test(from)) setTimeout(() => toast('Paid. Thank you! Check your email for the link to your sponsor dashboard.', 'success', 8000), 900);
  })();

  // If the page was already drawn before this file loaded, draw it again with the new sections.
  const view = document.body.dataset.view;
  if ((view === 'landing' || view === 'about' || (V3 && (view === 'auth' || view === 'sponsor' || view === 'home'))) && RT.rerender) RT.rerender();
})();
