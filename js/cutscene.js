// Level-complete cutscenes: a short, full-screen scene for each coach shark, drawn live on a canvas.
// Each coach gets its own scene (the Great White breaches, the Tiger hits a bait ball, and so on). Scenes that are not
// built yet fall back to the older animation in js/cinematic.js. The scene grows with the level (more spray, more shake).
// RT.levelCinematic(level, stars, { name, color }) -> true if something played. Tap or press a key to skip.
// RT.playCutscene(key, level, stars, coach) plays one scene directly (handy for testing).
(function () {
  const RT = window.RT;
  if (!RT) return;
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const E = {
    inQ: t => t * t, outQ: t => 1 - (1 - t) * (1 - t), inOut: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    outC: t => 1 - Math.pow(1 - t, 3), inC: t => t * t * t
  };
  const rnd = (a, b) => a + Math.random() * (b - a);
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = f < 0 ? 0 : 255, p = Math.abs(f);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  // Piecewise-linear time warp, for slow motion at the big moment: pts = [[real, scene], ...]
  function warp(t, pts) {
    for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const [a, b] = pts[i - 1], [c, d] = pts[i]; return b + (t - a) * (d - b) / (c - a); }
    const [a, b] = pts[pts.length - 2], [c, d] = pts[pts.length - 1]; return d + (t - c) * (d - b) / (c - a);
  }

  // ---------- the side-view shark (same silhouette as the rest of the site), with a jaw that opens ----------
  const SIDE_D = {
    front: 'M198 45C188 36 164 26 138 23L114 1C113 11 110 19 103 24L98 25L97 57.4C108 59.2 119 60 130 60L113 82C128 77 141 69 150 60C166 59 184 55 192 50Z',
    rear: 'M106 23.6C94 25.6 83 28 74 30L63 23L66 32C58 34 52 36 46 38L46 46C60 49 72 53 84 55L80 64L95 57C98 57.6 101 58 104 58.4Z',
    tail: 'M50 37L4 2C14 20 21 31 26 42C22 50 19 58 16 67L50 46.6Z'
  };
  let SIDE = null;
  const sidePaths = () => SIDE || (SIDE = { front: new Path2D(SIDE_D.front), rear: new Path2D(SIDE_D.rear), tail: new Path2D(SIDE_D.tail) });
  const PIV = { x: 120, y: 42 };
  // Where a point on the shark's drawing (0..200 by 0..84) lands on screen.
  function sideToWorld(o, lx, ly) {
    const k = o.len / 200, dx = (lx - PIV.x) * k, dy = (ly - PIV.y) * k * (o.flipY ? -1 : 1) * (o.slim || 1);
    return { x: o.x + dx * Math.cos(o.ang) - dy * Math.sin(o.ang), y: o.y + dx * Math.sin(o.ang) + dy * Math.cos(o.ang) };
  }
  // o: { x, y, ang, len, color, belly, jaw 0..1, beat (tail phase), squeeze, alpha, blur, flipY, stripes, teeth }
  function sideShark(ctx, o) {
    const P = sidePaths(), k = o.len / 200;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.translate(o.x, o.y); ctx.rotate(o.ang); ctx.scale(k, (o.flipY ? -k : k) * (o.slim || 1)); ctx.translate(-PIV.x, -PIV.y);
    const top = shade(o.color, -0.5), belly = o.belly || '#eef1ec';
    const g = ctx.createLinearGradient(0, 2, 0, 66);
    g.addColorStop(0, top); g.addColorStop(0.42, o.color); g.addColorStop(0.53, shade(o.color, 0.1)); g.addColorStop(0.585, belly); g.addColorStop(1, belly);
    ctx.fillStyle = g;
    const beat = o.beat || 0, sway = Math.sin(beat) * 0.05;
    // rear half + tail: the tail's sideways sweep reads as a squeeze from the side
    ctx.save(); ctx.translate(106, 42); ctx.rotate(sway); ctx.translate(-106, -42);
    ctx.fill(P.rear);
    ctx.save(); ctx.translate(49, 42); ctx.rotate(Math.sin(beat - 0.9) * 0.08); ctx.scale(0.62 + 0.38 * Math.abs(Math.cos(beat - 0.9)), 1); ctx.translate(-49, -42); ctx.fill(P.tail); ctx.restore();
    ctx.restore();
    ctx.fill(P.front);
    // shading: a soft top light and a darker back, so it reads as a solid body
    ctx.save(); ctx.clip(P.front);
    const hl = ctx.createLinearGradient(0, 18, 0, 40); hl.addColorStop(0, 'rgba(255,255,255,0.18)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(90, 0, 120, 40); ctx.restore();
    if (o.stripes) { ctx.save(); ctx.clip(P.front); ctx.fillStyle = 'rgba(0,0,0,0.26)'; for (let x = 112; x < 168; x += 10) { ctx.beginPath(); ctx.moveTo(x, 24); ctx.quadraticCurveTo(x - 3, 38, x - 1, 52); ctx.lineTo(x + 3, 52); ctx.quadraticCurveTo(x + 1, 38, x + 4, 24); ctx.fill(); } ctx.restore(); }
    // gills
    ctx.strokeStyle = rgba(shade(o.color, -0.6), 0.55); ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const gx = 150 + i * 3.6; ctx.beginPath(); ctx.moveTo(gx, 34 + i * 0.4); ctx.quadraticCurveTo(gx + 2.2, 42, gx - 0.4, 51 - i * 0.3); ctx.stroke(); }
    // the mouth: closed is a line; open shows a dark maw with two rows of teeth
    const a = clamp(o.jaw || 0, 0, 1) * 0.6, hx = 163, hy = 55;
    const rot = (px, py) => { const dx = px - hx, dy = py - hy; return [hx + dx * Math.cos(a) - dy * Math.sin(a), hy + dx * Math.sin(a) + dy * Math.cos(a)]; };
    if (a > 0.02) {
      const tip = rot(195, 50), mid = rot(180, 54);
      ctx.fillStyle = '#2a0710';
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(171, 53.6); ctx.lineTo(182, 51.6); ctx.lineTo(192, 49.4); ctx.lineTo(197.4, 47); ctx.lineTo(tip[0], tip[1]); ctx.lineTo(mid[0], mid[1]); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#7a1434'; ctx.beginPath(); ctx.moveTo(hx + 2, hy + 0.5); ctx.lineTo(tip[0] - 4, tip[1] - 1); ctx.lineTo(mid[0], mid[1]); ctx.closePath(); ctx.globalAlpha *= 0.6; ctx.fill(); ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
      ctx.fillStyle = '#f6f7f2';
      for (let x = 168; x < 196; x += 3.6) { const y = hy - (x - hx) * 0.24; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 1.6, y + 3.4 + (o.teeth || 0)); ctx.lineTo(x + 3.2, y); ctx.fill(); }
      // lower jaw (the chin), swung down, with its own teeth pointing up
      ctx.fillStyle = belly;
      const c = [rot(163, 55), rot(195, 50), rot(191, 55.5), rot(176, 60), rot(163, 60.5)];
      ctx.beginPath(); ctx.moveTo(c[0][0], c[0][1]); for (let i = 1; i < c.length; i++) ctx.lineTo(c[i][0], c[i][1]); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e9eee8';
      for (let x = 168; x < 192; x += 3.8) { const p1 = rot(x, 55 - (x - 163) * 0.16), p2 = rot(x + 1.7, 51.4 - (x - 163) * 0.16 - (o.teeth || 0)), p3 = rot(x + 3.4, 55 - (x + 3.4 - 163) * 0.16); ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.lineTo(p3[0], p3[1]); ctx.fill(); }
    } else {
      ctx.strokeStyle = rgba(shade(o.color, -0.7), 0.7); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(165, 54.5); ctx.quadraticCurveTo(182, 52, 196.5, 47.5); ctx.stroke();
    }
    // eye: black, with a hard little highlight
    ctx.fillStyle = '#05090a'; ctx.beginPath(); ctx.arc(177, 39.5, 2.7, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(177.9, 38.6, 0.8, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // A side-view fish (prey).
  function sideFish(ctx, x, y, ang, len, col, wag, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang); if (alpha != null) ctx.globalAlpha = alpha;
    const g = ctx.createLinearGradient(0, -len * 0.19, 0, len * 0.19);
    g.addColorStop(0, shade(col, -0.45)); g.addColorStop(0.5, col); g.addColorStop(0.58, shade(col, 0.55)); g.addColorStop(1, shade(col, 0.65));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(-len * 0.4, 0); ctx.lineTo(-len * 0.8, -len * 0.22 + wag); ctx.lineTo(-len * 0.68, wag * 0.4); ctx.lineTo(-len * 0.8, len * 0.22 + wag); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, len * 0.5, len * 0.17, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-len * 0.02, -len * 0.15); ctx.lineTo(-len * 0.2, -len * 0.3); ctx.lineTo(-len * 0.26, -len * 0.13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#071009'; ctx.beginPath(); ctx.arc(len * 0.34, -len * 0.035, Math.max(1, len * 0.034), 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ---------- the top-down shark: a spine that follows the path it swam, with a travelling S-wave ----------
  // The head leaves a trail; the body is laid along that trail, so it bends through turns like a real animal.
  function Trail() { this.pts = []; }
  Trail.prototype.push = function (x, y) {
    const p = this.pts, l = p[p.length - 1];
    if (l && Math.hypot(x - l.x, y - l.y) < 0.6) { l.x = x; l.y = y; return; }
    p.push({ x, y }); if (p.length > 1400) p.shift();
  };
  // Points at increasing distances back from the head, in one walk down the trail.
  Trail.prototype.samples = function (ds) {
    const p = this.pts, out = []; let i = p.length - 1, acc = 0, j = 0;
    while (j < ds.length && i > 0) {
      const a = p[i], b = p[i - 1], sl = Math.hypot(a.x - b.x, a.y - b.y) || 1e-6;
      if (acc + sl >= ds[j]) { const f = (ds[j] - acc) / sl; out.push({ x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }); j++; }
      else { acc += sl; i--; }
    }
    while (j < ds.length) { // past the end of the trail: carry on in a straight line
      const a = p[0], b = p[Math.min(1, p.length - 1)], dx = a.x - b.x, dy = a.y - b.y, sl = Math.hypot(dx, dy) || 1, r = ds[j] - acc;
      out.push({ x: a.x + dx / sl * r, y: a.y + dy / sl * r }); j++;
    }
    return out;
  };
  // Half-width of the body (as a share of length) along its length, per kind of shark.
  const PROFILES = {
    base: [[0, 0], [0.02, 0.028], [0.06, 0.052], [0.14, 0.072], [0.28, 0.082], [0.45, 0.07], [0.6, 0.048], [0.74, 0.028], [0.85, 0.014]],
    tiger: [[0, 0], [0.012, 0.04], [0.05, 0.062], [0.14, 0.078], [0.28, 0.088], [0.45, 0.074], [0.6, 0.05], [0.74, 0.029], [0.85, 0.014]],
    mako: [[0, 0], [0.04, 0.026], [0.1, 0.05], [0.25, 0.068], [0.42, 0.06], [0.6, 0.04], [0.74, 0.022], [0.85, 0.012]],
    nurse: [[0, 0], [0.008, 0.05], [0.05, 0.072], [0.2, 0.09], [0.4, 0.082], [0.58, 0.058], [0.74, 0.036], [0.86, 0.018]],
    hammer: [[0, 0], [0.02, 0.03], [0.07, 0.04], [0.16, 0.064], [0.3, 0.074], [0.46, 0.064], [0.6, 0.044], [0.74, 0.026], [0.85, 0.013]]
  };
  function widthAt(prof, u) {
    for (let i = 1; i < prof.length; i++) if (u <= prof[i][0]) { const [a, b] = prof[i - 1], [c, d] = prof[i], f = (u - a) / (c - a), sm = f * f * (3 - 2 * f); return b + (d - b) * sm; }
    return prof[prof.length - 1][1];
  }
  // o: { len, color, kind, phase, amp, alpha, stripes, shadow }
  function topShark(ctx, trail, o) {
    const L = o.len, N = 34, prof = PROFILES[o.kind] || PROFILES.base, uEnd = 0.85;
    const ds = []; for (let i = 0; i <= N; i++) ds.push((i / N) * uEnd * L);
    ds.push(uEnd * L + L * 0.04);
    const sp = trail.samples(ds);
    // tangent, normal and the S-wave offset at each spine point
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = sp[Math.max(0, i - 1)], b = sp[Math.min(sp.length - 1, i + 1)];
      let tx = a.x - b.x, ty = a.y - b.y; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      const u = (i / N) * uEnd, off = (o.amp || 0.06) * L * Math.pow(u, 1.6) * Math.sin(TAU * (u * 0.95) - (o.phase || 0));
      pts.push({ x: sp[i].x - ty * off, y: sp[i].y + tx * off, nx: -ty, ny: tx, tx, ty, u, w: widthAt(prof, u) * L * (o.girth || 1) });
    }
    const al = o.alpha == null ? 1 : o.alpha;
    ctx.save(); ctx.globalAlpha = al;
    const outline = (scale, dx, dy) => {
      ctx.beginPath();
      for (let i = 0; i <= N; i++) { const p = pts[i]; const x = p.x + p.nx * p.w * scale + dx, y = p.y + p.ny * p.w * scale + dy; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      for (let i = N; i >= 0; i--) { const p = pts[i]; ctx.lineTo(p.x - p.nx * p.w * scale + dx, p.y - p.ny * p.w * scale + dy); }
      ctx.closePath();
    };
    const fin = (u, side, len, sweep, wid, flap) => { // a fin coming off the side of the body, swept back
      const i = Math.round(u / uEnd * N), p = pts[i], bx = p.x + p.nx * p.w * side * 0.85, by = p.y + p.ny * p.w * side * 0.85;
      const ang = Math.atan2(p.ny * side, p.nx * side) + side * (sweep + flap), tip = { x: bx + Math.cos(ang) * len, y: by + Math.sin(ang) * len };
      const back = pts[Math.min(N, i + 3)], bx2 = back.x + back.nx * back.w * side * 0.8, by2 = back.y + back.ny * back.w * side * 0.8;
      ctx.beginPath(); ctx.moveTo(p.x - p.tx * wid + p.nx * p.w * side * 0.7, p.y - p.ty * wid + p.ny * p.w * side * 0.7); ctx.quadraticCurveTo(tip.x + p.tx * wid, tip.y + p.ty * wid, tip.x, tip.y); ctx.lineTo(bx2, by2); ctx.closePath(); ctx.fill();
    };
    // the tail fin: a long blade off the end of the spine that flicks a beat behind the body
    const tail = () => {
      const e = pts[N], ang = Math.atan2(-e.ty, -e.tx) + Math.sin((o.phase || 0) - 1.2) * 0.42, tl = L * 0.27;
      const tip = { x: e.x + Math.cos(ang) * tl, y: e.y + Math.sin(ang) * tl }, nx = -Math.sin(ang), ny = Math.cos(ang);
      ctx.beginPath(); ctx.moveTo(e.x + nx * e.w, e.y + ny * e.w);
      ctx.quadraticCurveTo(e.x + Math.cos(ang) * tl * 0.55 + nx * L * 0.03, e.y + Math.sin(ang) * tl * 0.55 + ny * L * 0.03, tip.x, tip.y);
      ctx.quadraticCurveTo(e.x + Math.cos(ang) * tl * 0.5 - nx * L * 0.012, e.y + Math.sin(ang) * tl * 0.5 - ny * L * 0.012, e.x - nx * e.w, e.y - ny * e.w);
      ctx.closePath(); ctx.fill();
    };
    const flap = Math.sin((o.phase || 0) * 0.5) * 0.08;
    // shadow on the water below (soft, offset)
    if (o.shadow) { ctx.fillStyle = `rgba(0,0,0,${o.shadow})`; outline(1.15, L * 0.05, L * 0.09); ctx.fill(); }
    const dark = shade(o.color, -0.35), darker = shade(o.color, -0.55);
    ctx.fillStyle = dark;
    fin(0.27, 1, L * (o.kind === 'nurse' ? 0.2 : 0.17), 0.95, L * 0.03, flap); fin(0.27, -1, L * (o.kind === 'nurse' ? 0.2 : 0.17), 0.95, L * 0.03, flap);
    fin(0.62, 1, L * 0.06, 1.0, L * 0.012, 0); fin(0.62, -1, L * 0.06, 1.0, L * 0.012, 0);
    tail();
    // the body, shaded round: dark edges, the lit back shifted toward the light (top-left), a soft highlight,
    // and a thin dark ridge down the spine
    const lx = -L * 0.009, ly = -L * 0.013;
    ctx.fillStyle = shade(o.color, -0.32); outline(1, 0, 0); ctx.fill();
    ctx.save(); outline(1, 0, 0); ctx.clip();
    ctx.fillStyle = o.color; outline(0.74, lx, ly); ctx.fill();
    ctx.fillStyle = rgba(shade(o.color, 0.28), 0.5); outline(0.34, lx * 1.8, ly * 1.8); ctx.fill();
    if (o.stripes) {
      ctx.strokeStyle = rgba(darker, 0.42); ctx.lineCap = 'round';
      let j = 0;
      for (let u = 0.2; u < 0.8; u += 0.05, j++) {
        const i = Math.round(u / uEnd * N), p = pts[i], wv = (j % 3 ? 0.7 : 0.85), bend = L * 0.012 * (j % 2 ? 1 : -1);
        ctx.lineWidth = L * (0.006 + (j % 3) * 0.002);
        ctx.beginPath(); ctx.moveTo(p.x + p.nx * p.w * wv, p.y + p.ny * p.w * wv);
        ctx.quadraticCurveTo(p.x + p.tx * bend, p.y + p.ty * bend, p.x - p.nx * p.w * wv * 0.9, p.y - p.ny * p.w * wv * 0.9); ctx.stroke();
      }
    }
    ctx.fillStyle = rgba(darker, 0.4); outline(0.12, 0, 0); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, L * 0.004); outline(0.97, 0, 0); ctx.stroke();
    // dorsal fins seen from above: thin dark blades on the back
    ctx.fillStyle = darker;
    for (const [u0, u1, ww] of [[0.3, 0.44, 0.014], [0.7, 0.76, 0.006]]) {
      const a = pts[Math.round(u0 / uEnd * N)], b = pts[Math.round(u1 / uEnd * N)];
      ctx.beginPath(); ctx.moveTo(a.x + a.nx * L * ww, a.y + a.ny * L * ww); ctx.lineTo(b.x - b.tx * L * 0.02, b.y - b.ty * L * 0.02); ctx.lineTo(a.x - a.nx * L * ww, a.y - a.ny * L * ww); ctx.closePath(); ctx.fill();
    }
    // hammerhead: the wide flat head, eyes at the very ends
    if (o.kind === 'hammer') {
      const h = pts[Math.round(0.03 / uEnd * N)], nb = pts[Math.round(0.12 / uEnd * N)], hw = L * 0.18, hd = L * 0.03;
      const P = (side, fwd) => [h.x + h.nx * side + h.tx * fwd, h.y + h.ny * side + h.ty * fwd];
      const head = () => {
        ctx.beginPath(); let q = P(hw, hd * 0.2); ctx.moveTo(q[0], q[1]);
        q = P(hw * 0.5, hd * 1.15); let q2 = P(hw * 0.12, hd * 1.2); ctx.quadraticCurveTo(q[0], q[1], q2[0], q2[1]);
        q = P(0, hd * 0.95); ctx.lineTo(q[0], q[1]); q = P(-hw * 0.12, hd * 1.2); ctx.lineTo(q[0], q[1]);
        q = P(-hw * 0.5, hd * 1.15); q2 = P(-hw, hd * 0.2); ctx.quadraticCurveTo(q[0], q[1], q2[0], q2[1]);
        q = P(-hw * 1.06, -hd * 0.5); q2 = P(-hw * 0.94, -hd * 1.1); ctx.quadraticCurveTo(q[0], q[1], q2[0], q2[1]);
        q = P(-hw * 0.4, -hd * 1.0); ctx.quadraticCurveTo(q[0], q[1], nb.x - nb.nx * nb.w, nb.y - nb.ny * nb.w);
        ctx.lineTo(nb.x + nb.nx * nb.w, nb.y + nb.ny * nb.w);
        q = P(hw * 0.4, -hd * 1.0); q2 = P(hw * 0.94, -hd * 1.1); ctx.quadraticCurveTo(q[0], q[1], q2[0], q2[1]);
        q = P(hw * 1.06, -hd * 0.5); q2 = P(hw, hd * 0.2); ctx.quadraticCurveTo(q[0], q[1], q2[0], q2[1]);
        ctx.closePath();
      };
      ctx.fillStyle = shade(o.color, -0.32); head(); ctx.fill();
      ctx.save(); head(); ctx.clip(); ctx.fillStyle = o.color; ctx.translate(-L * 0.004, -L * 0.006); ctx.scale(1, 1); head(); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = Math.max(1, L * 0.004); head(); ctx.stroke();
      ctx.fillStyle = '#05090a'; for (const sd of [1, -1]) { const q = P(hw * 0.97 * sd, -hd * 0.1); ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(1.3, L * 0.009), 0, TAU); ctx.fill(); }
    } else {
      const e = pts[Math.round(0.075 / uEnd * N)]; ctx.fillStyle = '#05090a';
      for (const sd of [1, -1]) { ctx.beginPath(); ctx.arc(e.x + e.nx * e.w * 0.86 * sd, e.y + e.ny * e.w * 0.86 * sd, Math.max(1.2, L * 0.0075), 0, TAU); ctx.fill(); }
    }
    ctx.restore();
    return pts[0];
  }
  // Lots of small fish at once, drawn in one go. f: [{ x, y, a (heading), s (size), al }]
  function topFish(ctx, fish, color, wagT) {
    ctx.fillStyle = color;
    for (const f of fish) {
      if (f.dead) continue;
      ctx.globalAlpha = f.al == null ? 1 : f.al;
      const c = Math.cos(f.a), si = Math.sin(f.a), s = f.s, wag = Math.sin(wagT * 18 + f.ph) * 0.35;
      const P = (fx, fy) => [f.x + fx * c - fy * si, f.y + fx * si + fy * c];
      const t1 = P(-s * 0.5, 0), tc = Math.cos(f.a + Math.PI + wag), ts = Math.sin(f.a + Math.PI + wag);
      ctx.beginPath(); ctx.ellipse(f.x, f.y, s * 0.5, s * 0.16, f.a, 0, TAU);
      ctx.moveTo(t1[0], t1[1]); ctx.lineTo(t1[0] + tc * s * 0.32 - ts * s * 0.18, t1[1] + ts * s * 0.32 + tc * s * 0.18); ctx.lineTo(t1[0] + tc * s * 0.32 + ts * s * 0.18, t1[1] + ts * s * 0.32 - tc * s * 0.18); ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  // Open water seen from above: deep green, with sunlight shimmering across it.
  function openWater(ctx, W, H, t, cx, cy) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.8);
    g.addColorStop(0, '#1d5d49'); g.addColorStop(0.55, '#0d3628'); g.addColorStop(1, '#041410');
    ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.lineWidth = 1.4;
    for (let layer = 0; layer < 2; layer++) {
      ctx.strokeStyle = `rgba(190,240,215,${layer ? 0.035 : 0.05})`;
      for (let y = -20; y < H + 30; y += 26) {
        ctx.beginPath();
        for (let x = -20; x <= W + 30; x += 20) {
          const yy = y + Math.sin(x * 0.018 + t * (layer ? -0.9 : 0.7) + y * 0.05) * 9 + Math.sin(x * 0.047 - t * 1.3 + y * 0.11) * 4;
          layer ? ctx.lineTo(yy * 0.3 + x, yy) : ctx.lineTo(x, yy);
        }
        ctx.stroke();
      }
    }
  }

  // ---------- particles ----------
  function spawn(S, p) { S.parts.push(Object.assign({ life: 0, max: 1, g: 0, drag: 1, layer: 'over', r: 2, a: 1, vx: 0, vy: 0 }, p)); }
  function stepParts(ctx, S, dt, layer) {
    for (let i = S.parts.length - 1; i >= 0; i--) {
      const p = S.parts[i];
      if (p.layer !== layer) continue;
      p.life += dt;
      if (p.life >= p.max) { S.parts.splice(i, 1); continue; }
      const f = p.life / p.max;
      p.vy += p.g * dt; const d = Math.pow(p.drag, dt * 60); p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'drop') {
        if (p.floor != null && p.y > p.floor && p.vy > 0) { S.parts.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(232,246,240,${(p.a * (1 - f * 0.7)).toFixed(3)})`; ctx.lineWidth = p.r; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022); ctx.stroke();
      } else if (p.type === 'bubble') {
        const x = p.x + Math.sin(p.life * 5 + p.ph) * 3;
        if (p.ceil != null && p.y < p.ceil) { S.parts.splice(i, 1); continue; }
        ctx.strokeStyle = `rgba(205,242,225,${(p.a * (1 - f)).toFixed(3)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, p.y, p.r, 0, TAU); ctx.stroke();
      } else if (p.type === 'foam') {
        const r = p.r * (1 + f * 1.6), al = p.a * (1 - f);
        if (!p.blobs) p.blobs = Array.from({ length: 7 }, () => [rnd(-1, 1), rnd(-0.35, 0.2), rnd(0.18, 0.42)]);
        ctx.fillStyle = `rgba(240,250,246,${al.toFixed(3)})`;
        for (const b of p.blobs) { ctx.beginPath(); ctx.arc(p.x + b[0] * r, p.y + b[1] * r * 0.5, b[2] * r * 0.6, 0, TAU); ctx.fill(); }
      } else if (p.type === 'scale') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * p.spin);
        ctx.fillStyle = `rgba(245,250,246,${(1 - f).toFixed(3)})`; ctx.fillRect(-p.r, -p.r * 0.35, p.r * 2, p.r * 0.7); ctx.restore();
      } else if (p.type === 'mist') {
        const r = p.r * (0.6 + f * 1.6);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, rgba(p.color || '#7a1434', p.a * (1 - f))); g.addColorStop(1, rgba(p.color || '#7a1434', 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      } else if (p.type === 'ring') {
        ctx.strokeStyle = rgba(p.color || '#e6f5ee', p.a * (1 - f)); ctx.lineWidth = p.w || 2;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r + f * p.grow, (p.r + f * p.grow) * (p.squash || 1), 0, 0, TAU); ctx.stroke();
      }
    }
  }

  // A crown of water thrown up where something punches through the surface. c = { x, t0, w, h }
  function crown(ctx, c, ts, surfY) {
    const age = ts - c.t0, life = c.life || 0.9;
    if (age < 0 || age > life) return;
    const u = age / life, hgt = c.h * Math.sin(Math.PI * Math.min(1, u * 1.15)) * (1 - u * 0.3), spread = c.w * (0.7 + u * 0.8);
    if (!c.j) c.j = Array.from({ length: 23 }, () => rnd(0.55, 1.15));
    for (let layer = 0; layer < 2; layer++) {
      const hh = hgt * (layer ? 0.62 : 1), ww = spread * (layer ? 0.75 : 1);
      ctx.fillStyle = `rgba(226,244,236,${((layer ? 0.42 : 0.28) * (1 - u)).toFixed(3)})`;
      ctx.beginPath(); ctx.moveTo(c.x - ww, surfY(c.x - ww));
      for (let i = 0; i <= 22; i++) { const q = i / 22, x = c.x - ww + q * ww * 2, edge = 1 - Math.pow(q * 2 - 1, 2); ctx.lineTo(x, surfY(x) - hh * edge * c.j[i] * (i % 2 ? 1 : 0.72)); }
      ctx.lineTo(c.x + ww, surfY(c.x + ww)); ctx.closePath(); ctx.fill();
    }
  }

  // ---------- shared scenery ----------
  function vignette(ctx, W, H, a) {
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  }

  // =====================================================================
  // GREAT WHITE: "Air Jaws". It rises out of the dark, breaches straight through the surface, takes the fish
  // in mid-air and crashes back down.
  // =====================================================================
  const SCENES = {};
  SCENES.greatwhite = {
    dur: 5.6, card: 3.55,
    setup(S, W, H, k, coach) {
      S.color = (coach && coach.color) || '#C9D2CD';
      S.surf = Math.round(H * 0.4);
      S.len = Math.min(W * 0.48, H * 0.92) * (0.92 + 0.14 * k);
      S.bx = W * 0.47;
      S.ripples = [];
      S.snow = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: S.surf + Math.random() * (H - S.surf), r: rnd(0.4, 1.8), a: rnd(0.08, 0.35), v: rnd(4, 12) }));
      S.rays = Array.from({ length: 5 }, (_, i) => ({ x: (i + rnd(0.25, 0.75)) / 5, w: rnd(50, 140), ph: rnd(0, 6) }));
      S.flash = 0; S.crowns = [];
    },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [1.3, 1.3], [2.35, 1.86], [9, 8.51]]); // slow motion through the breach
      // the camera pushes in a little through the breach
      const zoom = 1 + 0.09 * Math.sin(Math.PI * seg(t, 1.1, 3.0));
      ctx.save(); ctx.translate(S.bx, S.surf); ctx.scale(zoom, zoom); ctx.translate(-S.bx, -S.surf);
      const L = S.len, surf = S.surf;
      // --- where the shark is ---
      let cx, cy, ang, jaw = 0, alpha = 1, blur = 0, beat = ts * 13;
      const y0 = surf + L * 0.3;
      if (ts < 1.45) {
        const u = E.inQ(ts / 1.45);
        cx = S.bx + Math.sin(ts * 2.4) * 6; cy = lerp(H + L * 0.8, y0, u); ang = -Math.PI / 2 + 0.1;
        const depth = clamp((cy - surf) / H, 0, 1.5);
        alpha = clamp(1.25 - depth * 1.3, 0.22, 1); blur = clamp(depth * 12 - 1, 0, 9);
        jaw = E.outQ(seg(ts, 1.08, 1.42));
      } else if (ts < 3.0) {
        const tau = ts - 1.45, g = L * 2.75, v0 = g * 0.7;
        cx = S.bx + L * 0.2 * tau; cy = y0 - v0 * tau + 0.5 * g * tau * tau;
        ang = tau < 0.7 ? lerp(-Math.PI / 2 + 0.1, -0.62, E.outQ(tau / 0.7)) : lerp(-0.62, 0.8, E.inQ((tau - 0.7) / 0.8));
        jaw = ts < 1.5 ? 1 - E.outC(seg(ts, 1.45, 1.5)) * 0.85 : 0.15; beat = ts * 7;
      } else {
        const tau = ts - 3.0;
        cx = S.bx + L * 0.31 + tau * L * 0.12; cy = surf + L * 0.35 + tau * L * 0.5; ang = 0.8 + tau * 0.3;
        alpha = clamp(1 - tau * 1.1, 0, 1); blur = tau * 6; beat = ts * 9;
      }
      const shark = { x: cx, y: cy, ang, len: L, color: S.color, belly: '#f1f3ee', jaw, beat, alpha, blur, teeth: 0.6 };
      const mouth = sideToWorld(shark, 185, 56);
      // --- events ---
      if (!S.e1 && ts >= 1.43) {
        S.e1 = true; const nx = sideToWorld(shark, 198, 45).x;
        for (let i = 0; i < 70 + 50 * k; i++) spawn(S, { type: 'drop', x: nx + rnd(-L * 0.08, L * 0.08), y: surf, vx: rnd(-1, 1) * 380, vy: -rnd(260, 760), g: 1100, r: rnd(1.4, 4.2), max: rnd(0.9, 1.5), floor: surf + 4 });
        for (let i = 0; i < 12; i++) spawn(S, { type: 'foam', x: nx + rnd(-L * 0.18, L * 0.18), y: surf + rnd(-3, 3), r: rnd(8, 20), a: 0.55, max: rnd(1.2, 2.2), layer: 'over' });
        for (let i = 0; i < 34; i++) spawn(S, { type: 'bubble', x: nx + rnd(-L * 0.1, L * 0.1), y: surf + rnd(10, L * 0.5), vx: 0, vy: -rnd(70, 180), r: rnd(1.5, 5), max: rnd(1.2, 2.4), ph: rnd(0, 6), layer: 'under', ceil: surf + 3, a: 0.75 });
        S.ripples.push({ x: nx, t0: ts, amp: 9 + 5 * k }); S.shake = 7 + 4 * k;
        S.crowns.push({ x: nx, t0: ts, w: L * 0.2, h: L * 0.34, life: 0.85 });
      }
      if (!S.e2 && ts >= 1.5) {
        S.e2 = true; S.flash = 0.3;
        for (let i = 0; i < 22; i++) { const an = rnd(0, TAU), sp = rnd(90, 260); spawn(S, { type: 'scale', x: mouth.x, y: mouth.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 120, g: 700, r: rnd(1.5, 3.2), spin: rnd(-14, 14), max: rnd(0.7, 1.3) }); }
      }
      if (!S.e3 && ts >= 2.88) {
        S.e3 = true; const ex = cx + L * 0.05;
        for (let i = 0; i < 120 + 80 * k; i++) spawn(S, { type: 'drop', x: ex + rnd(-L * 0.3, L * 0.3), y: surf, vx: rnd(-1, 1) * 560, vy: -rnd(300, 900), g: 1150, r: rnd(1.6, 5), max: rnd(1, 1.7), floor: surf + 4 });
        for (let i = 0; i < 18; i++) spawn(S, { type: 'foam', x: ex + rnd(-L * 0.35, L * 0.35), y: surf + rnd(-3, 4), r: rnd(12, 30), a: 0.6, max: rnd(1.6, 2.6) });
        for (let i = 0; i < 80; i++) spawn(S, { type: 'bubble', x: ex + rnd(-L * 0.3, L * 0.3), y: surf + rnd(8, L * 0.7), vx: rnd(-20, 20), vy: -rnd(60, 200), r: rnd(1.5, 7), max: rnd(1.4, 2.8), ph: rnd(0, 6), layer: 'under', ceil: surf + 3, a: 0.8 });
        spawn(S, { type: 'mist', x: ex, y: surf + 40, r: L * 0.35, color: '#dff3ea', a: 0.22, max: 1.6, layer: 'under' });
        S.ripples.push({ x: ex, t0: ts, amp: 14 + 6 * k }); S.shake = 15 + 12 * k;
        S.crowns.push({ x: ex, t0: ts, w: L * 0.42, h: L * 0.5, life: 1.1 });
      }
      // water pouring off the body while it is in the air
      if (ts > 1.5 && ts < 2.85) for (let i = 0; i < 3; i++) { const q = sideToWorld(shark, rnd(55, 190), rnd(30, 60)); if (q.y < surf - 4) spawn(S, { type: 'drop', x: q.x, y: q.y, vx: rnd(-40, 40), vy: rnd(-30, 60), g: 1100, r: rnd(1, 2.4), max: 1, floor: surf + 4, a: 0.8 }); }
      // --- the water's surface ---
      const surfY = x => {
        let y = surf + Math.sin(x * 0.011 + t * 1.5) * 3 + Math.sin(x * 0.029 - t * 2.2) * 1.4;
        for (const r of S.ripples) { const age = ts - r.t0, d = Math.abs(x - r.x); y += r.amp * Math.exp(-age * 1.7) * Math.sin(d * 0.045 - age * 10) * Math.exp(-d / (220 + age * 320)); }
        return y;
      };
      const surfPath = () => { ctx.beginPath(); ctx.moveTo(0, H + 10); for (let x = 0; x <= W + 12; x += 12) ctx.lineTo(x, surfY(x)); ctx.lineTo(W, H + 10); ctx.closePath(); };
      // sky
      const sky = ctx.createLinearGradient(0, 0, 0, surf); sky.addColorStop(0, '#040d09'); sky.addColorStop(1, '#14402f');
      ctx.fillStyle = sky; ctx.fillRect(0, 0, W, surf + 20);
      const moon = ctx.createRadialGradient(W * 0.8, H * 0.1, 0, W * 0.8, H * 0.1, H * 0.35);
      moon.addColorStop(0, 'rgba(242,236,224,0.16)'); moon.addColorStop(1, 'rgba(242,236,224,0)'); ctx.fillStyle = moon; ctx.fillRect(0, 0, W, surf);
      const hz = ctx.createLinearGradient(0, surf - H * 0.12, 0, surf); hz.addColorStop(0, 'rgba(111,224,168,0)'); hz.addColorStop(1, 'rgba(111,224,168,0.12)');
      ctx.fillStyle = hz; ctx.fillRect(0, surf - H * 0.12, W, H * 0.12);
      // water
      const sea = ctx.createLinearGradient(0, surf, 0, H); sea.addColorStop(0, '#1b5a45'); sea.addColorStop(0.45, '#0b3024'); sea.addColorStop(1, '#030d09');
      ctx.fillStyle = sea; surfPath(); ctx.fill();
      ctx.save(); surfPath(); ctx.clip();
      for (const r of S.rays) {
        const x0 = r.x * W + Math.sin(t * 0.4 + r.ph) * 30;
        const g = ctx.createLinearGradient(0, surf, 0, H); g.addColorStop(0, 'rgba(190,240,215,0.09)'); g.addColorStop(1, 'rgba(190,240,215,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, surf); ctx.lineTo(x0 + r.w, surf); ctx.lineTo(x0 + r.w * 1.8 - H * 0.2, H); ctx.lineTo(x0 - r.w * 0.4 - H * 0.2, H); ctx.fill();
      }
      ctx.fillStyle = '#d8f3e6';
      for (const s of S.snow) { s.y -= s.v * dt; if (s.y < surf) s.y = H; ctx.globalAlpha = s.a; ctx.beginPath(); ctx.arc(s.x + Math.sin(t + s.y * 0.01) * 4, s.y, s.r, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
      stepParts(ctx, S, dt, 'under');
      ctx.restore();
      // the fish: it cruises along the surface, panics, and is taken
      if (ts < 1.5) {
        const u = E.outQ(clamp(ts / 1.45, 0, 1)), fx = lerp(W * 0.86, S.bx + L * 0.04, u), fy = surf + 16 + Math.sin(ts * 5) * 2;
        sideFish(ctx, fx, fy, Math.PI + Math.sin(ts * 3) * 0.06, L * 0.24, '#6fe0a8', Math.sin(ts * (ts > 1.05 ? 34 : 14)) * L * 0.02);
      } else if (ts < 2.95) {
        sideFish(ctx, mouth.x, mouth.y, ang + Math.PI / 2 + Math.sin(ts * 28) * 0.35, L * 0.24, '#6fe0a8', Math.sin(ts * 40) * L * 0.025);
      }
      sideShark(ctx, shark);
      // the parts still under water look tinted
      ctx.save(); ctx.fillStyle = 'rgba(8,40,30,0.32)'; surfPath(); ctx.fill(); ctx.restore();
      ctx.strokeStyle = 'rgba(205,240,225,0.55)'; ctx.lineWidth = 1.6; ctx.beginPath();
      for (let x = 0; x <= W + 12; x += 12) { const y = surfY(x); x ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke();
      stepParts(ctx, S, dt, 'over');
      for (const c of S.crowns) crown(ctx, c, ts, surfY);
      ctx.restore();
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.002, dt); }
      vignette(ctx, W, H, 0.6);
    }
  };

  // =====================================================================
  // TIGER: a bait ball from above. The tiger shark tears in, the school flash-explodes around it,
  // it snatches one in slow motion and thrashes away while the ball closes up behind it.
  // =====================================================================
  SCENES.tiger = {
    dur: 5.3, card: 3.45,
    setup(S, W, H, k, coach) {
      S.color = (coach && coach.color) || '#D2476E';
      S.C = { x: W * 0.58, y: H * 0.47 }; S.R = Math.min(W, H) * 0.24;
      S.len = Math.min(W, H) * 0.6 * (0.94 + 0.12 * k);
      const n = Math.round(240 + 100 * k);
      S.fish = Array.from({ length: n }, () => { const a = rnd(0, TAU), r = S.R * Math.pow(rnd(0.02, 1), 0.62), z = rnd(0.35, 1); return { home: a, r, w: rnd(0.85, 1.15) * (1.2 - r / S.R * 0.4), x: S.C.x + Math.cos(a) * r, y: S.C.y + Math.sin(a) * r, vx: 0, vy: 0, z, s: (9 + 9 * z) * Math.min(W, H) / 600, al: 0.45 + 0.5 * z, ph: rnd(0, 6), a: 0 }; });
      S.fish.sort((a, b) => a.z - b.z);
      S.trail = new Trail();
      const A0 = { x: -W * 0.25, y: H * 1.05 }, cA = { x: W * 0.2, y: H * 0.78 };
      S.path = { A0, cA, C: { x: S.C.x - W * 0.02, y: S.C.y + H * 0.02 }, cB: null, B1: { x: W * 1.4, y: H * 0.12 } };
      S.path.cB = { x: S.path.C.x + (S.path.C.x - cA.x) * 0.75, y: S.path.C.y + (S.path.C.y - cA.y) * 0.75 };
      // lay the body down behind the start point, so it arrives already whole
      const dx = A0.x - cA.x, dy = A0.y - cA.y, dl = Math.hypot(dx, dy);
      for (let i = 60; i >= 0; i--) S.trail.push(A0.x + dx / dl * i * S.len * 0.03, A0.y + dy / dl * i * S.len * 0.03);
      S.flash = 0; S.victim = null;
    },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [2.0, 2.0], [2.8, 2.3], [9, 8.5]]);
      const sdt = dt * (t > 2.0 && t < 2.8 ? 0.38 : 1);
      const P = S.path, q = (a, c, b, u) => ({ x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * b.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * b.y });
      let head;
      if (ts < 2.2) head = q(P.A0, P.cA, P.C, E.inQ(seg(ts, 0.7, 2.2)));
      else head = q(P.C, P.cB, P.B1, E.inOut(seg(ts, 2.2, 3.7)) * 0.98 + seg(ts, 2.2, 3.7) * 0.02);
      // head-shake after the bite
      if (ts > 2.22 && ts < 2.9) { const d = Math.exp(-(ts - 2.22) * 5), last = S.trail.pts[S.trail.pts.length - 1]; const ang = Math.atan2(head.y - last.y, head.x - last.x); head.x += -Math.sin(ang) * Math.sin(ts * 46) * S.len * 0.035 * d; head.y += Math.cos(ang) * Math.sin(ts * 46) * S.len * 0.035 * d; }
      S.trail.push(head.x, head.y);
      const zoom = 1 + 0.1 * Math.sin(Math.PI * seg(t, 1.7, 3.3));
      ctx.save(); ctx.translate(S.C.x, S.C.y); ctx.scale(zoom, zoom); ctx.translate(-S.C.x, -S.C.y);
      openWater(ctx, W, H, t, S.C.x, S.C.y);
      // --- the school ---
      const spin = 0.95;
      for (const f of S.fish) {
        if (f.dead) continue;
        f.home += spin * f.w * sdt;
        const hx = S.C.x + Math.cos(f.home) * f.r, hy = S.C.y + Math.sin(f.home) * f.r * 0.92;
        f.vx += (hx - f.x) * 6 * sdt; f.vy += (hy - f.y) * 6 * sdt;
        const dx = f.x - head.x, dy = f.y - head.y, d = Math.hypot(dx, dy) || 1, Rf = S.len * 0.42;
        if (d < Rf && f !== S.victim) { const push = (1 - d / Rf) * 2600; f.vx += dx / d * push * sdt; f.vy += dy / d * push * sdt; }
        const damp = Math.pow(0.06, sdt); f.vx *= damp; f.vy *= damp;
        f.x += f.vx * sdt; f.y += f.vy * sdt;
        const sp = Math.hypot(f.vx, f.vy);
        f.a = sp > 25 ? Math.atan2(f.vy, f.vx) : f.home + Math.PI / 2;
      }
      // the one that does not get away
      if (!S.victim && ts > 1.95) { let best = null, bd = 1e9; for (const f of S.fish) { const d = Math.hypot(f.x - head.x, f.y - head.y); if (d < bd && !f.dead) { bd = d; best = f; } } S.victim = best; }
      if (S.victim && !S.victim.dead && ts < 2.22) { const v = S.victim, u = seg(ts, 1.95, 2.2); v.x = lerp(v.x, head.x, u * 0.35); v.y = lerp(v.y, head.y, u * 0.35); v.al = 1; v.s *= 1.0; }
      if (!S.bit && ts >= 2.2) {
        S.bit = true; S.flash = 0.22; S.shake = 9 + 6 * k;
        if (S.victim) S.victim.dead = true;
        for (let i = 0; i < 26; i++) { const an = rnd(0, TAU), sp = rnd(60, 240); spawn(S, { type: 'scale', x: head.x, y: head.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 0.93, r: rnd(1.4, 3), spin: rnd(-12, 12), max: rnd(0.8, 1.5) }); }
        spawn(S, { type: 'mist', x: head.x, y: head.y, r: S.len * 0.16, color: '#7a1434', a: 0.45, max: 1.8 });
        spawn(S, { type: 'ring', x: head.x, y: head.y, r: S.len * 0.05, grow: S.len * 0.5, a: 0.5, w: 2.5, max: 0.7 });
      }
      // fish under the shark first (the deeper half), then the shark, then the near half
      const half = Math.floor(S.fish.length * 0.55);
      topFish(ctx, S.fish.slice(0, half), '#9fd9c0', ts);
      stepParts(ctx, S, dt, 'under');
      const speed = ts < 2.2 ? lerp(0.5, 1.4, seg(ts, 0.7, 2.2)) : lerp(1.6, 0.9, seg(ts, 2.2, 3.7));
      S.ph = (S.ph || 0) + sdt * 9 * speed;
      if (ts > 0.6 && ts < 4.2) topShark(ctx, S.trail, { len: S.len, color: S.color, kind: 'tiger', stripes: true, phase: S.ph, amp: 0.05 + 0.03 * speed, shadow: 0.22 });
      topFish(ctx, S.fish.slice(half), '#c9efdc', ts);
      stepParts(ctx, S, dt, 'over');
      ctx.restore();
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(255,240,244,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.003, dt); }
      vignette(ctx, W, H, 0.65);
    }
  };

  // =====================================================================
  // MAKO: speed. A tracking shot at full pace: a fish jukes just under the surface, the Mako matches every cut,
  // then both burst out of the water and the Mako takes it at the top of a long leap.
  // =====================================================================
  SCENES.mako = {
    dur: 5.3, card: 3.55,
    setup(S, W, H, k, coach) {
      S.color = (coach && coach.color) || '#3FBF7F';
      S.surf = Math.round(H * 0.38); S.L = Math.min(W * 0.42, H * 0.8) * (0.92 + 0.12 * k);
      S.v = W * 1.05; S.cam = 0; S.camV = 0; S.ripples = []; S.crowns = []; S.flash = 0;
      S.snow = Array.from({ length: 140 }, () => ({ x: rnd(-W, W * 7), y: rnd(S.surf + 10, H), a: rnd(0.08, 0.35), r: rnd(0.6, 1.8), z: rnd(0.4, 1) }));
      S.ghosts = [];
      S.zig = Array.from({ length: 12 }, (_, i) => (i % 2 ? 1 : -1) * rnd(0.5, 1));
    },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [2.25, 2.25], [3.0, 2.56], [9, 8.56]]);
      const L = S.L, surf = S.surf, v = S.v;
      // the fish's jukes: snap to a new depth every 0.32s
      const jig = tt => { const i = Math.floor(tt / 0.32), f = E.inOut(clamp((tt - i * 0.32) / 0.16, 0, 1)), a = S.zig[clamp(i, 0, 11)], b = S.zig[clamp(i + 1, 0, 11)]; return lerp(a, b, f) * H * 0.075; };
      const depth = surf + H * 0.2;
      let fx = W * 0.32 + v * ts, fy = depth + jig(ts), fAng = 0;
      if (ts >= 1.95) { const u = seg(ts, 1.95, 2.45); fy = lerp(depth + jig(1.95), surf - H * 0.27, Math.sin(u * Math.PI / 2)); fAng = -0.5 * (1 - u); }
      // the Mako closes the gap, copying each cut a beat later
      const gap = lerp(W * 0.42, W * 0.16, E.inQ(seg(ts, 0, 1.95)));
      let mx = fx - gap - L * 0.39, my = depth + jig(ts - 0.13), ang = clamp(Math.atan2(jig(ts - 0.1) - jig(ts - 0.16), v * 0.06) * 0.6, -0.28, 0.28), jaw = 0;
      if (ts >= 1.95) {
        const u = seg(ts, 2.03, 3.0);
        mx = lerp(fx - W * 0.2 - L * 0.39, fx - L * 0.4, seg(ts, 1.95, 2.45)); if (ts > 2.45) mx = W * 0.32 + v * ts - L * 0.4;
        my = ts < 2.03 ? lerp(depth + jig(1.82), surf + H * 0.06, seg(ts, 1.95, 2.03)) : surf + H * 0.06 - H * 0.36 * Math.sin(Math.PI * u);
        ang = ts < 2.03 ? -0.45 : Math.atan2(-H * 0.36 * Math.PI * Math.cos(Math.PI * u) / 0.97, v);
        jaw = ts < 2.45 ? E.outQ(seg(ts, 2.2, 2.43)) : 0.12;
        if (ts > 3.0) { my = surf + H * 0.08 + (ts - 3) * H * 0.1; ang = 0.12; }
      }
      // the camera rides with the shark until it lands, then lets it go
      const mid = (mx + L * 0.4 + fx) / 2;
      const want = (ts < 3.05 ? mid : S.camHold) - W * 0.5;
      if (ts < 3.05) S.camHold = mid;
      const prev = S.cam; S.cam = ts < 0.02 ? want : lerp(S.cam, want, 1 - Math.pow(0.0005, dt)); S.camV = (S.cam - prev) / Math.max(dt, 1e-3);
      const shark = { x: mx, y: my, ang, len: L, color: S.color, belly: '#eef2ee', jaw, beat: ts * 22, slim: 0.84, teeth: 0.3 };
      const mouth = sideToWorld(shark, 186, 56);
      if (ts >= 2.45 && ts < 3.0) { fx = mouth.x; fy = mouth.y; fAng = ang + 0.35 + Math.sin(ts * 40) * 0.3; }
      // --- events ---
      const surfYw = wx => { let y = surf + Math.sin(wx * 0.01 + t * 1.4) * 3 + Math.sin(wx * 0.027 - t * 2) * 1.3; for (const r of S.ripples) { const age = ts - r.t0, d = Math.abs(wx - r.x); y += r.amp * Math.exp(-age * 2) * Math.sin(d * 0.05 - age * 11) * Math.exp(-d / (200 + age * 300)); } return y; };
      if (!S.e1 && ts >= 2.0) { S.e1 = true; const x = fx; for (let i = 0; i < 40; i++) spawn(S, { type: 'drop', x: x + rnd(-20, 20), y: surf, vx: v * rnd(0.2, 0.5) + rnd(-120, 120), vy: -rnd(200, 520), g: 1100, r: rnd(1.2, 3), max: 1.2, floor: surf + 4 }); S.ripples.push({ x, t0: ts, amp: 6 }); S.crowns.push({ x, t0: ts, w: L * 0.08, h: L * 0.15, life: 0.6 }); }
      if (!S.e2 && ts >= 2.07) { S.e2 = true; const x = sideToWorld(shark, 198, 45).x; for (let i = 0; i < 60 + 40 * k; i++) spawn(S, { type: 'drop', x: x + rnd(-L * 0.1, L * 0.1), y: surf, vx: v * rnd(0.25, 0.6) + rnd(-160, 160), vy: -rnd(260, 700), g: 1150, r: rnd(1.4, 3.8), max: 1.4, floor: surf + 4 }); S.ripples.push({ x, t0: ts, amp: 10 }); S.crowns.push({ x, t0: ts, w: L * 0.16, h: L * 0.3, life: 0.75 }); S.shake = 6 + 3 * k; }
      if (!S.e3 && ts >= 2.45) { S.e3 = true; S.flash = 0.25; S.shake = 8 + 4 * k; for (let i = 0; i < 22; i++) { const an = rnd(0, TAU), sp = rnd(100, 280); spawn(S, { type: 'scale', x: mouth.x, y: mouth.y, vx: Math.cos(an) * sp + v * 0.3, vy: Math.sin(an) * sp - 100, g: 700, r: rnd(1.5, 3), spin: rnd(-14, 14), max: 1.1 }); } }
      if (!S.e4 && ts >= 2.97) { S.e4 = true; const x = mx; for (let i = 0; i < 110 + 70 * k; i++) spawn(S, { type: 'drop', x: x + rnd(-L * 0.4, L * 0.25), y: surf, vx: v * rnd(0.15, 0.7) + rnd(-200, 120), vy: -rnd(180, 640), g: 1150, r: rnd(1.4, 4.4), max: 1.5, floor: surf + 4 }); for (let i = 0; i < 14; i++) spawn(S, { type: 'foam', x: x + rnd(-L * 0.5, L * 0.3), y: surf + rnd(-2, 3), r: rnd(10, 24), a: 0.55, max: rnd(1.4, 2.2) }); for (let i = 0; i < 50; i++) spawn(S, { type: 'bubble', x: x + rnd(-L * 0.4, L * 0.3), y: surf + rnd(8, L * 0.4), vx: v * 0.1, vy: -rnd(60, 180), r: rnd(1.5, 6), max: rnd(1.2, 2.4), ph: rnd(0, 6), layer: 'under', ceil: surf + 3, a: 0.8 }); S.ripples.push({ x, t0: ts, amp: 13 }); S.crowns.push({ x: x - L * 0.1, t0: ts, w: L * 0.4, h: L * 0.34, life: 0.95 }); S.shake = 12 + 8 * k; }
      if (ts < 3.0 && ts > 0.1 && Math.random() < 0.6) spawn(S, { type: 'bubble', x: sideToWorld(shark, 30, 42).x, y: sideToWorld(shark, 30, 42).y, vx: -rnd(20, 60), vy: -rnd(30, 90), r: rnd(1, 3), max: 1.2, ph: rnd(0, 6), layer: 'under', ceil: surf + 3, a: 0.6 });
      // --- draw (world space, the camera tracks) ---
      ctx.save(); ctx.translate(-S.cam, 0);
      const x0 = S.cam - 30, x1 = S.cam + W + 30;
      const sky = ctx.createLinearGradient(0, 0, 0, surf); sky.addColorStop(0, '#040d09'); sky.addColorStop(1, '#143f2e');
      ctx.fillStyle = sky; ctx.fillRect(x0, 0, W + 60, surf + 12);
      const surfPath = () => { ctx.beginPath(); ctx.moveTo(x0, H + 10); for (let x = x0; x <= x1; x += 12) ctx.lineTo(x, surfYw(x)); ctx.lineTo(x1, H + 10); ctx.closePath(); };
      const sea = ctx.createLinearGradient(0, surf, 0, H); sea.addColorStop(0, '#1d5d48'); sea.addColorStop(0.5, '#0b3125'); sea.addColorStop(1, '#030e09');
      ctx.fillStyle = sea; surfPath(); ctx.fill();
      ctx.save(); surfPath(); ctx.clip();
      // light shafts drift slower than the camera (they're far away)
      for (let i = -2; i < 9; i++) { const rx = S.cam * 0.7 + (i * 0.23 + 0.1) * W - ((S.cam * 0.3) % (W * 0.23)); const g = ctx.createLinearGradient(0, surf, 0, H); g.addColorStop(0, 'rgba(190,240,215,0.07)'); g.addColorStop(1, 'rgba(190,240,215,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(rx, surf); ctx.lineTo(rx + 70, surf); ctx.lineTo(rx + 40 - H * 0.25, H); ctx.lineTo(rx - 30 - H * 0.25, H); ctx.fill(); }
      // marine snow streaks: at this speed they smear into lines
      const smear = clamp(Math.abs(S.camV) * 0.035, 0, 90);
      for (const p of S.snow) { if (p.x < x0 - 100 || p.x > x1 + 100) continue; ctx.strokeStyle = `rgba(216,243,230,${p.a})`; ctx.lineWidth = p.r * p.z; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + smear * p.z, p.y); ctx.stroke(); }
      stepParts(ctx, S, dt, 'under');
      ctx.restore();
      // the fish
      if (ts < 3.0) sideFish(ctx, fx, fy, fAng + Math.sin(ts * 26) * 0.08, L * 0.25, '#eadfc8', Math.sin(ts * 46) * L * 0.025);
      // afterimages: the Mako is so fast it leaves ghosts
      S.ghosts.unshift({ x: mx, y: my, ang, beat: ts * 22 }); if (S.ghosts.length > 9) S.ghosts.pop();
      if (ts < 3.0) for (let i = 8; i >= 3; i -= 2) { const g = S.ghosts[i]; if (g) sideShark(ctx, { x: g.x, y: g.y, ang: g.ang, len: L, color: S.color, belly: '#eef2ee', beat: g.beat, slim: 0.84, alpha: 0.09 * (1 - i / 10) }); }
      sideShark(ctx, shark);
      ctx.fillStyle = 'rgba(8,40,30,0.3)'; surfPath(); ctx.fill();
      ctx.strokeStyle = 'rgba(205,240,225,0.55)'; ctx.lineWidth = 1.6; ctx.beginPath(); for (let x = x0; x <= x1; x += 12) { const y = surfYw(x); x === x0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
      stepParts(ctx, S, dt, 'over');
      for (const c of S.crowns) crown(ctx, c, ts, surfYw);
      ctx.restore();
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(255,255,255,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.002, dt); }
      // speed lines at the edges while it's flat out
      const sl = clamp(Math.abs(S.camV) / (W * 1.0), 0, 1) * (ts < 3 ? 1 : 0);
      if (sl > 0.05) { ctx.strokeStyle = `rgba(220,245,235,${(0.16 * sl).toFixed(3)})`; ctx.lineWidth = 1.2; for (let i = 0; i < 16; i++) { const yy = ((i * 97 + Math.floor(t * 40) * 31) % H), len = 60 + (i * 53 % 140); const xx = W - ((t * 2600 + i * 211) % (W + 300)); ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + len, yy); ctx.stroke(); } }
      vignette(ctx, W, H, 0.6);
    }
  };

  // ---------- sand floor seen from above (shared by the bottom-dwellers) ----------
  function sandFloor(ctx, W, H, t, S, cx, cy) {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.85);
    g.addColorStop(0, '#6a8670'); g.addColorStop(0.5, '#3b5747'); g.addColorStop(1, '#10211a');
    ctx.fillStyle = g; ctx.fillRect(-60, -60, W + 120, H + 120);
    // ripples in the sand: a dark trough and a lit crest
    if (!S.rip) S.rip = Array.from({ length: Math.ceil((H + 120) / 26) }, (_, i) => ({ y: -60 + i * 26 + rnd(-6, 6), ph: rnd(0, 6), a: rnd(0.35, 0.9), f: rnd(0.008, 0.014) }));
    ctx.lineWidth = 2;
    for (const r of S.rip) {
      for (const [dy, col] of [[0, `rgba(14,32,24,${(0.32 * r.a).toFixed(3)})`], [-3, `rgba(226,238,222,${(0.07 * r.a).toFixed(3)})`]]) {
        ctx.strokeStyle = col; ctx.beginPath();
        for (let x = -60; x <= W + 60; x += 22) { const y = r.y + dy + Math.sin(x * r.f + r.ph) * 9 + Math.sin(x * 0.029 + r.ph * 2) * 3; x === -60 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
        ctx.stroke();
      }
    }
    if (!S.peb) S.peb = Array.from({ length: 60 }, () => ({ x: rnd(-40, W + 40), y: rnd(-40, H + 40), r: rnd(1.5, 5), a: rnd(0, 3), c: Math.random() < 0.3 ? '#d9cfbd' : '#1c3328' }));
    for (const b of S.peb) { ctx.fillStyle = b.c; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.ellipse(b.x, b.y, b.r, b.r * 0.62, b.a, 0, TAU); ctx.fill(); }
    ctx.globalAlpha = 1;
    // sunlight caustics: a bright net sliding over the sand
    ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
    for (let layer = 0; layer < 2; layer++) {
      ctx.strokeStyle = `rgba(236,248,226,${layer ? 0.045 : 0.06})`;
      const dir = layer ? 1 : -1;
      for (let k = -6; k < 30; k++) {
        ctx.beginPath();
        for (let i = 0; i <= 30; i++) {
          const b = -60 + i * (H + 120) / 30, a = k * 52 + dir * b * 0.55;
          const x = a + Math.sin(b * 0.023 + t * (layer ? 1.1 : -0.8) + k * 1.7) * 24 + Math.sin(b * 0.061 - t * 1.6 + k) * 8;
          i ? ctx.lineTo(x, b) : ctx.moveTo(x, b);
        }
        ctx.stroke();
      }
    }
  }
  // a stingray from above. flap: -1..1, buried: 0..1 (1 = under the sand)
  function topRay(ctx, x, y, ang, s, col, flap, buried, glow) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const wing = s * (0.6 + 0.08 * flap), sw = s * 0.1 * flap;
    const body = () => { ctx.beginPath(); ctx.moveTo(s * 0.5, 0); ctx.bezierCurveTo(s * 0.48, wing * 0.55, s * 0.05 + sw, wing, -s * 0.05 + sw, wing); ctx.bezierCurveTo(-s * 0.25, wing * 0.8, -s * 0.45, s * 0.12, -s * 0.5, 0); ctx.bezierCurveTo(-s * 0.45, -s * 0.12, -s * 0.25, -wing * 0.8, -s * 0.05 + sw, -wing); ctx.bezierCurveTo(s * 0.05 + sw, -wing, s * 0.48, -wing * 0.55, s * 0.5, 0); ctx.closePath(); };
    // tail
    ctx.strokeStyle = shade(col, -0.3); ctx.globalAlpha = 1 - buried * 0.8; ctx.lineWidth = Math.max(1.5, s * 0.035); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.45, 0); ctx.quadraticCurveTo(-s * 0.9, Math.sin(flap * 2) * s * 0.12, -s * 1.45, Math.sin(flap * 3 + 1) * s * 0.08); ctx.stroke();
    // body: buried rays take the colour of the sand and show only a faint edge and the eyes
    ctx.globalAlpha = 1;
    if (buried < 1) { ctx.globalAlpha = 1 - buried; ctx.fillStyle = shade(col, -0.25); body(); ctx.fill(); ctx.save(); body(); ctx.clip(); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(s * 0.04, -s * 0.03, s * 0.36, wing * 0.66, 0, 0, TAU); ctx.fill(); ctx.fillStyle = rgba(shade(col, 0.35), 0.45); for (const [a, b, r] of [[0.1, 0.25, 0.05], [-0.1, -0.3, 0.04], [0.2, -0.15, 0.035], [-0.2, 0.2, 0.045]]) { ctx.beginPath(); ctx.arc(s * a, s * b, s * r, 0, TAU); ctx.fill(); } ctx.restore(); }
    if (buried > 0) { ctx.globalAlpha = buried; ctx.strokeStyle = 'rgba(16,36,26,0.16)'; ctx.lineWidth = 1.2; body(); ctx.stroke(); ctx.fillStyle = 'rgba(214,230,212,0.05)'; body(); ctx.fill(); }
    if (glow > 0.01) { ctx.globalAlpha = glow; ctx.strokeStyle = '#6fe0a8'; ctx.lineWidth = 2.6; ctx.shadowColor = '#6fe0a8'; ctx.shadowBlur = 14; body(); ctx.stroke(); ctx.shadowBlur = 0; }
    ctx.globalAlpha = 1 - buried * 0.55; ctx.fillStyle = '#05090a';
    for (const sd of [1, -1]) { ctx.beginPath(); ctx.arc(s * 0.22, sd * s * 0.09, Math.max(1.4, s * 0.025), 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // =====================================================================
  // HAMMERHEAD: the hunter that sees what's hidden. It sweeps the sea floor, its head pulsing out electric
  // scans; one scan lights up a stingray buried in the sand, it hooks round and pins it with that wide head.
  // =====================================================================
  SCENES.hammer = {
    dur: 5.6, card: 3.75,
    setup(S, W, H, k, coach) {
      S.color = (coach && coach.color) || '#8FA69B';
      S.len = Math.min(W, H) * 0.58 * (0.94 + 0.12 * k);
      S.R = { x: W * 0.63, y: H * 0.36 }; S.rs = S.len * 0.3;
      S.trail = new Trail();
      const A0 = { x: -W * 0.28, y: H * 0.84 };
      for (let i = 60; i >= 0; i--) S.trail.push(A0.x - i * S.len * 0.03, A0.y + i * S.len * 0.006);
      S.nextScan = 0.35; S.flash = 0; S.glow = 0;
    },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [2.1, 2.1], [2.7, 2.4], [9, 8.7]]);
      const sdt = dt * (t > 2.1 && t < 2.7 ? 0.45 : 1);
      const L = S.len, R = S.R;
      const P1 = u => ({ x: lerp(-W * 0.28, W * 0.47, u), y: lerp(H * 0.84, H * 0.68, u) - Math.sin(u * Math.PI) * H * 0.07 });
      let head;
      if (ts < 1.8) {
        const u = seg(ts, 0, 1.8), b = P1(u), b2 = P1(Math.min(1, u + 0.01)), tl = Math.hypot(b2.x - b.x, b2.y - b.y) || 1;
        const sw = Math.sin(ts * 6.2) * L * 0.035; // the head sweeps side to side like a metal detector
        head = { x: b.x - (b2.y - b.y) / tl * sw, y: b.y + (b2.x - b.x) / tl * sw };
      } else if (ts < 2.35) {
        const u = E.inQ(seg(ts, 1.8, 2.35)), a = P1(1), c = { x: W * 0.69, y: H * 0.7 }, e = { x: R.x, y: R.y + L * 0.02 };
        head = { x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * c.x + u * u * e.x, y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * c.y + u * u * e.y };
      } else {
        const d = Math.exp(-(ts - 2.35) * 3); // pinned: grinding the ray into the sand
        head = { x: R.x + Math.sin(ts * 30) * L * 0.012 * d, y: R.y + L * 0.02 - Math.abs(Math.sin(ts * 15)) * L * 0.02 * d };
      }
      S.trail.push(head.x, head.y);
      // --- events ---
      if (ts > S.nextScan && ts < 1.8) { S.nextScan += 0.34; spawn(S, { type: 'ring', x: head.x, y: head.y, r: L * 0.08, grow: L * 0.85, a: 0.55, w: 1.8, color: '#6fe0a8', max: 0.95 }); }
      if (!S.found && ts >= 1.72) { S.found = true; S.flash = 0.08; spawn(S, { type: 'ring', x: R.x, y: R.y, r: S.rs * 0.6, grow: S.rs * 1.6, a: 0.9, w: 3, color: '#6fe0a8', max: 0.6 }); spawn(S, { type: 'ring', x: R.x, y: R.y, r: S.rs * 0.5, grow: S.rs * 2.6, a: 0.5, w: 1.5, color: '#6fe0a8', max: 0.9 }); }
      if (S.found) S.glow = ts < 2.35 ? 0.55 + 0.45 * Math.sin(ts * 28) : Math.max(0, S.glow - dt * 1.4);
      if (!S.pin && ts >= 2.35) {
        S.pin = true; S.flash = 0.18; S.shake = 13 + 6 * k;
        for (let i = 0; i < 30; i++) { const an = rnd(0, TAU), sp = rnd(120, 420); spawn(S, { type: 'mist', x: R.x + Math.cos(an) * S.rs * 0.3, y: R.y + Math.sin(an) * S.rs * 0.3, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 0.9, r: rnd(L * 0.08, L * 0.18), color: '#dfe6d2', a: 0.55, max: rnd(1.6, 2.8) }); }
        for (let i = 0; i < 70; i++) { const an = rnd(0, TAU), sp = rnd(150, 520); spawn(S, { type: 'scale', x: R.x, y: R.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 0.9, r: rnd(0.8, 2), spin: rnd(-10, 10), max: rnd(0.6, 1.3) }); }
        spawn(S, { type: 'ring', x: R.x, y: R.y, r: L * 0.06, grow: L * 0.9, a: 0.7, w: 3, color: '#f2ece0', max: 0.7 });
      }
      // a little sand kicked up by the tail as it hooks round
      if (ts > 1.8 && ts < 2.35 && Math.random() < 0.7) { const tp = S.trail.samples([L * 0.85])[0]; spawn(S, { type: 'mist', x: tp.x + rnd(-8, 8), y: tp.y + rnd(-8, 8), vx: rnd(-30, 30), vy: rnd(-30, 30), drag: 0.95, r: L * 0.06, color: '#a9bfa4', a: 0.25, max: 1.4, layer: 'under' }); }
      // --- draw ---
      const zoom = 1 + 0.16 * E.inOut(seg(t, 1.7, 2.7));
      const fx = lerp(W / 2, R.x, E.inOut(seg(t, 1.7, 2.7)) * 0.6), fy = lerp(H / 2, R.y, E.inOut(seg(t, 1.7, 2.7)) * 0.6);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-fx, -fy);
      sandFloor(ctx, W, H, t, S, R.x, R.y);
      stepParts(ctx, S, dt, 'under');
      const buried = S.pin ? Math.max(0, 1 - (ts - 2.35) * 6) : 1;
      const flap = S.pin ? Math.sin(ts * 34) * Math.exp(-(ts - 2.35) * 0.7) : 0;
      topRay(ctx, R.x, R.y, -0.5, S.rs, '#7a1434', flap, buried, S.glow);
      const speed = ts < 1.8 ? 0.8 : ts < 2.35 ? 1.6 : 1.2 + 0.8 * Math.exp(-(ts - 2.35) * 2);
      S.ph = (S.ph || 0) + sdt * 8 * speed;
      topShark(ctx, S.trail, { len: L, color: S.color, kind: 'hammer', phase: S.ph, amp: ts < 2.35 ? 0.06 : 0.1, shadow: 0.38 });
      stepParts(ctx, S, dt, 'over');
      ctx.restore();
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(226,250,238,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.003, dt); }
      vignette(ctx, W, H, 0.65);
    }
  };

  // =====================================================================
  // NURSE: the calm one with the strongest suction in the sea. It creeps up along the sand, goes perfectly
  // still, then inhales: sand, water and a fish vanish into its mouth in one spiral. Then it settles, unbothered.
  // =====================================================================
  SCENES.nurse = {
    dur: 5.4, card: 3.6,
    setup(S, W, H, k, coach) {
      S.color = (coach && coach.color) || '#86DDB0';
      S.len = Math.min(W, H) * 0.6 * (0.94 + 0.12 * k);
      S.F = { x: W * 0.62, y: H * 0.4 };
      const A = { x: W * 0.02, y: H * 0.96 }, dx = S.F.x - A.x, dy = S.F.y - A.y, dl = Math.hypot(dx, dy);
      S.dir = { x: dx / dl, y: dy / dl }; S.A = A;
      S.stop = { x: S.F.x - S.dir.x * S.len * 0.19, y: S.F.y - S.dir.y * S.len * 0.19 };
      S.trail = new Trail();
      for (let i = 60; i >= 0; i--) S.trail.push(A.x - S.dir.x * i * S.len * 0.03, A.y - S.dir.y * i * S.len * 0.03);
      const fs = Math.min(W, H) / 600;
      S.fish = Array.from({ length: 5 + Math.round(2 * k) }, (_, i) => { const a = rnd(0, TAU), r = rnd(0.03, 0.17) * S.len; return { hx: S.F.x + Math.cos(a) * r, hy: S.F.y + Math.sin(a) * r * 0.8, x: 0, y: 0, a: rnd(0, TAU), s: rnd(30, 40) * fs, ph: rnd(0, 6), al: 1, vx: 0, vy: 0 }; });
      S.rocks = [[W * 0.86, H * 0.2, S.len * 0.2], [W * 0.95, H * 0.42, S.len * 0.14], [W * 0.79, H * 0.06, S.len * 0.12], [W * 0.12, H * 0.14, S.len * 0.1]];
      S.grains = []; S.flash = 0;
    },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [2.1, 2.1], [2.75, 2.36], [9, 8.61]]);
      const sdt = dt * (t > 2.1 && t < 2.75 ? 0.4 : 1);
      const L = S.len, F = S.F, D = S.dir;
      // creep in, slowing to a stop; a short lunge forward as it inhales
      const u = E.outQ(seg(ts, 0, 1.95));
      let head = { x: lerp(S.A.x, S.stop.x, u), y: lerp(S.A.y, S.stop.y, u) };
      const lunge = ts > 2.15 ? Math.sin(Math.PI * seg(ts, 2.15, 2.5)) * L * 0.06 : 0;
      head.x += D.x * lunge; head.y += D.y * lunge;
      S.trail.push(head.x, head.y);
      const mouth = { x: head.x + D.x * L * 0.01, y: head.y + D.y * L * 0.01 };
      // --- the slurp ---
      if (!S.slurp && ts >= 2.15) {
        S.slurp = true; S.flash = 0.1; S.shake = 6 + 4 * k;
        for (const f of S.fish) { const d = Math.hypot(f.x - mouth.x, f.y - mouth.y); if (d < L * 0.36) { f.suck = { x: f.x, y: f.y, t0: ts, a0: Math.atan2(f.y - mouth.y, f.x - mouth.x), d }; } else { const dd = d || 1; f.vx = (f.x - mouth.x) / dd * 600; f.vy = (f.y - mouth.y) / dd * 600; f.flee = true; } }
        const hd = Math.atan2(D.y, D.x); for (let i = 0; i < 130 + 60 * k; i++) { const a = hd + rnd(-1, 1) * rnd(0.3, 1.5), r = L * rnd(0.06, 0.5); S.grains.push({ a, r, r0: r, w: rnd(2.5, 4.5), c: Math.random() < 0.6 ? '#e6ecda' : '#9fb59f', z: rnd(0.8, 2.2) }); }
      }
      // --- draw ---
      const zoom = 1 + 0.14 * E.inOut(seg(t, 1.3, 2.6));
      const fx = lerp(W / 2, F.x, 0.55 * E.inOut(seg(t, 1.3, 2.6))), fy = lerp(H / 2, F.y, 0.55 * E.inOut(seg(t, 1.3, 2.6)));
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(zoom, zoom); ctx.translate(-fx, -fy);
      sandFloor(ctx, W, H, t, S, F.x, F.y);
      // rocks: dark, rounded, lit from the top-left
      for (const [x, y, r] of S.rocks) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x + r * 0.18, y + r * 0.25, r * 1.0, r * 0.82, 0.3, 0, TAU); ctx.fill();
        const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1); g.addColorStop(0, '#46624f'); g.addColorStop(1, '#13241b');
        ctx.fillStyle = g; ctx.beginPath();
        for (let i = 0; i <= 12; i++) { const an = i / 12 * TAU, rr = r * (0.82 + 0.18 * Math.sin(an * 3 + x) + 0.08 * Math.sin(an * 7 + y)); const px = x + Math.cos(an) * rr, py = y + Math.sin(an) * rr * 0.8; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
        ctx.fill();
      }
      stepParts(ctx, S, dt, 'under');
      // the fish: hovering and picking at the sand, until the slurp
      for (const f of S.fish) {
        if (f.dead) continue;
        if (!f.x) { f.x = f.hx; f.y = f.hy; }
        if (f.suck) {
          const p = E.inQ(seg(ts, f.suck.t0, f.suck.t0 + 0.24)), rr = f.suck.d * Math.pow(1 - p, 1.6), an = f.suck.a0 + p * 2.2;
          f.x = mouth.x + Math.cos(an) * rr; f.y = mouth.y + Math.sin(an) * rr; f.a = an + Math.PI * 0.7; f.s *= 1 - 0.5 * p * sdt * 4;
          if (p >= 1) f.dead = true;
        } else if (f.flee) { f.x += f.vx * sdt; f.y += f.vy * sdt; f.vx *= Math.pow(0.15, sdt); f.vy *= Math.pow(0.15, sdt); f.a = Math.atan2(f.vy, f.vx); }
        else { f.x = f.hx + Math.sin(ts * 1.7 + f.ph) * L * 0.025; f.y = f.hy + Math.cos(ts * 1.3 + f.ph * 2) * L * 0.02; f.a = Math.cos(ts * 1.7 + f.ph) > 0 ? 0.2 + f.ph : Math.PI + 0.2 + f.ph; }
      }
      topFish(ctx, S.fish, '#efe6d2', ts);
      const speed = ts < 1.95 ? lerp(0.8, 0.25, seg(ts, 0, 1.95)) : ts < 2.6 ? 0.9 : 0.3;
      S.ph = (S.ph || 0) + sdt * 7 * speed;
      const girth = 1 + 0.1 * Math.sin(Math.PI * seg(ts, 2.35, 2.9));
      topShark(ctx, S.trail, { len: L, color: S.color, kind: 'nurse', phase: S.ph, amp: 0.035 + 0.04 * speed, shadow: 0.32, girth });
      // barbels at the snout, twitching while it waits
      const tw = Math.sin(ts * 9) * 0.25 * (ts > 1.4 && ts < 2.15 ? 1 : 0.3), nx = -D.y, ny = D.x;
      ctx.strokeStyle = shade(S.color, -0.4); ctx.lineWidth = Math.max(1.4, L * 0.006); ctx.lineCap = 'round';
      for (const sd of [1, -1]) { const bx = head.x + nx * sd * L * 0.022 + D.x * L * 0.004, by = head.y + ny * sd * L * 0.022 + D.y * L * 0.004, an = Math.atan2(D.y, D.x) + sd * (0.35 + tw * sd); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(an) * L * 0.035, by + Math.sin(an) * L * 0.035); ctx.stroke(); }
      // the inhale: sand spirals into the mouth and the water folds in on itself
      if (S.slurp) {
        const age = ts - 2.15;
        for (let i = S.grains.length - 1; i >= 0; i--) { const g = S.grains[i], pr = g.r; g.r -= (L * 1.2 + (g.r0 - g.r) * 6) * sdt * g.z; g.a += g.w * sdt * (1 + L * 0.05 / Math.max(g.r, 4)); if (g.r < L * 0.012) { S.grains.splice(i, 1); continue; } const x = mouth.x + Math.cos(g.a) * g.r, y = mouth.y + Math.sin(g.a) * g.r, x2 = mouth.x + Math.cos(g.a - 0.12) * pr, y2 = mouth.y + Math.sin(g.a - 0.12) * pr; ctx.strokeStyle = g.c; ctx.globalAlpha = 0.8; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(x2, y2); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.globalAlpha = 1;
        if (age < 0.4) { const q = E.inQ(age / 0.4); for (const [m, w] of [[1, 3], [0.7, 1.6]]) { ctx.strokeStyle = rgba('#e6f5ee', 0.7 * (1 - q)); ctx.lineWidth = w; ctx.beginPath(); ctx.arc(mouth.x, mouth.y, lerp(L * 0.5 * m, L * 0.02, q), 0, TAU); ctx.stroke(); } }
        if (!S.settle && ts >= 2.7) { S.settle = true; const pts = S.trail.samples([0, L * 0.2, L * 0.4, L * 0.6, L * 0.8]); for (const q of pts) for (let i = 0; i < 4; i++) { const an = rnd(0, TAU), sp = rnd(30, 110); spawn(S, { type: 'mist', x: q.x, y: q.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 0.93, r: rnd(L * 0.07, L * 0.14), color: '#d4dcc6', a: 0.35, max: rnd(1.8, 2.6), layer: 'under' }); } }
        if (ts > 2.7 && ts < 3.6 && Math.random() < 0.25) { const g = S.trail.samples([L * 0.22])[0]; spawn(S, { type: 'ring', x: g.x + rnd(-L * 0.06, L * 0.06), y: g.y + rnd(-L * 0.06, L * 0.06), r: 1.5, grow: L * 0.02, a: 0.7, w: 1.2, max: 0.9 }); }
      }
      stepParts(ctx, S, dt, 'over');
      ctx.restore();
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(226,250,238,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.003, dt); }
      vignette(ctx, W, H, 0.65);
    }
  };

  // ---------- a shark seen head-on, coming straight at you. Unit space: body is 1 wide. ----------
  // o: { color, belly, jaw 0..1, yaw -1..1, eyeRoll 0..1, alpha }
  function frontShark(ctx, x, y, sc, o) {
    const jaw = o.jaw || 0, yaw = o.yaw || 0, col = o.color, belly = o.belly || '#efe8da';
    ctx.save(); ctx.translate(x, y); ctx.scale(sc * (1 - Math.abs(yaw) * 0.12), sc); ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    const dark = shade(col, -0.45), mid = shade(col, -0.2);
    // dorsal fin and the top of the tail behind it, swinging with the yaw
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(-0.11, -0.27); ctx.quadraticCurveTo(-0.05 - yaw * 0.1, -0.55, 0.0 - yaw * 0.2, -0.78); ctx.quadraticCurveTo(0.06 - yaw * 0.08, -0.48, 0.12, -0.27); ctx.closePath(); ctx.fill();
    // pectoral fins, swept down and out like wings
    ctx.fillStyle = mid;
    for (const sd of [1, -1]) { ctx.beginPath(); ctx.moveTo(sd * 0.34, 0.08); ctx.quadraticCurveTo(sd * 0.75, 0.2 - yaw * sd * 0.05, sd * 1.0, 0.52 - yaw * sd * 0.08); ctx.quadraticCurveTo(sd * 0.6, 0.42, sd * 0.26, 0.27); ctx.closePath(); ctx.fill(); }
    // the body: dark back, the colour across the middle, a pale belly
    const lift = jaw * 0.06;
    const body = () => { ctx.beginPath(); ctx.moveTo(0, -0.36 - lift); ctx.bezierCurveTo(0.3, -0.36 - lift, 0.5, -0.16, 0.5, 0.03); ctx.bezierCurveTo(0.5, 0.24, 0.28, 0.38, 0, 0.38); ctx.bezierCurveTo(-0.28, 0.38, -0.5, 0.24, -0.5, 0.03); ctx.bezierCurveTo(-0.5, -0.16, -0.3, -0.36 - lift, 0, -0.36 - lift); ctx.closePath(); };
    const g = ctx.createLinearGradient(0, -0.38, 0, 0.38); g.addColorStop(0, dark); g.addColorStop(0.4, mid); g.addColorStop(0.62, col); g.addColorStop(0.74, shade(belly, -0.15)); g.addColorStop(1, shade(belly, -0.1));
    ctx.fillStyle = g; body(); ctx.fill();
    ctx.save(); body(); ctx.clip();
    const hl = ctx.createRadialGradient(-0.12, -0.26, 0, -0.12, -0.26, 0.45); hl.addColorStop(0, 'rgba(255,255,255,0.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = hl; ctx.fillRect(-0.6, -0.6, 1.2, 1.2);
    const rim = ctx.createRadialGradient(0, 0, 0.25, 0, 0, 0.55); rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(0,0,0,0.4)'); ctx.fillStyle = rim; ctx.fillRect(-0.6, -0.6, 1.2, 1.2);
    // the snout comes toward you: a lit cone over the middle of the face, with a shadow under it
    const sg = ctx.createRadialGradient(-0.04, -0.2 - lift, 0.02, 0, -0.06 - lift, 0.34); sg.addColorStop(0, shade(col, 0.22)); sg.addColorStop(0.6, col); sg.addColorStop(1, mid);
    ctx.fillStyle = 'rgba(20,2,8,0.35)'; ctx.beginPath(); ctx.ellipse(0, 0.0 - lift * 0.5, 0.31, 0.2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(0, -0.08 - lift, 0.29, 0.21, 0, 0, TAU); ctx.fill();
    // gills
    ctx.strokeStyle = 'rgba(30,4,12,0.45)'; ctx.lineWidth = 0.012;
    for (const sd of [1, -1]) for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(sd * (0.4 + i * 0.022), -0.04 + i * 0.01); ctx.quadraticCurveTo(sd * (0.44 + i * 0.022), 0.06, sd * (0.4 + i * 0.022), 0.15 + i * 0.01); ctx.stroke(); }
    // the mouth: a dark cave lined with two rows of teeth
    if (jaw > 0.02) {
      const mw = 0.27 + jaw * 0.07, top = 0.12 - lift * 0.4, bot = top + jaw * 0.24, my = (top + bot) / 2;
      const c0 = top + 0.07, m0 = top - 0.1 * jaw, arch = x => c0 + 0.5 * (1 - (x / mw) * (x / mw)) * (m0 - c0);
      const cave = () => { ctx.beginPath(); ctx.moveTo(-mw, c0); ctx.quadraticCurveTo(0, m0, mw, c0); ctx.quadraticCurveTo(mw * 0.9, bot + 0.02, 0, bot + 0.03); ctx.quadraticCurveTo(-mw * 0.9, bot + 0.02, -mw, c0); ctx.closePath(); };
      const cg = ctx.createRadialGradient(0, my, 0, 0, my, mw); cg.addColorStop(0, '#0a0103'); cg.addColorStop(0.7, '#2a0410'); cg.addColorStop(1, '#5a0c22');
      ctx.fillStyle = cg; cave(); ctx.fill();
      ctx.save(); cave(); ctx.clip();
      for (const [row, size, c] of [[1, 0.6, '#b9ab98'], [0, 1, '#f6f1e6']]) {
        ctx.fillStyle = c; const n = 11, tw = (mw * 2) / n, th = (0.055 + jaw * 0.03) * size, inset = row * 0.03;
        for (let i = 0; i < n; i++) { const x0 = -mw + i * tw + (row ? tw * 0.5 : 0), cx = x0 + tw / 2, edge = 1 - Math.pow((cx / mw), 2) * 0.5; if (cx > mw) continue;
          const ty = arch(cx) + 0.012 + inset; ctx.beginPath(); ctx.moveTo(x0, ty - 0.01); ctx.lineTo(cx, ty + th * edge); ctx.lineTo(x0 + tw, ty - 0.01); ctx.fill();
          const by = bot + 0.02 - inset; ctx.beginPath(); ctx.moveTo(x0, by + 0.01); ctx.lineTo(cx, by - th * edge * 0.85); ctx.lineTo(x0 + tw, by + 0.01); ctx.fill(); }
      }
      ctx.restore();
    } else { ctx.strokeStyle = 'rgba(30,4,12,0.6)'; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(-0.26, 0.15); ctx.quadraticCurveTo(0, 0.1, 0.26, 0.15); ctx.stroke(); }
    ctx.restore();
    // eyes on the sides of the head; they roll back white just before the bite
    for (const sd of [1, -1]) { ctx.fillStyle = (o.eyeRoll || 0) > 0.5 ? '#e9ece6' : '#05090a'; ctx.beginPath(); ctx.ellipse(sd * 0.37, -0.05 - lift * 0.5, 0.03, 0.026, 0, 0, TAU); ctx.fill(); if ((o.eyeRoll || 0) <= 0.5) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.beginPath(); ctx.arc(sd * 0.37 - 0.009, -0.058 - lift * 0.5, 0.007, 0, TAU); ctx.fill(); } }
    ctx.fillStyle = 'rgba(20,2,8,0.7)'; for (const sd of [1, -1]) { ctx.beginPath(); ctx.ellipse(sd * 0.11, -0.04 - lift, 0.026, 0.011, sd * 0.5, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // cracks spreading out from a point on the glass
  function makeCrack(x, y, len, n) {
    const out = [];
    for (let i = 0; i < n; i++) { let a = rnd(0, TAU), px = x, py = y; const pts = [[px, py]], L = len * rnd(0.4, 1); let d = 0;
      while (d < L) { const st = rnd(14, 34); a += rnd(-0.2, 0.2); px += Math.cos(a) * st; py += Math.sin(a) * st; d += st; pts.push([px, py]); if (Math.random() < 0.12 && out.length < n * 3) out.push(...makeCrack(px, py, (L - d) * 0.6, 1)); }
      out.push(pts); }
    return out;
  }

  // =====================================================================
  // REX: the rival. He comes out of the murk straight at you, eyes roll back, jaws open, and he bites the screen.
  // =====================================================================
  SCENES.rex = {
    dur: 5.2, card: 3.4,
    setup(S, W, H, k, coach) {
      S.color = (coach && coach.color) || '#A51D45';
      S.snow = Array.from({ length: 160 }, () => ({ x: rnd(0, W), y: rnd(0, H), z: rnd(0.3, 1), ph: rnd(0, 6) }));
      S.cracks = []; S.holes = []; S.flash = 0; S.red = 0;
    },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [1.85, 1.85], [2.45, 2.1], [9, 8.65]]);
      const M = Math.min(W, H);
      // distance: far away, closing in faster and faster, then filling the screen for the bite
      const z = ts < 2.1 ? lerp(10, 0.62, E.inC(seg(ts, 0, 2.1))) : lerp(0.62, 6, E.inOut(seg(ts, 2.25, 3.3)));
      const sc = M * 1.05 / z;
      const yaw = Math.sin(ts * (ts < 2.1 ? 5.5 : 3)) * (ts < 2.1 ? 0.55 : 0.8);
      const sway = Math.sin(ts * 5.5 - 0.6) * W * 0.06 * Math.min(1, 3 / z);
      const away = ts > 2.25 ? E.inQ(seg(ts, 2.25, 3.3)) : 0;
      const cx = W / 2 + sway + away * W * 0.3, cy = H * 0.5 + (ts < 2.1 ? lerp(-H * 0.05, H * 0.06, seg(ts, 0, 2.1)) : H * 0.06 + away * H * 0.2);
      const jaw = ts < 2.1 ? E.outQ(seg(ts, 1.35, 2.0)) : ts < 2.25 ? lerp(1, 0, E.inQ(seg(ts, 2.1, 2.22))) : 0.15 * (1 - away);
      const eyeRoll = ts > 1.97 && ts < 2.7 ? 1 : 0;
      // --- the bite ---
      if (!S.bite && ts >= 2.2) {
        S.bite = true; S.flash = 0.5; S.red = 0.55; S.shake = 26 + 10 * k;
        const n = 9;
        for (const [row, yy] of [[0, H * 0.34], [1, H * 0.7]]) for (let i = 0; i < n; i++) {
          const u = (i + 0.5 + (row ? 0.5 : 0)) / (n + 0.5), x = lerp(W * 0.14, W * 0.86, u), y = yy + (row ? -1 : 1) * Math.pow((u - 0.5) * 2, 2) * H * 0.09;
          const r = (row ? 7 : 9) * M / 540 * (1.1 - Math.abs(u - 0.5));
          S.holes.push({ x, y, r, up: row === 1 });
          if (Math.random() < 0.75) S.cracks.push(...makeCrack(x, y, M * rnd(0.12, 0.35), 2 + (Math.random() < 0.4 ? 1 : 0)));
        }
        const C0 = { x: W * 0.5, y: H * 0.52 }, nR = 9, rays = [];
        for (let i = 0; i < nR; i++) { const a = i / nR * TAU + rnd(-0.2, 0.2), pts = [[C0.x, C0.y]]; let px = C0.x, py = C0.y, aa = a; for (let d = 0; d < M * 0.75; d += 30) { aa += rnd(-0.08, 0.08); px += Math.cos(aa) * 30; py += Math.sin(aa) * 30; pts.push([px, py]); } rays.push(pts); S.cracks.push(pts); }
        for (const ring of [2, 4, 7]) for (let i = 0; i < nR; i++) { const a = rays[i][ring], b = rays[(i + 1) % nR][ring]; if (a && b && Math.random() < 0.85) S.cracks.push([a, [(a[0] + b[0]) / 2 + (C0.x - (a[0] + b[0]) / 2) * 0.08, (a[1] + b[1]) / 2 + (C0.y - (a[1] + b[1]) / 2) * 0.08], b]); }
      }
      // --- draw: murky water ---
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#11402f'); bg.addColorStop(0.55, '#06221a'); bg.addColorStop(1, '#020907');
      ctx.fillStyle = bg; ctx.fillRect(-40, -40, W + 80, H + 80);
      for (let i = 0; i < 6; i++) { const rx = W * (0.08 + i * 0.17) + Math.sin(t * 0.4 + i) * 20, g = ctx.createLinearGradient(0, 0, 0, H * 0.9); g.addColorStop(0, 'rgba(190,240,215,0.07)'); g.addColorStop(1, 'rgba(190,240,215,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(rx, -10); ctx.lineTo(rx + 60, -10); ctx.lineTo(rx + 140, H); ctx.lineTo(rx + 40, H); ctx.fill(); }
      // marine snow rushing past (we're closing on each other)
      const rush = ts < 2.2 ? 0.3 + 2 * E.inQ(seg(ts, 0.5, 2.1)) : 0.2;
      for (const p of S.snow) {
        const dx = p.x - W / 2, dy = p.y - H / 2; p.x += dx * rush * dt * p.z; p.y += dy * rush * dt * p.z;
        if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) { p.x = W / 2 + rnd(-W * 0.2, W * 0.2); p.y = H / 2 + rnd(-H * 0.2, H * 0.2); }
        ctx.strokeStyle = `rgba(216,243,230,${(0.12 + 0.25 * p.z).toFixed(3)})`; ctx.lineWidth = 0.6 + 1.4 * p.z;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - dx * rush * 0.05 * p.z, p.y - dy * rush * 0.05 * p.z); ctx.stroke();
      }
      // the shark, fading out of the murk as it closes in
      const fog = clamp(1.25 - z / 11, 0.08, 1);
      if (sc < M * 12) frontShark(ctx, cx, cy, sc, { color: S.color, jaw, yaw: yaw * (1 - away * 0.5), eyeRoll, alpha: fog * (1 - away * 0.6) });
      // murk over the top when it's far
      ctx.fillStyle = `rgba(4,20,15,${clamp(0.55 - (1.25 - z / 11) * 0.5, 0, 0.5).toFixed(3)})`; ctx.fillRect(-40, -40, W + 80, H + 80);
      // --- the broken glass ---
      if (S.bite) {
        for (const h of S.holes) {
          ctx.fillStyle = 'rgba(4,8,6,0.85)'; ctx.beginPath();
          const d = h.up ? -1 : 1; ctx.moveTo(h.x - h.r, h.y - d * h.r * 0.4); ctx.lineTo(h.x, h.y + d * h.r * 1.3); ctx.lineTo(h.x + h.r, h.y - d * h.r * 0.4); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(240,248,244,0.8)'; ctx.lineWidth = 1.3; ctx.stroke();
        }
        const grow = clamp((ts - 2.2) / 0.25, 0, 1);
        for (const c of S.cracks) {
          if (c.length < 2) continue; const m = Math.min(c.length, Math.max(2, Math.ceil(c.length * grow)));
          ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2.4; ctx.beginPath(); for (let i = 0; i < m; i++) i ? ctx.lineTo(c[i][0] + 1.2, c[i][1] + 1.2) : ctx.moveTo(c[i][0] + 1.2, c[i][1] + 1.2); ctx.stroke();
          ctx.strokeStyle = 'rgba(236,246,240,0.75)'; ctx.lineWidth = 1.1; ctx.beginPath(); for (let i = 0; i < m; i++) i ? ctx.lineTo(c[i][0], c[i][1]) : ctx.moveTo(c[i][0], c[i][1]); ctx.stroke();
        }
      }
      if (S.red > 0.01) { ctx.fillStyle = `rgba(122,20,52,${S.red.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.red *= Math.pow(0.08, dt); }
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(255,248,250,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.001, dt); }
      vignette(ctx, W, H, 0.7);
    }
  };

  // ---------- a rubber stamp slammed onto the screen ----------
  function stamp(ctx, x, y, word, sz, col, age, rot) {
    if (age < 0) return;
    const drop = E.inC(clamp(age / 0.16, 0, 1)), sc = lerp(2.6, 1, drop), al = drop;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc); ctx.globalAlpha = al;
    ctx.font = `${Math.round(sz)}px Anton, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(word).width, pw = tw + sz * 0.7, ph = sz * 1.35;
    ctx.strokeStyle = col; ctx.lineWidth = sz * 0.09; ctx.beginPath(); ctx.roundRect(-pw / 2, -ph / 2, pw, ph, sz * 0.12); ctx.stroke();
    ctx.lineWidth = sz * 0.03; ctx.beginPath(); ctx.roundRect(-pw / 2 + sz * 0.14, -ph / 2 + sz * 0.14, pw - sz * 0.28, ph - sz * 0.28, sz * 0.08); ctx.stroke();
    ctx.fillStyle = col; ctx.fillText(word, 0, sz * 0.04);
    // worn ink: knock a few specks out of it
    ctx.globalCompositeOperation = 'destination-out';
    let sd = 7; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 40; i++) { ctx.beginPath(); ctx.arc((r() - 0.5) * pw, (r() - 0.5) * ph, r() * sz * 0.05, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // the stage the human coaches stand on: dark, one spotlight
  function stage(ctx, W, H, t, cx, on) {
    ctx.fillStyle = '#04120d'; ctx.fillRect(-40, -40, W + 80, H + 80);
    const fl = H * 0.86;
    const g = ctx.createRadialGradient(cx, fl, 0, cx, fl, W * 0.5); g.addColorStop(0, `rgba(30,90,66,${0.9 * on})`); g.addColorStop(1, 'rgba(4,18,13,0)');
    ctx.fillStyle = g; ctx.fillRect(-40, -40, W + 80, H + 80);
    ctx.fillStyle = `rgba(242,236,224,${0.06 * on})`; ctx.beginPath(); ctx.moveTo(cx - W * 0.06, -10); ctx.lineTo(cx + W * 0.06, -10); ctx.lineTo(cx + W * 0.24, fl); ctx.lineTo(cx - W * 0.24, fl); ctx.closePath(); ctx.fill();
    ctx.fillStyle = `rgba(242,236,224,${0.08 * on})`; ctx.beginPath(); ctx.ellipse(cx, fl, W * 0.24, H * 0.05, 0, 0, TAU); ctx.fill();
  }

  // =====================================================================
  // CAM: the tough customer. Arms crossed, one eyebrow up. Your words fly in, one lands, and Cam is won over.
  // =====================================================================
  SCENES.cam = {
    dur: 5.0, card: 3.3,
    setup(S, W, H, k, coach) { S.color = (coach && coach.color) || '#F09AB2'; S.conf = []; S.flash = 0; },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [1.75, 1.75], [2.25, 1.95], [9, 8.7]]);
      const cx = W * 0.6, fl = H * 0.86, u = H / 540;
      const hits = [0.95, 1.4, 1.92];
      let bounce = 0; for (const h of hits) if (ts > h) bounce += Math.exp(-(ts - h) * 9) * Math.sin((ts - h) * 30) * (h === 1.92 ? 1.6 : 1);
      const won = E.outQ(seg(ts, 1.92, 2.15)), jump = ts > 2.0 ? Math.max(0, Math.sin(Math.PI * seg(ts, 2.0, 2.45))) * 26 * u : 0;
      const on = E.outQ(seg(t, 0, 0.5));
      stage(ctx, W, H, t, cx, on);
      ctx.save(); ctx.translate(0, -jump);
      // Cam: shoulders, head, arms
      const by = fl - 6 * u, sh = by - 175 * u, hy = sh - 52 * u + bounce * 3 * u, skin = '#FFE4CF', shirt = S.color, sd = shade(shirt, -0.2);
      ctx.fillStyle = sd; ctx.beginPath(); ctx.moveTo(cx - 92 * u, by); ctx.bezierCurveTo(cx - 92 * u, sh + 20 * u, cx - 70 * u, sh, cx, sh); ctx.bezierCurveTo(cx + 70 * u, sh, cx + 92 * u, sh + 20 * u, cx + 92 * u, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = shirt; ctx.beginPath(); ctx.moveTo(cx - 80 * u, by); ctx.bezierCurveTo(cx - 82 * u, sh + 24 * u, cx - 62 * u, sh + 6 * u, cx - 6 * u, sh + 4 * u); ctx.bezierCurveTo(cx + 40 * u, sh + 6 * u, cx + 60 * u, sh + 30 * u, cx + 50 * u, by); ctx.closePath(); ctx.fill();
      ctx.fillStyle = skin; ctx.fillRect(cx - 13 * u, sh - 14 * u, 26 * u, 20 * u);
      ctx.beginPath(); ctx.arc(cx, hy, 44 * u, 0, TAU); ctx.fill();
      ctx.fillStyle = shade(skin, -0.12); ctx.beginPath(); ctx.arc(cx + 8 * u, hy + 6 * u, 40 * u, -0.4, 1.6); ctx.fill();
      ctx.fillStyle = '#2a1a14'; ctx.beginPath(); ctx.arc(cx, hy - 6 * u, 45 * u, Math.PI * 1.02, Math.PI * 1.98); ctx.quadraticCurveTo(cx + 20 * u, hy - 30 * u, cx - 44 * u, hy - 12 * u); ctx.fill();
      // face: skeptical (one brow up, flat mouth to the side) -> won over (both brows up, big smile)
      ctx.fillStyle = '#1a0e0a'; const ey = hy + 4 * u, blink = Math.abs(Math.sin(ts * 1.3)) > 0.985 ? 0.2 : 1;
      for (const s2 of [-1, 1]) { ctx.beginPath(); ctx.ellipse(cx + s2 * 15 * u, ey, 4 * u * (1 + won * 0.3), 5 * u * blink * (1 + won * 0.3), 0, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = '#2a1a14'; ctx.lineWidth = 4 * u; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(cx - 22 * u, ey - lerp(10, 16, won) * u); ctx.lineTo(cx - 8 * u, ey - lerp(12, 18, won) * u); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 8 * u, ey - lerp(19, 18, won) * u); ctx.lineTo(cx + 22 * u, ey - lerp(14, 16, won) * u); ctx.stroke();
      if (won < 0.5) { ctx.beginPath(); ctx.moveTo(cx - 6 * u, hy + 24 * u); ctx.lineTo(cx + 12 * u, hy + 21 * u); ctx.stroke(); }
      else { ctx.fillStyle = '#7a1434'; ctx.beginPath(); ctx.arc(cx, hy + 18 * u, 14 * u * won, 0.1, Math.PI - 0.1); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillRect(cx - 9 * u * won, hy + 19 * u, 18 * u * won, 4 * u); }
      // arms: crossed and closed off, then flung up
      const arm = (s2, front) => {
        const S0 = { x: cx + s2 * 66 * u, y: sh + 30 * u };
        const E0 = { x: cx + s2 * 76 * u, y: sh + 95 * u }, H0 = { x: cx - s2 * 40 * u, y: sh + 78 * u + (front ? 0 : 10 * u) };
        const E1 = { x: cx + s2 * 112 * u, y: sh - 20 * u }, H1 = { x: cx + s2 * 104 * u, y: sh - 92 * u };
        const e = { x: lerp(E0.x, E1.x, won), y: lerp(E0.y, E1.y, won) }, h = { x: lerp(H0.x, H1.x, won), y: lerp(H0.y, H1.y, won) };
        ctx.strokeStyle = front ? shirt : sd; ctx.lineWidth = 30 * u; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(S0.x, S0.y); ctx.lineTo(e.x, e.y); ctx.lineTo(h.x, h.y); ctx.stroke();
        ctx.fillStyle = skin; ctx.beginPath(); ctx.arc(h.x, h.y, 14 * u, 0, TAU); ctx.fill();
      };
      arm(1, false); arm(-1, true);
      ctx.restore();
      // the "?" above Cam's head turns into a "!"
      const qx = cx + 82 * u, qy = hy - 74 * u - jump;
      const qs = ts < 1.92 ? E.outC(seg(ts, 0.35, 0.6)) * (1 - 0.18 * Math.min(2, hits.filter(h => ts > h).length)) : E.outC(seg(ts, 1.95, 2.2)) * 1.25;
      if (qs > 0.01) { ctx.save(); ctx.translate(qx, qy); ctx.rotate(ts < 1.92 ? Math.sin(ts * 3) * 0.12 : 0); ctx.scale(qs, qs); ctx.fillStyle = ts < 1.92 ? '#7a1434' : '#6fe0a8'; ctx.beginPath(); ctx.arc(0, 0, 30 * u, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.moveTo(-10 * u, 22 * u); ctx.lineTo(-24 * u, 36 * u); ctx.lineTo(4 * u, 28 * u); ctx.fill(); ctx.fillStyle = ts < 1.92 ? '#f2ece0' : '#0e402c'; ctx.font = `${Math.round(40 * u)}px Anton, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(ts < 1.92 ? '?' : '!', 0, 2 * u); ctx.restore(); }
      // your words: speech bubbles thrown at Cam
      hits.forEach((h, i) => {
        const a = seg(ts, h - 0.45, h); if (a <= 0 || a >= 1) return;
        const x = lerp(-60 * u, cx - 30 * u, a), y = lerp(H * (0.3 + i * 0.12), hy, a) - Math.sin(Math.PI * a) * 60 * u, sz = (i === 2 ? 1.35 : 1) * u;
        ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(a * 6) * 0.15); ctx.fillStyle = '#f2ece0'; ctx.beginPath(); ctx.roundRect(-48 * sz, -24 * sz, 96 * sz, 48 * sz, 18 * sz); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-26 * sz, 20 * sz); ctx.lineTo(-40 * sz, 36 * sz); ctx.lineTo(-10 * sz, 22 * sz); ctx.fill();
        ctx.fillStyle = '#0e402c'; for (let j = -1; j <= 1; j++) { ctx.beginPath(); ctx.arc(j * 20 * sz, 0, 6 * sz, 0, TAU); ctx.fill(); } ctx.restore();
      });
      hits.forEach((h, i) => { if (!S['h' + i] && ts >= h) { S['h' + i] = true; S.shake = i === 2 ? 10 + 4 * k : 3; for (let j = 0; j < (i === 2 ? 14 : 8); j++) { const an = rnd(-1.6, 1.6) + Math.PI, sp = rnd(120, 320); spawn(S, { type: 'scale', x: cx - 30 * u, y: hy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, g: 600, r: rnd(2, 4), spin: rnd(-12, 12), max: 0.7 }); } } });
      // confetti when Cam is won over
      if (!S.cf && ts >= 1.95) { S.cf = true; S.flash = 0.12; const cols = ['#6fe0a8', '#f2ece0', '#7a1434', S.color]; for (let i = 0; i < 90 + 40 * k; i++) { const an = rnd(-Math.PI * 0.95, -Math.PI * 0.05), sp = rnd(300, 820) * u; S.conf.push({ x: cx + rnd(-40, 40) * u, y: hy, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, c: cols[i % 4], r: rnd(4, 9) * u, sp: rnd(-10, 10), a: rnd(0, 6) }); } }
      for (const c of S.conf) { c.vy += 900 * u * dt; c.vx *= Math.pow(0.5, dt); c.vy *= Math.pow(0.7, dt); c.x += c.vx * dt; c.y += c.vy * dt; c.a += c.sp * dt; ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.scale(1, Math.abs(Math.cos(c.a * 1.7)) + 0.15); ctx.fillStyle = c.c; ctx.fillRect(-c.r, -c.r * 0.5, c.r * 2, c.r); ctx.restore(); }
      stepParts(ctx, S, dt, 'over');
      if (!S.st && ts >= 2.45) { S.st = true; S.shake = 14 + 6 * k; for (let i = 0; i < 26; i++) { const an = rnd(0, TAU), sp = rnd(80, 300); spawn(S, { type: 'mist', x: W * 0.27 + Math.cos(an) * 60 * u, y: H * 0.36 + Math.sin(an) * 30 * u, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 0.85, r: rnd(3, 8) * u, color: '#7a1434', a: 0.9, max: 3 }); } }
      if (ts < 3.25) stamp(ctx, W * 0.27, H * 0.36, 'WON OVER', 50 * u, '#c23a62', ts - 2.3, -0.14);
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(255,248,250,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.003, dt); }
      vignette(ctx, W, H, 0.6);
    }
  };

  // =====================================================================
  // DANA: the busy bakery owner. Your first message bounces off a closed door. The follow-up loops in through
  // the mail slot, the lights come on, the sign flips to OPEN. Yes.
  // =====================================================================
  function paperPlane(ctx, x, y, ang, sz) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = '#f2ece0'; ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.8, -sz * 0.55); ctx.lineTo(-sz * 0.45, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#c9c0ae'; ctx.beginPath(); ctx.moveTo(sz, 0); ctx.lineTo(-sz * 0.45, 0); ctx.lineTo(-sz * 0.8, sz * 0.4); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  SCENES.dana = {
    dur: 5.2, card: 3.4,
    setup(S, W, H, k, coach) { S.color = (coach && coach.color) || '#D2476E'; S.flash = 0; S.stars = Array.from({ length: 50 }, () => [rnd(0, W), rnd(0, H * 0.4), rnd(0.5, 1.6), rnd(0, 6)]); },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [1.95, 1.95], [2.45, 2.15], [9, 8.7]]);
      const u = H / 540, gy = H * 0.86, sx = W * 0.6, sw = 330 * u, top = gy - 300 * u;
      const doorX = sx, doorW = 66 * u, doorTop = gy - 132 * u, slotY = doorTop + 70 * u;
      const lit = E.outQ(seg(ts, 2.15, 2.4));
      // night street
      const sky = ctx.createLinearGradient(0, 0, 0, gy); sky.addColorStop(0, '#020a07'); sky.addColorStop(1, '#0d3326');
      ctx.fillStyle = sky; ctx.fillRect(-40, -40, W + 80, H + 80);
      for (const [x, y, r, ph] of S.stars) { ctx.fillStyle = `rgba(242,236,224,${(0.3 + 0.3 * Math.sin(t * 2 + ph)).toFixed(3)})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
      const zb = 1.32 + 0.3 * E.inOut(seg(t, 1.75, 2.7));
      ctx.save(); ctx.translate(W * 0.56, H * 0.66); ctx.scale(zb, zb); ctx.translate(-sx, -(gy - 110 * u));
      ctx.fillStyle = '#06170f'; ctx.fillRect(-W, gy, W * 3, H * 2);
      // warm light spilling onto the pavement once it's open
      if (lit > 0) { const g = ctx.createRadialGradient(sx, gy, 0, sx, gy, sw); g.addColorStop(0, `rgba(255,214,160,${(0.35 * lit).toFixed(3)})`); g.addColorStop(1, 'rgba(255,214,160,0)'); ctx.fillStyle = g; ctx.fillRect(sx - sw, gy - 10, sw * 2, H - gy + 10); }
      // the shop
      ctx.fillStyle = '#163126'; ctx.fillRect(sx - sw / 2, top, sw, gy - top);
      ctx.fillStyle = '#0f241b'; ctx.fillRect(sx - sw / 2, top, sw, 14 * u);
      ctx.fillStyle = '#7a1434'; ctx.fillRect(sx - 92 * u, top + 26 * u, 184 * u, 42 * u);
      ctx.fillStyle = '#f2ece0'; ctx.font = `${Math.round(28 * u)}px Anton, Impact, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText("DANA'S BAKERY", sx, top + 48 * u);
      // windows: dark until the yes, then warm with loaves on the shelf
      for (const s2 of [-1, 1]) {
        const wx = sx + s2 * 104 * u, wy = gy - 128 * u, ww = 96 * u, wh = 82 * u;
        ctx.fillStyle = '#0a1712'; ctx.fillRect(wx - ww / 2, wy, ww, wh);
        if (lit > 0) {
          ctx.fillStyle = `rgba(255,220,170,${(0.9 * lit).toFixed(3)})`; ctx.fillRect(wx - ww / 2, wy, ww, wh);
          ctx.fillStyle = `rgba(150,82,40,${lit.toFixed(3)})`; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(wx - 28 * u + i * 28 * u, wy + wh - 18 * u, 13 * u, 9 * u, 0, Math.PI, 0); ctx.fill(); }
          ctx.fillStyle = `rgba(122,20,52,${(0.5 * lit).toFixed(3)})`; ctx.fillRect(wx - ww / 2, wy + wh - 16 * u, ww, 4 * u);
        }
        ctx.strokeStyle = '#2b4a3c'; ctx.lineWidth = 4 * u; ctx.strokeRect(wx - ww / 2, wy, ww, wh); ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx, wy + wh); ctx.stroke();
      }
      // the door, its mail slot and the sign
      ctx.fillStyle = lit > 0 ? `rgb(${Math.round(lerp(14, 120, lit))},${Math.round(lerp(36, 30, lit))},${Math.round(lerp(28, 52, lit))})` : '#0e241c';
      ctx.fillRect(doorX - doorW / 2, doorTop, doorW, gy - doorTop);
      ctx.fillStyle = '#05100b'; ctx.fillRect(doorX - 20 * u, slotY - 3 * u, 40 * u, 6 * u);
      const flip = seg(ts, 2.15, 2.4), fx = Math.abs(Math.cos(Math.PI * flip)), open = flip > 0.5;
      ctx.save(); ctx.translate(doorX, doorTop + 34 * u + Math.sin(Math.max(0, ts - 2.15) * 12) * Math.exp(-Math.max(0, ts - 2.15) * 3) * 4 * u); ctx.scale(Math.max(0.03, fx), 1);
      ctx.fillStyle = open ? '#6fe0a8' : '#f2ece0'; ctx.fillRect(-28 * u, -12 * u, 56 * u, 24 * u);
      ctx.fillStyle = open ? '#0e402c' : '#7a1434'; ctx.font = `${Math.round(16 * u)}px Anton, Impact, sans-serif`; ctx.fillText(open ? 'OPEN' : 'CLOSED', 0, 1 * u); ctx.restore();
      ctx.strokeStyle = '#2b4a3c'; ctx.lineWidth = 1.5 * u; ctx.beginPath(); ctx.moveTo(doorX - 18 * u, doorTop + 22 * u); ctx.lineTo(doorX, doorTop + 8 * u); ctx.lineTo(doorX + 18 * u, doorTop + 22 * u); ctx.stroke();
      // the awning: stripes and a scalloped edge that flaps when it opens
      const flapA = lit > 0 ? Math.sin(ts * 14) * Math.exp(-(ts - 2.15) * 2) * 6 * u : 0;
      const aw = sw + 30 * u, ay = top + 82 * u, ah = 40 * u, nS = 9;
      for (let i = 0; i < nS; i++) {
        const x0 = sx - aw / 2 + i * aw / nS, x1 = x0 + aw / nS;
        ctx.fillStyle = i % 2 ? '#f2ece0' : S.color; ctx.beginPath(); ctx.moveTo(x0 + 8 * u, ay); ctx.lineTo(x1 + 8 * u, ay); ctx.lineTo(x1, ay + ah + flapA); ctx.quadraticCurveTo((x0 + x1) / 2, ay + ah + 16 * u + flapA, x0, ay + ah + flapA); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(sx - aw / 2 + 8 * u, ay, aw, 6 * u);
      // plane one: straight at the door, bonk, falls
      if (ts > 0.3 && ts < 1.9) {
        let x, y, a;
        if (ts < 1.1) { const q = E.inOut(seg(ts, 0.3, 1.1)), q2 = Math.min(1, q + 0.02); const P = v => ({ x: lerp(sx - W * 0.5, doorX - 30 * u, v), y: lerp(top, doorTop + 60 * u, v) - Math.sin(Math.PI * v) * H * 0.1 }); const p = P(q), p2 = P(q2); x = p.x; y = p.y; a = Math.atan2(p2.y - p.y, p2.x - p.x); }
        else { const f = ts - 1.1; x = doorX - 30 * u - f * 70 * u; y = doorTop + 60 * u + f * f * 380 * u; a = 1.2 + f * 9; if (y > gy - 6 * u) { y = gy - 6 * u; a = 0.2; } }
        paperPlane(ctx, x, y, a, 20 * u);
      }
      if (!S.bonk && ts >= 1.1) { S.bonk = true; S.shake = 4; for (let i = 0; i < 6; i++) spawn(S, { type: 'scale', x: doorX - 30 * u, y: doorTop + 60 * u, vx: rnd(-200, -40), vy: rnd(-200, 40), g: 500, r: 2, spin: 8, max: 0.6 }); }
      if (ts > 1.15 && ts < 1.85) { const a = Math.min(1, (ts - 1.15) * 6) * Math.min(1, (1.85 - ts) * 5); ctx.globalAlpha = a; ctx.fillStyle = '#f2ece0'; ctx.beginPath(); ctx.roundRect(sx + 40 * u, top - 54 * u, 120 * u, 40 * u, 12 * u); ctx.fill(); ctx.fillStyle = '#7a1434'; ctx.font = `${Math.round(20 * u)}px Anton, Impact, sans-serif`; ctx.fillText('NOT NOW.', sx + 100 * u, top - 33 * u); ctx.globalAlpha = 1; }
      // plane two: the follow-up. It loops and slides into the mail slot.
      if (ts > 1.3 && ts < 2.16) {
        const P = v => { const b = { x: lerp(sx - W * 0.5, doorX - 14 * u, v), y: lerp(gy - 40 * u, slotY, v) }; const l = seg(v, 0.3, 0.68), r = 70 * u; return { x: b.x + Math.sin(TAU * l) * r * 0.9, y: b.y - (1 - Math.cos(TAU * l)) * r }; };
        const q = E.inOut(seg(ts, 1.3, 2.15)), p = P(q), p2 = P(Math.min(1, q + 0.01)), sc = q > 0.92 ? lerp(1, 0.4, seg(q, 0.92, 1)) : 1;
        paperPlane(ctx, p.x, p.y, Math.atan2(p2.y - p.y, p2.x - p.x), 24 * u * sc);
        if (Math.random() < 0.5) spawn(S, { type: 'ring', x: p.x, y: p.y, r: 1, grow: 6 * u, a: 0.35, w: 1, max: 0.5 });
      }
      if (!S.yes && ts >= 2.15) { S.yes = true; S.flash = 0.18; S.shake = 8 + 4 * k; for (let i = 0; i < 40; i++) { const an = rnd(-Math.PI, 0), sp = rnd(120, 420); spawn(S, { type: 'scale', x: doorX, y: doorTop, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, g: 300, r: rnd(1.5, 3), spin: rnd(-10, 10), max: rnd(0.8, 1.5) }); } }
      // the smell of fresh bread drifting out of the door
      if (lit > 0.5 && Math.random() < 0.5) spawn(S, { type: 'mist', x: doorX + rnd(-20, 20) * u, y: doorTop - 4 * u, vx: rnd(-20, 20), vy: -rnd(30, 70), r: rnd(10, 20) * u, color: '#f2ece0', a: 0.18, max: 2.2 });
      stepParts(ctx, S, dt, 'over');
      ctx.restore();
      if (!S.st && ts >= 2.55) { S.st = true; S.shake = 14 + 6 * k; }
      if (ts < 3.3) stamp(ctx, W * 0.22, H * 0.34, 'YES', 76 * u, '#6fe0a8', ts - 2.4, -0.16);
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(255,236,210,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.003, dt); }
      vignette(ctx, W, H, 0.6);
    }
  };

  // ---------- which scene for which coach ----------
  const BY_COACH = { 'Great White': 'greatwhite', Tiger: 'tiger', Mako: 'mako', Hammerhead: 'hammer', Nurse: 'nurse', Rex: 'rex', Cam: 'cam', Dana: 'dana' };
  const STAR = '<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="currentColor"/></svg>';

  function play(key, level, stars, coach) {
    const scene = SCENES[key];
    if (!scene) return false;
    const wrap = document.createElement('div');
    wrap.className = 'cs cs-' + key;
    wrap.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const n = clamp(stars || 1, 1, 3);
    const card = document.createElement('div');
    card.className = 'cs-card';
    card.innerHTML = '<div class="cs-stars">' + Array.from({ length: n }, (_, i) => '<span style="--i:' + i + '">' + STAR + '</span>').join('') + '</div>' +
      '<div class="cs-level">Level ' + level + '</div><div class="cs-word">' + (scene.word || 'Passed') + '</div>' +
      (coach && coach.name ? '<div class="cs-coach">with ' + coach.name + '</div>' : '');
    const skip = document.createElement('div'); skip.className = 'cs-skip'; skip.textContent = 'Tap to skip';
    wrap.append(canvas, card, skip);
    document.body.appendChild(wrap);
    let W = 0, H = 0, dpr = 1;
    const size = () => { dpr = Math.min(window.devicePixelRatio || 1, 1.5); W = window.innerWidth; H = window.innerHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
    size();
    const k = clamp(level / 40, 0, 1);
    const S = { parts: [], shake: 0 };
    scene.setup(S, W, H, k, coach || {});
    const t0 = performance.now();
    let last = t0, raf = 0, done = false, shown = false;
    function frame(now) {
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      if (S.shake > 0.2) { ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake); S.shake *= Math.pow(0.015, dt); }
      scene.draw(ctx, t, dt, S, W, H, k);
      if (!shown && t >= scene.card) { shown = true; wrap.classList.add('show-card'); }
      if (t < scene.dur) raf = requestAnimationFrame(frame); else end();
    }
    function end() {
      if (done) return; done = true;
      cancelAnimationFrame(raf);
      wrap.classList.add('out');
      window.removeEventListener('keydown', end, true);
      setTimeout(() => wrap.remove(), 500);
    }
    wrap.addEventListener('pointerdown', end);
    window.addEventListener('keydown', end, true);
    raf = requestAnimationFrame(frame);
    return true;
  }

  const older = RT.levelCinematic;
  RT.levelCinematic = function (level, stars, coach) {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (document.documentElement.classList.contains('tank-lite')) return false;
    const key = (([10, 20, 30, 40].includes(level) && SCENES.megalodon) ? 'megalodon' : BY_COACH[coach && coach.name]);
    if (key && SCENES[key]) return play(key, level, stars, coach);
    return older ? older(level, stars, coach) : false;
  };
  RT.playCutscene = (key, level, stars, coach) => play(key, level || 1, stars || 3, coach || {});
  // Preview helper: renders a scene off-screen at a fixed frame rate and returns JPEG frames (title card drawn in).
  RT.cutsceneFrames = function (key, level, stars, coach, opt) {
    const scene = SCENES[key]; if (!scene) return [];
    opt = opt || {}; const W = opt.W || 900, H = opt.H || 540, fps = opt.fps || 30, every = opt.every || 2;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d');
    const k = clamp(level / 40, 0, 1), S = { parts: [], shake: 0 }; scene.setup(S, W, H, k, coach || {});
    const out = [], dt = 1 / fps, n = Math.ceil(scene.dur * fps);
    for (let i = 0; i <= n; i++) {
      const t = i * dt;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
      if (S.shake > 0.2) { ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake); S.shake *= Math.pow(0.015, dt); }
      scene.draw(ctx, t, dt, S, W, H, k);
      if (t >= scene.card) {
        const f = clamp((t - scene.card) / 0.5, 0, 1);
        ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = f; ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(2,8,6,0.45)'; ctx.fillRect(0, H * 0.33, W, H * 0.36);
        ctx.fillStyle = '#f1f4f1'; ctx.font = `${Math.round(H * 0.2)}px Anton, Impact, sans-serif`; ctx.fillText('LEVEL ' + level, W / 2, H * 0.55);
        ctx.fillStyle = '#6fe0a8'; ctx.font = `${Math.round(H * 0.06)}px Anton, Impact, sans-serif`; ctx.fillText((scene.word || 'Passed').toUpperCase(), W / 2, H * 0.64);
        ctx.globalAlpha = 1;
      }
      if (i % every === 0) out.push(cv.toDataURL('image/jpeg', 0.8));
    }
    return out;
  };
  RT.cutsceneKit = { stamp, stage, frontShark, makeCrack, sandFloor, topRay, SCENES, BY_COACH, sideShark, sideFish, sideToWorld, topShark, topFish, Trail, openWater, crown, spawn, stepParts, vignette, warp, shade, rgba, E, seg, lerp, clamp, rnd, TAU };
})();
