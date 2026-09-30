// Opening animation: "RIDGE TANK" condenses out of vapor, holds, then drifts apart
// and dissolves into the background. Plays once per browser tab (add ?intro to replay).
(function () {
  const root = document.documentElement;
  const el = document.getElementById('intro');
  const done = () => {
    root.classList.remove('intro-running');
    root.classList.add('intro-done');
    window.dispatchEvent(new Event('rt:intro-done'));
  };
  if (!el) { done(); return; }

  const cfg = (window.RT_CONFIG && window.RT_CONFIG.intro) || { form: 1700, hold: 1900, disperse: 2000 };
  const forced = /[?&]intro\b/.test(location.search);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seen = false;
  try { seen = sessionStorage.getItem('rt_intro_seen') === '1'; } catch (e) { /* storage blocked */ }

  if ((seen && !forced) || reduceMotion) {
    el.remove();
    done();
    return;
  }
  try { sessionStorage.setItem('rt_intro_seen', '1'); } catch (e) { /* ignore */ }

  root.classList.add('intro-running');
  const canvas = el.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const caption = el.querySelector('.intro-caption');
  const skipBtn = el.querySelector('.intro-skip');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0;
  let particles = [];
  let finished = false;
  let raf = 0;

  // White while formed; each grain picks up a club color as it drifts away.
  const TINTS = [
    [244, 241, 234], [244, 241, 234], [244, 241, 234],
    [63, 191, 127], [46, 160, 104], [194, 70, 106], [160, 38, 72]
  ];

  function size() {
    W = Math.round(window.innerWidth * dpr);
    H = Math.round(window.innerHeight * dpr);
    canvas.width = W;
    canvas.height = H;
  }

  function sample() {
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d');
    let fontPx = Math.min(window.innerWidth * 0.17, 196) * dpr;
    const setFont = () => {
      o.font = `800 ${fontPx}px "Bricolage Grotesque", "Arial Black", Impact, sans-serif`;
      if ('fontStretch' in o) o.fontStretch = 'condensed';
      if ('letterSpacing' in o) o.letterSpacing = `${Math.round(fontPx * 0.01)}px`;
    };
    setFont();
    const maxW = W * 0.88;
    const measured = o.measureText('RIDGE TANK').width;
    if (measured > maxW) { fontPx *= maxW / measured; setFont(); }
    o.fillStyle = '#fff';
    o.textAlign = 'center';
    o.textBaseline = 'middle';
    o.fillText('RIDGE TANK', W / 2, H / 2 - fontPx * 0.06);
    const data = o.getImageData(0, 0, W, H).data;

    let gap = Math.max(2, Math.round(2.6 * dpr));
    let pts = [];
    for (;;) {
      pts = [];
      for (let y = 0; y < H; y += gap) {
        for (let x = 0; x < W; x += gap) {
          if (data[(y * W + x) * 4 + 3] > 130) pts.push(x, y);
        }
      }
      if (pts.length / 2 <= 11000 || gap > 8 * dpr) break;
      gap += 1;
    }

    const minX = W * 0.06, spanX = W * 0.88;
    particles = [];
    for (let i = 0; i < pts.length; i += 2) {
      const tx = pts[i], ty = pts[i + 1];
      const nx = (tx - minX) / spanX; // 0..1 left to right
      const tint = TINTS[(Math.random() * TINTS.length) | 0];
      particles.push({
        tx, ty,
        sx: tx + (Math.random() - 0.5) * W * 0.55,
        sy: ty + (Math.random() - 0.35) * H * 0.55,
        x: 0, y: 0,
        // formation sweeps left to right with some randomness
        fDelay: Math.max(0, Math.min(1, nx)) * 0.32 + Math.random() * 0.14,
        fDur: 0.42 + Math.random() * 0.12,
        dDelay: Math.max(0, Math.min(1, nx)) * 0.38 + Math.random() * 0.12,
        vx: (0.25 + Math.random() * 1.25) * dpr,
        vy: -(0.35 + Math.random() * 1.45) * dpr,
        wob: Math.random() * Math.PI * 2,
        size: dpr * (0.9 + Math.random() * 1.0),
        tint,
        a: 0
      });
    }
  }

  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
  let t0 = 0;
  let bgFading = false;

  function frame(now) {
    if (finished) return;
    if (!t0) t0 = now;
    const t = now - t0;
    ctx.clearRect(0, 0, W, H);

    const FORM = cfg.form, HOLD = cfg.hold, DISP = cfg.disperse;
    let phase = 'form', pt = 0;
    if (t < FORM) { phase = 'form'; pt = t / FORM; }
    else if (t < FORM + HOLD) { phase = 'hold'; pt = (t - FORM) / HOLD; }
    else if (t < FORM + HOLD + DISP) { phase = 'disperse'; pt = (t - FORM - HOLD) / DISP; }
    else { finish(); return; }

    if (phase === 'hold' && pt > 0.12) caption.classList.add('show');
    if (phase === 'disperse') {
      caption.classList.remove('show');
      if (!bgFading) { bgFading = true; el.classList.add('fading'); }
    }

    const sec = t / 1000;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      let r = 244, g = 241, b = 234;
      if (phase === 'form') {
        const k = clamp01((pt - p.fDelay) / p.fDur);
        const e = easeOut(k);
        const sway = (1 - e) * 26 * dpr;
        p.x = p.sx + (p.tx - p.sx) * e + Math.sin(sec * 2.2 + p.wob) * sway;
        p.y = p.sy + (p.ty - p.sy) * e + Math.cos(sec * 1.7 + p.wob) * sway * 0.6;
        p.a = 0.1 + Math.pow(k, 0.8) * 0.85; // faint drifting haze right away, solid once in place
      } else if (phase === 'hold') {
        p.x = p.tx + Math.sin(sec * 3 + p.wob) * 0.35 * dpr;
        p.y = p.ty + Math.cos(sec * 2.4 + p.wob) * 0.35 * dpr;
        p.a = 0.82 + 0.18 * Math.sin(sec * 4 + p.wob * 3);
      } else {
        const k = clamp01((pt - p.dDelay) / (1 - p.dDelay));
        const life = k * k;
        const drift = k * DISP / 16.7; // roughly frames since this grain let go
        p.x = p.tx + p.vx * drift + Math.sin(sec * 1.6 + p.wob + p.ty * 0.004) * 14 * dpr * k;
        p.y = p.ty + p.vy * drift - life * 30 * dpr;
        p.a = Math.max(0, 1 - Math.pow(k, 0.85)) * 0.95;
        const c = clamp01(k * 2.2);
        r = r + (p.tint[0] - r) * c;
        g = g + (p.tint[1] - g) * c;
        b = b + (p.tint[2] - b) * c;
      }
      if (p.a <= 0.01) continue;
      ctx.globalAlpha = p.a;
      ctx.fillStyle = `rgb(${r | 0},${g | 0},${b | 0})`;
      const s = phase === 'disperse' ? p.size * (1 + 0.8 * clamp01((pt - p.dDelay) * 2)) : p.size;
      ctx.fillRect(p.x, p.y, s, s);
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    el.classList.add('gone');
    done();
    setTimeout(() => el.remove(), 700);
  }

  skipBtn.addEventListener('click', finish);
  window.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape' && !finished) { finish(); window.removeEventListener('keydown', onKey); }
  });
  window.addEventListener('resize', () => {
    if (finished) return;
    size();
    sample();
  });

  function begin() {
    size();
    sample();
    raf = requestAnimationFrame(frame);
  }

  // Wait (briefly) for the display font so the letters come out right.
  const fontReady = document.fonts && document.fonts.load
    ? Promise.race([
        document.fonts.load('800 100px "Bricolage Grotesque"'),
        new Promise(r => setTimeout(r, 1200))
      ]).catch(() => {})
    : Promise.resolve();
  fontReady.then(begin);

  // Never trap anyone behind the intro.
  setTimeout(finish, cfg.form + cfg.hold + cfg.disperse + 4000);
})();
