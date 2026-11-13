// Geek Bar Pulse–style disposable: soft-touch box in a flavour gradient, a glass side screen
// (battery, e-liquid, puff animation) and a clear mouthpiece. Scrolling is a draw. Keep it up
// for pace.blink seconds and the device cuts off and flashes (a blinker); letting go exhales a cloud sized
// by how much you scrolled.
import * as THREE from '../vendor/three/build/three.module.js';
import { pace } from './pace.js';
import { brand as getBrand } from './brands.js';

export const W = 5.26, H = 8.26, D = 2.77;   // cm, Geek Bar Pulse is 52.6 × 82.6 × 27.7 mm
const HOLD_PX = 800;                         // px-equivalent per second while the Hit button is held
const BEV = 0.42, CORNER = 0.55;
const REST_YAW = 0.62;                       // screen side towards you
const damp = (a, b, tau, dt) => b + (a - b) * Math.exp(-dt / tau);
const rnd = (a, b) => a + Math.random() * (b - a);

function rrect(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
// rounded slab, w × h in x/y, d deep in z, centred; caps split into back (group 2) and front (group 0)
function slab(w, h, d, r, bev) {
  const g = new THREE.ExtrudeGeometry(rrect(w - 2 * bev, h - 2 * bev, r), {
    depth: d - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 5, curveSegments: 12,
  });
  g.translate(0, 0, -(d - 2 * bev) / 2);
  smooth(g);
  const [lid, side] = g.groups, half = lid.count / 2;
  g.clearGroups();
  g.addGroup(lid.start, half, 2); g.addGroup(lid.start + half, half, 0); g.addGroup(side.start, side.count, 1);
  return g;
}

// the bevel is tangent to both the faces and the walls, so averaging normals by position is safe
function smooth(g) {
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map();
  const key = (i) => `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i), a = acc.get(k) || [0, 0, 0];
    a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(k, a);
  }
  for (let i = 0; i < p.count; i++) {
    const [x, y, z] = acc.get(key(i)), l = Math.hypot(x, y, z) || 1;
    n.setXYZ(i, x / l, y / l, z / l);
  }
  n.needsUpdate = true;
}

function canvasTex(w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return { c, g: c.getContext('2d'), t };
}

function gradientMat(top, bot) {
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.45 });
  const u = { uTop: { value: new THREE.Color(top) }, uBot: { value: new THREE.Color(bot) } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vGy;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGy = position.y / ${H.toFixed(2)} + 0.5;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGy;\nuniform vec3 uTop, uBot;')
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( mix( uBot, uTop, smoothstep( 0.0, 1.0, vGy ) ), opacity );');
  };
  return m;
}

function sparkle(g, x, y, r) {
  g.beginPath();
  g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
}

function face(g, w, h, b, back) {
  const v = b.device;
  const gr = g.createLinearGradient(0, 0, w * 0.35, h);
  gr.addColorStop(0, v.top); gr.addColorStop(1, v.bot);
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  const sh = g.createLinearGradient(0, 0, w, 0);          // soft-touch sheen
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.55, 'rgba(255,255,255,.10)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  if (back) {
    g.fillStyle = '#fff'; g.fillRect(40, 90, w - 80, 250);
    g.strokeStyle = '#000'; g.lineWidth = 6; g.strokeRect(52, 102, w - 104, 226);
    g.fillStyle = '#000'; g.font = '800 38px "Helvetica Neue", Arial, sans-serif';
    ['WARNING: This product', 'contains nicotine.', 'Nicotine is an', 'addictive chemical.'].forEach((l, i) => g.fillText(l, w / 2, 160 + i * 46));
    g.fillStyle = '#fff'; g.font = '700 30px "Avenir Next", Futura, "Helvetica Neue", Arial, sans-serif';
    g.letterSpacing = '6px'; g.fillText('GEEK BAR PULSE', w / 2, 470); g.letterSpacing = '0px';
    g.font = '500 22px "Helvetica Neue", Arial, sans-serif';
    [`${b.puffs.toLocaleString()} PUFFS · REGULAR MODE`, `${b.ml} mL · ${b.nicPct}% NICOTINE · 650 mAh`, 'DUAL MESH COIL · USB-C', b.flavour.toUpperCase()]
      .forEach((l, i) => g.fillText(l, w / 2, 540 + i * 40));
    return;
  }
  g.globalAlpha = 0.9;
  sparkle(g, w * 0.7, h * 0.27, 26); sparkle(g, w * 0.31, h * 0.3, 13); sparkle(g, w * 0.66, h * 0.68, 50);
  g.globalAlpha = 0.75; g.lineWidth = 4; g.strokeStyle = '#fff';
  g.beginPath(); g.arc(w * 0.24, h * 0.62, 10, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(w * 0.82, h * 0.34, 7, 0, Math.PI * 2); g.fill();
  g.globalAlpha = 1;
  g.font = '800 92px "Avenir Next", Futura, "Helvetica Neue", Arial, sans-serif'; g.letterSpacing = '4px';
  g.fillText('GEEK BAR', w / 2 + 2, h * 0.47);
  g.font = '600 34px "Avenir Next", Futura, "Helvetica Neue", Arial, sans-serif'; g.letterSpacing = '16px';
  g.fillText('PULSE', w / 2 + 8, h * 0.47 + 50);
  g.letterSpacing = '2px'; g.font = '600 19px "Helvetica Neue", Arial, sans-serif';
  g.fillText(b.flavour.toUpperCase(), w / 2, h * 0.8);
  g.font = '600 17px "Helvetica Neue", Arial, sans-serif';
  g.fillText('MAY THE PULSE BE WITH YOU', w / 2, h * 0.93); g.letterSpacing = '0px';
  for (const s of [-1, 1]) {
    const x = w / 2 + s * 168, y = h * 0.93 - 6;
    g.beginPath(); g.moveTo(x - s * 8, y - 7); g.lineTo(x + s * 4, y); g.lineTo(x - s * 8, y + 7); g.fill();
  }
}

/* --------------------------------------------------------------- screen */
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
const SEG_R = { a: [1, 0, 4, 1], b: [5, 1, 1, 3.5], c: [5, 5.5, 1, 3.5], d: [1, 9, 4, 1], e: [0, 5.5, 1, 3.5], f: [0, 1, 1, 3.5], g: [1, 4.5, 4, 1] };
function digits(g, str, x, y, h, on, off) {
  const k = h / 10, step = 7.4 * k;
  x -= (str.length * step - 1.4 * k) / 2;
  for (const ch of str) {
    const lit = SEG[ch] || '';
    for (const [s, [sx, sy, sw, shh]] of Object.entries(SEG_R)) {
      g.fillStyle = lit.includes(s) ? on : off;
      g.fillRect(x + sx * k + (10 - sy) * k * 0.08, y + sy * k, sw * k, shh * k);
    }
    x += step;
  }
}
function bolt(g, x, y, s) {
  g.beginPath(); g.moveTo(x + 2 * s, y - 10 * s); g.lineTo(x - 5 * s, y + 1 * s); g.lineTo(x, y + 1 * s);
  g.lineTo(x - 2 * s, y + 10 * s); g.lineTo(x + 5 * s, y - 1 * s); g.lineTo(x, y - 1 * s); g.closePath(); g.fill();
}
function drop(g, x, y, s) {
  g.beginPath(); g.moveTo(x, y - 10 * s);
  g.bezierCurveTo(x + 7 * s, y - 1 * s, x + 7 * s, y + 8 * s, x, y + 8 * s);
  g.bezierCurveTo(x - 7 * s, y + 8 * s, x - 7 * s, y - 1 * s, x, y - 10 * s); g.fill();
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }

function drawScreen(g, w, h, s) {
  g.fillStyle = '#040406'; g.fillRect(0, 0, w, h);
  const on = `rgba(255,170,40,${0.35 + 0.65 * s.glow})`, off = 'rgba(255,170,40,.07)', hot = `rgba(255,236,170,${0.4 + 0.6 * s.glow})`;
  g.save();
  g.shadowColor = 'rgba(255,212,0,.9)'; g.shadowBlur = 6 + 14 * s.glow;
  g.strokeStyle = `rgba(255,212,0,${0.45 + 0.55 * s.glow})`; g.lineWidth = 5;
  rr(g, 8, 8, w - 16, h - 16, 30); g.stroke();
  g.restore();
  // battery
  g.fillStyle = hot; bolt(g, w / 2, 70, 2.1);
  for (let i = 0; i < 8; i++) {
    const a = Math.PI * (1.15 + i * 0.1);
    g.fillStyle = i / 8 < s.batt / 100 ? on : off;
    g.beginPath(); g.arc(w / 2 + Math.cos(a) * 62, 96 + Math.sin(a) * 62, 5, 0, Math.PI * 2); g.fill();
  }
  digits(g, String(Math.round(s.batt)).padStart(3, ' '), w / 2, 108, 46, hot, off);
  // middle: planet idle, rocket while drawing, ring fills up towards the blinker
  const cx = w / 2, cy = 318;
  if (s.drawing) {
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const sx = ((i * 53) % (w - 40)) + 20, sy = ((i * 97 + s.t * (260 + 420 * s.draw)) % 300) + 170;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx, sy + 10 + 26 * s.draw); g.stroke();
    }
    g.fillStyle = hot;
    g.beginPath(); g.moveTo(cx, cy - 46); g.quadraticCurveTo(cx + 22, cy - 18, cx + 16, cy + 22); g.lineTo(cx - 16, cy + 22);
    g.quadraticCurveTo(cx - 22, cy - 18, cx, cy - 46); g.fill();
    g.fillStyle = '#040406'; g.beginPath(); g.arc(cx, cy - 12, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = `rgba(255,${120 + 80 * Math.random()},30,.95)`;
    g.beginPath(); g.moveTo(cx - 11, cy + 24); g.lineTo(cx, cy + 40 + 22 * Math.random() * s.draw); g.lineTo(cx + 11, cy + 24); g.fill();
  } else {
    g.strokeStyle = on; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, 26, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, 52, 15, -0.35, 0, Math.PI * 2); g.stroke();
    const a = s.t * 1.3;
    g.fillStyle = hot; g.beginPath(); g.arc(cx + Math.cos(a) * 52 * Math.cos(-0.35) - Math.sin(a) * 15 * Math.sin(-0.35), cy + Math.cos(a) * 52 * Math.sin(-0.35) + Math.sin(a) * 15 * Math.cos(-0.35), 5, 0, Math.PI * 2); g.fill();
  }
  g.lineWidth = 6; g.strokeStyle = off; g.beginPath(); g.arc(cx, cy, 74, 0, Math.PI * 2); g.stroke();
  if (s.charge > 0) {
    g.strokeStyle = s.charge > 0.8 ? 'rgba(255,80,60,.95)' : hot;
    g.beginPath(); g.arc(cx, cy, 74, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, s.charge)); g.stroke();
  }
  // e-liquid
  g.fillStyle = hot; drop(g, w / 2, 470, 2.1);
  digits(g, String(Math.ceil(s.liquid)).padStart(3, ' '), w / 2, 506, 46, hot, off);
  g.fillStyle = on; g.font = '700 15px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center';
  g.fillText(s.drawing ? 'PULSE' : 'REGULAR', w / 2, 594);
  if (s.flash > 0) { g.fillStyle = `rgba(255,236,170,${s.flash})`; rr(g, 10, 10, w - 20, h - 20, 28); g.fill(); }
}

export class Vape {
  constructor(scene, fx, { brand = 'geekbar', left } = {}) {
    this.fx = fx; this.handlers = {};
    this.root = new THREE.Group(); this.yawG = new THREE.Group(); this.tiltG = new THREE.Group();
    scene.add(this.root); this.root.add(this.yawG); this.yawG.add(this.tiltG);

    const cw = W - 2 * BEV, ch = H - 2 * BEV;
    this.front = canvasTex(512, Math.round(512 * ch / cw));
    this.back = canvasTex(512, Math.round(512 * ch / cw));
    this.front.t.repeat.set(1 / cw, 1 / ch); this.front.t.offset.set(0.5, 0.5);
    this.back.t.repeat.set(-1 / cw, 1 / ch); this.back.t.offset.set(0.5, 0.5);
    const cap = (t) => new THREE.MeshPhysicalMaterial({ map: t, roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.45 });
    this.sideMat = gradientMat('#ff5f8f', '#ffb27a');
    this.body = new THREE.Mesh(slab(W, H, D, CORNER, BEV), [cap(this.front.t), this.sideMat, cap(this.back.t)]);
    this.tiltG.add(this.body);

    // glass screen down the left side
    const bez = new THREE.Mesh(slab(D - 0.42, H - 1.1, 0.08, 0.45, 0.03),
      new THREE.MeshPhysicalMaterial({ color: 0x050507, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05 }));
    bez.rotation.y = -Math.PI / 2; bez.position.x = -W / 2 + 0.005; this.tiltG.add(bez);
    this.screen = canvasTex(192, 640);
    this.screenMat = new THREE.MeshBasicMaterial({ map: this.screen.t, toneMapped: false, transparent: true });
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(D - 0.66, H - 1.4), this.screenMat);
    scr.rotation.y = -Math.PI / 2; scr.position.x = -W / 2 - 0.045; this.tiltG.add(scr);
    this.led = new THREE.PointLight(0xffb02e, 0, 9, 2); this.led.position.set(-W / 2 - 1.2, 0.4, 0); this.tiltG.add(this.led);

    // clear mouthpiece over a coloured core, offset to the back like the Pulse
    this.coreMat = new THREE.MeshPhysicalMaterial({ roughness: 0.5, clearcoat: 0.3 });
    const core = new THREE.Mesh(slab(1.25, 1.5, 0.95, 0.35, 0.18), this.coreMat);
    core.position.set(0.55, H / 2 + 0.55, -0.1); this.tiltG.add(core);
    this.shellMat = new THREE.MeshPhysicalMaterial({ roughness: 0.06, transparent: true, opacity: 0.5, clearcoat: 1, clearcoatRoughness: 0.03, depthWrite: false });
    const shell = new THREE.Mesh(slab(2.05, 1.9, 1.55, 0.6, 0.32), this.shellMat);
    shell.position.set(0.55, H / 2 + 0.6, -0.1); shell.renderOrder = 2; this.tiltG.add(shell);
    const hole = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
    hole.rotation.x = -Math.PI / 2; hole.scale.set(1.6, 0.7, 1); hole.position.set(0.55, H / 2 + 1.56, -0.1); this.tiltG.add(hole);
    this.mouth = new THREE.Vector3(0.55, H / 2 + 1.6, -0.1);

    this.yaw = REST_YAW; this.yawVel = 0; this.tilt = 0; this.grabbed = false;
    this.inhale = 0; this.glow = 0.3; this.appear = 1; this.swapT = 0;
    this.drawing = false; this.drawT = 0; this.gap = 0; this.charge = 0; this.fed = 0; this.needRelease = false;
    this.blinkT = 0; this.exhaleQ = []; this.awakeT = 0; this.clock = 0; this.screenAt = -1;
    this.setDevice(brand, left);
  }

  on(name, fn) { (this.handlers[name] ||= []).push(fn); return this; }
  _emit(name, ...a) { for (const fn of this.handlers[name] || []) fn(...a); }

  setDevice(id, left) {
    this.brand = getBrand(id);
    const b = this.brand, v = b.device;
    this.left = left == null ? b.puffs : left;
    face(this.front.g, this.front.c.width, this.front.c.height, b, false); this.front.t.needsUpdate = true;
    face(this.back.g, this.back.c.width, this.back.c.height, b, true); this.back.t.needsUpdate = true;
    this.sideMat.userData.u.uTop.value.set(v.top); this.sideMat.userData.u.uBot.value.set(v.bot);
    this.coreMat.color.set(v.top); this.shellMat.color.set(v.shell);
    this.screenAt = -1;
  }
  setLeft(left, opened) { this.left = left; if (opened) this.swapT = 1; this.screenAt = -1; }
  show() { this.appear = 0; this.root.visible = true; this.fx.setGlow(this.root.position, 0); this.fx.setFlame(this.root.position, 0, 0); }
  feed(px) { this.fed += Math.abs(px); this.awakeT = this.clock; }
  get battery() { const used = this.brand.puffs - this.left; return 100 - (used % 600) / 6; }
  get liquid() { return (100 * this.left) / this.brand.puffs; }
  hit(ray) { return ray.intersectObject(this.tiltG, true).length > 0; }

  _end(blinker) {
    const ms = this.drawT * 1000, px = this.charge;
    this.drawing = false; this.drawT = 0; this.charge = 0;
    if (blinker) { this.blinkT = 1; this.needRelease = true; }
    this._emit('hit', { ms, px, blinker });
    const amount = Math.min(3, px / 2400 + (ms / 1000 / pace.blink) * 0.6);
    this.exhaleQ.push({ at: this.clock + (blinker ? 0.95 : 0.35), amount, ms, blinker });
  }

  update(dt, t, target, hold = 0) {
    this.clock += dt;
    if (target < 0.15) this.needRelease = false;
    if (target > 0.22 && !this.needRelease) {
      if (!this.drawing) { this.drawing = true; this.drawT = 0; this.charge = 0; }
      this.drawT += dt; this.gap = 0;
      this.charge += this.fed + hold * HOLD_PX * dt;
      if (this.drawT >= pace.blink) this._end(true);
    } else if (this.drawing) {
      this.gap += dt; this.charge += this.fed;
      if (this.gap > pace.gap) this._end(false);
    }
    this.fed = 0;
    if (this.drawing || hold) this.awakeT = this.clock;

    // the exhale comes out of you, but a little vapour curls off the mouthpiece too
    while (this.exhaleQ.length && this.exhaleQ[0].at <= this.clock) {
      const e = this.exhaleQ.shift();
      this._emit('exhale', e.amount, e.blinker);
      const p = this.tiltG.localToWorld(this.mouth.clone());
      const n = Math.round(10 + 14 * e.amount);
      for (let i = 0; i < n; i++) this.fx.smoke.spawn(p.x + rnd(-0.2, 0.2), p.y, p.z + rnd(-0.2, 0.2), rnd(-0.8, 0.8), rnd(0.8, 2.4), rnd(-0.8, 0.8), rnd(1.6, 3), rnd(0.3, 0.6), rnd(2, 3.6), rnd(0.05, 0.09), 0, 0, 0);
    }

    this.blinkT = Math.max(0, this.blinkT - dt / 0.95);
    const flashing = this.blinkT > 0 && Math.floor((1 - this.blinkT) * 6) % 2 === 0;
    const awake = this.clock - this.awakeT < 6;
    this.inhale = damp(this.inhale, this.drawing ? 1 : 0, this.drawing ? 0.35 : 0.5, dt);
    this.glow = damp(this.glow, this.drawing || flashing ? 1 : awake ? 0.5 : 0.22, 0.12, dt);
    const k = 0.7 + 1.9 * this.glow + (flashing ? 1.2 : 0);
    this.screenMat.color.setScalar(k);
    this.led.intensity = (this.drawing ? 5 + 2 * Math.sin(t * 9) : 0) + (flashing ? 14 : 0);
    this.led.color.set(flashing ? 0xfff0b0 : this.brand.device.led);

    if (this.clock - this.screenAt > (this.drawing || this.blinkT > 0 ? 1 / 24 : 0.25)) {
      this.screenAt = this.clock;
      drawScreen(this.screen.g, 192, 640, {
        glow: this.glow, batt: this.battery, liquid: this.liquid, drawing: this.drawing, t,
        draw: Math.min(1, this.drawT / pace.blink), charge: this.drawing ? this.drawT / pace.blink : 0, flash: flashing ? 0.85 : 0,
      });
      this.screen.t.needsUpdate = true;
    }

    // pose: idle sway, tipped towards you while drawing, a little shake on the blinker
    if (!this.grabbed) {
      this.yawVel *= Math.exp(-dt * 2.2);
      this.yaw += this.yawVel * dt;
      if (Math.abs(this.yawVel) < 0.4) this.yaw = damp(this.yaw, REST_YAW + 0.2 * Math.sin(t * 0.33), 1.2, dt);
      this.tilt = damp(this.tilt, 0, 0.6, dt);
    }
    this.appear = damp(this.appear, 1, 0.12, dt);
    this.swapT = Math.max(0, this.swapT - dt / 0.8);
    const pop = this.swapT > 0 ? 1 - Math.sin(Math.PI * this.swapT) * 0.35 : 1;
    this.yawG.scale.setScalar(Math.max(1e-3, this.appear * pop));
    this.yawG.rotation.y = this.yaw + this.swapT * Math.PI * 2;
    this.yawG.position.y = Math.sin(t * 0.8) * 0.1;
    const shake = this.blinkT > 0 ? Math.sin(t * 70) * 0.03 * this.blinkT : 0;
    this.tiltG.rotation.set(this.tilt - 0.3 * this.inhale, 0, shake);
    this.tiltG.position.z = 1.6 * this.inhale;
  }
}
