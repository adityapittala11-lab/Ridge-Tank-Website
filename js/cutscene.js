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
      const h = pts[Math.round(0.035 / uEnd * N)], hw = L * 0.17, hd = L * 0.035;
      ctx.fillStyle = o.color;
      ctx.beginPath(); ctx.moveTo(h.x + h.nx * hw + h.tx * hd, h.y + h.ny * hw + h.ty * hd); ctx.quadraticCurveTo(h.x + h.tx * hd * 1.8, h.y + h.ty * hd * 1.8, h.x - h.nx * hw + h.tx * hd, h.y - h.ny * hw + h.ty * hd);
      ctx.lineTo(h.x - h.nx * hw * 0.92 - h.tx * hd, h.y - h.ny * hw * 0.92 - h.ty * hd); ctx.quadraticCurveTo(h.x - h.tx * hd * 0.2, h.y - h.ty * hd * 0.2, h.x + h.nx * hw * 0.92 - h.tx * hd, h.y + h.ny * hw * 0.92 - h.ty * hd); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#05090a'; for (const sd of [1, -1]) { ctx.beginPath(); ctx.arc(h.x + h.nx * hw * 0.93 * sd + h.tx * hd * 0.2, h.y + h.ny * hw * 0.93 * sd + h.ty * hd * 0.2, Math.max(1.2, L * 0.008), 0, TAU); ctx.fill(); }
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

  // ---------- which scene for which coach ----------
  const BY_COACH = { 'Great White': 'greatwhite', Tiger: 'tiger', Mako: 'mako' };
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
  RT.cutsceneKit = { SCENES, BY_COACH, sideShark, sideFish, sideToWorld, topShark, topFish, Trail, openWater, crown, spawn, stepParts, vignette, warp, shade, rgba, E, seg, lerp, clamp, rnd, TAU };
})();
