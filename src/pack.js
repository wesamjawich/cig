// A 20-cigarette flip-top hard pack. Units are cm, like the cigarette.
// Root origin is the centre of the pack; the lid hinges at the back of the top edge.
import * as THREE from '../vendor/three/build/three.module.js';
import { brand as getBrand } from './brands.js';
import { R } from './cigarette.js';

export const PW = 5.6, PH = 8.8, PD = 2.3;
const LID = 2.5, BODY = PH - LID;
const FILTER_TOP = BODY + 0.8;
const PULL = 4.2;                     // how far a cigarette slides out before it is "taken"

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const damp = (cur, target, tau, dt) => cur + (target - cur) * (1 - Math.exp(-dt / tau));

/* ------------------------------------------------------------------ slots */
// 7-6-7 rows, the way they come out of the machine. Taken front row first, from the middle out.
const SLOTS = [];
{
  const rows = [[7, 0.675], [6, 0], [7, -0.675]];
  for (const [n, z] of rows) {
    const order = [];
    for (let i = 0; i < n; i++) order.push(i);
    order.sort((a, b) => Math.abs(a - (n - 1) / 2) - Math.abs(b - (n - 1) / 2) || a - b);
    for (const i of order) SLOTS.push(new THREE.Vector3((i - (n - 1) / 2) * 0.78, 0, z));
  }
}

/* --------------------------------------------------------------- printing */
const srgb = (rgb) => '#' + new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]).getHexString();

function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function fit(g, text, maxW, size, font) {
  let s = size;
  g.font = font.replace('$', s);
  while (g.measureText(text).width > maxW && s > 8) { s -= 2; g.font = font.replace('$', s); }
}

function star(g, x, y, r, rot = -Math.PI / 2, inner = 0.42) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5, rr = i % 2 ? r * inner : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
}

function background(g, w, h, p) {
  if (p.bg2) {
    const gr = g.createLinearGradient(0, 0, w * 0.3, h);
    gr.addColorStop(0, p.bg); gr.addColorStop(1, p.bg2);
    g.fillStyle = gr;
  } else g.fillStyle = p.bg;
  g.fillRect(0, 0, w, h);
}

function warning(g, w, h, y, text, big) {
  const m = 26;
  g.fillStyle = '#fff'; g.fillRect(m, y, w - m * 2, h - y - m);
  g.strokeStyle = '#000'; g.lineWidth = 10; g.strokeRect(m + 5, y + 5, w - m * 2 - 10, h - y - m - 10);
  g.fillStyle = '#000'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lines = text.split('\n');
  const size = big ? 52 : 40, lh = size * 1.12;
  const y0 = y + (h - y - m) / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => { fit(g, l, w - m * 2 - 44, size, '800 $px "Helvetica Neue", Arial, sans-serif'); g.fillText(l, w / 2, y0 + i * lh); });
}

const ART = {
  roof(g, w, h, b) {
    const p = b.pack;
    g.fillStyle = p.accent;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(w, 0); g.lineTo(w, 250); g.lineTo(w / 2, 120); g.lineTo(0, 250); g.closePath(); g.fill();
    g.strokeStyle = p.accent2; g.lineWidth = 6;
    g.beginPath(); g.moveTo(0, 268); g.lineTo(w / 2, 138); g.lineTo(w, 268); g.stroke();
    g.fillStyle = p.accent2; g.beginPath(); g.arc(w / 2, 225, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = p.accent; star(g, w / 2, 226, 18); g.fill();
    g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    fit(g, 'CLASSIC', w - 70, 96, '700 $px Georgia, "Times New Roman", serif'); g.fillText('CLASSIC', w / 2, 360);
    g.font = '600 30px "Helvetica Neue", Arial, sans-serif'; g.fillStyle = p.accent;
    g.letterSpacing = '12px'; g.fillText('GOLD', w / 2 + 6, 408); g.letterSpacing = '0px';
    g.fillStyle = '#6d655a'; g.font = 'italic 22px Georgia, serif'; g.fillText('Fine Scrolling Tobacco', w / 2, 452);
  },
  wave(g, w, h, b) {
    const p = b.pack;
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 9;
    for (let k = 0; k < 3; k++) {
      g.beginPath();
      for (let x = -10; x <= w + 10; x += 8) g.lineTo(x, 110 + k * 34 + Math.sin(x / 52 + k) * 16);
      g.stroke();
    }
    g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    fit(g, 'MENTHOL', w - 60, 92, '900 $px "Helvetica Neue", Arial, sans-serif'); g.fillText('MENTHOL', w / 2, 330);
    // the capsule
    const cx = w / 2, cy = 410;
    const gr = g.createRadialGradient(cx - 14, cy - 14, 4, cx, cy, 42);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, p.bg2); gr.addColorStop(1, p.accent2);
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, 40, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#fff'; g.font = '800 26px "Helvetica Neue", Arial, sans-serif';
    g.fillText('CLICK  ·  POP', w / 2, 488);
  },
  stars(g, w, h, b) {
    const p = b.pack;
    // a field of small silver stars, the ones inside a big "7" printed gold
    const seven = new Path2D();
    seven.moveTo(120, 96); seven.lineTo(400, 96); seven.lineTo(400, 150);
    seven.lineTo(268, 540); seven.lineTo(196, 540); seven.lineTo(318, 160); seven.lineTo(120, 160); seven.closePath();
    for (let y = 92, r = 0; y < 560; y += 21, r++) {
      for (let x = 14 + (r % 2) * 10.5; x < w; x += 21) {
        const in7 = g.isPointInPath(seven, x, y);
        g.fillStyle = in7 ? p.accent2 : p.accent; g.globalAlpha = in7 ? 0.75 : 0.55;
        star(g, x, y, in7 ? 6 : 4.6); g.fill();
      }
    }
    g.globalAlpha = 1;
    g.fillStyle = p.tab; g.fillRect(150, 0, 212, 74);
    g.fillStyle = '#fff';
    for (let i = 0; i < 7; i++) { star(g, 176 + i * 26.5, 38, 8); g.fill(); }
    g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    fit(g, 'SevenStars', w - 60, 104, '500 $px "Times New Roman", Times, serif'); g.fillText('SevenStars', w / 2, 352);
    g.font = '13px "Helvetica Neue", Arial, sans-serif'; g.fillText('KING SIZE', w / 2, 400);
    g.fillStyle = '#3b3326'; g.font = 'italic 600 40px "Times New Roman", Times, serif'; g.fillText('Charcoal Filter', w / 2, 520);
  },
  arc(g, w, h, b) {
    const p = b.pack;
    // halftone dots fading in towards the lower right
    for (let y = 40; y < 560; y += 14) for (let x = 10; x < w; x += 14) {
      const k = Math.max(0, Math.min(1, (x / w) * 0.9 + (y / 560) * 0.6 - 0.55));
      if (k <= 0) continue;
      g.fillStyle = `rgba(125,136,224,${0.55 * k})`; g.beginPath(); g.arc(x, y, 1 + 3.2 * k, 0, Math.PI * 2); g.fill();
    }
    // the arc: a crescent that brightens from white into gold
    const gr = g.createLinearGradient(80, 520, 470, 60);
    gr.addColorStop(0, 'rgba(244,239,227,0)'); gr.addColorStop(0.35, p.accent); gr.addColorStop(1, p.ink);
    g.fillStyle = gr; g.beginPath();
    g.moveTo(60, 530); g.quadraticCurveTo(470, 430, 452, 60); g.quadraticCurveTo(440, 400, 60, 530); g.fill();
    // swoosh emblem
    g.strokeStyle = p.accent; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.ellipse(410, 214, 30, 15, -0.2, Math.PI * 0.15, Math.PI * 1.05); g.stroke();
    g.beginPath(); g.ellipse(410, 214, 30, 15, -0.2, Math.PI * 1.15, Math.PI * 2.05); g.stroke();
    g.fillStyle = p.ink; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    fit(g, 'MEVIUS', 320, 86, '600 $px Optima, Candara, "Gill Sans", sans-serif'); g.fillText('MEVIUS', 46, 252);
    g.font = '600 22px Optima, Candara, "Gill Sans", sans-serif'; g.letterSpacing = '8px'; g.fillText('ORIGINAL', 50, 292); g.letterSpacing = '0px';
    g.font = '600 40px Optima, Candara, sans-serif'; g.textAlign = 'right'; g.fillText('10', w - 46, 530);
  },
  devil(g, w, h, b) {
    const p = b.pack;
    g.strokeStyle = '#5c5d61'; g.lineWidth = 4; g.strokeRect(18, 18, w - 36, 526);
    g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    fit(g, 'BLACK DEVIL', w - 70, 76, '$px "Chalkduster", "Marker Felt", "Bradley Hand", fantasy');
    g.save(); g.translate(w / 2, 168); g.rotate(-0.04); g.fillText('BLACK DEVIL', 0, 0); g.restore();
    g.font = 'italic 34px "Snell Roundhand", "Apple Chancery", "Brush Script MT", cursive'; g.fillStyle = '#9a9b9f';
    g.fillText('Special Flavour', w / 2 - 40, 222);
    // red seal with the grinning devil and his trident
    const cx = w / 2 + 70, cy = 390, r = 92;
    g.fillStyle = p.accent2; g.beginPath(); g.arc(cx, cy, r + 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = p.accent; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0a0a0a';
    g.beginPath(); g.arc(cx - 10, cy - 6, 36, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(cx - 10, cy + 52, 34, 26, 0, Math.PI, Math.PI * 2); g.fill();
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx - 10 + s * 18, cy - 34); g.lineTo(cx - 10 + s * 34, cy - 64); g.lineTo(cx - 10 + s * 32, cy - 26); g.fill(); }
    g.strokeStyle = p.accent; g.lineWidth = 4; g.beginPath(); g.arc(cx - 10, cy + 2, 18, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    g.fillStyle = p.accent; for (const s of [-1, 1]) { g.beginPath(); g.arc(cx - 10 + s * 13, cy - 14, 5, 0, Math.PI * 2); g.fill(); }
    g.strokeStyle = '#d7d8dc'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + 44, cy + 70); g.lineTo(cx + 44, cy - 50); g.stroke();
    g.beginPath(); g.moveTo(cx + 26, cy - 72); g.lineTo(cx + 26, cy - 50); g.lineTo(cx + 62, cy - 50); g.lineTo(cx + 62, cy - 72); g.moveTo(cx + 44, cy - 50); g.lineTo(cx + 44, cy - 78); g.stroke();
    g.fillStyle = p.ink; g.font = '600 17px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'left';
    g.fillText('20 BLACK', 50, 470); g.fillText('FILTER CIGARETTES', 50, 494);
  },
  kretek(g, w, h, b) {
    const p = b.pack;
    g.strokeStyle = p.accent; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, 520);
    g.lineWidth = 2; g.strokeRect(34, 34, w - 68, 492);
    for (const [x, y] of [[34, 34], [w - 34, 34], [34, 526], [w - 34, 526]]) {
      g.fillStyle = p.accent; g.beginPath(); g.moveTo(x, y - 14); g.lineTo(x + 14, y); g.lineTo(x, y + 14); g.lineTo(x - 14, y); g.fill();
    }
    // clove sprig
    g.strokeStyle = p.accent; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(w / 2, 300); g.lineTo(w / 2, 150); g.stroke();
    for (const [dx, dy] of [[-60, 170], [60, 190], [-46, 230], [44, 250]]) {
      g.beginPath(); g.moveTo(w / 2, dy + 30); g.lineTo(w / 2 + dx, dy); g.stroke();
      g.fillStyle = p.accent2; g.beginPath(); g.arc(w / 2 + dx, dy, 13, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = p.ink; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    fit(g, 'KRETEK', w - 90, 88, '700 $px Georgia, "Times New Roman", serif'); g.fillText('KRETEK', w / 2, 400);
    g.font = 'italic 26px Georgia, serif'; g.fillText('clove cigarettes', w / 2, 446);
  },
};

function frontArt(b, back) {
  return canvas(512, 805, (g, w, h) => {
    background(g, w, h, b.pack);
    if (back) {
      g.fillStyle = b.pack.ink; g.textAlign = 'center'; g.globalAlpha = 0.85;
      fit(g, b.name.toUpperCase(), w - 80, 44, '700 $px "Helvetica Neue", Arial, sans-serif'); g.fillText(b.name.toUpperCase(), w / 2, 300);
      g.globalAlpha = 1;
      warning(g, w, h, 340, 'Doomscrolling\nseriously harms\nyou and others\naround you', true);
    } else {
      ART[b.pack.style](g, w, h, b);
      warning(g, w, h, 572, 'SCROLLING KILLS');
    }
  });
}

function sideArt(b) {
  return canvas(134, 805, (g, w, h) => {
    background(g, w, h, b.pack);
    g.save(); g.translate(w / 2, h * 0.42); g.rotate(-Math.PI / 2);
    g.fillStyle = b.pack.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, b.name.toUpperCase(), 420, 48, '700 $px "Helvetica Neue", Arial, sans-serif'); g.fillText(b.name.toUpperCase(), 0, 0);
    g.restore();
    g.fillStyle = b.pack.accent; g.font = '700 18px "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center';
    g.fillText('20', w / 2, h - 96); g.font = '600 11px "Helvetica Neue", Arial, sans-serif'; g.fillText('CIGARETTES', w / 2, h - 76);
  });
}

function capArt(b, bottom) {
  return canvas(512, 210, (g, w, h) => {
    background(g, w, h, b.pack);
    if (bottom) {
      g.fillStyle = '#fff'; g.fillRect(150, 50, 212, 110); g.fillStyle = '#000';
      for (let x = 162, i = 0; x < 350; i++) { const bw = 2 + ((i * 7) % 5); g.fillRect(x, 60, bw, 80); x += bw + 2 + ((i * 3) % 3); }
      return;
    }
    g.fillStyle = b.pack.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    fit(g, b.name.toUpperCase(), w - 120, 54, '700 $px "Helvetica Neue", Arial, sans-serif'); g.fillText(b.name.toUpperCase(), w / 2, h / 2);
  });
}

function speckle(w, h, base, alt, amount, dark = 0) {
  return canvas(w, h, (g) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * h * 0.06 * amount; i++) {
      g.fillStyle = Math.random() < dark ? '#1a1a1a' : alt;
      g.globalAlpha = 0.25 + Math.random() * 0.5;
      g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    g.globalAlpha = 1;
  });
}

/* ------------------------------------------------------------------- pack */
const slice = (tex, v0, v1) => { const t = tex.clone(); t.offset.set(0, v0); t.repeat.set(1, v1 - v0); t.needsUpdate = true; return t; };

export class Pack {
  constructor(scene, brandId = 'classic', left = 20) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.swing = new THREE.Group();            // swap animation moves this
    this.root.add(this.swing);
    this.inner = new THREE.Group();
    this.inner.position.y = -PH / 2;
    this.swing.add(this.inner);

    const card = (o = {}) => new THREE.MeshPhysicalMaterial({ roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25, ...o });
    this.mats = {
      bodyFront: card(), bodyBack: card(), bodyR: card(), bodyL: card(), bottom: card(),
      lidFront: card(), lidBack: card(), lidR: card(), lidL: card(), lidTop: card(),
      collar: card({ clearcoat: 0.2 }), inside: new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9, side: THREE.BackSide }),
      lidInside: new THREE.MeshStandardMaterial({ color: 0xe9e4da, roughness: 0.9 }),
      foil: new THREE.MeshStandardMaterial({ color: 0xd4d6da, metalness: 1, roughness: 0.32, side: THREE.DoubleSide }),
      tip: new THREE.MeshStandardMaterial({ roughness: 0.7 }), face: new THREE.MeshStandardMaterial({ roughness: 0.95 }),
    };
    const none = new THREE.MeshBasicMaterial({ visible: false });
    const M = this.mats;

    const bodyG = new THREE.BoxGeometry(PW, BODY, PD); bodyG.translate(0, BODY / 2, 0);
    this.inner.add(new THREE.Mesh(bodyG, [M.bodyR, M.bodyL, none, M.bottom, M.bodyFront, M.bodyBack]));
    const linerG = new THREE.BoxGeometry(PW - 0.03, BODY - 0.03, PD - 0.03); linerG.translate(0, BODY / 2, 0);
    this.inner.add(new THREE.Mesh(linerG, [M.inside, M.inside, none, M.inside, M.inside, M.inside]));

    // inner frame card that the lid closes over
    const collarH = 1.5, collarY = BODY - 0.5;
    const cf = new THREE.Mesh(new THREE.BoxGeometry(PW - 0.1, collarH, 0.04), M.collar);
    cf.position.set(0, collarY + collarH / 2, PD / 2 - 0.06);
    const cl = new THREE.Mesh(new THREE.BoxGeometry(0.04, collarH, PD - 0.3), M.collar);
    cl.position.set(-(PW / 2 - 0.06), collarY + collarH / 2 - 0.25, 0.08);
    const cr = cl.clone(); cr.position.x *= -1;
    this.inner.add(cf, cl, cr);

    // torn-open foil round the bundle
    const foilG = new THREE.BoxGeometry(PW - 0.16, 0.9, PD - 0.18); foilG.translate(0, BODY + 0.05, 0);
    this.inner.add(new THREE.Mesh(foilG, [M.foil, M.foil, none, none, M.foil, M.foil]));

    // the twenty
    const cigG = new THREE.CylinderGeometry(R, R, 3.4, 28, 1);
    cigG.translate(0, -1.7, 0);
    this.cigs = new THREE.InstancedMesh(cigG, [M.tip, M.face, M.face], SLOTS.length);
    this.cigs.position.y = FILTER_TOP;
    this.inner.add(this.cigs);

    this.lid = new THREE.Group();
    this.lid.position.set(0, BODY, -PD / 2);
    const lidG = new THREE.BoxGeometry(PW, LID, PD); lidG.translate(0, LID / 2, PD / 2);
    this.lid.add(new THREE.Mesh(lidG, [M.lidR, M.lidL, M.lidTop, M.lidInside, M.lidFront, M.lidBack]));
    this.inner.add(this.lid);

    this.lidAngle = 0;
    this.anim = null;
    this.yaw = 0.5; this.tilt = 0.12;
    this.pulled = -1; this.pullY = 0;
    this.swapK = 1; this.swapDir = 0;
    this.setBrand(brandId);
    this.setCount(left);
  }

  setBrand(id) {
    const b = getBrand(id), M = this.mats;
    if (this.brandId === b.id && M.bodyFront.map) return;
    this.brandId = b.id;
    for (const m of Object.values(M)) { if (m.map) { m.map.dispose(); m.map = null; } }
    const front = frontArt(b, false), back = frontArt(b, true), side = sideArt(b);
    const v = BODY / PH;
    M.bodyFront.map = slice(front, 0, v); M.lidFront.map = slice(front, v, 1);
    M.bodyBack.map = slice(back, 0, v); M.lidBack.map = slice(back, v, 1);
    M.bodyR.map = slice(side, 0, v); M.lidR.map = slice(side, v, 1);
    M.bodyL.map = slice(side, 0, v); M.lidL.map = slice(side, v, 1);
    M.lidTop.map = capArt(b, false); M.bottom.map = capArt(b, true);
    M.collar.color.set(b.pack.bg2 || b.pack.bg);
    const k = b.look;
    M.tip.map = speckle(64, 128, srgb(k.tipA), srgb(k.tipB), k.cork > 0.5 ? 3 : 0.4);
    M.face.map = speckle(64, 64, srgb(k.filter), srgb(k.filter.map((c) => c * 0.8)), 2, k.charcoal * 0.5);
    for (const m of Object.values(M)) m.needsUpdate = true;
  }

  setCount(n) {
    this.left = Math.max(0, Math.min(SLOTS.length, n));
    const m = new THREE.Matrix4(), gone = SLOTS.length - this.left;
    SLOTS.forEach((p, i) => {
      if (i < gone && i !== this.pulled) m.makeScale(0, 0, 0);
      else m.makeTranslation(p.x, i === this.pulled ? this.pullY : 0, p.z);
      this.cigs.setMatrixAt(i, m);
    });
    this.cigs.instanceMatrix.needsUpdate = true;
  }

  get busy() { return !!this.anim; }

  // the slide-out: `left` is what remains after this one; `refill` means swap in a fresh pack first
  take({ left, refill = false, brand, onOut } = {}) {
    if (this.anim) { this._finish(); }
    this.anim = { kind: 'take', t: 0, left, onOut, brand, swap: refill || (brand && brand !== this.brandId) };
    this.anim.refill = refill;
    if (!this.anim.swap) this._startPull();
  }

  // swap to another pack without taking anything
  swapTo(brand, left) {
    if (this.anim) this._finish();
    this.anim = { kind: 'swap', t: 0, left, brand, swap: true };
  }

  _startPull() {
    const a = this.anim;
    const before = a.left + 1;
    this.setCount(before);
    this.pulled = SLOTS.length - before; this.pullY = 0;
    a.t = 0; a.swap = false;
  }

  _finish() {
    const a = this.anim; this.anim = null;
    if (a.brand) this.setBrand(a.brand);
    this.pulled = -1; this.pullY = 0; this.swapK = 1;
    this.setCount(a.left);
    if (a.kind === 'take' && !a.out && a.onOut) a.onOut();
  }

  update(dt, t) {
    let lidTarget = 0;
    const a = this.anim;
    if (a) {
      a.t += dt;
      if (a.swap) {
        // old pack spins away, new one spins in
        const out = ss(0, 0.4, a.t), inn = ss(0.4, 0.85, a.t);
        if (a.t >= 0.4 && !a.swapped) {
          a.swapped = true;
          if (a.brand) this.setBrand(a.brand);
          this.setCount(a.kind === 'take' ? a.left + 1 : a.left);
        }
        this.swapK = a.t < 0.4 ? 1 - out : inn;
        if (a.t >= 0.85) {
          this.swapK = 1;
          if (a.kind === 'swap') { this.anim = null; }
          else this._startPull();
        }
      } else if (a.kind === 'take') {
        lidTarget = a.t < 1.3 ? 1 : 0;
        this.pullY = PULL * ss(0.35, 1.05, a.t);
        this.setCount(a.left + 1);
        if (a.t >= 1.05 && !a.out) {
          a.out = true; this.pulled = -1; this.setCount(a.left);
          if (a.onOut) a.onOut();
        }
        if (a.t > 1.9) this.anim = null;
      }
    }
    lidTarget = Math.max(lidTarget, this.peek || 0);
    this.lidAngle = damp(this.lidAngle, lidTarget, lidTarget ? 0.12 : 0.18, dt);
    this.lid.rotation.x = -1.95 * this.lidAngle;

    const k = this.swapK;
    this.swing.scale.setScalar(0.35 + 0.65 * k);
    this.swing.rotation.y = (1 - k) * 2.2;
    this.swing.position.y = (1 - k) * -3;
    this.swing.visible = k > 0.02;
    this.root.rotation.set(this.tilt + 0.03 * Math.sin(t * 0.6), this.yaw + 0.08 * Math.sin(t * 0.4), 0.02 * Math.sin(t * 0.5));
  }

  hit(raycaster) { return raycaster.intersectObject(this.root, true).length > 0; }
}
