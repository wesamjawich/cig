import * as THREE from '../vendor/three/build/three.module.js';
import { pace } from './pace.js';
import { NOISE } from './noise.js';
import { brand as getBrand } from './brands.js';

// All lengths in centimetres. The cigarette lies along local +X: x = 0 is the mouth end.
export const L = 8.4;        // total length
export const R = 0.39;       // radius
export const TIP = 3.0;      // tipping (cork) paper length
export const END = TIP + 0.3; // burn stops here
const PIVOT = 1.7;           // where the fingers would hold it; taps rotate about this
const KEEP = 0.5;            // length of glowing coal left after ashing
const SPIN = 0.2;            // idle yaw speed, rad/s
const REST_TILT = 0.2;

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const damp = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

/* ---------------------------------------------------------------- geometry */
// A tube of rings whose real positions are computed in the vertex shader from
// (kind, s, theta): kind -1 = mouth-end cap, 0 = side, +1 = burning-end cap.
function buildGeometry(nBody = 420, nCap = 14, nRad = 72) {
  const rings = [];
  for (let i = nCap; i >= 1; i--) rings.push([-1, i / nCap]);
  for (let i = 0; i <= nBody; i++) rings.push([0, i / nBody]);
  for (let i = 1; i <= nCap; i++) rings.push([1, i / nCap]);
  const param = new Float32Array(rings.length * nRad * 3);
  let p = 0;
  for (const [kind, s] of rings) {
    for (let k = 0; k < nRad; k++) { param[p++] = kind; param[p++] = s; param[p++] = (k / nRad) * Math.PI * 2; }
  }
  const idx = [];
  for (let j = 0; j < rings.length - 1; j++) {
    for (let k = 0; k < nRad; k++) {
      const a = j * nRad + k, b = j * nRad + ((k + 1) % nRad);
      const c = a + nRad, d = b + nRad;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('aParam', new THREE.BufferAttribute(param, 3));
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rings.length * nRad * 3), 3));
  g.setIndex(idx);
  return g;
}

/* ------------------------------------------------------------------ shader */
const VERT_PARS = /* glsl */ `
attribute vec3 aParam;
uniform float uMin, uMax, uCapMin, uCapMax, uBurn, uRagMin, uRagMax;
varying vec3 vP;
varying float vKind;
vec3 cigCanon;
const float CR = ${R.toFixed(4)};
${NOISE}
void cigSurface(out vec3 pos, out vec3 nrm){
  float kind = aParam.x, s = aParam.y, th = aParam.z;
  float len = max(uMax - uMin, 1e-3);
  float cMin = min(uCapMin, len * 0.5), cMax = min(uCapMax, len * 0.5);
  float ph = s * 1.5707963;
  float x; float r = CR; vec2 n = vec2(0.0, 1.0); float rag = 0.0;
  if (kind < -0.5) {
    x = uMin + cMin - cMin * sin(ph); r = CR * cos(ph);
    n = normalize(vec2(-CR * sin(ph), cMin * cos(ph)));
    rag = uRagMin;
  } else if (kind > 0.5) {
    x = uMax - cMax + cMax * sin(ph); r = CR * cos(ph);
    n = normalize(vec2(CR * sin(ph), cMax * cos(ph)));
    rag = uRagMax;
  } else {
    x = mix(uMin + cMin, uMax - cMax, s);
  }
  vec2 cs = vec2(cos(th), sin(th));
  vec3 P = vec3(x, r * cs);
  // burnt material shrinks and goes lumpy
  float b = smoothstep(-0.02, 0.2, x - uBurn);
  float hl = fbm(vec3(P.x * 4.0, P.yz * 6.0) + 3.0);
  float rs = 1.0 - 0.07 * b + (hl - 0.5) * 0.24 * b;
  // jagged break faces on ash chunks
  float jag = (vnoise(vec3(P.x * 2.0, P.yz * 9.0) + 13.0) - 0.5) * min(1.0, s * 3.0) * rag;
  pos = vec3(x + jag, P.yz * rs);
  nrm = vec3(n.x, n.y * cs);
  cigCanon = P;
  vKind = kind;
}
`;

const FRAG_PARS = /* glsl */ `
uniform float uBurn, uHeat, uTime, uStain, uDissolve, uDead;
uniform vec3 uPaper, uTipA, uTipB, uBandCol, uFilterCol, uPrintCol, uTobacco, uMint;
uniform float uCork, uBandMetal, uBand1, uBand2, uCharcoal, uStars, uPop, uPopGlow;
varying vec3 vP;
varying float vKind;
const float CR = ${R.toFixed(4)};
const float TIPL = ${TIP.toFixed(4)};
${NOISE}
struct CigSurf { vec3 albedo; float rough; float metal; float h; vec3 emis; };

float sdStar5(vec2 p, float r, float rf){
  const vec2 k1 = vec2(0.809016994, -0.587785252);
  const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x);
  p -= 2.0 * max(dot(k1, p), 0.0) * k1;
  p -= 2.0 * max(dot(k2, p), 0.0) * k2;
  p.x = abs(p.x);
  p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0.0, 1.0);
  float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, r);
  return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);
}

float band(float x, float a, float b){ return smoothstep(a - 0.004, a + 0.004, x) * (1.0 - smoothstep(b - 0.004, b + 0.004, x)); }

vec3 cigPerturb(vec3 surfPos, vec3 N, vec2 dH){
  vec3 sx = dFdx(surfPos), sy = dFdy(surfPos);
  vec3 r1 = cross(sy, N), r2 = cross(N, sx);
  float det = dot(sx, r1);
  vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * N - grad);
}

CigSurf cigShade(){
  CigSurf s;
  vec3 P = vP;
  float x = P.x;
  float rr = length(P.yz) / CR;

  if (uDissolve > 0.001) {
    float dn = vnoise(P * 24.0 + 3.1) * 0.7 + vnoise(P * 61.0) * 0.3;
    if (dn < uDissolve * 1.2 - 0.1) discard;
  }

  // ---- cigarette paper
  float fibre = fbm(P * vec3(26.0, 60.0, 60.0));
  vec3 alb = uPaper * (0.93 + 0.09 * fibre);
  alb *= 1.0 - 0.035 * smoothstep(0.7, 1.0, sin(x * 52.0));          // faint burn-rate rings
  float seam = 1.0 - smoothstep(0.0, 0.035, abs(atan(P.z, P.y) - 2.4));
  alb *= 1.0 - 0.05 * seam;
  float h = fibre * 0.0012 + seam * 0.002;
  float rough = 0.88, metal = 0.0;

  // ---- printed ring of stars just above the tipping
  if (uStars > 0.5) {
    const float SEG = 6.2831853 / 7.0;
    float a = mod(atan(P.z, P.y) + SEG * 0.5, SEG) - SEG * 0.5;
    float st = sdStar5(vec2(a * CR, x - TIPL - 0.32), 0.085, 0.45);
    float ink = 1.0 - smoothstep(-0.004, 0.004, st);
    alb = mix(alb, uPrintCol, ink * 0.92);
  }

  // ---- tipping paper (cork mottle or plain) + bands
  float tipM = 1.0 - smoothstep(TIPL - 0.006, TIPL + 0.006, x);
  float ck = vnoise(P * vec3(9.0, 46.0, 46.0) + 7.0);
  float ck2 = vnoise(P * vec3(24.0, 110.0, 110.0) + 2.0);
  vec3 cork = mix(uTipA, uTipB, mix(0.5, smoothstep(0.50, 0.72, ck), uCork));
  cork *= 1.0 - 0.22 * uCork * smoothstep(0.68, 0.82, ck2);
  cork = mix(cork, uMint, uPop * 0.35 * (1.0 - smoothstep(0.6, 1.6, abs(x - 1.5))));
  alb = mix(alb, cork, tipM);
  rough = mix(rough, 0.6, tipM);
  h += tipM * 0.006;
  float gold = band(x, TIPL - 0.21, TIPL - 0.15) * uBand1 + band(x, TIPL - 0.09, TIPL - 0.065) * uBand2;
  alb = mix(alb, uBandCol, gold);
  metal = gold * uBandMetal; rough = mix(rough, mix(0.55, 0.3, uBandMetal), gold);

  // ---- end faces
  if (rr < 0.99) {
    float face = 1.0 - smoothstep(0.90, 0.945, rr);
    if (vKind < 0.0) {                                               // filter
      float dots = vnoise(vec3(1.3, P.yz * 90.0));
      vec3 fil = uFilterCol * (0.80 + 0.24 * dots);
      float coalDots = smoothstep(0.55, 0.75, vnoise(vec3(7.7, P.yz * 70.0)));
      fil = mix(fil, vec3(0.08), uCharcoal * coalDots * 0.85 * step(rr, 0.8));
      fil = mix(fil, vec3(0.62, 0.43, 0.20) * (0.8 + 0.3 * dots), uStain * (1.0 - rr * rr * 0.55) * 0.85);
      alb = mix(alb, fil, face); h += face * dots * 0.006;
    } else {                                                         // cut tobacco
      float t1 = fbm(vec3(x * 2.0, P.yz * 14.0) + 11.0);
      float t2 = vnoise(vec3(4.2, P.yz * 38.0));
      vec3 tob = mix(vec3(0.19, 0.095, 0.03), vec3(0.58, 0.38, 0.15), smoothstep(0.3, 0.68, t1)) * uTobacco;
      tob *= 0.3 + 0.7 * smoothstep(0.2, 0.5, t2);
      alb = mix(alb, tob, face); h += face * (t1 * 0.03 + t2 * 0.015);
    }
    rough = mix(rough, 1.0, face); metal *= 1.0 - face;
  }

  // ---- burn front (ragged)
  float rag = (fbm(vec3(x * 3.0, P.yz * 5.0) + 23.0) - 0.5) * 0.17 + (vnoise(P * vec3(20.0, 30.0, 30.0)) - 0.5) * 0.03;
  float d = x - uBurn + rag;

  float scorch = smoothstep(-0.22, -0.03, d);
  alb = mix(alb, alb * vec3(0.52, 0.34, 0.17), scorch * 0.9);
  float charM = smoothstep(-0.055, -0.004, d);
  alb = mix(alb, vec3(0.024, 0.02, 0.018), charM);
  rough = mix(rough, 1.0, charM);

  float burnt = smoothstep(-0.01, 0.03, d);
  const float W = 0.55;
  float coal = burnt * (1.0 - smoothstep(W * 0.55, W, d));

  // ash
  float a1 = fbm(P * vec3(7.0, 16.0, 16.0) + 41.0);
  float a2 = vnoise(P * vec3(48.0, 22.0, 22.0) + 9.0);
  vec3 ash = mix(vec3(0.27, 0.265, 0.26), vec3(0.74, 0.73, 0.71), smoothstep(0.25, 0.72, a1 * 0.72 + a2 * 0.36));
  float cr = 1.0 - smoothstep(0.0, 0.055, abs(fbm(P * vec3(5.0, 11.0, 11.0) + 77.0) - 0.5));
  ash = mix(ash, vec3(0.07), cr * 0.75);
  float hl = fbm(vec3(P.x * 4.0, P.yz * 6.0) + 3.0);
  float hAsh = (hl - 0.5) * 0.24 * CR + a1 * 0.05 + a2 * 0.012 - cr * 0.025;

  // coal
  float cn = fbm(P * 13.0 + vec3(0.0, uTime * 0.05, uTime * 0.035) + 5.0);
  float flick = 0.84 + 0.16 * vnoise(vec3(uTime * 3.2, P.yz * 4.0));
  float cover = smoothstep(0.38, 0.62, cn + d / W * 0.38 - uHeat * 0.32 - 0.05);   // 1 = coated in ash
  float alive = smoothstep(0.0, 0.1, uHeat);
  float hot = 0.45 + 0.75 * smoothstep(0.25, 0.75, fbm(P * 21.0 + vec3(uTime * 0.11, 0.0, uTime * 0.07)));
  float temp = coal * ((1.0 - cover) * (0.2 + 0.62 * uHeat) * mix(hot, 1.0, min(1.0, uHeat * 0.7)) + cover * 0.16 * uHeat) * flick * alive;
  temp = min(temp, 1.15);
  vec3 glow = vec3(1.0, 0.13, 0.01) * temp * 1.6
            + vec3(1.0, 0.45, 0.05) * temp * temp * 1.2
            + vec3(1.0, 0.8, 0.4) * pow(temp, 4.0) * 0.35;

  vec3 coalAlb = mix(vec3(0.03, 0.025, 0.02), ash * 0.85, cover);
  vec3 burntAlb = mix(ash, coalAlb, coal);
  burntAlb = mix(burntAlb, vec3(0.045, 0.04, 0.038), uDead * (0.35 + 0.5 * a1));
  alb = mix(alb, burntAlb, burnt);
  h = mix(h, hAsh, burnt);
  metal *= 1.0 - burnt;

  // heat bleeding through the paper just behind the line
  float through = exp(-max(-d, 0.0) * 15.0) * (1.0 - burnt);
  glow += vec3(1.0, 0.27, 0.04) * through * uHeat * 0.3;

  // menthol capsule crushed: a cold flash through the filter
  glow += uMint * uPopGlow * 0.9 * (1.0 - smoothstep(0.4, 1.4, abs(x - 1.5))) * (1.0 - burnt);

  s.albedo = alb; s.rough = rough; s.metal = metal; s.h = h; s.emis = glow;
  return s;
}
`;

// per-brand uniforms, shared by the cigarette and its ash chunks
export function makeBrandUniforms() {
  const v3 = () => ({ value: new THREE.Vector3() });
  return {
    uPaper: v3(), uTipA: v3(), uTipB: v3(), uBandCol: v3(), uFilterCol: v3(), uPrintCol: v3(), uTobacco: v3(),
    uMint: { value: new THREE.Vector3(0.55, 0.95, 0.82) },
    uCork: { value: 1 }, uBandMetal: { value: 1 }, uBand1: { value: 1 }, uBand2: { value: 1 },
    uCharcoal: { value: 0 }, uStars: { value: 0 }, uPop: { value: 0 }, uPopGlow: { value: 0 },
  };
}

export function applyBrand(bu, b) {
  const k = b.look;
  bu.uPaper.value.fromArray(k.paper); bu.uTipA.value.fromArray(k.tipA); bu.uTipB.value.fromArray(k.tipB);
  bu.uBandCol.value.fromArray(k.band); bu.uFilterCol.value.fromArray(k.filter); bu.uPrintCol.value.fromArray(k.print);
  bu.uTobacco.value.fromArray(k.tobacco);
  if (b.mint) bu.uMint.value.fromArray(b.mint);
  bu.uCork.value = k.cork; bu.uBandMetal.value = k.bandMetal; bu.uBand1.value = k.bands[0]; bu.uBand2.value = k.bands[1];
  bu.uCharcoal.value = k.charcoal; bu.uStars.value = k.stars;
}

function makeMaterial(timeU, brandU) {
  const u = {
    ...brandU,
    uMin: { value: 0 }, uMax: { value: L }, uCapMin: { value: 0.004 }, uCapMax: { value: 0.004 },
    uBurn: { value: L + 0.3 }, uHeat: { value: 0 }, uTime: timeU, uStain: { value: 0 },
    uDissolve: { value: 0 }, uDead: { value: 0 }, uRagMin: { value: 0 }, uRagMax: { value: 0 },
  };
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_PARS)
      .replace('#include <beginnormal_vertex>', 'vec3 cigPos; vec3 objectNormal; cigSurface(cigPos, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = cigPos; vP = cigCanon;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
      .replace('#include <color_fragment>', '#include <color_fragment>\nCigSurf cs = cigShade(); diffuseColor.rgb = cs.albedo;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = cs.rough;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = cs.metal;')
      .replace('#include <normal_fragment_maps>', 'normal = cigPerturb(-vViewPosition, normal, vec2(dFdx(cs.h), dFdy(cs.h)));')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = cs.emis;');
  };
  mat.customProgramCacheKey = () => 'cig-surface';
  return { mat, u };
}

/* --------------------------------------------------------------- cigarette */
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();
const _axis = new THREE.Vector3(), _perp = new THREE.Vector3(), _side = new THREE.Vector3();

export class Cigarette {
  constructor(scene, fx, timeU, opts = {}) {
    this.fx = fx;
    this.sway = !!opts.sway;      // overlay mode: hold a readable pose instead of spinning
    this.geo = buildGeometry();
    this.yawG = new THREE.Group();
    this.tiltG = new THREE.Group();
    this.rollG = new THREE.Group();
    scene.add(this.yawG); this.yawG.add(this.tiltG); this.tiltG.add(this.rollG);
    this.tiltG.position.x = PIVOT - L / 2;

    this.brandU = makeBrandUniforms();
    this.handlers = {};
    this.setBrand(opts.brand || 'classic');
    const { mat, u } = makeMaterial(timeU, this.brandU);
    this.u = u;
    this.mesh = new THREE.Mesh(this.geo, mat);
    this.mesh.frustumCulled = false;
    this.rollG.add(this.mesh);

    // pool of falling ash chunks — same geometry + shader, clipped to a slice
    this.chunks = [];
    for (let i = 0; i < 8; i++) {
      const m = makeMaterial(timeU, this.brandU);
      const holder = new THREE.Group();
      const mesh = new THREE.Mesh(this.geo, m.mat);
      mesh.frustumCulled = false;
      holder.add(mesh); holder.visible = false; scene.add(holder);
      this.chunks.push({ holder, mesh, u: m.u, active: false, vel: new THREE.Vector3(), ang: new THREE.Vector3(), age: 0, x0: 0, x1: 0, acc: 0 });
    }

    this.yaw = -0.55; this.yawVel = SPIN; this.tilt = REST_TILT; this.roll = 0;
    this.grabbed = false;
    this.reset();
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  _emit(name, ...a) { for (const fn of this.handlers[name] || []) fn(...a); }

  setBrand(id) {
    this.brand = getBrand(id);
    applyBrand(this.brandU, this.brand);
    this._syncSmoke();
  }

  get canPop() { return !!this.brand.capsule && !this.popped && (this.state === 'fresh' || this.state === 'lighting' || this.state === 'lit'); }

  // crush the menthol capsule in the filter
  pop() {
    if (!this.canPop) return false;
    this.popped = true; this.brandU.uPop.value = 1; this.popFlash = 1;
    this._syncSmoke();
    this._frame();
    for (let k = 0; k < 10; k++) {
      this.mesh.localToWorld(_v.set(1.5 + rnd(-0.4, 0.4), rnd(-R, R), rnd(-R, R)));
      this.fx.smoke.spawn(_v.x, _v.y, _v.z, rnd(-0.6, 0.6), rnd(0.6, 1.6), rnd(-0.6, 0.6), rnd(1.2, 2.2), rnd(0.15, 0.3), rnd(1.0, 1.8), rnd(0.04, 0.07), 0, 0, 0);
    }
    this._emit('pop');
    return true;
  }

  _syncSmoke() {
    if (!this.fx.setTint) return;
    const b = this.brand;
    if (b.capsule && this.popped) this.fx.setTint(b.mint, 0.3);
    else if (b.smoke) this.fx.setTint(b.smoke.tint, b.smoke.amount);
    else this.fx.setTint([1, 1, 1], 0);
  }

  reset() {
    this.popped = false; this.popFlash = 0; this.brandU.uPop.value = 0; this.brandU.uPopGlow.value = 0;
    this._syncSmoke();
    this.state = 'fresh';           // fresh → lighting → lit → stubbing → out
    this.burn = L + 0.3; this.tip = L; this.cap = 0.004;
    this.heat = 0; this.inhale = 0; this.lit = 0; this.dead = 0;
    this.clock = 0; this.impact = false;
    this.tap = 0; this.tapVel = 0; this.tapQ = null; this.tapClock = 0; this.releaseAt = null;
    this.poseMix = 0; this.poseY = 0; this.twist = 0;
    this.dragging = false; this.drags = 0; this.lungs = 0; this.puff = 0; this.wisp = 0; this.ashTimer = 0;
    this.smokeAcc = 0; this.mouthAcc = 0; this.sparkAcc = 0; this.flakeAcc = 0;
    for (const c of this.chunks) { c.active = false; c.holder.visible = false; }
    this.fx.clear();
    this._lastRemaining = this.remaining;
  }

  // pick up where a previous page left off
  restore(burn, out = false) {
    this.reset();
    this.burn = Math.min(L - 0.16, Math.max(END, burn));
    if (out) { this.state = 'out'; this.tip = this.burn + 0.16; this.dead = 1; this.cap = 0.07; }
    else { this.state = 'lit'; this.lit = 1; this.tip = Math.min(L, this.burn + KEEP); this.cap = Math.min(0.42, (this.tip - this.burn) * 0.85); }
    this._lastRemaining = this.remaining;
  }

  get ashLength() { return this.tip - this.burn; }
  get remaining() { return Math.min(1, Math.max(0, (this.burn - END) / (L - END))); }

  light() {
    if (this.state !== 'fresh') return;
    this.state = 'lighting'; this.clock = 0;
    this._emit('light');
  }

  ash() {
    if (this.state !== 'lit' || this.tapQ) return;
    this.tapQ = [{ at: 0, s: 1 }, { at: 0.25, s: 0.55 }];
    this.tapClock = 0; this.releaseAt = 0.025; this.ashTimer = 0;
  }

  stub() {
    if (this.state !== 'lit') return;
    this.state = 'stubbing'; this.clock = 0; this.impact = false; this.tapQ = null; this.ashTimer = 0;
    this._emit('stub', 1 - this.remaining);
  }

  // world-space frame of the cigarette: axis (+X), perp (+Y of the tilt frame), side
  _frame() {
    this.mesh.getWorldQuaternion(_q);
    _axis.set(1, 0, 0).applyQuaternion(_q);
    this.tiltG.getWorldQuaternion(_q);
    _perp.set(0, 1, 0).applyQuaternion(_q);
    _side.set(0, 0, 1).applyQuaternion(_q);
  }

  // break the ash column off into tumbling chunks
  _release(kick) {
    const a = this.burn + KEEP, b = this.tip;
    if (b - a < 0.1) return false;
    this._frame();
    const n = Math.min(4, Math.max(1, Math.round((b - a) / 0.42)));
    const cuts = [a];
    for (let i = 1; i < n; i++) cuts.push(a + (b - a) * (i + rnd(-0.28, 0.28)) / n);
    cuts.push(b);
    const { flakes, sparks } = this.fx;
    for (let i = 0; i < n; i++) {
      const c = this.chunks.find((k) => !k.active);
      if (!c) break;
      const x0 = cuts[i], x1 = cuts[i + 1], cx = (x0 + x1) / 2, last = i === n - 1;
      c.active = true; c.age = 0; c.acc = 0; c.x0 = x0; c.x1 = x1;
      c.u.uMin.value = x0; c.u.uMax.value = x1;
      c.u.uCapMin.value = 0.03; c.u.uCapMax.value = last ? this.cap : 0.03;
      c.u.uRagMin.value = 0.1; c.u.uRagMax.value = last ? 0 : 0.1;
      c.u.uBurn.value = this.burn; c.u.uHeat.value = 0; c.u.uDissolve.value = 0;
      this.mesh.getWorldQuaternion(c.holder.quaternion);
      c.holder.position.copy(this.mesh.localToWorld(_v.set(cx, 0, 0)));
      c.mesh.position.x = -cx;
      c.holder.visible = true;
      const lever = cx - PIVOT;
      c.vel.copy(_perp).multiplyScalar(this.tapVel * lever * 0.5 * kick - rnd(0.5, 1.5))
        .addScaledVector(_axis, rnd(0.3, 1.4) * (i + 1) * (0.4 + 0.6 * kick))
        .addScaledVector(_side, rnd(-0.8, 0.8));
      c.ang.copy(_side).multiplyScalar(-rnd(1.5, 5) * (0.4 + 0.6 * kick))
        .add(_v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(1.6));
      // dust knocked loose at each break
      for (let k = 0; k < 14; k++) {
        const th = rnd(Math.PI * 2);
        this.mesh.localToWorld(_v.set(x0 + rnd(-0.04, 0.04), Math.cos(th) * R * rnd(0.3, 1), Math.sin(th) * R * rnd(0.3, 1)));
        flakes.spawn(_v.x, _v.y, _v.z, c.vel.x * 0.5 + rnd(-2.5, 2.5), c.vel.y * 0.5 + rnd(-1, 2.5), c.vel.z * 0.5 + rnd(-2.5, 2.5),
          rnd(1.2, 2.8), rnd(0.02, 0.07), 0, rnd(0.6, 1), rnd(), rnd(3, 6));
      }
    }
    // a few sparks off the freshly exposed coal
    this.mesh.localToWorld(_v.set(a, 0, 0));
    for (let k = 0; k < 5; k++) {
      sparks.spawn(_v.x, _v.y, _v.z, rnd(-6, 6) + _axis.x * 3, rnd(-2, 7), rnd(-6, 6) + _axis.z * 3, rnd(0.35, 0.9), rnd(0.035, 0.06), 0, 1, 0, 1.6);
    }
    this.tip = a;
    this.cap = 0.03;
    return true;
  }

  update(dt, t, inhaleTarget) {
    const { smoke, flakes, sparks } = this.fx;
    let flameA = 0, flameRise = 0;

    /* ---- lighting */
    if (this.state === 'lighting') {
      this.clock += dt; const c = this.clock;
      flameRise = ss(0, 0.35, c) * (1 - ss(1.6, 2.0, c));
      flameA = ss(0.05, 0.3, c) * (1 - ss(1.55, 1.95, c));
      const k = ss(0.5, 1.6, c);
      this.burn = lerp(L + 0.3, L - 0.16, k);
      this.lit = k;
      inhaleTarget = Math.max(inhaleTarget, ss(0.45, 0.9, c) * (1 - ss(1.3, 1.9, c)) * 0.8);
      if (c > 2.0) this.state = 'lit';
    }
    const burning = this.state === 'lit' || this.state === 'lighting';
    if (!burning) inhaleTarget = 0;

    /* ---- inhale + heat */
    this.inhale = damp(this.inhale, inhaleTarget, inhaleTarget > this.inhale ? 0.1 : 0.3, dt);
    if (this.inhale < 1e-4) this.inhale = 0;
    const idle = 0.22 + 0.05 * Math.sin(t * 1.3) + 0.03 * Math.sin(t * 3.7 + 1);
    const heatTarget = this.lit * (idle + this.inhale * 1.15);
    this.heat = damp(this.heat, heatTarget, heatTarget > this.heat ? 0.12 : 0.65, dt);

    /* ---- burning down */
    if (this.state === 'lit') {
      this.burn -= (pace.idle + this.inhale * pace.drag) * dt;   // cm/s, see pace.js
      if (!this.dragging && this.inhale > 0.35) this.dragging = true;
      if (this.dragging) this.lungs += this.inhale * dt;
      if (this.dragging && this.inhale < 0.12) {
        this.dragging = false; this.drags++; this._emit('drag');
        this.puff = Math.min(1.4, this.puff + Math.min(this.lungs, 1.2)); this.lungs = 0;
        if (this.ashLength > KEEP + 0.85) this.ashTimer = 0.5;
      }
      if (this.ashTimer > 0 && (this.ashTimer -= dt) <= 0) this.ash();
      if (this.ashLength > KEEP + 2.2 && !this.tapQ) this._release(0);     // too long: falls by itself
      if (this.burn <= END) this.stub();
    }
    this.puff = damp(this.puff, 0, 0.9, dt);

    /* ---- stubbing out */
    if (this.state === 'stubbing') {
      this.clock += dt; const c = this.clock;
      const a = ss(0, 0.6, c), down = ss(0.55, 0.85, c), back = ss(2.0, 2.9, c);
      const win = ss(0.85, 1.0, c) * (1 - ss(1.6, 1.9, c));
      this.poseMix = a * (1 - back);
      this.poseY = (2.4 * a - 1.3 * down) * (1 - back) - 0.12 * win * Math.abs(Math.sin((c - 0.85) * 10));
      this.twist = win * Math.sin((c - 0.85) * 8) * 0.6;
      if (c > 0.85 && !this.impact) {
        this.impact = true;
        this._release(0);
        this.tip0 = this.tip;
        this.mesh.localToWorld(_v.set(this.tip, 0, 0));
        for (let k = 0; k < 14; k++) sparks.spawn(_v.x, _v.y, _v.z, rnd(-9, 9), rnd(0, 6), rnd(-9, 9), rnd(0.3, 0.8), rnd(0.035, 0.06), 0, 1, 0, 1.8);
        this.wisp = 1;
      }
      if (this.impact) {
        const cr = ss(0.85, 1.7, c);
        this.tip = lerp(this.tip0, this.burn + 0.16, cr);
        this.dead = cr; this.lit = 1 - cr;
        this.flakeAcc += win * 130 * dt;
      }
      if (c > 2.9) { this.state = 'out'; this.poseMix = 0; this.poseY = 0; this.twist = 0; this._emit('out'); }
    }
    this.wisp = damp(this.wisp, 0, 1.6, dt);

    /* ---- tap spring */
    if (this.tapQ) {
      this.tapClock += dt;
      while (this.tapQ.length && this.tapQ[0].at <= this.tapClock) this.tapVel -= 7.5 * this.tapQ.shift().s;
      if (this.releaseAt !== null && this.tapClock >= this.releaseAt) { this._releasePending = true; this.releaseAt = null; }
      if (!this.tapQ.length && this.tapClock > 0.6) this.tapQ = null;
    }
    this.tapVel += (-520 * this.tap - 30 * this.tapVel) * dt;
    this.tap += this.tapVel * dt;

    /* ---- pose */
    if (this.sway) {
      this.yaw = -0.5 + 0.3 * Math.sin(t * 0.33);
      this.tilt = REST_TILT + 0.12 + 0.05 * Math.sin(t * 0.47);
    } else if (!this.grabbed) {
      const spin = this.state === 'stubbing' ? 0 : SPIN;
      this.yawVel = damp(this.yawVel, spin, this.state === 'stubbing' ? 0.3 : 1.4, dt);
      this.yaw += this.yawVel * dt;
      this.tilt = damp(this.tilt, REST_TILT, 2.5, dt);
    }
    this.roll += 0.12 * dt;
    this.yawG.rotation.y = this.yaw;
    this.yawG.position.y = Math.sin(t * 0.8) * 0.1 + this.poseY;
    this.tiltG.rotation.z = lerp(this.tilt, -1.2, this.poseMix) + this.tap;
    this.rollG.rotation.x = this.roll + this.twist;
    this.rollG.position.x = -PIVOT - 0.14 * this.inhale;
    this.yawG.updateMatrixWorld(true);

    if (this._releasePending) { this._releasePending = false; this._release(1); }

    /* ---- shape */
    const capTarget = this.state === 'fresh' ? 0.004
      : this.state === 'stubbing' || this.state === 'out' ? 0.07
      : Math.min(0.42, Math.max(0.004, this.ashLength * 0.85));
    this.cap = damp(this.cap, capTarget, 0.22, dt);
    const u = this.u;
    u.uBurn.value = this.burn; u.uMax.value = this.tip; u.uCapMax.value = this.cap;
    u.uHeat.value = this.heat; u.uDead.value = this.dead;
    u.uStain.value = Math.min(1, (L - this.burn) / (L - END)) * 0.9;

    /* ---- emitters */
    this._frame();
    const tipW = this.mesh.localToWorld(_v2.set(this.tip, 0, 0)).clone();

    // sidestream smoke off the coal; it thins while air is being pulled through
    // density is carried by opacity, not spawn rate, so a thin wisp never breaks into beads
    let rate = 0, dens = 1;
    if (burning) { rate = this.lit * 170 + this.puff * 200; dens = 1 - 0.8 * this.inhale * (1 - Math.min(1, this.puff)); }
    else if (this.state === 'stubbing' && this.impact) { rate = 190; dens = 0.25 + this.wisp; }
    else if (this.state === 'out' && this.wisp > 0.01) { rate = 150; dens = Math.min(1, this.wisp * 1.6); }
    this.smokeAcc += rate * dt;
    while (this.smokeAcc >= 1) {
      this.smokeAcc -= 1;
      const lx = Math.min(this.tip - 0.02, this.burn + 0.05 + rnd(0.42));
      this.mesh.localToWorld(_v.set(lx, 0, 0));
      smoke.spawn(_v.x + rnd(-0.05, 0.05), _v.y + R * 0.75, _v.z + rnd(-0.05, 0.05),
        rnd(-0.15, 0.15), rnd(2.6, 3.4), rnd(-0.15, 0.15),
        rnd(3.8, 6.0), rnd(0.16, 0.24), rnd(1.9, 3.4), rnd(0.05, 0.075) * dens * (0.75 + 0.5 * Math.min(1, this.puff)), this.heat, 0, rnd(dt));
    }
    // a curl from the mouth end after each drag
    this.mouthAcc += (burning ? this.puff * 26 : 0) * dt;
    while (this.mouthAcc >= 1) {
      this.mouthAcc -= 1;
      this.mesh.localToWorld(_v.set(-0.03, rnd(-0.2, 0.2), rnd(-0.2, 0.2)));
      smoke.spawn(_v.x, _v.y, _v.z, -_axis.x * 1.6, 1.2 - _axis.y * 1.6, -_axis.z * 1.6,
        rnd(2.2, 3.4), rnd(0.25, 0.4), rnd(1.6, 2.6), rnd(0.05, 0.09), 0, 0, rnd(dt));
    }
    // sparks while pulling hard (clove keeps popping even at rest)
    const crackle = this.brand.crackle ? this.lit * this.brand.crackle * (0.9 + 9 * this.inhale) : 0;
    this.sparkAcc += (burning ? Math.max(0, this.inhale - 0.3) * 7 + crackle : 0) * dt;
    while (this.sparkAcc >= 1) {
      this.sparkAcc -= 1;
      const th = rnd(Math.PI * 2);
      this.mesh.localToWorld(_v.set(this.burn + rnd(0.05, 0.4), Math.cos(th) * R * 0.8, Math.sin(th) * R * 0.8));
      sparks.spawn(_v.x, _v.y, _v.z, rnd(-3, 3) + _axis.x * 2, rnd(1, 6), rnd(-3, 3) + _axis.z * 2, rnd(0.4, 1.1), rnd(0.03, 0.05), 0, 1, 0, 1.4);
    }
    // crushed ash while stubbing
    while (this.flakeAcc >= 1) {
      this.flakeAcc -= 1;
      const th = rnd(Math.PI * 2), sp = rnd(2, 8);
      flakes.spawn(tipW.x + rnd(-0.2, 0.2), tipW.y + rnd(-0.1, 0.2), tipW.z + rnd(-0.2, 0.2),
        Math.cos(th) * sp, rnd(-1, 3), Math.sin(th) * sp, rnd(1.2, 2.6), rnd(0.02, 0.08), 0, rnd(0.6, 1), rnd(), rnd(3, 6));
    }

    /* ---- falling ash */
    for (const c of this.chunks) {
      if (!c.active) continue;
      c.age += dt;
      c.vel.y -= 30 * dt;
      c.vel.multiplyScalar(Math.exp(-dt * 0.9));
      c.holder.position.addScaledVector(c.vel, dt);
      const w = c.ang.length() * dt;
      if (w > 1e-6) c.holder.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(c.ang).normalize(), w));
      const dis = ss(0.12, 1.05, c.age);
      c.u.uDissolve.value = dis;
      c.holder.updateMatrixWorld(true);
      // crumbles into flakes as it goes
      c.acc += (20 + 260 * dis * (1 - dis)) * (c.x1 - c.x0) * dt * 2.2;
      while (c.acc >= 1) {
        c.acc -= 1;
        const th = rnd(Math.PI * 2), rr = R * rnd(0.2, 1);
        c.mesh.localToWorld(_v.set(rnd(c.x0, c.x1), Math.cos(th) * rr, Math.sin(th) * rr));
        flakes.spawn(_v.x, _v.y, _v.z, c.vel.x * 0.6 + rnd(-1.5, 1.5), c.vel.y * 0.6 + rnd(-0.5, 1.5), c.vel.z * 0.6 + rnd(-1.5, 1.5),
          rnd(1.0, 2.6), rnd(0.02, 0.075), 0, rnd(0.6, 1), rnd(), rnd(3, 6.5));
      }
      if (c.age > 1.1) { c.active = false; c.holder.visible = false; }
    }

    /* ---- bookkeeping */
    const rem = this.remaining;
    if (rem < this._lastRemaining && (burning || this.state === 'stubbing')) this._emit('burn', this._lastRemaining - rem);
    this._lastRemaining = rem;
    this.popFlash = damp(this.popFlash, 0, 0.35, dt);
    this.brandU.uPopGlow.value = this.popFlash;

    /* ---- lighter flame */
    this.fx.setFlame(tipW, flameA, flameRise);
    this.fx.setGlow(this.mesh.localToWorld(_v.set(Math.min(this.tip, this.burn + 0.2), 0, 0)), this.heat);
  }
}
