// Motion for look v3 ("the Tank"). Two parts:
//
// 1. The sea layer (every screen): a few specks drifting up like marine snow, and the odd bubble. It sits between
//    the moving background and the page, and slides a little when you scroll, so the page feels like it is under water.
//
// 2. The landing page scroll engine (js/landing2.js starts and stops it). As you scroll:
//      - things rise into place the first time you reach them
//      - the background gets darker the deeper you go, and the water in the word TANK climbs
//      - the depth gauge follows you down; its shark tips nose-down while you dive and levels out when you stop
//      - the ticket and the pinned photos swing a little with your scroll speed, then settle like something hanging
//      - big things drift slower or faster than the page (data-px), smoothed so they glide instead of jumping
//      - a fin rides along the top of the mystery block (data-ride)
//      - numbers count to their value (data-count-from / data-count-to)
//      - the Join bar slides up once you are past the top of the page
//
// People who ask their device for less motion get everything already in place, with no drifting or swinging.
(function () {
  const RT = (window.RT = window.RT || {});
  const html = document.documentElement;
  if (html.dataset.look !== 'v3') { RT.tank = { start() {}, stop() {} }; return; }
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // Slow devices (older Chromebooks) get "lite" motion: everything still slides and settles, but the loops that
  // repaint all the time (rolling waves, bubbles, the sea layer, tail beats) hold still. It is decided once, from how
  // smoothly the first couple of seconds ran. Force it either way with ?motion=lite or ?motion=full in the address.
  (function probe() {
    if (reduce) return;
    let want = null;
    try { want = new URLSearchParams(location.search).get('motion'); } catch (e) { /* ignore */ }
    if (want === 'full') return;
    if (want === 'lite') { html.classList.add('tank-lite'); return; }
    let n = 0, slow = 0, last = 0;
    function f(now) {
      if (document.hidden) return;              // can't judge a tab nobody is looking at
      if (last) { n++; if (now - last > 28) slow++; }
      last = now;
      if (n < 60) requestAnimationFrame(f);
      else if (slow > 30) html.classList.add('tank-lite');
    }
    setTimeout(() => requestAnimationFrame(f), 2600);
  })();

  // =====================================================================
  // 1. The sea layer
  // =====================================================================
  (function sea() {
    if (reduce) return;
    const canvas = document.createElement('canvas');
    canvas.id = 'sea';
    canvas.setAttribute('aria-hidden', 'true');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const mount = () => { const bg = document.getElementById('bg'); if (bg && bg.parentNode) bg.parentNode.insertBefore(canvas, bg.nextSibling); else document.body.prepend(canvas); };
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);

    let W = 0, H = 0, dpr = 1, specks = [], bubbles = [], raf = 0, last = 0, lastY = window.scrollY, nextBubble = 2;
    let surface = -1e9, surfaceEl = null, tick = 0; // the hero's waterline, when it is on screen: above it is air
    const rnd = (a, b) => a + Math.random() * (b - a);

    function speck(anywhere) {
      const z = rnd(0.25, 1); // depth: 1 is close (bigger, brighter, moves more)
      return { x: rnd(0, W), y: anywhere ? rnd(0, H) : H + 4, z, r: rnd(0.5, 1.7) * z + 0.3, a: rnd(0.08, 0.3) * z, vy: -rnd(3, 9) * z, sway: rnd(4, 14), f: rnd(0.15, 0.5), ph: rnd(0, 6.28) };
    }
    function bubble(x) {
      const r = rnd(1.6, 5.2);
      // Bigger bubbles rise faster and wobble wider, like the real thing.
      return { x: x == null ? rnd(W * 0.05, W * 0.95) : x + rnd(-14, 14), y: H + r + rnd(0, 40), r, vy: -(26 + r * 9), amp: 3 + r * 1.3, f: rnd(1.1, 2.1), ph: rnd(0, 6.28), a: rnd(0.16, 0.34) };
    }
    // ---- more life: light rays from above, schools of fish in the middle distance, and now and then a big shark far off ----
    let rays = [], schools = [], far = null, nextSchool = 5, nextFar = 16, mx = 0, my = 0, pmx = 0, pmy = 0;
    const SK = { front: new Path2D('M198 45C188 36 164 26 138 23L114 1C113 11 110 19 103 24L98 25L97 57.4C108 59.2 119 60 130 60L113 82C128 77 141 69 150 60C166 59 184 55 192 50Z'),
      rear: new Path2D('M106 23.6C94 25.6 83 28 74 30L63 23L66 32C58 34 52 36 46 38L46 46C60 49 72 53 84 55L80 64L95 57C98 57.6 101 58 104 58.4Z'),
      tail: new Path2D('M50 37L4 2C14 20 21 31 26 42C22 50 19 58 16 67L50 46.6Z') };
    const busy = () => (document.body.dataset.view === 'academy' ? 0.55 : 1); // the Academy is the liveliest water
    function ray(i, n) { return { x: (i + rnd(0.2, 0.8)) / n, w: rnd(60, 150), lean: rnd(0.16, 0.34), a: rnd(0.028, 0.055), f: rnd(0.05, 0.11), ph: rnd(0, 6.28) }; }
    function school() {
      const dir = Math.random() < 0.5 ? 1 : -1, z = rnd(0.35, 1), n = Math.round(rnd(6, 15) * (W < 720 ? 0.6 : 1));
      const fish = Array.from({ length: n }, (_, i) => ({ ox: -rnd(0, 26) * i * 0.5 - rnd(0, 30), oy: rnd(-1, 1) * (16 + n * 2.2), s: rnd(0.8, 1.25), ph: rnd(0, 6.28), f: rnd(7, 11), lag: rnd(0.2, 1.3) }));
      return { dir, z, x: dir > 0 ? -80 : W + 80, y: rnd(H * 0.18, H * 0.86), v: rnd(46, 84) * z, wob: rnd(18, 46), wf: rnd(0.25, 0.5), ph: rnd(0, 6.28), fish, scare: 0, t0: 0 };
    }
    function farShark() {
      const dir = Math.random() < 0.5 ? 1 : -1, w = rnd(240, 420);
      return { dir, w, x: dir > 0 ? -w : W + w, y: rnd(H * 0.2, H * 0.7), v: rnd(13, 22), a: rnd(0.045, 0.075), beat: rnd(2.4, 3.2), ph: rnd(0, 6.28) };
    }
    function drawFish(x, y, len, ang, wag, alpha) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.ellipse(0, 0, len * 0.5, len * 0.17, 0, 0, 6.2832); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-len * 0.42, 0); ctx.lineTo(-len * 0.82, -len * 0.2 + wag); ctx.lineTo(-len * 0.82, len * 0.2 + wag); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    function drawFar(t) {
      const f = far, k = f.w / 200, sw = Math.sin(t * 6.2832 / f.beat + f.ph);
      ctx.save(); ctx.translate(f.x + pmx * 6, f.y + Math.sin(t * 0.3 + f.ph) * 10 + pmy * 4); ctx.scale(f.dir * k, k); ctx.translate(-100, -42);
      ctx.globalAlpha = f.a; ctx.fillStyle = '#9fd9c0';
      ctx.fill(SK.front);
      ctx.translate(104, 41); ctx.rotate(sw * 0.045); ctx.translate(-104, -41); ctx.fill(SK.rear);
      ctx.translate(48, 42); ctx.rotate(Math.sin(t * 6.2832 / f.beat + f.ph - 0.9) * 0.1); ctx.translate(-48, -42); ctx.fill(SK.tail);
      ctx.restore();
    }
    window.addEventListener('pointermove', e => { mx = e.clientX / (W || 1) - 0.5; my = e.clientY / (H || 1) - 0.5; }, { passive: true });
    // The water answers a click: a few bubbles from that spot, and nearby fish scatter.
    window.addEventListener('pointerdown', e => {
      if (!raf) return;
      for (let i = 0; i < 4; i++) { const b = bubble(e.clientX); b.y = e.clientY + rnd(-4, 10); b.r = rnd(1.4, 3.4); bubbles.push(b); }
      for (const sc of schools) if (Math.abs(sc.x - e.clientX) < 260 && Math.abs(sc.y - e.clientY) < 200) sc.scare = 1;
    }, { passive: true });

    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = W < 720 ? 20 : 42;
      specks = Array.from({ length: n }, () => speck(true));
      bubbles = [];
      const nr = W < 720 ? 3 : 5;
      rays = Array.from({ length: nr }, (_, i) => ray(i, nr));
      schools = []; far = null;
    }

    function frame(now) {
      if (html.classList.contains('tank-lite')) { halt(); ctx.clearRect(0, 0, W, H); return; }
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
      if (dt < 0.03) return; // about 30 frames a second is plenty for something this slow
      last = now;
      const t = now / 1000;
      const y = window.scrollY, dy = y - lastY; lastY = y;
      ctx.clearRect(0, 0, W, H);
      if (tick++ % 20 === 0) surfaceEl = document.querySelector('.waterline');
      surface = surfaceEl && surfaceEl.isConnected ? surfaceEl.getBoundingClientRect().bottom - 8 : -1e9;

      pmx += (mx - pmx) * 0.06; pmy += (my - pmy) * 0.06; // the layers lean a little with the pointer, the near ones most

      // back: light from above, swaying slowly. Skipped while the hero's surface is on screen (that is air up there).
      if (surface < -1e8) {
        for (const r of rays) {
          const x0 = r.x * W + Math.sin(t * r.f + r.ph) * 40 - pmx * 10, lean = (r.lean + Math.sin(t * r.f * 0.7 + r.ph) * 0.05) * H;
          const g = ctx.createLinearGradient(0, 0, 0, H * 0.78);
          g.addColorStop(0, 'rgba(190,240,215,' + r.a + ')'); g.addColorStop(1, 'rgba(190,240,215,0)');
          ctx.globalAlpha = 0.75 + Math.sin(t * r.f * 2.3 + r.ph) * 0.25;
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0 + r.w, 0); ctx.lineTo(x0 + r.w * 1.9 - lean, H * 0.78); ctx.lineTo(x0 - lean - r.w * 0.5, H * 0.78); ctx.closePath(); ctx.fill();
        }
        // far: one big shark, rarely, barely there
        nextFar -= dt;
        if (!far && nextFar <= 0) far = farShark();
        if (far) {
          far.x += far.dir * far.v * dt; far.y -= dy * 0.08;
          drawFar(t);
          if (far.x < -far.w * 1.2 || far.x > W + far.w * 1.2) { far = null; nextFar = rnd(28, 60) * busy(); }
        }
      }

      // middle: schools of fish. Each fish trails the leader's path with its own lag, so the school bends as it turns.
      nextSchool -= dt;
      if (nextSchool <= 0 && schools.length < 2) { schools.push(school()); nextSchool = rnd(9, 22) * busy(); }
      ctx.fillStyle = '#bfe9d6';
      for (let i = schools.length - 1; i >= 0; i--) {
        const sc = schools[i];
        sc.t0 += dt; sc.scare = Math.max(0, sc.scare - dt * 0.7);
        sc.x += sc.dir * sc.v * (1 + sc.scare * 1.6) * dt; sc.y -= dy * sc.z * 0.2;
        if (sc.x < -420 || sc.x > W + 420) { schools.splice(i, 1); continue; }
        const path = tt => sc.y + Math.sin(tt * sc.wf + sc.ph) * sc.wob;
        for (const f of sc.fish) {
          const tt = sc.t0 - f.lag, fx = sc.x + sc.dir * f.ox * (1 + sc.scare * 0.8) + pmx * 14 * sc.z, base = path(tt);
          const fy = base + f.oy * (1 + sc.scare * 1.3) + Math.sin(t * 1.3 + f.ph) * 3 + pmy * 8 * sc.z;
          if (fy < surface) continue;
          const slope = (path(tt + 0.1) - base) / (sc.v * 0.1);
          const len = (9 + 9 * sc.z) * f.s;
          drawFish(fx, fy, len, sc.dir > 0 ? Math.atan(slope) : Math.PI - Math.atan(slope), Math.sin(t * f.f * (1 + sc.scare) + f.ph) * len * 0.14, 0.1 + 0.2 * sc.z);
        }
      }
      ctx.globalAlpha = 1;

      for (const s of specks) {
        s.y += s.vy * dt - dy * s.z * 0.3; // scrolling down pushes them up past you, the close ones most
        if (s.y < -6) { s.y = H + 4; s.x = rnd(0, W); } else if (s.y > H + 6) { s.y = -4; s.x = rnd(0, W); }
        if (s.y < surface) continue;
        const x = s.x + Math.sin(t * s.f + s.ph) * s.sway + pmx * 10 * s.z;
        ctx.globalAlpha = s.a;
        ctx.fillStyle = '#d8f3e6';
        ctx.beginPath(); ctx.arc(x, s.y, s.r, 0, 6.2832); ctx.fill();
      }

      nextBubble -= dt;
      if (nextBubble <= 0) { // a small burst from one spot, then a quiet stretch
        const x = rnd(W * 0.08, W * 0.92), k = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < k; i++) bubbles.push(bubble(x));
        nextBubble = rnd(2.5, 6);
      }
      ctx.lineWidth = 1;
      for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.y += b.vy * dt - dy * 0.45;
        b.r += dt * 0.12; // they swell a touch as they rise
        if (b.y < -12 || b.y > H + 80 || b.y - b.r < surface) { bubbles.splice(i, 1); continue; } // gone, or popped at the surface
        const x = b.x + Math.sin(t * b.f + b.ph) * b.amp;
        ctx.globalAlpha = b.a;
        ctx.strokeStyle = '#c9f2df';
        ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, 6.2832); ctx.stroke();
        ctx.globalAlpha = b.a * 1.5; // the little highlight on the upper left
        ctx.beginPath(); ctx.arc(x, b.y, b.r * 0.62, 3.5, 4.6); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    const lightOn = () => html.getAttribute('data-theme') === 'light';
    function run() { if (!raf && !document.hidden && !lightOn()) { last = performance.now(); lastY = window.scrollY; raf = requestAnimationFrame(frame); } }
    function halt() { cancelAnimationFrame(raf); raf = 0; }
    window.addEventListener('resize', size);
    document.addEventListener('visibilitychange', () => (document.hidden ? halt() : run()));
    window.addEventListener('rt:theme', e => { if (e.detail === 'light') { halt(); ctx.clearRect(0, 0, W, H); } else run(); });
    size(); run();
  })();

  // =====================================================================
  // 2. The landing page scroll engine
  // =====================================================================
  let live = null;

  // What rises into view. Things matched by the same line come in one after another.
  const RISE = [
    '.crowd-photo', '.crowd-copy > *',
    '#pitches .section-head', '.clip', '.pitch-print',
    '#year .section-head', '.year-track', '.phase', '.prize-line',
    '.mystery-mark .q', '.mystery-copy > *',
    '#how .section-head', '.how-list li',
    '.hoodie-photos img', '.hoodie-copy > *',
    '#tiers .section-head', '.tier-stop',
    '#faq .section-head', '.closer .card', '#officers .section-head'
  ];

  function countTo(el) {
    const from = parseFloat(el.dataset.countFrom), to = parseFloat(el.dataset.countTo);
    const pre = el.dataset.countPrefix || '', suf = el.dataset.countSuffix || '';
    const fmt = n => pre + (Number.isInteger(to) ? Math.round(n) : n.toFixed(2)) + suf;
    if (!isFinite(from) || !isFinite(to) || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 1100;
    (function tick(now) {
      const k = clamp((now - t0) / dur, 0, 1);
      const eased = 1 - Math.pow(1 - k, 4);
      el.textContent = fmt(from + (to - from) * eased);
      if (k < 1 && live) requestAnimationFrame(tick); else el.textContent = fmt(to);
    })(t0);
  }

  function start(root, extras) {
    stop();
    html.classList.toggle('tank-still', reduce);
    const state = { raf: 0, ios: [], onScroll: null, onLoad: null };
    live = state;

    // ---- rise into place ----
    const rising = [];
    const counters = [...root.querySelectorAll('[data-count-from]')];
    if (!reduce) {
      RISE.forEach(sel => root.querySelectorAll(sel).forEach((el, i) => { el.classList.add('rv'); el.style.setProperty('--rv-i', String(Math.min(i, 6))); rising.push(el); }));
      counters.forEach(el => { el.textContent = (el.dataset.countPrefix || '') + el.dataset.countFrom + (el.dataset.countSuffix || ''); });
    }
    if (!reduce && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver(entries => entries.forEach(e => {
        if (!e.isIntersecting) return;
        e.target.classList.add('in');
        io.unobserve(e.target);
        const c = e.target.matches('[data-count-from]') ? e.target : e.target.querySelector('[data-count-from]');
        if (c && !c.dataset.counted) { c.dataset.counted = '1'; setTimeout(() => countTo(c), 380); }
      }), { rootMargin: '0px 0px -9% 0px', threshold: 0.1 });
      rising.forEach(el => io.observe(el));
      state.ios.push(io);
      // Slow background loops (the shark behind the mystery block) only run while their block is on screen.
      const play = new IntersectionObserver(entries => entries.forEach(e => e.target.classList.toggle('playing', e.isIntersecting)), { rootMargin: '10% 0px 10% 0px' });
      root.querySelectorAll('[data-play]').forEach(el => play.observe(el));
      state.ios.push(play);
    } else {
      rising.forEach(el => el.classList.add('in'));
      root.querySelectorAll('[data-play]').forEach(el => el.classList.add('playing'));
    }

    // ---- the bite: something takes a bite out of the ticket once it has landed and you can see it (once per visit) ----
    const tk = root.querySelector('.hero2 .ticket');
    let bitten = false;
    try { bitten = sessionStorage.getItem('rt_bitten') === '1'; } catch (e) { /* storage blocked */ }
    if (tk && !reduce && !bitten && 'IntersectionObserver' in window) {
      tk.classList.add('await-bite');
      const born = performance.now();
      const watch = new IntersectionObserver(entries => entries.forEach(e => {
        if (e.intersectionRatio < 0.6) return;
        watch.disconnect();
        setTimeout(() => { tk.classList.add('bite'); try { sessionStorage.setItem('rt_bitten', '1'); } catch (x) { /* ignore */ } },
          Math.max(450, 2100 - (performance.now() - born)));
      }), { threshold: [0.6] });
      watch.observe(tk);
      state.ios.push(watch);
    }

    // ---- everything tied to the scroll position ----
    const drifters = [...root.querySelectorAll('[data-px]')].map(el => ({ el, k: parseFloat(el.dataset.px) || 0, cur: 0 }));
    const swingers = [...root.querySelectorAll('[data-swing]')].map(el => ({ el, k: parseFloat(el.dataset.swing) || 1 }));
    const riders = [...root.querySelectorAll('[data-ride]')];
    const tankWord = root.querySelector('.ht-tank');
    const heroEl = root.querySelector('.hero2');
    const pick = cls => (extras || []).find(el => el.classList.contains(cls));
    const nudge = pick('nudge'), depth = pick('depth'), bar = pick('scrollbar');
    const depthFill = depth && depth.querySelector('.depth-fill');
    const diver = depth && depth.querySelector('.depth-diver');
    const stops = (depth && depth.stops) || [];
    const barFill = bar && bar.querySelector('.scrollbar-fill');
    const wide = window.matchMedia('(min-width: 900px)');

    let max = 1, vh = window.innerHeight, frames = 0;
    function measure() {
      vh = window.innerHeight;
      max = Math.max(1, document.documentElement.scrollHeight - vh);
      const y = window.scrollY;
      stops.forEach(s => {
        s.pos = clamp((s.el.getBoundingClientRect().top + y - 84) / max, 0, 1);
        s.btn.style.top = (s.pos * 100).toFixed(2) + '%';
      });
    }

    // A spring: pulls "x" toward "to", overshoots a little, settles. Used for anything that should feel like it has weight.
    // It is stepped in small fixed slices of time, so a slow device shows the same swing as a fast one, just in fewer frames.
    const STEP = 1 / 120;
    const spring = (s, to, dt, k, c) => {
      for (let left = dt; left > 0; left -= STEP) { const h = Math.min(STEP, left); s.v += (-k * (s.x - to) - c * s.v) * h; s.x += s.v * h; }
    };
    const tilt = { x: 0, v: 0 }, pitch = { x: 0, v: 0 };
    let lastY = window.scrollY, lastT = performance.now(), vel = 0, activeStop = -1;

    function frame(now) {
      state.raf = 0;
      const dt = clamp((now - lastT) / 1000, 0.001, 0.25); lastT = now;
      const y = window.scrollY;
      const instant = (y - lastY) / dt; lastY = y;            // px per second, positive = going down
      vel += (instant - vel) * (1 - Math.exp(-dt * 14));       // smoothed
      const p = clamp(y / max, 0, 1);
      if (++frames % 45 === 1) measure();

      if (window.RTMesh) window.RTMesh.setDim(1 - 0.5 * p);                                   // deeper = darker
      if (tankWord && heroEl) tankWord.style.setProperty('--dive', clamp(y / (heroEl.offsetHeight * 0.75), 0, 1).toFixed(3));
      if (depthFill) depthFill.style.transform = `scaleY(${p.toFixed(4)})`;
      if (barFill) barFill.style.transform = `scaleX(${p.toFixed(4)})`;
      if (nudge) nudge.classList.toggle('show', y > vh * 0.7 && y < max - 140);
      if (stops.length) {
        let a = 0;
        stops.forEach((s, i) => { if (p >= s.pos - 0.004) a = i; });
        if (a !== activeStop) { activeStop = a; stops.forEach((s, i) => s.btn.classList.toggle('on', i === a)); }
      }
      for (const el of riders) {
        const host = el.parentElement.getBoundingClientRect();
        if (host.top > vh + 100 || host.top < -200) continue;
        el.style.setProperty('--ride', clamp(1 - host.top / vh, 0, 1).toFixed(4));        // 0 as the block enters, 1 at the top
      }

      let moving = Math.abs(vel) > 4;
      if (!reduce) {
        // The diver: nose down while you descend, nose up on the way back, level when you stop.
        spring(pitch, clamp(vel * 0.03, -42, 42), dt, 90, 13);
        if (diver) { diver.style.top = (p * 100).toFixed(2) + '%'; diver.style.setProperty('--pitch', pitch.x.toFixed(2) + 'deg'); }
        // Hanging things swing against the direction of travel, then settle.
        spring(tilt, clamp(-vel * 0.0022, -5, 5), dt, 70, 6);
        for (const s of swingers) s.el.style.setProperty('--tilt', (tilt.x * s.k).toFixed(3) + 'deg');
        if (Math.abs(tilt.v) > 0.05 || Math.abs(tilt.x) > 0.02 || Math.abs(pitch.v) > 0.3 || Math.abs(pitch.x) > 0.2) moving = true;
        // Drifting things glide toward where they should be instead of jumping there.
        if (wide.matches) {
          const ease = 1 - Math.exp(-dt * 9);
          for (const d of drifters) {
            const r = d.el.getBoundingClientRect();
            if (r.bottom < -300 || r.top > vh + 300) continue;
            const to = (r.top - d.cur + r.height / 2 - vh / 2) * d.k;
            d.cur += (to - d.cur) * ease;
            if (Math.abs(to - d.cur) > 0.2) moving = true;
            d.el.style.setProperty('--py', d.cur.toFixed(2) + 'px');
          }
        }
      } else if (diver) diver.style.top = (p * 100).toFixed(2) + '%';

      if (moving) state.raf = requestAnimationFrame(frame);    // keep going until everything has come to rest
    }
    state.onScroll = () => { if (!state.raf) { lastT = performance.now() - 16; lastY = window.scrollY; state.raf = requestAnimationFrame(frame); } };
    state.onLoad = () => { measure(); state.onScroll(); };
    window.addEventListener('scroll', state.onScroll, { passive: true });
    window.addEventListener('resize', state.onLoad);
    window.addEventListener('load', state.onLoad);
    measure();
    state.onScroll();
    setTimeout(() => { if (live === state) state.onLoad(); }, 1200); // once fonts and pictures have settled
  }

  function stop() {
    if (!live) return;
    if (live.raf) cancelAnimationFrame(live.raf);
    live.ios.forEach(io => io.disconnect());
    if (live.onScroll) window.removeEventListener('scroll', live.onScroll);
    if (live.onLoad) { window.removeEventListener('resize', live.onLoad); window.removeEventListener('load', live.onLoad); }
    live = null;
  }

  RT.tank = { start, stop };
})();
