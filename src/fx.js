import * as THREE from '../vendor/three/build/three.module.js';
import { NOISE } from './noise.js';

// CPU-simulated, camera-facing instanced quads.
// per particle: 0-2 pos, 3-5 vel, 6 age, 7 life, 8 size0, 9 size1, 10 alpha, 11 rot, 12 rotVel, 13 seed, 14 extra, 15 drag
const S = 16;

const VERT = /* glsl */ `
attribute vec3 iPos;
attribute vec4 iA;   // size, alpha, rotation, seed
attribute vec2 iB;   // age 0..1, extra
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying float vAgeN; varying float vExtra;
void main(){
  vUv = position.xy * 2.0;
  vAlpha = iA.y; vSeed = iA.w; vAgeN = iB.x; vExtra = iB.y;
  float c = cos(iA.z), s = sin(iA.z);
  vec4 mv = viewMatrix * vec4(iPos, 1.0);
  mv.xy += mat2(c, -s, s, c) * position.xy * iA.x;
  gl_Position = projectionMatrix * mv;
}`;

const HEAD = /* glsl */ `
varying vec2 vUv; varying float vAlpha; varying float vSeed; varying float vAgeN; varying float vExtra;
${NOISE}`;

const SMOKE_FRAG = HEAD + /* glsl */ `
uniform float uDark, uTintAmt;
uniform vec3 uTint;
void main(){
  float r = length(vUv);
  if (r >= 1.0) discard;
  float g = exp(-3.2 * r * r) * (1.0 - smoothstep(0.6, 1.0, r));
  float n = fbm(vec3(vUv * 1.4 + vSeed * 31.0, vSeed * 7.0 + vAgeN * 1.6));
  float wisp = mix(1.0, 0.35 + 1.3 * smoothstep(0.2, 0.8, n), smoothstep(0.15, 0.7, vAgeN));
  vec3 col = mix(vec3(0.50, 0.56, 0.68), vec3(0.80, 0.83, 0.88), n);
  col = mix(col, vec3(1.0, 0.45, 0.16) * 1.4, vExtra * pow(1.0 - vAgeN, 14.0) * 0.5);
  col = mix(col, uTint * (0.85 + 0.25 * n), uTintAmt);
  col = mix(col, vec3(0.16, 0.165, 0.18) + 0.1 * n, uDark);
  gl_FragColor = vec4(col, g * wisp * vAlpha * (1.0 + 0.6 * uDark));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FLAKE_FRAG = HEAD + /* glsl */ `
void main(){
  float r = length(vUv);
  float edge = 0.5 + 0.5 * vnoise(vec3(vUv * 1.7, vSeed * 40.0));
  if (r > edge) discard;
  float tumble = 0.62 + 0.38 * sin(vAgeN * 40.0 + vSeed * 60.0);
  vec3 col = mix(vec3(0.16, 0.155, 0.15), vec3(0.62, 0.61, 0.60), vExtra) * tumble;
  gl_FragColor = vec4(col, vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SPARK_FRAG = HEAD + /* glsl */ `
void main(){
  float r = length(vUv);
  float g = exp(-5.0 * r * r);
  vec3 col = mix(vec3(1.0, 0.25, 0.03), vec3(1.0, 0.75, 0.35), vAlpha) * 7.0;
  gl_FragColor = vec4(col, g * vAlpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

class Sprites {
  constructor(max, fragmentShader, { blend = {}, uniforms = {}, order = 1, curve, force }) {
    this.max = max; this.d = new Float32Array(max * S); this.head = 0;
    this.curve = curve; this.force = force; this.out = [0, 0];
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(max * 2), 2).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('iPos', this.aPos); g.setAttribute('iA', this.aA); g.setAttribute('iB', this.aB);
    g.instanceCount = 0;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader, uniforms, transparent: true, depthWrite: false, ...blend,
    }));
    this.mesh.frustumCulled = false; this.mesh.renderOrder = order;
  }

  spawn(x, y, z, vx, vy, vz, life, size0, size1, alpha, extra = 0, drag = 0, pre = 0) {
    const d = this.d, o = this.head * S;
    this.head = (this.head + 1) % this.max;
    d[o] = x + vx * pre; d[o + 1] = y + vy * pre; d[o + 2] = z + vz * pre; d[o + 3] = vx; d[o + 4] = vy; d[o + 5] = vz;
    d[o + 6] = pre; d[o + 7] = life; d[o + 8] = size0; d[o + 9] = size1; d[o + 10] = alpha;
    d[o + 11] = Math.random() * 6.283; d[o + 12] = (Math.random() - 0.5) * 2; d[o + 13] = Math.random();
    d[o + 14] = extra; d[o + 15] = drag;
  }

  clear() { this.d.fill(0); this.geo.instanceCount = 0; }

  update(dt, t) {
    const d = this.d, P = this.aPos.array, A = this.aA.array, B = this.aB.array, out = this.out;
    let n = 0;
    for (let i = 0, o = 0; i < this.max; i++, o += S) {
      if (d[o + 7] <= 0) continue;
      d[o + 6] += dt;
      if (d[o + 6] >= d[o + 7]) { d[o + 7] = 0; continue; }
      this.force(d, o, dt, t);
      d[o] += d[o + 3] * dt; d[o + 1] += d[o + 4] * dt; d[o + 2] += d[o + 5] * dt;
      d[o + 11] += d[o + 12] * dt;
      const ageN = d[o + 6] / d[o + 7];
      this.curve(d, o, ageN, out);
      P[n * 3] = d[o]; P[n * 3 + 1] = d[o + 1]; P[n * 3 + 2] = d[o + 2];
      A[n * 4] = out[0]; A[n * 4 + 1] = out[1]; A[n * 4 + 2] = d[o + 11]; A[n * 4 + 3] = d[o + 13];
      B[n * 2] = ageN; B[n * 2 + 1] = d[o + 14];
      n++;
    }
    this.geo.instanceCount = n;
    this.aPos.needsUpdate = this.aA.needsUpdate = this.aB.needsUpdate = true;
  }
}

/* ------------------------------------------------------------------- flame */
const FLAME_FRAG = /* glsl */ `
uniform float uT, uA;
varying vec2 vUv;
${NOISE}
void main(){
  float y = vUv.y;
  float x = (vUv.x - 0.5) * 2.0;
  x += (vnoise(vec3(y * 3.0 - uT * 5.0, uT * 2.0, 0.0)) - 0.5) * 0.5 * y * y;
  float w = 0.62 * pow(max(1.0 - y, 0.0), 0.75) * sqrt(smoothstep(0.0, 0.22, y)) * (0.92 + 0.08 * sin(uT * 23.0));
  float f = 1.0 - abs(x) / max(w, 1e-4);
  if (f <= 0.0) discard;
  vec3 col = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.86, 0.45), smoothstep(0.15, 0.75, f));
  float base = 1.0 - smoothstep(0.04, 0.3, y);
  col = mix(col, vec3(0.12, 0.3, 1.0), base * 0.85);
  float a = smoothstep(0.0, 0.3, f) * (1.0 - 0.55 * base * smoothstep(0.3, 1.0, f)) * uA;
  gl_FragColor = vec4(col * 1.5, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// additive light that leaves canvas alpha alone, so it also adds over a web page behind a transparent canvas
const ADD = { blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneFactor,
  blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };

const GLOW_FRAG = /* glsl */ `
uniform float uI;
varying vec2 vUv;
void main(){
  float r = length(vUv - 0.5) * 2.0;
  float g = exp(-4.5 * r * r) * (1.0 - smoothstep(0.65, 1.0, r));
  gl_FragColor = vec4(vec3(1.0, 0.4, 0.09) * uI, g);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

export function createFx(scene, camera, opts = {}) {
  const smokeU = { uDark: { value: 0 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uTintAmt: { value: 0 } };
  const smoke = new Sprites(2000, SMOKE_FRAG, {
    order: 1, uniforms: smokeU,
    curve(d, o, a, out) {
      out[0] = d[o + 8] + (d[o + 9] - d[o + 8]) * Math.pow(a, 1.25);
      const q = 1 - a;
      out[1] = d[o + 10] * Math.min(1, d[o + 6] / 0.12) * q * Math.sqrt(q);
    },
    // laminar thread that starts to wander and curl as it climbs
    force(d, o, dt, t) {
      const age = d[o + 6], y = d[o + 1], seed = d[o + 13];
      const A = Math.min(1, age / 0.9) * (0.55 + age * 0.34);
      const tx = A * (Math.sin(y * 0.85 - t * 1.6 + 1.3 * Math.sin(t * 0.33)) * 1.3 + Math.sin(y * 2.1 - t * 2.7 + 2.0) * 0.55)
        + 0.35 * Math.sin(t * 0.21) + (seed - 0.5) * age * 0.3;
      const tz = A * (Math.cos(y * 1.05 - t * 1.45 + 0.7) * 1.1 + Math.sin(y * 2.6 - t * 2.3) * 0.5)
        + (((seed * 7.13) % 1) - 0.5) * age * 0.3;
      const k = Math.min(1, dt * 4);
      d[o + 3] += (tx - d[o + 3]) * k;
      d[o + 5] += (tz - d[o + 5]) * k;
      d[o + 4] += (4.6 - age * 0.35 - d[o + 4]) * Math.min(1, dt * 1.2);
    },
  });

  const flakes = new Sprites(900, FLAKE_FRAG, {
    order: 2,
    curve(d, o, a, out) { out[0] = d[o + 8]; out[1] = d[o + 10] * Math.min(1, (1 - a) * 4); },
    force(d, o, dt) {
      const age = d[o + 6], seed = d[o + 13], k = Math.exp(-d[o + 15] * dt);
      d[o + 4] -= 30 * dt;
      d[o + 3] = (d[o + 3] + Math.sin(age * 9 + seed * 50) * 5 * dt) * k;
      d[o + 5] = (d[o + 5] + Math.cos(age * 7 + seed * 31) * 5 * dt) * k;
      d[o + 4] *= k;
    },
  });

  const sparks = new Sprites(160, SPARK_FRAG, {
    order: 3, blend: ADD,
    curve(d, o, a, out) { out[0] = d[o + 8] * (1 - a * 0.5); out[1] = (1 - a) * (1 - a); },
    force(d, o, dt) {
      const k = Math.exp(-d[o + 15] * dt);
      d[o + 4] -= 14 * dt;
      d[o + 3] *= k; d[o + 4] *= k; d[o + 5] *= k;
    },
  });

  scene.add(smoke.mesh, flakes.mesh, sparks.mesh);

  const flameU = { uT: { value: 0 }, uA: { value: 0 } };
  const flameGeo = new THREE.PlaneGeometry(1.7, 2.4);
  flameGeo.translate(0, 1.2, 0);                       // origin at the base of the flame
  const flame = new THREE.Mesh(flameGeo, new THREE.ShaderMaterial({
    uniforms: flameU, fragmentShader: FLAME_FRAG, vertexShader: QUAD_VERT, transparent: true, depthWrite: false, ...ADD,
  }));
  flame.renderOrder = 4; flame.visible = false;
  const flameLight = new THREE.PointLight(0xffa24a, 0, 14, 2);
  scene.add(flame, flameLight);
  const toCam = new THREE.Vector3();

  // stand-in for bloom when there is no post-processing (transparent overlay)
  const glowU = { uI: { value: 0 } };
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    uniforms: glowU, fragmentShader: GLOW_FRAG, vertexShader: QUAD_VERT, transparent: true, depthWrite: false, depthTest: false, ...ADD,
  }));
  glow.renderOrder = 5; glow.visible = false;
  scene.add(glow);

  return {
    smoke, flakes, sparks,
    get count() { return smoke.geo.instanceCount + flakes.geo.instanceCount + sparks.geo.instanceCount; },
    setDark(v) { smokeU.uDark.value = v; },
    setTint(rgb, amount) { smokeU.uTint.value.fromArray(rgb); smokeU.uTintAmt.value = amount; },
    setGlow(pos, heat) {
      glow.visible = !!opts.glow && heat > 0.01;
      if (!glow.visible) return;
      glow.position.copy(pos); glow.quaternion.copy(camera.quaternion);
      glow.scale.setScalar(2.0 + 2.6 * heat);
      glowU.uI.value = 0.22 * heat + 0.42 * heat * heat;
    },
    clear() { smoke.clear(); flakes.clear(); sparks.clear(); },
    update(dt, t) {
      flameU.uT.value = t;
      smoke.update(dt, t); flakes.update(dt, t); sparks.update(dt, t);
    },
    // tip: world position of the burning end; rise 0..1 brings the lighter up from below
    setFlame(tip, alpha, rise) {
      flame.visible = alpha > 0.002;
      flameU.uA.value = alpha;
      if (!flame.visible) { flameLight.intensity = 0; return; }
      toCam.copy(camera.position).sub(tip).normalize();
      flame.position.copy(tip).addScaledVector(toCam, 0.5);
      flame.position.y += -1.75 - (1 - rise) * 2.2;
      flame.quaternion.copy(camera.quaternion);
      const t = flameU.uT.value;
      flameLight.position.copy(flame.position).addScaledVector(toCam, 1.2); flameLight.position.y += 1.2;
      flameLight.intensity = alpha * (14 + 5 * Math.sin(t * 31) + 3 * Math.sin(t * 17.3));
    },
  };
}
