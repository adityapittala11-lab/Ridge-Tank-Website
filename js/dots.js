// Big text drawn as small dots, matching the opening animation.
// The real text stays in the page (for screen readers, copy/paste and layout) but is made
// transparent; a canvas on top redraws each word as a grid of dots sampled from its letters.
// The hero title also shimmers, forms in when the page appears, and scatters away from the cursor.
(function () {
  const RT = (window.RT = window.RT || {});
  const SELECTOR = '.hero-title, .page-title, .section-title, .auth-title, .profile-name, .big-num';
  const state = new Map(); // element -> render state
  const queue = new Set();
  let raf = 0;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });

  const STRETCH = [[50, 'ultra-condensed'], [62.5, 'extra-condensed'], [75, 'condensed'], [87.5, 'semi-condensed'], [100, 'normal'], [112.5, 'semi-expanded'], [125, 'expanded']];
  function stretchKeyword(v) {
    const pct = parseFloat(v);
    if (!pct) return v && isNaN(parseFloat(v)) ? v : 'normal';
    return STRETCH.reduce((best, s) => (Math.abs(s[0] - pct) < Math.abs(best[0] - pct) ? s : best))[1];
  }

  function schedule(el) {
    queue.add(el);
    if (!raf) raf = requestAnimationFrame(flush);
  }
  function flush() {
    raf = 0;
    const els = [...queue];
    queue.clear();
    els.forEach(render);
  }

  function attach(el) {
    if (state.has(el)) return;
    const canvas = document.createElement('canvas');
    canvas.className = 'dot-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    const st = {
      canvas,
      ctx: canvas.getContext('2d'),
      color: getComputedStyle(el).color,
      hero: el.classList.contains('hero-title'),
      dots: null,
      born: 0,
      visible: true,
      loop: 0
    };
    state.set(el, st);
    st.ro = new ResizeObserver(() => schedule(el));
    st.ro.observe(el);
    st.mo = new MutationObserver(muts => {
      const onlyCanvas = muts.every(m => m.type === 'childList' &&
        [...m.addedNodes, ...m.removedNodes].every(n => n === canvas));
      if (!onlyCanvas) schedule(el);
    });
    st.mo.observe(el, { childList: true, characterData: true, subtree: true });
    if (st.hero) setupHero(el, st);
    schedule(el);
  }

  function detach(el) {
    const st = state.get(el);
    if (!st) return;
    st.ro.disconnect();
    st.mo.disconnect();
    if (st.io) st.io.disconnect();
    cancelAnimationFrame(st.loop);
    state.delete(el);
  }

  // Lay each word out exactly where the browser put it, then sample the letters on a grid.
  function render(el) {
    const st = state.get(el);
    if (!st) return;
    if (!el.isConnected) { detach(el); return; }
    const box = el.getBoundingClientRect();
    if (box.width < 2 || box.height < 2) return;
    if (st.canvas.parentNode !== el) el.appendChild(st.canvas);

    const cs = getComputedStyle(el);
    const fontSize = parseFloat(cs.fontSize) || 16;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pad = Math.ceil(fontSize * 0.3);
    const cssW = box.width + pad * 2;
    const cssH = box.height + pad * 2;
    const W = Math.max(2, Math.ceil(cssW * dpr));
    const H = Math.max(2, Math.ceil(cssH * dpr));

    off.width = W;
    off.height = H;
    octx.clearRect(0, 0, W, H);
    octx.fillStyle = '#fff';
    octx.textBaseline = 'alphabetic';
    octx.textAlign = 'left';
    octx.font = `${cs.fontStyle} ${cs.fontWeight} ${fontSize * dpr}px ${cs.fontFamily}`;
    if ('fontStretch' in octx) octx.fontStretch = stretchKeyword(cs.fontStretch);
    if ('letterSpacing' in octx) octx.letterSpacing = ((parseFloat(cs.letterSpacing) || 0) * dpr) + 'px';
    const metrics = octx.measureText('Hg');
    const ascent = metrics.fontBoundingBoxAscent || fontSize * 0.82 * dpr;

    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node, drew = false;
    while ((node = walker.nextNode())) {
      const text = node.nodeValue;
      const re = /\S+/g;
      let m;
      while ((m = re.exec(text))) {
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const rects = range.getClientRects();
        if (!rects.length) continue;
        const rc = rects[0];
        const x = (rc.left - box.left + pad) * dpr;
        const y = (rc.top - box.top + pad) * dpr + ascent;
        // Squeeze or stretch the word to the exact width the page gave it, so words never collide
        // even if this browser's canvas can't do condensed type.
        const w = octx.measureText(m[0]).width;
        const sx = w > 0 ? Math.min(1.6, Math.max(0.6, (rc.width * dpr) / w)) : 1;
        octx.setTransform(sx, 0, 0, 1, x, y);
        octx.fillText(m[0], 0, 0);
        octx.setTransform(1, 0, 0, 1, 0, 0);
        drew = true;
      }
    }
    if (!drew) return;

    const data = octx.getImageData(0, 0, W, H).data;
    // Finer grid on smaller headings so they stay readable; coarser on the big title.
    const gapCss = Math.min(3.2, Math.max(2.3, fontSize / 21));
    // At least 3 screen pixels between dots, so each dot can be 2px and small titles don't wash out.
    const gap = Math.max(3, Math.round(gapCss * dpr));
    const half = gap >> 1;
    const list = [];
    for (let y = half; y < H; y += gap) {
      for (let x = half; x < W; x += gap) {
        if (data[(y * W + x) * 4 + 3] > 120) list.push(x, y);
      }
    }

    const n = list.length / 2;
    const d = {
      n, gap, dpr, W, H,
      x: new Float32Array(n), y: new Float32Array(n),
      s: new Float32Array(n), a: new Float32Array(n), ph: new Float32Array(n),
      ox: new Float32Array(n), oy: new Float32Array(n),
      fx: new Float32Array(n), fy: new Float32Array(n)
    };
    for (let i = 0; i < n; i++) {
      d.x[i] = list[i * 2];
      d.y[i] = list[i * 2 + 1];
      // The hero uses the intro's proportions (dots about half the spacing). Smaller headings get
      // chunkier, brighter dots so they stay easy to read.
      d.s[i] = Math.max(1, Math.round(gap * (st.hero ? 0.42 + Math.random() * 0.3 : 0.58 + Math.random() * 0.24)));
      d.a[i] = st.hero ? 0.78 + Math.random() * 0.22 : 0.9 + Math.random() * 0.1;
      d.ph[i] = Math.random() * Math.PI * 2;
      d.fx[i] = (Math.random() - 0.5) * 60 * dpr;
      d.fy[i] = (Math.random() - 0.5) * 36 * dpr - 10 * dpr;
    }
    st.dots = d;

    const cv = st.canvas;
    cv.width = W;
    cv.height = H;
    cv.style.left = -pad + 'px';
    cv.style.top = -pad + 'px';
    cv.style.width = cssW + 'px';
    cv.style.height = cssH + 'px';
    el.classList.add('dotted');

    if (st.hero && !reduceMotion) { if (!st.loop) st.loop = requestAnimationFrame(t => heroFrame(el, st, t)); }
    else drawStatic(st);
  }

  function drawStatic(st) {
    const { ctx } = st;
    const d = st.dots;
    ctx.clearRect(0, 0, d.W, d.H);
    ctx.fillStyle = st.color;
    for (let i = 0; i < d.n; i++) {
      ctx.globalAlpha = d.a[i];
      const s = d.s[i];
      ctx.fillRect(d.x[i] - s / 2, d.y[i] - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- hero: form in, shimmer, part around the cursor ----------
  const pointer = { x: -1e4, y: -1e4 };
  window.addEventListener('pointermove', e => { pointer.x = e.clientX; pointer.y = e.clientY; }, { passive: true });
  window.addEventListener('pointerleave', () => { pointer.x = pointer.y = -1e4; });
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) pointer.x = pointer.y = -1e4; });

  function setupHero(el, st) {
    const start = () => { st.born = performance.now(); };
    if (document.documentElement.classList.contains('intro-running')) {
      window.addEventListener('rt:intro-done', start, { once: true });
      st.born = Infinity;
    } else start();
    st.io = new IntersectionObserver(entries => {
      st.visible = entries.some(e => e.isIntersecting);
      if (st.visible && !st.loop && st.dots && !reduceMotion) st.loop = requestAnimationFrame(t => heroFrame(el, st, t));
    });
    st.io.observe(el);
  }

  function heroFrame(el, st, now) {
    st.loop = 0;
    if (!state.has(el) || !el.isConnected) { detach(el); return; }
    if (!st.visible) return; // resumes when scrolled back into view (browsers already pause hidden tabs)
    const d = st.dots;
    const { ctx } = st;
    const box = st.canvas.getBoundingClientRect();
    const px = (pointer.x - box.left) * d.dpr;
    const py = (pointer.y - box.top) * d.dpr;
    const R = 90 * d.dpr;
    const R2 = R * R;
    const push = 26 * d.dpr;
    const form = st.born === Infinity ? 0 : Math.min(1, Math.max(0, (now - st.born) / 1100));
    const e = 1 - Math.pow(1 - form, 3);
    const tt = now / 1000;

    ctx.clearRect(0, 0, d.W, d.H);
    ctx.fillStyle = st.color;
    for (let i = 0; i < d.n; i++) {
      const hx = d.x[i], hy = d.y[i];
      let tx = 0, ty = 0;
      const dx = hx - px, dy = hy - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < R2) {
        const dist = Math.sqrt(d2) || 1;
        const f = Math.pow(1 - dist / R, 2) * push;
        tx = (dx / dist) * f;
        ty = (dy / dist) * f;
      }
      d.ox[i] += (tx - d.ox[i]) * 0.14;
      d.oy[i] += (ty - d.oy[i]) * 0.14;
      const lag = 1 - e;
      const x = hx + d.ox[i] + d.fx[i] * lag;
      const y = hy + d.oy[i] + d.fy[i] * lag;
      const a = d.a[i] * (0.86 + 0.14 * Math.sin(tt * 3.2 + d.ph[i])) * Math.min(1, form * 1.6);
      if (a <= 0.01) continue;
      ctx.globalAlpha = a;
      const s = d.s[i];
      ctx.fillRect(x - s / 2, y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    st.loop = requestAnimationFrame(t => heroFrame(el, st, t));
  }

  // ---------- find new headings as screens render ----------
  let scanRaf = 0;
  function scan() {
    scanRaf = 0;
    state.forEach((st, el) => { if (!el.isConnected) detach(el); });
    document.querySelectorAll(SELECTOR).forEach(attach);
  }
  function scheduleScan() { if (!scanRaf) scanRaf = requestAnimationFrame(scan); }

  function init() {
    const app = document.getElementById('app');
    if (!app) return;
    new MutationObserver(scheduleScan).observe(app, { childList: true, subtree: true });
    scheduleScan();
    // Redraw once the real fonts arrive (the first pass may have used a fallback).
    if (document.fonts) {
      document.fonts.ready.then(() => state.forEach((st, el) => schedule(el)));
      document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => state.forEach((st, el) => schedule(el)));
    }
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      state.forEach((st, el) => { if (st.hero && !st.loop && st.dots && !reduceMotion) st.loop = requestAnimationFrame(t => heroFrame(el, st, t)); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // scan() picks up big text outside #app too (the Academy's round window lives in #modal-root).
  RT.dots = { refresh: () => state.forEach((st, el) => schedule(el)), scan: scheduleScan };
})();
