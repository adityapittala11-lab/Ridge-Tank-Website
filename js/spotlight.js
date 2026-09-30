// Cursor spotlight for boxes ("Spotlight Card" effect): a soft glow follows the pointer inside
// each box and its border lights up near the pointer. Kept subtle and in club colors; the look
// lives in css/styles.css under "cursor spotlight".
//
// Boxes are looked up on every pointer move, so screens that render later work automatically.
// Only boxes near the pointer are touched. Touch input is ignored, so phones never run it.
(function () {
  const BOXES = [
    '.card:not(.chat)', '.badge-tile', '.badge-chip', '.mini-stat', '.strip-stat',
    '.podium-slot', '.detail-box', '.next-badge', '.ref-stat', '.composer'
  ].join(',');
  const FIELDS = 'input.input, textarea.input'; // text boxes people type in
  const REACH = 140;    // px: how close the pointer has to be for a neighbor's border to react
  const NEIGHBOR = 0.8; // strongest reaction for a box the pointer is next to (1 = pointer inside)

  const root = document.documentElement;
  let px = -1, py = -1, raf = 0;
  const lit = new Set();

  function schedule() { if (!raf) raf = requestAnimationFrame(frame); }

  function release() {
    px = py = -1;
    lit.forEach(el => el.style.setProperty('--o', '0'));
    lit.clear();
  }

  function collect() {
    const out = [];
    document.querySelectorAll(BOXES).forEach(el => { el.classList.add('spot'); out.push(el); });
    document.querySelectorAll(FIELDS).forEach(el => { el.classList.add('spot-field'); out.push(el); });
    return out;
  }

  function frame() {
    raf = 0;
    if (px < 0) return;
    // Stay out of the way of the intro and of dialogs (their backdrop covers the page).
    if (root.classList.contains('intro-running') || document.body.classList.contains('modal-open')) { release(); return; }

    const els = collect();
    const rects = els.map(el => el.getBoundingClientRect()); // read everything first, then write

    for (let i = 0; i < els.length; i++) {
      const el = els[i], r = rects[i];
      let o = 0;
      if (r.width > 1 && r.height > 1) {
        const dx = Math.max(r.left - px, 0, px - r.right);
        const dy = Math.max(r.top - py, 0, py - r.bottom);
        const d = Math.hypot(dx, dy);
        o = d === 0 ? 1 : d < REACH ? (1 - d / REACH) * NEIGHBOR : 0;
      }
      if (o > 0) {
        el.style.setProperty('--mx', (px - r.left).toFixed(1) + 'px');
        el.style.setProperty('--my', (py - r.top).toFixed(1) + 'px');
        // Bigger boxes get a wider, softer glow.
        el.style.setProperty('--sr', Math.round(Math.max(180, Math.min(420, Math.max(r.width, r.height) * 0.7))) + 'px');
        el.style.setProperty('--o', o.toFixed(3));
        lit.add(el);
      } else if (lit.has(el)) {
        el.style.setProperty('--o', '0');
        lit.delete(el);
      }
    }
    lit.forEach(el => { if (!el.isConnected) lit.delete(el); });
  }

  window.addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    px = e.clientX;
    py = e.clientY;
    schedule();
  }, { passive: true });
  // Content slides under a pointer that isn't moving.
  window.addEventListener('scroll', () => { if (px >= 0) schedule(); }, { passive: true });
  window.addEventListener('resize', () => { if (px >= 0) schedule(); });
  document.documentElement.addEventListener('mouseleave', release);
  window.addEventListener('blur', release);
})();
