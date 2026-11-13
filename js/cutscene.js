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
      S.surf = Math.round(H * 0.48);
      S.len = Math.min(W * 0.46, H * 0.86) * (0.92 + 0.14 * k);
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
        const tau = ts - 1.45, g = L * 2.75, v0 = g * 0.64;
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
      const scr = p => ({ x: (p.x - S.bx) * zoom + S.bx, y: (p.y - S.surf) * zoom + S.surf });
      // --- effects: smear on the rush up, held focus lines through the slow-mo, a hit on the bite and on the crash ---
      S.bokeh = true;
      S.blur = ts < 1.45 ? 0.55 * E.inQ(seg(ts, 0.5, 1.4)) : ts < 2.9 ? 0.32 : Math.max(0, 0.45 - (ts - 2.9) * 0.6);
      if (ts > 0.9 && ts < 1.44) S.streak = { x: 0, y: -26 * E.inQ(seg(ts, 0.9, 1.44)) };
      if (S.focus && S.focus.hold && ts > 1.8) S.focus.hold = false;
      // --- events ---
      if (!S.e1 && ts >= 1.43) {
        S.e1 = true; const nx = sideToWorld(shark, 198, 45).x;
        for (let i = 0; i < 70 + 50 * k; i++) spawn(S, { type: 'drop', x: nx + rnd(-L * 0.08, L * 0.08), y: surf, vx: rnd(-1, 1) * 380, vy: -rnd(260, 760), g: 1100, r: rnd(1.4, 4.2), max: rnd(0.9, 1.5), floor: surf + 4 });
        for (let i = 0; i < 12; i++) spawn(S, { type: 'foam', x: nx + rnd(-L * 0.18, L * 0.18), y: surf + rnd(-3, 3), r: rnd(8, 20), a: 0.55, max: rnd(1.2, 2.2), layer: 'over' });
        for (let i = 0; i < 34; i++) spawn(S, { type: 'bubble', x: nx + rnd(-L * 0.1, L * 0.1), y: surf + rnd(10, L * 0.5), vx: 0, vy: -rnd(70, 180), r: rnd(1.5, 5), max: rnd(1.2, 2.4), ph: rnd(0, 6), layer: 'under', ceil: surf + 3, a: 0.75 });
        S.ripples.push({ x: nx, t0: ts, amp: 9 + 5 * k }); S.shake = 7 + 4 * k;
        const q = scr({ x: nx, y: surf }); S.zoom = { x: q.x, y: q.y, amt: 0.07 }; S.chroma = 6;
        S.crowns.push({ x: nx, t0: ts, w: L * 0.2, h: L * 0.34, life: 0.85 });
      }
      if (!S.e2 && ts >= 1.5) {
        S.e2 = true; S.flash = 0.18;
        const q = scr(mouth); hit(S, q.x, q.y, 0.9 + 0.3 * k); S.focus.hold = true; S.focus.a = 0.6;
        for (let i = 0; i < 22; i++) { const an = rnd(0, TAU), sp = rnd(90, 260); spawn(S, { type: 'scale', x: mouth.x, y: mouth.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 120, g: 700, r: rnd(1.5, 3.2), spin: rnd(-14, 14), max: rnd(0.7, 1.3) }); }
      }
      if (!S.e3 && ts >= 2.88) {
        S.e3 = true; const ex = cx + L * 0.05;
        for (let i = 0; i < 120 + 80 * k; i++) spawn(S, { type: 'drop', x: ex + rnd(-L * 0.3, L * 0.3), y: surf, vx: rnd(-1, 1) * 560, vy: -rnd(300, 900), g: 1150, r: rnd(1.6, 5), max: rnd(1, 1.7), floor: surf + 4 });
        for (let i = 0; i < 18; i++) spawn(S, { type: 'foam', x: ex + rnd(-L * 0.35, L * 0.35), y: surf + rnd(-3, 4), r: rnd(12, 30), a: 0.6, max: rnd(1.6, 2.6) });
        for (let i = 0; i < 80; i++) spawn(S, { type: 'bubble', x: ex + rnd(-L * 0.3, L * 0.3), y: surf + rnd(8, L * 0.7), vx: rnd(-20, 20), vy: -rnd(60, 200), r: rnd(1.5, 7), max: rnd(1.4, 2.8), ph: rnd(0, 6), layer: 'under', ceil: surf + 3, a: 0.8 });
        spawn(S, { type: 'mist', x: ex, y: surf + 40, r: L * 0.35, color: '#dff3ea', a: 0.22, max: 1.6, layer: 'under' });
        S.ripples.push({ x: ex, t0: ts, amp: 14 + 6 * k }); S.shake = 15 + 12 * k;
        const q = scr({ x: ex, y: surf }); hit(S, q.x, q.y, 1 + 0.3 * k); S.focus.a = 0.5; S.streak = { x: 8, y: 26 };
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

  // ---------- the Megalodon from the side, built from the site's own silhouette (js/megalodon.js) ----------
  const MEG_D = { rear: 'M124 27.5C108 30 96 34 88 38L80 31L82 40.5C72 44 64 47.5 56 50L56 60C66 62 76 65 86 68.5L83 77L94 71C102 74 108 76.5 112 78.5L106 92L122 82.5L124 83ZM91 48Q99 51.5 104 60Q97.5 53.1 91 48Z', tail: 'M60 49.5L6 5C12 17 16 25 19 30L15 32L23 37C27 43 31 49 34 54C28 68 21 86 16 103L60 60.5Z', front: 'M252 52C244 44 224 33 196 28C184 26 172 25 160 25L131 3C131 12 127 21 121 27L117 28L116 83C130 85 146 85.5 160 84L141 117C160 111 176 99 184 82C192 80 199 76 204 71L207 75.4L210 69.6L213.5 74.8L217 68.4L220.5 73.2L224 67L227.5 71.2L230.5 65L233 68.2L236 61.6C243 60 249 57 252 52ZM221.2 49a2.7 2.7 0 1 0 5.4 0a2.7 2.7 0 1 0 -5.4 0ZM173 46.0Q176.4 56 172.4 67.0Q174.1 55.9 173 46.0ZM179.5 46.6Q182.9 56 178.9 66.6Q180.6 55.9 179.5 46.6ZM186 47.2Q189.4 56 185.4 66.2Q187.1 55.9 186 47.2ZM192.5 47.8Q195.9 56 191.9 65.8Q193.6 55.9 192.5 47.8ZM199 48.4Q202.4 56 198.4 65.4Q200.1 55.9 199 48.4ZM139 38Q149 43 157 55Q147.4 44.7 139 38ZM146 34.5Q157 40.5 164 52Q155.2 42.4 146 34.5ZM154 33.5Q163 38 169 47Q161.5 39.6 154 33.5ZM123 60Q137 61 151 70Q136.3 63.1 123 60Z', jaw: 'M195 78.5L204.5 71.5L207.5 76.4L211 71.8L214.5 77.2L218 72.8L221.5 77.8L225 73.8L228 78.4C220 84.6 207 84.4 195 78.5Z' };
  let MEG = null;
  // o: { x, y, ang, len, jaw 0..1, beat, back, belly, rim }  (the pivot is local 130,55; the head points along +x)
  function megSide(ctx, o) {
    if (!MEG) MEG = { rear: new Path2D(MEG_D.rear), tail: new Path2D(MEG_D.tail), front: new Path2D(MEG_D.front), jaw: new Path2D(MEG_D.jaw) };
    const k = o.len / 258, b = o.beat || 0;
    ctx.save(); ctx.translate(o.x, o.y); ctx.rotate(o.ang); ctx.scale(k, k); ctx.translate(-130, -55);
    const g = ctx.createLinearGradient(0, 22, 0, 90); g.addColorStop(0, o.back); g.addColorStop(0.55, shade(o.back, 0.25)); g.addColorStop(1, o.belly);
    const rl = o.light || { x: 0, y: -1 }, rx = rl.x * 1.6, ry = rl.y * 1.6;
    const paint = (path) => { ctx.save(); ctx.translate(rx, ry); ctx.fillStyle = o.rim; ctx.fill(path, 'evenodd'); ctx.restore(); ctx.fillStyle = g; ctx.fill(path, 'evenodd'); };
    // mouth: the dark inside shows when the jaw drops
    const ja = (o.jaw || 0) * 0.75;
    if (ja > 0.01) { ctx.fillStyle = '#12020a'; ctx.beginPath(); ctx.moveTo(186, 76); ctx.lineTo(236, 61.6); ctx.lineTo(197 + Math.cos(ja) * 33, 79 + Math.sin(ja) * 33); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(122,20,52,0.6)'; ctx.beginPath(); ctx.moveTo(192, 77); ctx.lineTo(222, 70); ctx.lineTo(197 + Math.cos(ja) * 24, 79 + Math.sin(ja) * 24); ctx.closePath(); ctx.fill(); }
    if (o.inner) o.inner(ctx, k);
    ctx.save(); ctx.translate(124, 55); ctx.rotate(Math.sin(b) * 0.07); ctx.translate(-124, -55);
    ctx.save(); ctx.translate(60, 55); ctx.rotate(Math.sin(b - 1.1) * 0.2); ctx.translate(-60, -55); paint(MEG.tail); ctx.restore();
    paint(MEG.rear); ctx.restore();
    ctx.save(); ctx.translate(197, 79); ctx.rotate(ja); ctx.translate(-197, -79); paint(MEG.jaw); ctx.restore();
    paint(MEG.front);
    // the eye catches the light
    if (o.eye) { ctx.fillStyle = rgba('#6fe0a8', o.eye * 0.12); ctx.beginPath(); ctx.arc(223.9, 49, 3.4, 0, TAU); ctx.fill(); ctx.fillStyle = rgba('#e8fff4', o.eye); ctx.beginPath(); ctx.arc(224.4, 48.6, 1.3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  // =====================================================================
  // MEGALODON: the season boss. The five coaches cruise along with a big fish; the light dies, they bolt, and
  // something the size of the sky rises out of the dark, swallows the fish whole and keeps going.
  // =====================================================================
  SCENES.megalodon = {
    dur: 6.2, card: 4.2,
    setup(S, W, H, k) {
      S.k = k; S.L = H * (3.3 + 0.5 * k); S.flash = 0; S.dark = 0; S.flow = []; S.lines = [];
      const M = Math.min(W, H), cols = ['#86DDB0', '#D2476E', '#8FA69B', '#3FBF7F', '#C9D2CD'];
      S.pod = cols.map((c, i) => ({ c, x: W * (0.12 + i * 0.13) + rnd(-20, 20), y: H * (0.32 + (i % 3) * 0.1) + rnd(-15, 15), len: M * (0.15 + (i === 4 ? 0.04 : 0)), vx: W * 0.06, vy: 0, ang: 0, ph: rnd(0, 6), flee: { x: (i % 2 ? 1 : -1) * rnd(0.6, 1), y: -rnd(0.4, 1) } }));
      S.prey = { x: W * 0.36, y: H * 0.5, len: M * 0.2, ang: 0 };
      S.snow = Array.from({ length: 170 }, () => ({ x: rnd(0, W), y: rnd(0, H), z: rnd(0.3, 1), vx: 0, vy: 0 }));
    },
    draw(ctx, t, dt, S, W, H, k) {
      const ts = warp(t, [[0, 0], [1.95, 1.95], [2.5, 2.2], [9, 8.7]]);
      const sdt = dt * (t > 1.95 && t < 2.5 ? 0.45 : 1);
      const L = S.L, M = Math.min(W, H), pr = S.prey;
      // ---- where the mouth is: out of the dark, onto the fish, a hard stop on impact, then it surges on up ----
      const biteAt = 2.12, t0r = 1.2, D = biteAt - t0r, y0 = H * 1.25, fy = pr.y0 == null ? pr.y : pr.y0;
      let mY;
      if (ts < biteAt) { const u = seg(ts, t0r, biteAt), f = 0.6 * u * u + 0.4 * u * u * (3 - 2 * u); mY = lerp(y0, fy, f); }
      else { const d = ts - biteAt; mY = fy - H * (0.42 * d + 1.5 * Math.pow(Math.max(0, d - 0.5), 2)); }
      const vRise = S.mYp == null ? 0 : (S.mYp - mY) / Math.max(sdt, 1e-3); S.mYp = mY;
      const speed = clamp(Math.abs(vRise) / (H * 1.4), 0, 1.4);
      const shakeA = ts > biteAt ? Math.sin((ts - biteAt) * 34) * 0.05 * Math.exp(-(ts - biteAt) * 4) : 0;
      const rise = clamp((y0 - mY) / (y0 + L), 0, 1);
      const ang = -Math.PI / 2 + 0.14 - 0.08 * rise + shakeA;
      if (S.aimX == null && ts >= 1.55) { S.aimX = pr.x; pr.y0 = pr.y; }
      const MOUTH = [212, 80];
      const mo = sideToWorldMeg(0, 0, ang, L, MOUTH[0], MOUTH[1]), px = (S.aimX == null ? pr.x : S.aimX) - mo.x, py = mY - mo.y;
      const mouth = { x: px + mo.x, y: mY }, A = { x: Math.cos(ang), y: Math.sin(ang) }, N = { x: -A.y, y: A.x };
      // jaw: gapes on the way up, slams shut on the bite, opens a crack to gulp the fish down
      let jaw = ts < biteAt ? E.outQ(seg(ts, 1.5, 1.98)) : ts < biteAt + 0.07 ? lerp(1, 0.04, E.inQ(seg(ts, biteAt, biteAt + 0.07))) : 0.04;
      const gulpT = biteAt + 0.42;
      if (ts > gulpT && ts < gulpT + 0.2) jaw = 0.04 + 0.32 * Math.sin(Math.PI * seg(ts, gulpT, gulpT + 0.2));
      // ---- camera: a slow push in as it comes, a punch on the bite ----
      const punch = Math.exp(-Math.pow((ts - biteAt - 0.02) / 0.12, 2));
      const zoom = 1 + 0.06 * E.inOut(seg(ts, 1.3, 2.1)) + 0.1 * punch;
      if (ts > 1.25 && ts < biteAt) S.shake = Math.max(S.shake, 1.5 + 6 * seg(ts, 1.25, 2.1) * (1 + k));
      ctx.save(); const fx = lerp(W / 2, mouth.x, 0.6), fyc = lerp(H / 2, clamp(mouth.y, 0, H), 0.6);
      ctx.translate(fx, fyc); ctx.scale(zoom, zoom); ctx.translate(-fx, -fyc);
      // ---- water ----
      const bg = ctx.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a5a44'); bg.addColorStop(0.5, '#0b3124'); bg.addColorStop(1, '#020806');
      ctx.fillStyle = bg; ctx.fillRect(-W, -H, W * 3, H * 3);
      for (let i = 0; i < 7; i++) { const rx = W * (i * 0.16) + Math.sin(t * 0.3 + i) * 20, g = ctx.createLinearGradient(0, 0, 0, H * 0.8); g.addColorStop(0, `rgba(200,245,222,${(0.09 * (1 - S.dark)).toFixed(3)})`); g.addColorStop(1, 'rgba(200,245,222,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(rx, -10); ctx.lineTo(rx + 70, -10); ctx.lineTo(rx + 170, H); ctx.lineTo(rx + 50, H); ctx.fill(); }
      // marine snow: drifting, until the Meg shoves the water aside and drags it along its flanks
      const megOn = ts > 1.1 && py - L * 0.62 < H + 60 && py + L * 0.62 > -60;
      for (const p of S.snow) {
        if (megOn) {
          const rx = p.x - px, ry = p.y - py, al = rx * A.x + ry * A.y, ac = rx * N.x + ry * N.y, hw = Math.max(0, 0.13 * L * (1 - Math.pow(al / (0.5 * L), 2)));
          const reach = hw * 1.7 + 50;
          if (al > -0.55 * L && al < 0.6 * L && Math.abs(ac) < reach) { const f = (1 - Math.abs(ac) / reach) * speed; const sg = ac < 0 ? -1 : 1; p.vx += (N.x * sg * 2600 - A.x * 1800) * f * sdt; p.vy += (N.y * sg * 2600 - A.y * 1800) * f * sdt; }
        }
        p.vx *= Math.pow(0.12, sdt); p.vy *= Math.pow(0.12, sdt);
        p.x += p.vx * sdt; p.y += (p.vy + 8 + 12 * p.z) * sdt;
        if (p.y > H + 20) { p.y = -10; p.x = rnd(0, W); } if (p.y < -30) { p.y = H + 10; p.x = rnd(0, W); } if (p.x < -30) p.x = W + 20; if (p.x > W + 30) p.x = -20;
        const v = Math.hypot(p.vx, p.vy), al = 0.15 + 0.3 * p.z;
        if (v > 60) { ctx.strokeStyle = `rgba(216,243,230,${al.toFixed(3)})`; ctx.lineWidth = 0.7 + 1.2 * p.z; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05); ctx.stroke(); }
        else { ctx.fillStyle = `rgba(216,243,230,${al.toFixed(3)})`; ctx.beginPath(); ctx.arc(p.x, p.y, 0.7 + 1.3 * p.z, 0, TAU); ctx.fill(); }
      }
      // the light dies from the bottom up
      S.dark = clamp(seg(ts, 0.9, 1.7) * 0.75, 0, 0.75);
      const dg = ctx.createLinearGradient(0, H * (1 - S.dark * 1.2), 0, H); dg.addColorStop(0, 'rgba(1,6,4,0)'); dg.addColorStop(1, `rgba(1,6,4,${(S.dark + 0.2).toFixed(3)})`);
      ctx.fillStyle = dg; ctx.fillRect(-W, -H, W * 3, H * 3);
      // ---- the coaches: cruising, then bolting with streaks behind them ----
      const bolt = ts > 1.15;
      if (!S.bolted && bolt) { S.bolted = true; for (const s of S.pod) { s.vx = s.flee.x * W * 0.9; s.vy = s.flee.y * H * 0.9; } }
      for (const s of S.pod) {
        if (bolt) { s.vx *= Math.pow(0.7, sdt); s.vy *= Math.pow(0.7, sdt); }
        s.x += s.vx * sdt; s.y += s.vy * sdt + (bolt ? 0 : Math.sin(ts * 1.5 + s.ph) * 6 * dt);
        const ta = Math.atan2(s.vy, s.vx); s.ang = lerp(s.ang, ta, 1 - Math.pow(0.001, sdt));
        const sp = Math.hypot(s.vx, s.vy);
        if (bolt && sp > 120) { ctx.strokeStyle = 'rgba(220,245,235,0.22)'; ctx.lineWidth = 1.2; for (const o of [-0.08, 0, 0.08]) { const bx = s.x - Math.cos(s.ang) * s.len * 0.45 + N.x * 0 - Math.sin(s.ang) * o * s.len, by = s.y - Math.sin(s.ang) * s.len * 0.45 + Math.cos(s.ang) * o * s.len; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - s.vx * 0.12, by - s.vy * 0.12); ctx.stroke(); } }
        sideShark(ctx, { x: s.x, y: s.y, ang: s.ang, flipY: Math.cos(s.ang) < 0, len: s.len, color: s.c, belly: shade(s.c, 0.45), beat: ts * (bolt ? 26 : 9) + s.ph, alpha: 1 - 0.4 * S.dark });
      }
      // ---- the fish: cruising, panicking, sucked in, caught, swallowed ----
      const kM = L / 258, inA = Math.atan2(0.93, 0.36), IN = { x: 214, y: 84 }, tIn = 2.05;
      const inWorld = sideToWorldMeg(px, py, ang, L, IN.x, IN.y), inAngW = ang + inA;
      if (ts < tIn) {
        if (ts < 1.55) { pr.x += W * 0.05 * sdt + (bolt ? W * 0.1 * sdt : 0); pr.y += Math.sin(ts * 2) * 4 * dt - (bolt ? H * 0.03 * sdt : 0); pr.ang = Math.sin(ts * 9) * 0.06; }
        else if (ts < 1.8) { const away = Math.atan2(pr.y - mouth.y, pr.x - mouth.x), d = Math.atan2(Math.sin(away - pr.ang), Math.cos(away - pr.ang)); pr.ang += d * (1 - Math.pow(0.0005, sdt)); pr.x += Math.cos(pr.ang) * W * 0.08 * sdt; pr.y += Math.sin(pr.ang) * W * 0.08 * sdt; pr.p0 = null; }
        else {
          if (!pr.p0) pr.p0 = { x: pr.x, y: pr.y, a: pr.ang };
          const q = E.inC(seg(ts, 1.8, tIn)), da = Math.atan2(Math.sin(inAngW - pr.p0.a), Math.cos(inAngW - pr.p0.a));
          pr.x = lerp(pr.p0.x, inWorld.x, q); pr.y = lerp(pr.p0.y, inWorld.y, q); pr.ang = pr.p0.a + da * q + Math.sin(ts * 50) * 0.25 * (1 - q);
        }
        if (ts < 1.8) sideFish(ctx, pr.x, pr.y, pr.ang, pr.len, '#efe6d2', Math.sin(ts * (ts > 1.55 ? 55 : 14)) * pr.len * (ts > 1.55 ? 0.14 : 0.08));
      }
      // suction: water streaks pulled into the open mouth
      if (ts > 1.72 && ts < biteAt) {
        const pull = seg(ts, 1.72, 1.9);
        if (S.lines.length < 46) for (let i = 0; i < 4; i++) S.lines.push({ a: rnd(-1.4, 1.4), r: M * rnd(0.35, 0.7), v: rnd(0.9, 1.6) });
        ctx.lineCap = 'round';
        for (let i = S.lines.length - 1; i >= 0; i--) {
          const l = S.lines[i]; l.r -= M * 1.9 * l.v * sdt; if (l.r < M * 0.03) { S.lines.splice(i, 1); continue; }
          const dir = Math.atan2(-N.y, -N.x) + l.a * 0.9, cx = mouth.x + Math.cos(dir) * l.r, cy = mouth.y + Math.sin(dir) * l.r, len = Math.min(l.r * 0.5, M * 0.12);
          ctx.strokeStyle = `rgba(226,248,238,${(0.4 * pull).toFixed(3)})`; ctx.lineWidth = 1.6;
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(dir) * len, cy + Math.sin(dir) * len); ctx.stroke();
        }
      } else if (ts >= biteAt) S.lines.length = 0;
      // ---- the Meg ----
      if (megOn) {
        // slipstream: lines of water sliding down its flanks, longer the faster it goes
        if (speed > 0.15) for (let i = 0; i < 8; i++) S.flow.push({ al: rnd(-0.35, 0.55) * L, sd: Math.random() < 0.5 ? -1 : 1, off: rnd(8, 60), life: 0, max: rnd(0.25, 0.5) });
        for (let i = S.flow.length - 1; i >= 0; i--) {
          const f = S.flow[i]; f.life += sdt; f.al -= Math.abs(vRise) * 0.9 * sdt; if (f.life > f.max || f.al < -0.6 * L) { S.flow.splice(i, 1); continue; }
          const hw = Math.max(0, 0.13 * L * (1 - Math.pow(f.al / (0.5 * L), 2))), ac = f.sd * (hw + f.off), x0 = px + A.x * f.al + N.x * ac, y0b = py + A.y * f.al + N.y * ac, ln = Math.min(L * 0.25, 40 + Math.abs(vRise) * 0.12);
          ctx.strokeStyle = `rgba(220,246,234,${(0.45 * Math.sin(Math.PI * f.life / f.max) * Math.min(1, speed)).toFixed(3)})`; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(x0, y0b); ctx.lineTo(x0 - A.x * ln, y0b - A.y * ln); ctx.stroke();
        }
        // bow wave: a pressure front pushed ahead of the snout
        const tip = sideToWorldMeg(px, py, ang, L, 258, 50);
        if (speed > 0.1 && tip.y > -80) { const r = L * 0.06 + 30; for (const [sc, al] of [[1, 0.4], [1.45, 0.18]]) { const R = r * sc; ctx.strokeStyle = `rgba(230,250,240,${(al * Math.min(1, speed)).toFixed(3)})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(tip.x - A.x * R * 0.3, tip.y - A.y * R * 0.3, R * 0.5, R, ang, -1.25, 1.25); ctx.stroke(); } }
        const eye = ts < 1.75 ? E.outQ(seg(ts, 1.25, 1.6)) : 0.85;
        // the fish inside the mouth, drawn in the Meg's own space so it moves with it and the jaw closes over it
        const inner = (c) => {
          if (ts < tIn || S.gone) return;
          const g = seg(ts, gulpT, gulpT + 0.16), ins = E.inC(g);
          if (g >= 1) { S.gone = true; return; }
          const lx = lerp(IN.x, 200, ins), ly = lerp(IN.y, 72, ins), thrash = ts < gulpT ? Math.sin(ts * 44) * 0.28 : 0;
          sideFish(c, lx, ly, inA + thrash, pr.len / kM, '#efe6d2', Math.sin(ts * 60) * pr.len / kM * 0.16);
        };
        megSide(ctx, { x: px, y: py, ang, len: L, jaw, beat: ts * 3.2, back: k > 0.9 ? '#2a0812' : '#07170f', belly: k > 0.9 ? '#7a1434' : '#2f4c3d', rim: rgba('#f2ece0', 0.55), light: { x: -Math.sin(ang), y: -Math.cos(ang) }, eye, inner });
        if (ts >= 1.8 && ts < tIn) sideFish(ctx, pr.x, pr.y, pr.ang, pr.len, '#efe6d2', Math.sin(ts * 55) * pr.len * 0.14);
        // bubbles streaming off the flanks
        for (let i = 0; i < 3 + 4 * k + 6 * speed; i++) { const along = rnd(-0.4, 0.5) * L, side = (Math.random() < 0.5 ? -1 : 1) * L * 0.12; const bx = px + A.x * along + N.x * side, by = py + A.y * along + N.y * side; if (by > -20 && by < H + 20) spawn(S, { type: 'bubble', x: bx, y: by, vx: rnd(-40, 40) - A.x * 200 * speed, vy: -rnd(60, 200) - A.y * 200 * speed, r: rnd(2, 7), max: rnd(0.6, 1.4), ph: rnd(0, 6), a: 0.7 }); }
        // caught: blood and scales leak from the jaw while the fish fights
        if (S.ate && !S.gone && ts < gulpT && Math.random() < 0.45) { const c = sideToWorldMeg(px, py, ang, L, rnd(200, 226), 84); spawn(S, { type: 'mist', x: c.x, y: c.y, vx: N.x * 60, vy: N.y * 60, r: M * rnd(0.03, 0.07), color: '#7a1434', a: 0.5, max: 1.4 }); if (Math.random() < 0.5) spawn(S, { type: 'scale', x: c.x, y: c.y, vx: N.x * rnd(60, 200) + rnd(-60, 60), vy: N.y * rnd(60, 200) + rnd(-60, 60), drag: 0.93, r: rnd(1.5, 3), spin: rnd(-12, 12), max: 1 }); }
        // the gulp: water flushes out of the gills
        if (!S.flush && ts > gulpT + 0.12) { S.flush = true; S.shake = 8 + 6 * k; for (let i = 0; i < 40; i++) { const c = sideToWorldMeg(px, py, ang, L, rnd(172, 200), rnd(48, 66)); spawn(S, { type: 'bubble', x: c.x, y: c.y, vx: -N.x * rnd(80, 260) + rnd(-40, 40), vy: -N.y * rnd(80, 260) + rnd(-40, 40), r: rnd(2, 6), max: rnd(0.6, 1.2), ph: rnd(0, 6), a: 0.8 }); } }
      }
      // ---- the bite ----
      if (!S.ate && ts >= biteAt) {
        S.ate = true; S.flash = 0.2; S.shake = 26 + 14 * k;
        spawn(S, { type: 'ring', x: mouth.x, y: mouth.y, r: M * 0.05, grow: M * 1.2, a: 0.8, w: 4, max: 0.8 });
        spawn(S, { type: 'ring', x: mouth.x, y: mouth.y, r: M * 0.03, grow: M * 0.75, a: 0.5, w: 2, max: 0.6 });
        for (let i = 0; i < 30 + 20 * k; i++) { const an = rnd(0, TAU), sp = rnd(120, 520); spawn(S, { type: 'scale', x: mouth.x, y: mouth.y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, drag: 0.92, r: rnd(1.5, 3.5), spin: rnd(-14, 14), max: rnd(0.8, 1.6) }); }
        spawn(S, { type: 'mist', x: mouth.x, y: mouth.y, r: M * 0.16, color: '#7a1434', a: 0.45, max: 2.0 });
        S.burst = Array.from({ length: 26 }, () => ({ a: rnd(0, TAU), r0: rnd(0.08, 0.2), v: rnd(1.4, 2.6) }));
      }
      // impact lines bursting out from the bite
      if (S.burst && ts < biteAt + 0.35) { const u = seg(ts, biteAt, biteAt + 0.35); ctx.strokeStyle = `rgba(240,250,245,${(0.55 * (1 - u)).toFixed(3)})`; ctx.lineWidth = 2; for (const b of S.burst) { const r1 = M * (b.r0 + u * b.v * 0.5), r2 = r1 + M * 0.12 * (1 - u); ctx.beginPath(); ctx.moveTo(mouth.x + Math.cos(b.a) * r1, mouth.y + Math.sin(b.a) * r1); ctx.lineTo(mouth.x + Math.cos(b.a) * r2, mouth.y + Math.sin(b.a) * r2); ctx.stroke(); } }
      // the tail goes by: a wall of bubbles
      if (!S.wash && ts > biteAt + 1.15) { S.wash = true; S.shake = 12 + 8 * k; for (let i = 0; i < 90 + 60 * k; i++) spawn(S, { type: 'bubble', x: px + rnd(-W * 0.25, W * 0.25), y: H + rnd(0, 80), vx: rnd(-80, 80), vy: -rnd(200, 600), r: rnd(2, 10), max: rnd(1.2, 2.4), ph: rnd(0, 6), a: 0.8 }); }
      stepParts(ctx, S, dt, 'over');
      ctx.restore();
      // sheer mass going past: fast streaks down the whole frame while the body slides through
      const mass = ts > biteAt + 0.15 && megOn ? Math.min(1, speed) : 0;
      if (mass > 0.05) { ctx.strokeStyle = `rgba(220,245,235,${(0.12 * mass).toFixed(3)})`; ctx.lineWidth = 1.2; for (let i = 0; i < 18; i++) { const x = (i * 137 + 41) % W, y = ((t * 2400 + i * 233) % (H + 300)) - 150, ln = 80 + (i * 57 % 160); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + ln); ctx.stroke(); } }
      if (S.flash > 0.01) { ctx.fillStyle = `rgba(255,240,244,${S.flash.toFixed(3)})`; ctx.fillRect(0, 0, W, H); S.flash *= Math.pow(0.002, dt); }
      vignette(ctx, W, H, 0.75);
    }
  };
  function sideToWorldMeg(x, y, ang, len, lx, ly) { const k = len / 258, dx = (lx - 130) * k, dy = (ly - 55) * k; return { x: x + dx * Math.cos(ang) - dy * Math.sin(ang), y: y + dx * Math.sin(ang) + dy * Math.cos(ang) }; }

  // =====================================================================
  // POST EFFECTS. A scene asks for them by setting fields on S (or calling hit()); they are applied after it draws.
  //   S.blur    0..0.9   motion blur: how much of the last frame lingers
  //   S.zoom    { x, y, amt }  radial zoom blur from a point (amt < 0 sucks inward)
  //   S.streak  { x, y }  directional blur: the frame smears back along this vector (px)
  //   S.chroma  px of red/cyan split
  //   S.impact  seconds of black-and-white "impact frame" left
  //   S.focus   { x, y, a }  manga focus lines aimed at a point
  //   S.kick    { x, y }  a shove that springs back
  //   S.bokeh   true: soft out-of-focus specks drifting close to the camera
  // =====================================================================
  function hit(S, x, y, p) {
    p = p == null ? 1 : p;
    S.impact = Math.max(S.impact || 0, 0.045 * p);
    S.chroma = Math.max(S.chroma || 0, 10 * p);
    S.zoom = { x, y, amt: 0.1 * p };
    S.shake = Math.max(S.shake || 0, 16 * p);
    S.focus = { x, y, a: Math.min(1, 0.95 * p) };
    const a = rnd(0, TAU); S.kick = { x: Math.cos(a) * 12 * p, y: Math.abs(Math.sin(a)) * 12 * p };
  }
  const FX = {};
  function buf(name, w, h) {
    let c = FX[name]; if (!c) c = FX[name] = document.createElement('canvas');
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return c;
  }
  function grainTile() {
    if (FX.grain) return FX.grain;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), d = x.createImageData(128, 128);
    for (let i = 0; i < d.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 200; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
    x.putImageData(d, 0, 0); FX.grain = c; return c;
  }
  function bokehSprite() {
    if (FX.bok) return FX.bok;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(225,248,236,0.55)'); g.addColorStop(0.55, 'rgba(225,248,236,0.35)'); g.addColorStop(0.8, 'rgba(225,248,236,0.12)'); g.addColorStop(1, 'rgba(225,248,236,0)');
    x.fillStyle = g; x.fillRect(0, 0, 128, 128); FX.bok = c; return c;
  }
  function focusLines(ctx, x, y, w, h, a) {
    const R = Math.hypot(w, h), n = 64, m = Math.min(w, h);
    ctx.fillStyle = `rgba(242,248,244,${(0.32 * a).toFixed(3)})`;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const an = (i + Math.random() * 0.8) / n * TAU, r0 = m * (0.36 + Math.random() * 0.26), wd = (0.003 + Math.random() * 0.009);
      ctx.moveTo(x + Math.cos(an) * r0, y + Math.sin(an) * r0);
      ctx.lineTo(x + Math.cos(an - wd) * R, y + Math.sin(an - wd) * R);
      ctx.lineTo(x + Math.cos(an + wd) * R, y + Math.sin(an + wd) * R);
    }
    ctx.fill();
  }
  function post(cv, ctx, S, t, dt, W, H, dpr) {
    const w = cv.width, h = cv.height, lo = !!S.lowfx;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    const copy = () => { const b = buf('b', w, h), x = b.getContext('2d'); x.globalCompositeOperation = 'copy'; x.globalAlpha = 1; x.drawImage(cv, 0, 0); return b; };
    // directional smear
    if (!lo && S.streak && Math.hypot(S.streak.x, S.streak.y) > 1.5) {
      const b = copy(), n = 6;
      for (let i = 1; i <= n; i++) { ctx.globalAlpha = 1 / (i + 1); ctx.drawImage(b, -S.streak.x * dpr * i / n, -S.streak.y * dpr * i / n); }
      ctx.globalAlpha = 1; S.streak.x *= Math.pow(0.02, dt); S.streak.y *= Math.pow(0.02, dt);
    }
    // radial zoom blur
    if (!lo && S.zoom && Math.abs(S.zoom.amt) > 0.004) {
      const b = copy(), n = 6, zx = S.zoom.x * dpr, zy = S.zoom.y * dpr;
      for (let i = 1; i <= n; i++) { const sc = 1 + S.zoom.amt * i / n; ctx.globalAlpha = 1 / (i + 1); ctx.setTransform(sc, 0, 0, sc, zx * (1 - sc), zy * (1 - sc)); ctx.drawImage(b, 0, 0); }
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; S.zoom.amt *= Math.pow(0.006, dt);
    }
    // motion blur: blend this frame into a running average of the last few
    const bl = lo ? 0 : clamp(S.blur || 0, 0, 0.9);
    if (bl > 0.02) {
      const a = buf('a', w, h), ax = a.getContext('2d');
      if (!S._acc) { ax.globalCompositeOperation = 'copy'; ax.globalAlpha = 1; ax.drawImage(cv, 0, 0); S._acc = true; }
      else { ax.globalCompositeOperation = 'source-over'; ax.globalAlpha = 1 - Math.pow(bl, dt * 60); ax.drawImage(cv, 0, 0); ax.globalAlpha = 1; ctx.globalCompositeOperation = 'copy'; ctx.drawImage(a, 0, 0); ctx.globalCompositeOperation = 'source-over'; }
    } else S._acc = false;
    // soft specks right in front of the lens
    if (S.bokeh) {
      if (!S._bok) S._bok = Array.from({ length: 6 }, () => ({ x: Math.random(), y: Math.random(), r: rnd(0.025, 0.07), v: rnd(0.01, 0.04), ph: rnd(0, 6), a: rnd(0.1, 0.26) }));
      const sp = bokehSprite(), m = Math.min(w, h);
      for (const b of S._bok) { b.y -= b.v * dt; if (b.y < -0.15) { b.y = 1.15; b.x = Math.random(); } const r = b.r * m; ctx.globalAlpha = b.a * (0.7 + 0.3 * Math.sin(t * 1.3 + b.ph)); ctx.drawImage(sp, b.x * w + Math.sin(t * 0.5 + b.ph) * m * 0.02 - r, b.y * h - r, r * 2, r * 2); }
      ctx.globalAlpha = 1;
    }
    // red/cyan split
    if (!lo && (S.chroma || 0) > 0.6) {
      const d = S.chroma * dpr, r = buf('b', w, h), rx = r.getContext('2d'), c = buf('c', w, h), cx = c.getContext('2d');
      rx.globalCompositeOperation = 'copy'; rx.drawImage(cv, 0, 0); rx.globalCompositeOperation = 'multiply'; rx.fillStyle = '#ff0000'; rx.fillRect(0, 0, w, h);
      cx.globalCompositeOperation = 'copy'; cx.drawImage(cv, 0, 0); cx.globalCompositeOperation = 'multiply'; cx.fillStyle = '#00ffff'; cx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'copy'; ctx.drawImage(c, -d * 0.5, -d * 0.15);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(r, d * 0.5, d * 0.15);
      ctx.globalCompositeOperation = 'source-over'; S.chroma *= Math.pow(0.012, dt);
    }
    // impact frame: a beat of high-contrast negative, tinted burgundy
    if ((S.impact || 0) > 0) {
      ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'color'; ctx.globalAlpha = 0.4; ctx.fillStyle = '#7a1434'; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; S.impact -= dt;
    }
    if (S.focus && S.focus.a > 0.03) { focusLines(ctx, S.focus.x * dpr, S.focus.y * dpr, w, h, S.focus.a); S.focus.a *= Math.pow(S.focus.hold ? 1 : 0.05, dt); }
    // film grain, then letterbox bars
    if (!lo) {
      if (!FX.pat || FX.patCtx !== ctx) { FX.pat = ctx.createPattern(grainTile(), 'repeat'); FX.patCtx = ctx; }
      ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.07; ctx.translate(Math.random() * 128 | 0, Math.random() * 128 | 0);
      ctx.fillStyle = FX.pat; ctx.fillRect(-128, -128, w + 128, h + 128);
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    const bars = h * 0.075 * E.outC(seg(t, 0, 0.45));
    if (bars > 0.5) { ctx.fillStyle = '#010503'; ctx.fillRect(0, 0, w, bars); ctx.fillRect(0, h - bars, w, bars); }
    ctx.restore();
  }
  // One frame: camera shake (a smooth wobble with a little roll, plus any kick), the scene, then post effects.
  function renderFrame(cv, ctx, scene, S, t, dt, W, H, k, dpr) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.clearRect(0, 0, W, H);
    S.clock = (S.clock || 0) + dt;
    const sh = S.shake || 0, c = S.clock;
    let kx = 0, ky = 0;
    if (S.kick) { S.kick.x *= Math.pow(0.003, dt); S.kick.y *= Math.pow(0.003, dt); kx = S.kick.x * Math.cos(c * 40); ky = S.kick.y * Math.cos(c * 40); }
    if (sh > 0.2 || Math.abs(kx) + Math.abs(ky) > 0.3) {
      const nx = Math.sin(c * 47.1) * 0.6 + Math.sin(c * 83.7 + 1.3) * 0.4, ny = Math.sin(c * 53.3 + 2.1) * 0.6 + Math.sin(c * 91.9 + 0.4) * 0.4, nr = Math.sin(c * 37.7 + 0.7);
      ctx.translate(W / 2 + nx * sh * 0.6 + kx, H / 2 + ny * sh * 0.6 + ky); ctx.rotate(nr * sh * 0.0011); ctx.scale(1 + sh * 0.0012, 1 + sh * 0.0012); ctx.translate(-W / 2, -H / 2);
      S.shake = sh * Math.pow(0.012, dt);
    }
    scene.draw(ctx, t, dt, S, W, H, k);
    post(cv, ctx, S, t, dt, W, H, dpr);
  }

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
    const lite = document.documentElement.classList.contains('tank-lite');
    const size = () => { dpr = lite ? 1 : Math.min(window.devicePixelRatio || 1, 1.5); W = window.innerWidth; H = window.innerHeight; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); };
    size();
    const k = clamp(level / 40, 0, 1);
    const S = { parts: [], shake: 0, lowfx: lite };
    let slowN = 0, frames = 0;
    scene.setup(S, W, H, k, coach || {});
    const t0 = performance.now();
    let last = t0, raf = 0, done = false, shown = false;
    function frame(now) {
      const t = (now - t0) / 1000, dt = Math.min(0.05, (now - last) / 1000); last = now;
      // if this machine can't keep up, keep the scene but drop the heavy effects
      if (frames++ > 3 && !S.lowfx) { if (dt > 0.036) slowN++; if (slowN > 8) S.lowfx = true; }
      try { renderFrame(canvas, ctx, scene, S, t, dt, W, H, k, dpr); } catch (e) { console.warn('cutscene', key, e); end(); return; }
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
    const k = clamp(level / 40, 0, 1), S = { parts: [], shake: 0, lowfx: !!opt.lowfx }; scene.setup(S, W, H, k, coach || {});
    const out = [], dt = 1 / fps, n = Math.ceil(scene.dur * fps);
    for (let i = 0; i <= n; i++) {
      const t = i * dt;
      renderFrame(cv, ctx, scene, S, t, dt, W, H, k, 1);
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
  RT.cutsceneKit = { hit, post, renderFrame, megSide, stamp, stage, frontShark, makeCrack, sandFloor, topRay, SCENES, BY_COACH, sideShark, sideFish, sideToWorld, topShark, topFish, Trail, openWater, crown, spawn, stepParts, vignette, warp, shade, rgba, E, seg, lerp, clamp, rnd, TAU };
})();
