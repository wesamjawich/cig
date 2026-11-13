// Full-viewport exhale. A small GPU fluid solver (stable fluids: advection, vorticity confinement,
// Jacobi pressure, plus buoyancy) adapted from PavelDoGreat/WebGL-Fluid-Simulation (MIT, © 2017
// Pavel Dobryakov). Smoke is injected at the bottom of the screen in proportion to the hit and
// rises, curls and thins out. Lives in its own pointer-events: none canvas so it can cover the
// whole page, X included, and only runs while there is smoke. Falls back to 2D sprites when the
// GPU can't render to half-float textures.
const rnd = (a, b) => a + Math.random() * (b - a);

const CFG = { sim: 128, dye: 512, densDiss: 0.5, velDiss: 0.4, pressure: 0.8, iters: 20, curl: 11, buoy: 7, linger: 7 };

const VERT = `precision highp float;
attribute vec2 aPosition;
varying vec2 vUv, vL, vR, vT, vB;
uniform vec2 texelSize;
void main () {
  vUv = aPosition * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0); vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y); vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;
const HEAD = 'precision highp float; precision highp sampler2D; varying highp vec2 vUv, vL, vR, vT, vB;\n';
const FRAG = {
  clear: `${HEAD}uniform sampler2D uTexture; uniform float value;
    void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`,
  splat: `${HEAD}uniform sampler2D uTarget; uniform float aspectRatio, radius; uniform vec3 color; uniform vec2 point;
    void main () {
      vec2 p = vUv - point; p.x *= aspectRatio;
      gl_FragColor = vec4(texture2D(uTarget, vUv).xyz + exp(-dot(p, p) / radius) * color, 1.0);
    }`,
  advect: `${HEAD}uniform sampler2D uVelocity, uSource; uniform vec2 texelSize, dyeTexelSize; uniform float dt, dissipation;
    vec4 bilerp (sampler2D s, vec2 uv, vec2 ts) {
      vec2 st = uv / ts - 0.5, i = floor(st), f = fract(st);
      vec4 a = texture2D(s, (i + vec2(0.5, 0.5)) * ts), b = texture2D(s, (i + vec2(1.5, 0.5)) * ts);
      vec4 c = texture2D(s, (i + vec2(0.5, 1.5)) * ts), d = texture2D(s, (i + vec2(1.5, 1.5)) * ts);
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    void main () {
    #ifdef MANUAL_FILTERING
      vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
      vec4 result = bilerp(uSource, coord, dyeTexelSize);
    #else
      vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
      vec4 result = texture2D(uSource, coord);
    #endif
      gl_FragColor = result / (1.0 + dissipation * dt);
    }`,
  buoyancy: `${HEAD}uniform sampler2D uVelocity, uDye; uniform float dt, amount;
    void main () {
      vec2 v = texture2D(uVelocity, vUv).xy;
      v.y += dt * amount * min(texture2D(uDye, vUv).r, 1.5);
      gl_FragColor = vec4(v, 0.0, 1.0);
    }`,
  divergence: `${HEAD}uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).x, R = texture2D(uVelocity, vR).x, T = texture2D(uVelocity, vT).y, B = texture2D(uVelocity, vB).y;
      vec2 C = texture2D(uVelocity, vUv).xy;
      if (vL.x < 0.0) L = -C.x; if (vR.x > 1.0) R = -C.x; if (vT.y > 1.0) T = -C.y; if (vB.y < 0.0) B = -C.y;
      gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
    }`,
  curl: `${HEAD}uniform sampler2D uVelocity;
    void main () {
      float L = texture2D(uVelocity, vL).y, R = texture2D(uVelocity, vR).y, T = texture2D(uVelocity, vT).x, B = texture2D(uVelocity, vB).x;
      gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
    }`,
  vorticity: `${HEAD}uniform sampler2D uVelocity, uCurl; uniform float curl, dt;
    void main () {
      float L = texture2D(uCurl, vL).x, R = texture2D(uCurl, vR).x, T = texture2D(uCurl, vT).x, B = texture2D(uCurl, vB).x, C = texture2D(uCurl, vUv).x;
      vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
      force = force / (length(force) + 0.0001) * curl * C; force.y *= -1.0;
      vec2 v = clamp(texture2D(uVelocity, vUv).xy + force * dt, -1000.0, 1000.0);
      gl_FragColor = vec4(v, 0.0, 1.0);
    }`,
  pressure: `${HEAD}uniform sampler2D uPressure, uDivergence;
    void main () {
      float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
      gl_FragColor = vec4((L + R + B + T - texture2D(uDivergence, vUv).x) * 0.25, 0.0, 0.0, 1.0);
    }`,
  gradient: `${HEAD}uniform sampler2D uPressure, uVelocity;
    void main () {
      float L = texture2D(uPressure, vL).x, R = texture2D(uPressure, vR).x, T = texture2D(uPressure, vT).x, B = texture2D(uPressure, vB).x;
      gl_FragColor = vec4(texture2D(uVelocity, vUv).xy - vec2(R - L, T - B), 0.0, 1.0);
    }`,
  // density → premultiplied smoke, lit with a fake normal from the density gradient
  display: `${HEAD}uniform sampler2D uTexture; uniform vec2 texelSize; uniform vec3 smoke; uniform float opacity;
    void main () {
      // soften: a wide 9-tap average for density, the gradient taken 3 texels apart for gentle shading
      vec2 o = texelSize * 3.0;
      float L = texture2D(uTexture, vUv - vec2(o.x, 0.0)).r, R = texture2D(uTexture, vUv + vec2(o.x, 0.0)).r;
      float T = texture2D(uTexture, vUv + vec2(0.0, o.y)).r, B = texture2D(uTexture, vUv - vec2(0.0, o.y)).r;
      float X = texture2D(uTexture, vUv + o).r + texture2D(uTexture, vUv - o).r + texture2D(uTexture, vUv + vec2(o.x, -o.y)).r + texture2D(uTexture, vUv + vec2(-o.x, o.y)).r;
      float d = (texture2D(uTexture, vUv).r * 4.0 + (L + R + T + B) * 2.0 + X) / 16.0;
      vec3 n = normalize(vec3(R - L, T - B, 1.2));
      float shade = clamp(0.86 + 0.22 * dot(n, normalize(vec3(-0.4, 0.7, 0.6))), 0.7, 1.05);
      float a = (1.0 - exp(-d * 1.15)) * opacity;
      gl_FragColor = vec4(smoke * shade * a, a);
    }`,
};

function fluidCloud(c) {
  const params = { alpha: true, depth: false, stencil: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer: false };
  let gl = c.getContext('webgl2', params), isGL2 = !!gl;
  if (!gl) gl = c.getContext('webgl', params) || c.getContext('experimental-webgl', params);
  if (!gl) return null;
  let type, ifmt, linear;
  if (isGL2) {
    if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) return null;
    type = gl.HALF_FLOAT; ifmt = gl.RGBA16F; linear = true;                  // half-float textures are filterable in WebGL2
  } else {
    const hf = gl.getExtension('OES_texture_half_float');
    if (!hf) return null;
    type = hf.HALF_FLOAT_OES; ifmt = gl.RGBA; linear = !!gl.getExtension('OES_texture_half_float_linear');
  }
  const filter = linear ? gl.LINEAR : gl.NEAREST;

  function compile(kind, src) {
    const s = gl.createShader(kind); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  const vs = compile(gl.VERTEX_SHADER, VERT);
  const P = {};
  for (const [k, src] of Object.entries(FRAG)) {
    const prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, (linear ? '' : '#define MANUAL_FILTERING\n') + src));
    gl.bindAttribLocation(prog, 0, 'aPosition'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    const u = {}, n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(prog, i).name; u[name] = gl.getUniformLocation(prog, name); }
    P[k] = { prog, u };
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.enableVertexAttribArray(0);

  function fbo(w, h) {
    gl.activeTexture(gl.TEXTURE0);
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, ifmt, w, h, 0, gl.RGBA, type, null);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h, tx: 1 / w, ty: 1 / h, attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
  }
  const double = (w, h) => ({ read: fbo(w, h), write: fbo(w, h), swap() { [this.read, this.write] = [this.write, this.read]; } });
  const res = (r) => { const a = c.width / c.height, lo = Math.round(r), hi = Math.round(r * Math.max(a, 1 / a)); return a > 1 ? [hi, lo] : [lo, hi]; };

  let dye, vel, div, curlF, pres;
  function init() {
    const [sw, sh] = res(CFG.sim), [dw, dh] = res(CFG.dye);
    dye = double(dw, dh); vel = double(sw, sh); div = fbo(sw, sh); curlF = fbo(sw, sh); pres = double(sw, sh);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('fbo');
  }
  init();

  function blit(target) {
    if (target) { gl.viewport(0, 0, target.w, target.h); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fb); }
    else { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  }
  function use(k, t) { const p = P[k]; gl.useProgram(p.prog); if (t && p.u.texelSize) gl.uniform2f(p.u.texelSize, t.tx, t.ty); return p.u; }

  function splat(x, y, dx, dy, d, radius) {
    const aspect = c.width / c.height, r = (radius / 100) * (aspect > 1 ? aspect : 1);
    let u = use('splat', vel.read);
    gl.uniform1i(u.uTarget, vel.read.attach(0)); gl.uniform1f(u.aspectRatio, aspect);
    gl.uniform2f(u.point, x, y); gl.uniform3f(u.color, dx, dy, 0); gl.uniform1f(u.radius, r);
    blit(vel.write); vel.swap();
    gl.uniform1i(u.uTarget, dye.read.attach(0)); gl.uniform3f(u.color, d, d, d);
    blit(dye.write); dye.swap();
  }

  function step(dt) {
    let u = use('buoyancy', vel.read);
    gl.uniform1i(u.uVelocity, vel.read.attach(0)); gl.uniform1i(u.uDye, dye.read.attach(1));
    gl.uniform1f(u.dt, dt); gl.uniform1f(u.amount, CFG.buoy * 60);
    blit(vel.write); vel.swap();
    u = use('curl', vel.read); gl.uniform1i(u.uVelocity, vel.read.attach(0)); blit(curlF);
    u = use('vorticity', vel.read);
    gl.uniform1i(u.uVelocity, vel.read.attach(0)); gl.uniform1i(u.uCurl, curlF.attach(1));
    gl.uniform1f(u.curl, CFG.curl); gl.uniform1f(u.dt, dt);
    blit(vel.write); vel.swap();
    u = use('divergence', vel.read); gl.uniform1i(u.uVelocity, vel.read.attach(0)); blit(div);
    u = use('clear', pres.read); gl.uniform1i(u.uTexture, pres.read.attach(0)); gl.uniform1f(u.value, CFG.pressure);
    blit(pres.write); pres.swap();
    u = use('pressure', vel.read); gl.uniform1i(u.uDivergence, div.attach(0));
    for (let i = 0; i < CFG.iters; i++) { gl.uniform1i(u.uPressure, pres.read.attach(1)); blit(pres.write); pres.swap(); }
    u = use('gradient', vel.read);
    gl.uniform1i(u.uPressure, pres.read.attach(0)); gl.uniform1i(u.uVelocity, vel.read.attach(1));
    blit(vel.write); vel.swap();
    u = use('advect', vel.read);
    if (u.dyeTexelSize) gl.uniform2f(u.dyeTexelSize, vel.read.tx, vel.read.ty);
    gl.uniform1i(u.uVelocity, vel.read.attach(0)); gl.uniform1i(u.uSource, vel.read.attach(0));
    gl.uniform1f(u.dt, dt); gl.uniform1f(u.dissipation, CFG.velDiss);
    blit(vel.write); vel.swap();
    if (u.dyeTexelSize) gl.uniform2f(u.dyeTexelSize, dye.read.tx, dye.read.ty);
    gl.uniform1i(u.uVelocity, vel.read.attach(0)); gl.uniform1i(u.uSource, dye.read.attach(1));
    gl.uniform1f(u.dissipation, CFG.densDiss * (heavy > 0 ? 0.45 : 1));
    blit(dye.write); dye.swap();
  }

  let light = false, emitters = [], raf = 0, last = 0, quietFor = 0, heavy = 0;
  function render() {
    gl.clearColor(0, 0, 0, 0); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    const u = use('display', dye.read);
    gl.uniform1i(u.uTexture, dye.read.attach(0));
    if (light) { gl.uniform3f(u.smoke, 0.5, 0.51, 0.54); gl.uniform1f(u.opacity, 0.7); }
    else { gl.uniform3f(u.smoke, 0.93, 0.93, 0.95); gl.uniform1f(u.opacity, 0.78); }
    blit(null);
    gl.disable(gl.BLEND);
  }

  // an exhale: a stream of splats from just below the bottom edge, fanning out and up
  function emit(e, dt) {
    e.acc += e.rate * dt;
    while (e.acc >= 1 && e.left > 0) {
      e.acc -= 1; e.left--;
      const k = 1 - e.left / e.total, a = rnd(-e.spread, e.spread) * (0.4 + k);
      const sp = rnd(0.75, 1.15) * e.power;
      splat(e.x + rnd(-0.05, 0.05), -0.02, Math.sin(a) * sp * 0.8, Math.cos(a) * sp, rnd(0.5, 0.9) * e.dens, rnd(0.6, 1.1) * e.radius);
    }
  }

  function frame(now) {
    const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
    for (const e of emitters) emit(e, dt);
    emitters = emitters.filter((e) => e.left > 0);
    gl.disable(gl.BLEND);
    step(dt);
    render();
    quietFor = emitters.length ? 0 : quietFor + dt;
    heavy = Math.max(0, heavy - dt);
    if (quietFor < CFG.linger + (heavy > 0 ? 4 : 0)) raf = requestAnimationFrame(frame);
    else { raf = 0; init(); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.25), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
    if (c.width === w && c.height === h) return;
    c.width = w; c.height = h; init();
  }
  addEventListener('resize', resize); resize();

  return {
    kind: 'fluid',
    get active() { return !!raf; },
    setLight(v) { light = !!v; },
    // a blinker is about five times the smoke: five streams across the bottom, denser, wider, longer
    burst(amount, { x, blinker = false } = {}) {
      const a = Math.max(0.15, Math.min(amount, 4.5)), k = Math.min(a, 3);
      const xs = blinker ? [0.14, 0.32, 0.5, 0.68, 0.86] : [x != null ? x / innerWidth : 0.5];
      const boost = blinker ? 1.35 : 1, n = Math.round((10 + 22 * a) * boost), dur = (0.4 + 0.45 * k) * (blinker ? 2 : 1);
      for (const ex of xs) emitters.push({
        x: ex, total: n, left: n, rate: n / dur, acc: 1, spread: 0.25 + 0.12 * k,
        power: (900 + 420 * k) * boost, dens: (0.55 + 0.25 * k) * (blinker ? 1.1 : 1), radius: (0.35 + 0.22 * k) * (blinker ? 1.2 : 1),
      });
      if (blinker) heavy = 6;
      quietFor = 0;
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    clear() { emitters = []; init(); },
  };
}

export function createCloud(parent, { z = 2147483645, before = null, fluid = true } = {}) {
  const c = document.createElement('canvas');
  c.setAttribute('aria-hidden', 'true');
  Object.assign(c.style, { position: 'fixed', left: '0', top: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: String(z) });
  parent.insertBefore(c, before);
  let api = null;
  if (fluid) { try { api = fluidCloud(c); } catch (err) { console.warn('[cig] fluid smoke unavailable, using sprites', err); api = null; } }
  if (!api) {
    // a canvas that tried WebGL can't hand out a 2D context, so start over
    const c2 = c.cloneNode(); c.replaceWith(c2);
    api = { kind: 'sprites', ...spriteCloud(c2) };
    api.el = c2;
    return api;
  }
  api.el = c;
  return api;
}

/* ---------------------------------------------------- 2D sprite fallback */

function sprites(color) {
  return Array.from({ length: 4 }, () => {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    for (let i = 0; i < 10; i++) {
      const x = 128 + rnd(-50, 50), y = 128 + rnd(-50, 50), r = rnd(45, 85);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(${color},.3)`); gr.addColorStop(0.6, `rgba(${color},.1)`); gr.addColorStop(1, `rgba(${color},0)`);
      g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    }
    return c;
  });
}

function spriteCloud(c) {
  const g = c.getContext('2d');
  const SPR = { dark: sprites('236,236,240'), light: sprites('120,122,130') };
  let parts = [], emitters = [], raf = 0, last = 0, light = false, dpr = 1;

  function resize() { dpr = Math.min(devicePixelRatio || 1, 1.5); c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr); }
  addEventListener('resize', resize); resize();

  function spawn(e) {
    const vh = innerHeight / 900, a = rnd(-e.spread, e.spread), sp = rnd(420, 980) * e.power * vh;
    parts.push({
      x: e.x + rnd(-70, 70), y: e.y, vx: Math.sin(a) * sp, vy: -Math.cos(a) * sp, age: 0, life: rnd(2.4, 4.4) + e.amount * 0.7,
      s0: rnd(70, 120) * vh, s1: rnd(360, 640) * vh * (0.8 + 0.25 * e.amount), rot: rnd(0, 6.3), vr: rnd(-0.5, 0.5),
      a: rnd(0.1, 0.2), img: Math.floor(Math.random() * 4), seed: Math.random() * 10,
    });
  }

  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    for (const e of emitters) { e.acc += e.rate * dt; while (e.acc >= 1 && e.left > 0) { e.acc -= 1; e.left--; spawn(e); } }
    emitters = emitters.filter((e) => e.left > 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, innerWidth, innerHeight);
    const set = light ? SPR.light : SPR.dark;
    parts = parts.filter((p) => (p.age += dt) < p.life);
    for (const p of parts) {
      const k = Math.exp(-dt * 1.7);
      p.vx = p.vx * k + Math.sin(p.age * 1.3 + p.seed) * 40 * dt; p.vy = p.vy * k - 34 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      const q = p.age / p.life, s = p.s0 + (p.s1 - p.s0) * (1 - Math.exp(-p.age * 1.4));
      g.globalAlpha = p.a * Math.min(1, p.age / 0.15) * (1 - q) * (1 - q);
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.drawImage(set[p.img], -s / 2, -s / 2, s, s); g.restore();
    }
    g.globalAlpha = 1;
    raf = parts.length || emitters.length ? requestAnimationFrame(frame) : 0;
    if (!raf) g.clearRect(0, 0, innerWidth, innerHeight);
  }

  return {
    el: c,
    get active() { return !!raf; },
    setLight(v) { light = !!v; },
    // amount ~ 0.2 (quick hit) … 3+ (a blinker after a long scroll)
    burst(amount, { x, y, blinker = false } = {}) {
      const a = Math.max(0.15, Math.min(amount, 4.5)), n = Math.round((14 + 36 * a) * (blinker ? 1.3 : 1)), dur = (0.45 + 0.4 * a) * (blinker ? 1.8 : 1);
      const xs = blinker ? [0.14, 0.32, 0.5, 0.68, 0.86].map((f) => f * innerWidth) : [x ?? innerWidth / 2];
      for (const ex of xs) emitters.push({ x: ex, y: y ?? innerHeight + 60, left: n, rate: n / dur, acc: 1,
        spread: 0.35 + 0.16 * Math.min(a, 3), power: 0.7 + 0.22 * Math.min(a, 3), amount: a });
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    },
    clear() { parts = []; emitters = []; },
  };
}
