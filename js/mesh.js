// Animated mesh-gradient background (drifting color points + noise warp + cursor swirl).
// Modeled on the "Blue-Gold Mesh" shader style, recolored to Ridge Tank green and burgundy.
(function () {
  const canvas = document.getElementById('bg');
  if (!canvas) return;

  const gl = canvas.getContext('webgl', {
    antialias: false, alpha: false, depth: false, stencil: false,
    premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power'
  });
  if (!gl) { document.documentElement.classList.add('no-webgl'); return; }

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // How crisp the color edges are. "soft" is the original smooth blend; "sharp" gives defined,
  // marbled edges. Preview any of them with ?swirl=soft|medium|sharp in the address bar.
  const LEVELS = {
    soft: { power: 2.6, detail: 0.05, res: 0.5 },
    medium: { power: 4.4, detail: 0.07, res: 0.8 },
    sharp: { power: 7.5, detail: 0.09, res: 1.0 },
    crisp: { power: 16, detail: 0.1, res: 1.0 }
  };
  const meshCfg = (window.RT_CONFIG && window.RT_CONFIG.mesh) || {};
  const level = LEVELS[new URLSearchParams(location.search).get('swirl')] || LEVELS[meshCfg.swirl] || LEVELS.medium;

  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  // Mostly black: two deep greens, two deep burgundies, three blacks that keep the colors apart.
  const PALETTE = ['#0B4A2F', '#052818', '#561029', '#2A0610', '#010302', '#020403', '#030104'].map(hex);
  const N = PALETTE.length;

  // Each point drifts on its own slow Lissajous path: [cx, cy, ax, ay, sx, sy, px, py]
  const PATHS = [
    [0.20, 0.74, 0.18, 0.15, 0.050, 0.041, 0.0, 1.3],
    [0.74, 0.90, 0.22, 0.10, 0.037, 0.058, 2.1, 0.4],
    [0.86, 0.30, 0.14, 0.20, 0.046, 0.033, 4.0, 2.6],
    [0.14, 0.12, 0.18, 0.12, 0.031, 0.052, 1.2, 5.1],
    [0.50, 0.48, 0.28, 0.24, 0.027, 0.035, 3.3, 0.9],
    [0.48, 0.04, 0.32, 0.10, 0.040, 0.029, 5.5, 3.7],
    [0.96, 0.62, 0.12, 0.26, 0.033, 0.044, 0.7, 4.4]
  ];

  const VERT = `
    attribute vec2 aPos;
    void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
  `;

  const FRAG = `
    precision highp float;
    uniform vec2 uRes;
    uniform float uTime;
    uniform vec2 uMouse;
    uniform float uSwirl;
    uniform float uDim;
    uniform float uPow;
    uniform float uDetail;
    uniform vec2 uP[${N}];
    uniform vec3 uC[${N}];

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }
    float snoise(vec2 v) {
      const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
      vec2 i = floor(v + dot(v, C.yy));
      vec2 x0 = v - i + dot(i, C.xx);
      vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
      vec4 x12 = x0.xyxy + C.xxzz;
      x12.xy -= i1;
      i = mod289(i);
      vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
      vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
      m = m * m; m = m * m;
      vec3 x = 2.0 * fract(p * C.www) - 1.0;
      vec3 h = abs(x) - 0.5;
      vec3 ox = floor(x + 0.5);
      vec3 a0 = x - ox;
      m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
      vec3 g;
      g.x = a0.x * x0.x + h.x * x0.y;
      g.yz = a0.yz * x12.xz + h.yz * x12.yw;
      return 130.0 * dot(m, g);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uRes;
      float aspect = uRes.x / uRes.y;
      vec2 p = vec2(uv.x * aspect, uv.y);

      // Cursor swirl: rotate the field around the pointer, strongest at the center.
      vec2 m = vec2(uMouse.x * aspect, uMouse.y);
      vec2 d = p - m;
      float ang = uSwirl * exp(-dot(d, d) / 0.075);
      float s = sin(ang), c = cos(ang);
      p = m + mat2(c, s, -s, c) * d;

      // Slow organic warp so the blobs breathe instead of sliding.
      float t = uTime;
      vec2 w = vec2(snoise(p * 1.15 + vec2(0.0, t * 0.055)),
                    snoise(p * 1.15 + vec2(5.2, -t * 0.047)));
      p += w * 0.2;
      p += uDetail * vec2(snoise(p * 3.1 - t * 0.03), snoise(p * 3.1 + 9.1 + t * 0.03));

      // Inverse-distance blend. Weights are taken relative to the nearest point so a high
      // exponent (crisper edges) can't overflow on phones.
      float ds[${N}];
      float dmin = 1e6;
      for (int i = 0; i < ${N}; i++) {
        vec2 q = vec2(uP[i].x * aspect, uP[i].y);
        ds[i] = distance(p, q) + 0.035;
        dmin = min(dmin, ds[i]);
      }
      vec3 col = vec3(0.0);
      float ws = 0.0;
      for (int i = 0; i < ${N}; i++) {
        float wt = pow(dmin / ds[i], uPow);
        col += uC[i] * wt;
        ws += wt;
      }
      col /= ws;

      // Keep the color rich but dark, and sink the edges into black.
      float luma = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(luma), col, 1.15);
      float vig = smoothstep(1.3, 0.2, length((uv - 0.5) * vec2(aspect * 0.85, 1.0)));
      col *= mix(0.35, 1.0, vig);
      col *= uDim;

      // Dither to hide banding.
      float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) / 180.0;

      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `;

  function compile(type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.warn('[mesh] shader error', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  }

  const vs = compile(gl.VERTEX_SHADER, VERT);
  const fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) { document.documentElement.classList.add('no-webgl'); return; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn('[mesh] link error', gl.getProgramInfoLog(prog));
    document.documentElement.classList.add('no-webgl');
    return;
  }
  gl.useProgram(prog);

  // One oversized triangle covers the whole screen.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = name => gl.getUniformLocation(prog, name);
  const uRes = U('uRes'), uTime = U('uTime'), uMouse = U('uMouse'), uSwirl = U('uSwirl'), uDim = U('uDim');
  const uP = U('uP'), uC = U('uC');
  gl.uniform3fv(uC, new Float32Array(PALETTE.flat()));
  gl.uniform1f(U('uPow'), level.power);
  gl.uniform1f(U('uDetail'), level.detail);

  let width = 0, height = 0;
  function resize() {
    // Crisper edges need more pixels; soft blends look the same at a fraction of the cost.
    const small = window.innerWidth < 720;
    const scale = Math.min(window.devicePixelRatio || 1, 1.5) * level.res * (small ? 0.8 : 1);
    width = Math.max(2, Math.round(window.innerWidth * scale));
    height = Math.max(2, Math.round(window.innerHeight * scale));
    canvas.width = width;
    canvas.height = height;
    gl.viewport(0, 0, width, height);
    gl.uniform2f(uRes, width, height);
  }
  resize();
  window.addEventListener('resize', resize);

  // Pointer: eased position, swirl grows with speed and relaxes back.
  const mouse = { x: 0.62, y: 0.48, tx: 0.62, ty: 0.48 };
  let swirl = 0, swirlTarget = 0, lastMove = 0;
  let lastX = null, lastY = null;
  function onMove(clientX, clientY) {
    const x = clientX / window.innerWidth;
    const y = 1 - clientY / window.innerHeight;
    if (lastX !== null) {
      const speed = Math.hypot(x - lastX, y - lastY);
      swirlTarget = Math.min(2.4, swirlTarget + speed * 9);
    }
    lastX = x; lastY = y;
    mouse.tx = x; mouse.ty = y;
    lastMove = performance.now();
  }
  if (!reduceMotion) {
    window.addEventListener('pointermove', e => onMove(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', e => {
      const t0 = e.touches[0];
      if (t0) onMove(t0.clientX, t0.clientY);
    }, { passive: true });
  }

  let dim = 1, dimTarget = 1;
  const start = performance.now();
  let raf = 0;
  const pts = new Float32Array(N * 2);

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const t = (now - start) / 1000 * (reduceMotion ? 0.25 : 1);

    for (let i = 0; i < PATHS.length; i++) {
      const [cx, cy, ax, ay, sx, sy, px, py] = PATHS[i];
      pts[i * 2] = cx + ax * Math.sin(t * sx * 6.2831 + px);
      pts[i * 2 + 1] = cy + ay * Math.cos(t * sy * 6.2831 + py);
    }

    mouse.x += (mouse.tx - mouse.x) * 0.06;
    mouse.y += (mouse.ty - mouse.y) * 0.06;
    if (now - lastMove > 120) swirlTarget *= 0.965;
    swirl += (swirlTarget - swirl) * 0.05;
    dim += (dimTarget - dim) * 0.04;

    gl.uniform1f(uTime, t);
    gl.uniform2f(uMouse, mouse.x, mouse.y);
    gl.uniform1f(uSwirl, swirl);
    gl.uniform1f(uDim, dim);
    gl.uniform2fv(uP, pts);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function run() { if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { cancelAnimationFrame(raf); raf = 0; }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : run()));
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); stop(); });
  // Light mode hides the canvas, so stop drawing it.
  window.addEventListener('rt:theme', e => (e.detail === 'light' ? stop() : run()));
  if (document.documentElement.getAttribute('data-theme') !== 'light') run();
  requestAnimationFrame(() => canvas.classList.add('ready'));

  window.RTMesh = {
    // 1 = full strength (landing), lower = calmer behind app screens.
    setDim(v) { dimTarget = v; },
    // Little burst of swirl, e.g. after a successful check-in.
    pulse(x = 0.5, y = 0.5, amount = 2.2) {
      if (reduceMotion) return;
      mouse.tx = x; mouse.ty = 1 - y;
      swirlTarget = Math.min(3, swirlTarget + amount);
      lastMove = performance.now();
    }
  };
})();
