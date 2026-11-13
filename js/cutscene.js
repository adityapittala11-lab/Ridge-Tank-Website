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
    const k = o.len / 200, dx = (lx - PIV.x) * k, dy = (ly - PIV.y) * k * (o.flipY ? -1 : 1);
    return { x: o.x + dx * Math.cos(o.ang) - dy * Math.sin(o.ang), y: o.y + dx * Math.sin(o.ang) + dy * Math.cos(o.ang) };
  }
  // o: { x, y, ang, len, color, belly, jaw 0..1, beat (tail phase), squeeze, alpha, blur, flipY, stripes, teeth }
  function sideShark(ctx, o) {
    const P = sidePaths(), k = o.len / 200;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = o.alpha;
    ctx.translate(o.x, o.y); ctx.rotate(o.ang); ctx.scale(k, o.flipY ? -k : k); ctx.translate(-PIV.x, -PIV.y);
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

  // ---------- which scene for which coach ----------
  const BY_COACH = { 'Great White': 'greatwhite' };
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
  RT.cutsceneKit = { SCENES, BY_COACH, sideShark, sideFish, sideToWorld, spawn, stepParts, vignette, warp, shade, rgba, E, seg, lerp, clamp, rnd, TAU };
})();
