import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Cigarette } from './cigarette.js';
import { createFx } from './fx.js';
import { Pack } from './pack.js';
import { Tracker } from './stats.js';
import { createPanel, fmtDur } from './panel.js';
import { BRANDS, brand as getBrand, isVape } from './brands.js';
import { Vape } from './vape.js';
import { createCloud } from './cloud.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
{ // soft dark backdrop
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(128, 118, 0, 128, 128, 180);
  grad.addColorStop(0, '#1b1a1d'); grad.addColorStop(0.55, '#0d0d0f'); grad.addColorStop(1, '#050506');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  scene.background = tex;
}
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.3;

const camera = new THREE.PerspectiveCamera(28, 1, 0.5, 200);
const LOOK = new THREE.Vector3(0, 1.5, 0);

const key = new THREE.DirectionalLight(0xfff1e0, 1.55); key.position.set(-4, 7, 6);
const rim = new THREE.DirectionalLight(0xbcd0ff, 1.3); rim.position.set(5, 3, -7);
const fill = new THREE.DirectionalLight(0xffe2c8, 0.3); fill.position.set(4, -3, 5);
scene.add(key, rim, fill);

const timeU = { value: 0 };
const fx = createFx(scene, camera);
const tracker = new Tracker();
const cig = new Cigarette(scene, fx, timeU, { brand: tracker.cigBrand });
const pack = new Pack(scene, tracker.cigBrand, tracker.left(tracker.cigBrand));
let mode = isVape(tracker.brand);       // true while a Geek Bar is in hand
const vape = new Vape(scene, fx, { brand: mode ? tracker.brand : 'geekbar', left: mode ? tracker.puffsLeft() : undefined });
vape.root.position.set(0, 1.3, 0);
vape.root.visible = mode;
const cloud = createCloud(document.body, { z: 5 });
vape.on('hit', (h) => { const { left, opened } = tracker.hit(h, vape.brand.id); vape.setLeft(left, opened); });
vape.on('exhale', (amount, blinker) => cloud.burst(amount, { blinker }));

cig.on('light', () => tracker.clearHand());
cig.on('drag', () => tracker.drag());
cig.on('burn', (f) => tracker.burn(f, cig.brand.id));
cig.on('pop', () => tracker.pop());

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.45, 1.25);
composer.addPass(bloom);
composer.addPass(new OutputPass());

let baseDist = 26;
function resize() {
  const w = innerWidth, h = innerHeight, pr = Math.min(devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pr); renderer.setSize(w, h, false);
  composer.setPixelRatio(pr); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  baseDist = Math.max(26, 11.5 / (2 * Math.tan(THREE.MathUtils.degToRad(14)) * camera.aspect));
  // the pack sits to the left of the cigarette, or under it on a tall screen
  const halfW = baseDist * Math.tan(THREE.MathUtils.degToRad(14)) * camera.aspect;
  if (camera.aspect < 1) { pack.root.position.set(0, -4.2, 0); pack.root.scale.setScalar(0.82); pack.yaw = 0.35; }
  else {
    const k = Math.min(0.9, Math.max(0.6, (halfW - 4.2) / 7));
    pack.root.position.set(-(4.2 + 3.0 * k), 0.8, -0.5); pack.root.scale.setScalar(k); pack.yaw = 0.5;
  }
}
addEventListener('resize', resize); resize();

/* ------------------------------------------------------------------ input */
const input = { hold: 0, energy: 0 };
const $ = (id) => document.getElementById(id);
const btn = { light: $('light'), drag: $('drag'), ash: $('ash'), stub: $('stub'), pop: $('pop'), stats: $('stats') };
const hud = $('hud');
let away = localStorage.getItem('cig:away') === '1';   // put away: hidden, nothing tracked
const panel = createPanel(document, tracker, { onBrand: setBrand, away: { get: () => away, toggle: () => setAway(!away) } });
function setAway(v) {
  away = v;
  try { localStorage.setItem('cig:away', v ? '1' : '0'); } catch { /* storage blocked */ }
  if (!v) { if (mode) vape.root.visible = true; else pack.root.visible = true; }
  document.getElementById('ui').hidden = v;
  shown = ''; hudAt = 0;
}
let lastActive = -1e9;

// scrolling = dragging on it. Wheel energy leaks away, so the pull follows the scroll.
function pull(px) { input.energy = Math.min(input.energy + Math.min(Math.abs(px), 160), 900); lastActive = performance.now(); }
addEventListener('wheel', (e) => {
  e.preventDefault();
  const px = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
  if (away) return;
  pull(px); tracker.scroll(px);
  if (mode) vape.feed(px);
}, { passive: false });

// the stub shrinks away, the pack opens and the next one slides out
const stage = { k: 1, target: 1 };
function takeNew() {
  if (pack.anim?.kind === 'take') return;
  stage.target = 0;
  const id = tracker.cigBrand, { left, opened } = tracker.take(id);
  pack.take({ left, refill: opened, brand: id, onOut: () => { cig.reset(); cig.setBrand(id); stage.target = 1; } });
}
function lightOrNew() { if (cig.state === 'fresh') cig.light(); else if (cig.state === 'out') takeNew(); }
function setBrand(id) {
  const was = mode;
  tracker.setBrand(id);
  mode = isVape(id);
  if (mode) {
    vape.setDevice(id, tracker.puffsLeft(id));
    if (!was) vape.show();
  } else {
    vape.root.visible = false;
    pack.root.visible = true;
    // back from the Geek Bar to the cigarette still burning: carry on with it
    const resume = was && cig.brand.id === id && stage.target === 1 && cig.state !== 'out' && cig.state !== 'fresh';
    if (!resume) {
      // a new brand means a new cigarette: finish any hand-off, return an unlit one, take one from the new pack
      if (pack.anim?.kind === 'take') pack._finish();
      if (!was && cig.state === 'fresh' && stage.target === 1) tracker.putBack(cig.brand.id);
      takeNew();
    }
  }
  shown = ''; hudAt = 0;
}
function cycleBrand(dir = 1) {
  const i = BRANDS.findIndex((b) => b.id === tracker.brand);
  setBrand(BRANDS[(i + dir + BRANDS.length) % BRANDS.length].id);
}
const holdOn = () => { input.hold = 1; btn.drag.classList.add('on'); lastActive = performance.now(); };
const holdOff = () => { input.hold = 0; btn.drag.classList.remove('on'); };

btn.light.addEventListener('click', lightOrNew);
btn.ash.addEventListener('click', () => cig.ash());
btn.stub.addEventListener('click', () => cig.stub());
btn.pop.addEventListener('click', () => cig.pop());
btn.stats.addEventListener('click', () => panel.toggle());
btn.drag.addEventListener('pointerdown', (e) => { btn.drag.setPointerCapture(e.pointerId); holdOn(); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) btn.drag.addEventListener(ev, holdOff);

addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey) return;
  if (e.code === 'KeyT') return panel.toggle();
  if (e.code === 'KeyH') return setAway(!away);
  if (panel.isOpen) return;
  if (e.code === 'Space') { e.preventDefault(); holdOn(); }
  else if (e.code === 'KeyB') cycleBrand(e.shiftKey ? -1 : 1);
  else if (mode) return;
  else if (e.code === 'KeyP') cig.pop();
  else if (e.code === 'KeyL') lightOrNew();
  else if (e.code === 'KeyA') cig.ash();
  else if (e.code === 'KeyS') cig.stub();
});
addEventListener('keyup', (e) => { if (e.code === 'Space') holdOff(); });
addEventListener('blur', holdOff);

// grab to spin it; click the pack for stats
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function overPack(e) {
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  return mode ? vape.hit(ray) : pack.hit(ray);
}
let px = 0, py = 0, pt = 0, down = null;
const held = () => (mode ? vape : cig);
canvas.addEventListener('pointerdown', (e) => {
  if (!mode && overPack(e)) { panel.open(); return; }
  down = { x: e.clientX, y: e.clientY };
  canvas.setPointerCapture(e.pointerId); canvas.classList.add('dragging');
  held().grabbed = true; held().yawVel = 0; px = e.clientX; py = e.clientY; pt = performance.now();
});
canvas.addEventListener('pointermove', (e) => {
  const h = held();
  if (!h.grabbed) { canvas.style.cursor = overPack(e) ? 'pointer' : ''; return; }
  const now = performance.now(), dts = Math.max(0.004, (now - pt) / 1000);
  const dy = (e.clientX - px) * 0.008;
  h.yaw += dy;
  h.yawVel = h.yawVel * 0.6 + (dy / dts) * 0.4;
  h.tilt = Math.min(0.75, Math.max(-0.6, h.tilt - (e.clientY - py) * 0.005));
  px = e.clientX; py = e.clientY; pt = now;
});
for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, (e) => {
  const h = held();
  if (mode && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 5 && overPack(e)) panel.open();
  down = null;
  h.grabbed = false; canvas.classList.remove('dragging');
  if (performance.now() - pt > 80) h.yawVel = 0;
  h.yawVel = Math.max(-9, Math.min(9, h.yawVel));
});

let shown = '';
let hudAt = 0;
function syncHud(now) {
  if (now - hudAt < 400) return;
  hudAt = now;
  if (away) { hud.innerHTML = 'Put away · nothing is being tracked<span>H, or Stats → Bring it back</span>'; return; }
  const s = tracker.snapshot().session, b = getBrand(tracker.brand);
  if (mode) {
    hud.innerHTML = `<b>${s.puffs}</b> puff${s.puffs === 1 ? '' : 's'} · <b>${s.blinkers}</b> blinker${s.blinkers === 1 ? '' : 's'} · <b>${fmtDur(s.activeMs)}</b> scrolling · <b>${s.nic.toFixed(1)}</b> mg nicotine`
      + `<span>${b.name} · ${b.flavour} · ${tracker.puffsLeft().toLocaleString()} / ${b.puffs.toLocaleString()} puffs left</span>`;
    return;
  }
  hud.innerHTML = `<b>${s.cigs}</b> cig${s.cigs === 1 ? '' : 's'} · <b>${(s.cigs / 20).toFixed(2)}</b> packs · <b>${fmtDur(s.activeMs)}</b> scrolling · <b>${s.tar.toFixed(1)}</b> mg tar`
    + `<span>${b.name} · ${tracker.left()} / 20 left in pack</span>`;
}
function syncUi() {
  const pop = !mode && cig.canPop;
  if (btn.pop.hidden === pop) btn.pop.hidden = !pop;
  const key = mode ? 'vape' : cig.state;
  if (key === shown) return;
  shown = key;
  for (const b of [btn.light, btn.ash, btn.stub]) b.hidden = mode;
  btn.drag.textContent = mode ? 'Hit' : 'Drag';
  btn.drag.title = mode ? 'Hold, or keep scrolling. Hold it (5 s, or 8 s on realistic) for a blinker' : 'Hold — or scroll / hold Space';
  btn.stats.title = mode ? 'T, or click the Geek Bar. B cycles brands' : 'T — or click the pack. B cycles brands';
  if (mode) { btn.drag.disabled = false; return; }
  const lit = shown === 'lit';
  btn.light.textContent = shown === 'out' ? 'New' : 'Light';
  btn.light.disabled = !(shown === 'fresh' || shown === 'out');
  btn.drag.disabled = btn.ash.disabled = btn.stub.disabled = !lit;
}

/* ------------------------------------------------------------------- loop */
const sim = { speed: 1, zoom: 1, lookX: 0 };
let last = performance.now(), time = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 24) * sim.speed;
  last = now; time += dt; timeU.value = time;

  input.energy *= Math.exp(-dt / 0.28);
  const target = Math.max(input.hold, 1 - Math.exp(-input.energy / 260));
  if (away) { cig.yawG.visible = false; vape.root.visible = false; pack.root.visible = false; }
  else if (mode) {
    vape.update(dt, time, target, input.hold);
    cig.yawG.visible = false; pack.root.visible = false;
  } else {
    cig.update(dt, time, target);
    pack.update(dt, time);
    stage.k += (stage.target - stage.k) * (1 - Math.exp(-dt / 0.09));
    cig.yawG.scale.setScalar(Math.max(1e-3, stage.k));
    cig.yawG.visible = stage.k > 0.01;
  }
  fx.update(dt, time);

  if (!away && now - lastActive < 2500 && !document.hidden) tracker.active(dt / sim.speed * 1000);
  tracker.flush();
  syncHud(now);

  const inh = mode ? vape.inhale : cig.inhale;
  const dist = baseDist * sim.zoom * (1 - 0.035 * inh);
  LOOK.x = sim.lookX;
  camera.position.set(sim.lookX, 2.2, dist);
  camera.lookAt(LOOK);
  bloom.strength = 0.5 + 0.2 * inh;

  syncUi();
  composer.render();
}
requestAnimationFrame(frame);
if (away) setAway(true);
addEventListener('pagehide', () => tracker.flush(true));

// first visit: shake one out of the pack; a taken-but-unlit one survives a reload
if (mode) { stage.k = stage.target = 0; pack.root.visible = false; vape.show(); }
else if (tracker.hand) cig.setBrand(tracker.hand.brand);
else { stage.k = stage.target = 0; setTimeout(takeNew, 650); }

// handle for the extension layer (and the console)
window.cig = { cig, pack, vape, cloud, tracker, panel, sim, pull, setBrand, takeNew, get mode() { return mode; }, hold: (v) => (v ? holdOn() : holdOff()) };
