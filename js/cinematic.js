// The moment a level is passed for the first time. It grows with the level:
//   levels 1-13   a school of fish rushes across the screen
//   levels 14-27  the school, plus sharks crossing at two depths and a sweep of light
//   levels 28-40  the Megalodon: far off first, then right across the screen, bigger the higher the level
// RT.levelCinematic(level, stars) -> true if it played. Click or press a key to skip. Skipped for reduced motion.
(function () {
  const RT = window.RT;
  if (!RT) return;
  const SHARK = '<g fill="currentColor"><g class="sk-rear"><path d="M106 23.6C94 25.6 83 28 74 30L63 23L66 32C58 34 52 36 46 38L46 46C60 49 72 53 84 55L80 64L95 57C98 57.6 101 58 104 58.4Z"/><g class="sk-tail"><path d="M50 37L4 2C14 20 21 31 26 42C22 50 19 58 16 67L50 46.6Z"/></g></g><path class="sk-front" d="M198 45C188 36 164 26 138 23L114 1C113 11 110 19 103 24L98 25L97 57.4C108 59.2 119 60 130 60L113 82C128 77 141 69 150 60C166 59 184 55 192 50Z"/></g>';
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const rnd = (a, b) => a + Math.random() * (b - a);
  const STAR = '<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>';

  // A school that pours across: a dense head, a long tail, every fish on its own wavering line.
  function school(canvas, count, dur, tint) {
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5), W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const mid = H * rnd(0.42, 0.56);
    const fish = Array.from({ length: count }, (_, i) => {
      const z = rnd(0.3, 1), lead = Math.pow(Math.random(), 1.8); // most of them near the front
      return { z, t0: lead * dur * 0.5, y: mid + (Math.random() - 0.5) * H * (0.25 + lead * 0.75), v: (W + 500) / (dur * rnd(0.34, 0.5)) * (0.75 + z * 0.4), amp: rnd(8, 34), f: rnd(1.6, 3.4), ph: rnd(0, 6.28), len: (10 + 22 * z) * rnd(0.8, 1.2), wf: rnd(16, 26) };
    });
    fish.sort((a, b) => a.z - b.z);
    let raf = 0; const start = performance.now();
    (function frame(now) {
      const t = (now - start) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = tint;
      for (const f of fish) {
        const tt = t - f.t0; if (tt < 0) continue;
        const x = -120 + tt * f.v; if (x > W + 140) continue;
        const y = f.y + Math.sin(tt * f.f + f.ph) * f.amp, slope = Math.cos(tt * f.f + f.ph) * f.amp * f.f / f.v;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.atan(slope)); ctx.globalAlpha = 0.25 + 0.7 * f.z;
        const L = f.len, wag = Math.sin(tt * f.wf + f.ph) * L * 0.16;
        ctx.beginPath(); ctx.ellipse(0, 0, L * 0.5, L * 0.18, 0, 0, 6.2832); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-L * 0.4, 0); ctx.lineTo(-L * 0.86, -L * 0.22 + wag); ctx.lineTo(-L * 0.86, L * 0.22 + wag); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (t < dur + 0.4 && canvas.isConnected) raf = requestAnimationFrame(frame);
    })(start);
    return () => cancelAnimationFrame(raf);
  }

  RT.levelCinematic = function (level, stars) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (document.documentElement.classList.contains('tank-lite')) return false;
    const tier = level >= 28 ? 3 : level >= 14 ? 2 : 1;
    const life = tier === 3 ? 6200 : tier === 2 ? 4300 : 3300;
    const wrap = el('div', 'cine cine-t' + tier);
    wrap.setAttribute('aria-hidden', 'true');
    wrap.style.setProperty('--life', life + 'ms');
    wrap.appendChild(el('div', 'cine-dark'));
    if (tier >= 2) wrap.appendChild(el('div', 'cine-light'));
    const canvas = el('canvas', 'cine-fish'); wrap.appendChild(canvas);

    if (tier === 2) {
      [['cine-shark far', 0.42], ['cine-shark near', 0.3]].forEach(([cls, top], i) => {
        const s = el('div', cls, '<svg class="shark" viewBox="0 0 200 84">' + SHARK + '</svg>');
        s.style.top = (top * 100 + rnd(-4, 4)) + '%';
        s.firstChild.style.setProperty('--beat', i ? '0.7s' : '1.1s');
        wrap.appendChild(s);
      });
    }
    if (tier === 3 && RT.megalodon) {
      const k = (level - 28) / 12; // 0 at level 28, 1 at level 40: bigger, slower, closer
      const far = el('div', 'cine-meg-far'); far.appendChild(RT.megalodon(''));
      const near = el('div', 'cine-meg'); near.appendChild(RT.megalodon(''));
      near.style.setProperty('--w', Math.round(110 + k * 70) + 'vw');
      near.style.setProperty('--y', Math.round(8 - k * 10) + 'vh');
      wrap.append(far, near, el('div', 'cine-shadow'));
      for (let i = 0; i < 16; i++) { const b = el('i', 'cine-bub'); b.style.cssText = `left:${rnd(4, 96)}%;--s:${rnd(5, 18)}px;--d:${rnd(2.4, 4.2)}s;--t:${rnd(1.6, 2.8)}s`; wrap.appendChild(b); }
    }
    const n = Math.max(1, Math.min(3, stars || 1));
    const card = el('div', 'cine-card', '<div class="cine-stars">' + Array.from({ length: n }, (_, i) => '<span style="--i:' + i + '">' + STAR + '</span>').join('') + '</div><div class="cine-level">Level ' + level + '</div><div class="cine-word">' + (tier === 3 ? 'Conquered' : 'Passed') + '</div>');
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    const stopFish = school(canvas, tier === 1 ? 70 : tier === 2 ? 110 : 46, tier === 3 ? 2.2 : 2.6, tier === 3 ? '#e9b9c6' : '#bfe9d6');
    if (tier === 3) { document.body.classList.add('cine-quake'); setTimeout(() => document.body.classList.remove('cine-quake'), 4300); }
    let done = false;
    function end() {
      if (done) return; done = true;
      wrap.classList.add('out'); document.body.classList.remove('cine-quake');
      window.removeEventListener('keydown', end, true);
      setTimeout(() => { stopFish(); wrap.remove(); }, 450);
    }
    wrap.addEventListener('pointerdown', end);
    window.addEventListener('keydown', end, true);
    setTimeout(end, life);
    return true;
  };
})();
