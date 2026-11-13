// The cigarette as a floating layer over a web page (X / Twitter).
// No addons and no import map here, so it can be loaded straight from an extension.
import * as THREE from '../vendor/three/build/three.module.js';
import { pace } from './pace.js';
import { Cigarette, L } from './cigarette.js';
import { createFx } from './fx.js';
import { Pack } from './pack.js';
import { Tracker } from './stats.js';
import { createPanel, fmtDur } from './panel.js';
import { BRANDS, isVape, brand as getBrand } from './brands.js';
import { Vape } from './vape.js';
import { createCloud } from './cloud.js';

const BOX_W = 520, BOX_H = 780;       // canvas size, CSS px
const PX_PER_CM = 24;                 // cigarette ≈ 200px long
const ORIGIN_UP = 150;                // cigarette centre, px above the bottom of the box
const HIT_W = 230, HIT_H = 84;
const LONG_PRESS = 550;               // ms
const SAVE_KEY = 'cig:v1';
const RESUME_WINDOW = 20 * 60e3;      // a lit cigarette left longer than this is gone

const CSS = `
:host { all: initial; }
.dim { position: fixed; inset: 0; z-index: 2147483645; pointer-events: none; opacity: 0;
  background: rgba(0,0,0,.8); backdrop-filter: grayscale(1) blur(1.5px); -webkit-backdrop-filter: grayscale(1) blur(1.5px);
  transition: opacity 1.8s ease; }
.dim.on { opacity: 1; }
.box { position: fixed; width: ${BOX_W}px; height: ${BOX_H}px; z-index: 2147483646; pointer-events: none; }
canvas { width: 100%; height: 100%; display: block; transition: opacity .35s ease;
  -webkit-mask-image: linear-gradient(to right, transparent, #000 16%, #000 84%, transparent), linear-gradient(to bottom, transparent, #000 26%);
  -webkit-mask-composite: source-in; mask-composite: intersect; }
canvas.fade { opacity: 0; }
.box.light canvas { filter: drop-shadow(0 5px 10px rgba(0,0,0,.28)); }
.hit { position: absolute; left: ${(BOX_W - HIT_W) / 2}px; bottom: ${ORIGIN_UP - HIT_H / 2}px; width: ${HIT_W}px; height: ${HIT_H}px;
  pointer-events: auto; cursor: pointer; touch-action: none; border-radius: 40px; -webkit-tap-highlight-color: transparent; }
.hit.moving { cursor: grabbing; }
.chip { position: absolute; left: 50%; bottom: ${ORIGIN_UP + HIT_H / 2 + 6}px; transform: translateX(-50%); pointer-events: auto; cursor: pointer;
  font: 600 10.5px/1 ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif; letter-spacing: .06em; text-transform: uppercase;
  white-space: nowrap; color: rgba(255,255,255,.72); background: rgba(20,20,22,.72); border: 1px solid rgba(255,255,255,.12);
  border-radius: 999px; padding: 6px 10px; opacity: 0; transition: opacity .2s ease; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.chip:hover { opacity: 1; }
.chip b { color: #fff; font-variant-numeric: tabular-nums; }
.box.light .chip { color: rgba(0,0,0,.6); background: rgba(255,255,255,.8); border-color: rgba(0,0,0,.1); }
.box.light .chip b { color: #000; }
.box.vape .hit { width: 150px; height: 200px; left: ${(BOX_W - 150) / 2}px; bottom: ${ORIGIN_UP - 80}px; border-radius: 28px; }
.box.vape .chip { bottom: ${ORIGIN_UP + 128}px; }
.bar { position: absolute; left: 50%; bottom: ${ORIGIN_UP + HIT_H / 2 + 38}px; transform: translateX(-50%); display: flex; align-items: center; gap: 4px;
  pointer-events: auto; opacity: 0; transition: opacity .2s ease; white-space: nowrap;
  font: 600 10.5px/1 ui-sans-serif, system-ui, -apple-system, "Helvetica Neue", sans-serif; letter-spacing: .06em; text-transform: uppercase; }
.box.vape .bar { bottom: ${ORIGIN_UP + 160}px; }
.box:has(.hit:hover, .chip:hover, .bar:hover) .bar, .box:has(.hit:hover, .chip:hover, .bar:hover) .chip, .box.peek .bar, .box.peek .chip, .bar.show, .bar:focus-within, .chip:focus-visible { opacity: 1; }
.bar button, .bar span { color: rgba(255,255,255,.8); background: rgba(20,20,22,.78); border: 1px solid rgba(255,255,255,.14); border-radius: 999px;
  padding: 6px 9px; font: inherit; letter-spacing: inherit; text-transform: inherit; -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); }
.bar button { cursor: pointer; }
.bar button:hover { color: #fff; background: rgba(40,40,44,.9); }
.bar button[hidden] { display: none; }
.bar [data-a="pop"] { color: #9ff3d6; border-color: rgba(120,240,200,.45); }
.box.light .bar button, .box.light .bar span { color: rgba(0,0,0,.7); background: rgba(255,255,255,.85); border-color: rgba(0,0,0,.12); }
.box.light .bar [data-a="pop"] { color: #0b7a5a; border-color: rgba(11,122,90,.4); }
.box.away canvas, .box.away .hit, .box.away .bar { visibility: hidden; }
.box.away .chip { opacity: .45; bottom: ${ORIGIN_UP - 10}px; }
.box.away .chip:hover { opacity: 1; }
`;

function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } }
function save(patch) { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ ...load(), ...patch })); } catch { /* storage blocked */ } }

export function mount() {
  if (window.__cigOverlay) return window.__cigOverlay;

  const host = document.createElement('div');
  host.id = 'cig-overlay';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${CSS}</style><div class="dim"></div><div class="box"><canvas></canvas><div class="hit"></div><div class="bar"><button data-a="prev" title="Previous brand (Alt+Shift+B)" aria-label="Previous brand">‹</button><span class="bn"></span><button data-a="next" title="Next brand (Alt+B)" aria-label="Next brand">›</button><button data-a="pop" title="Crush the capsule (Alt+P)" hidden>Pop</button><button data-a="away" title="Put it away, pauses tracking (Alt+H)">Hide</button></div><button class="chip" title="Stats · tar calculator · brands (Alt+T)"></button></div>`;
  document.documentElement.appendChild(host);
  const dim = root.querySelector('.dim'), box = root.querySelector('.box');
  const canvas = root.querySelector('canvas'), hit = root.querySelector('.hit'), chip = root.querySelector('.chip');

  /* ---------------------------------------------------------------- scene */
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(BOX_W, BOX_H, false);

  const scene = new THREE.Scene();
  { // small studio for reflections on the gold band
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(60, 16, 8), new THREE.MeshBasicMaterial({ color: 0x24242a, side: THREE.BackSide })));
    const panel = (color, x, y, z, s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(new THREE.Color(9, 8.4, 7.6), -22, 34, 22, 30);
    panel(new THREE.Color(3, 3.6, 5), 30, 14, -30, 26);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.04).texture;
    scene.environmentIntensity = 0.3;
    pmrem.dispose();
  }
  const key = new THREE.DirectionalLight(0xfff1e0, 1.55); key.position.set(-4, 7, 6);
  const rim = new THREE.DirectionalLight(0xbcd0ff, 1.3); rim.position.set(5, 3, -7);
  const fill = new THREE.DirectionalLight(0xffe2c8, 0.3); fill.position.set(4, -3, 5);
  scene.add(key, rim, fill);

  // world units are cm; frame it so 1cm = PX_PER_CM px and the origin sits ORIGIN_UP px above the bottom
  const halfH = BOX_H / PX_PER_CM / 2, fov = 28;
  const camera = new THREE.PerspectiveCamera(fov, BOX_W / BOX_H, 1, 400);
  const camY = halfH - ORIGIN_UP / PX_PER_CM;
  camera.position.set(0, camY, halfH / Math.tan(THREE.MathUtils.degToRad(fov / 2)));
  camera.lookAt(0, camY, 0);

  const timeU = { value: 0 };
  const fx = createFx(scene, camera, { glow: true });
  const tracker = new Tracker();
  const cig = new Cigarette(scene, fx, timeU, { sway: true, brand: tracker.cigBrand });
  cig.on('light', () => tracker.clearHand());
  cig.on('drag', () => tracker.drag());
  cig.on('burn', (f) => tracker.burn(f, cig.brand.id));
  cig.on('pop', () => tracker.pop());

  // the pack only shows up to hand over the next one
  const pack = new Pack(scene, tracker.cigBrand, tracker.left(tracker.cigBrand));
  pack.root.position.set(0, 6.8, -1.5); pack.yaw = 0.35;
  const packK = { k: 0, target: 0, hideAt: 0 };
  const stage = { k: 1, target: 1 };

  let mode = isVape(tracker.brand);     // a Geek Bar instead of a cigarette
  const vape = new Vape(scene, fx, { brand: mode ? tracker.brand : 'geekbar', left: mode ? tracker.puffsLeft() : undefined });
  vape.root.position.set(0, 0.9, 0); vape.root.scale.setScalar(0.8); vape.root.visible = mode;
  box.classList.toggle('vape', mode);
  const cloud = createCloud(root, { before: box });
  vape.on('hit', (h) => { const { left, opened } = tracker.hit(h, vape.brand.id); vape.setLeft(left, opened); });
  vape.on('exhale', (amount, blinker) => cloud.burst(amount, { blinker }));
  function setBrand(id) {
    const was = mode;
    tracker.setBrand(id);
    mode = isVape(id);
    box.classList.toggle('vape', mode);
    chipAt = 0; labelBrand();
    if (mode) { vape.setDevice(id, tracker.puffsLeft(id)); if (!was) vape.show(); return; }
    vape.root.visible = false;
    // back from the Geek Bar to the cigarette still burning: carry on with it
    if (was && cig.brand.id === id && stage.target === 1 && cig.state !== 'out' && cig.state !== 'fresh') return;
    // otherwise a new brand means a new cigarette out of the new pack
    if (pack.anim?.kind === 'take') pack._finish();
    if (!was && cig.state === 'fresh' && stage.target === 1) tracker.putBack(cig.brand.id);
    relight(true);
  }

  let away = !!load().away;             // put away: hidden, nothing tracked
  box.classList.toggle('away', away);
  function setAway(v) {
    away = v; save({ away: v }); box.classList.toggle('away', v); chipAt = 0;
    if (v) dim.classList.remove('on'); else lastY = scrollY;
  }
  const panel = createPanel(root, tracker, { onBrand: (id) => setBrand(id), away: { get: () => away, toggle: () => setAway(!away) } });
  chip.addEventListener('click', () => (away ? setAway(false) : panel.toggle()));

  // quick actions: a hover bar plus Alt shortcuts (X already owns the plain letter keys)
  const bar = root.querySelector('.bar'), popBtn = bar.querySelector('[data-a="pop"]'), brandLabel = bar.querySelector('.bn');
  let barTimer = 0, peekTimer = 0;
  function peekUi() { box.classList.add('peek'); clearTimeout(peekTimer); peekTimer = setTimeout(() => box.classList.remove('peek'), 2500); }
  function flashBar() { bar.classList.add('show'); clearTimeout(barTimer); barTimer = setTimeout(() => bar.classList.remove('show'), 1600); }
  function labelBrand() { const b = getBrand(tracker.brand); brandLabel.textContent = b.kind === 'vape' ? b.flavour : b.short; }
  function cycleBrand(dir) {
    const i = BRANDS.findIndex((b) => b.id === tracker.brand);
    setBrand(BRANDS[(i + dir + BRANDS.length) % BRANDS.length].id);
    if (panel.isOpen) panel.render(true);
    flashBar();
  }
  bar.addEventListener('click', (e) => {
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'prev') cycleBrand(-1); else if (a === 'next') cycleBrand(1); else if (a === 'pop') cig.pop(); else if (a === 'away') setAway(true);
  });
  addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.repeat) return;
    const t = e.composedPath()[0];
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.code === 'KeyP') { if (!mode) cig.pop(); }
    else if (e.code === 'KeyB') cycleBrand(e.shiftKey ? -1 : 1);
    else if (e.code === 'KeyT') panel.toggle();
    else if (e.code === 'KeyH') setAway(!away);
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  let chipAt = 0;
  function syncChip(now) {
    if (now - chipAt < 1000) return;
    chipAt = now;
    if (away) { chip.textContent = 'Put away · bring it back'; return; }
    const s = tracker.snapshot().session;
    if (mode) {
      chip.innerHTML = `<b>${s.puffs}</b> puff${s.puffs === 1 ? '' : 's'} · <b>${s.blinkers}</b> blinker${s.blinkers === 1 ? '' : 's'} · <b>${fmtDur(s.activeMs)}</b> · <b>${tracker.puffsLeft().toLocaleString()}</b> left`;
      return;
    }
    chip.innerHTML = `<b>${s.cigs}</b> cig${s.cigs === 1 ? '' : 's'} · <b>${(s.cigs / 20).toFixed(2)}</b> pk · <b>${fmtDur(s.activeMs)}</b> · <b>${tracker.left()}</b>/20`;
  }

  /* ------------------------------------------------------------ placement */
  // default: bottom of X's right-hand column; falls back to the bottom-right corner
  let custom = load().pos || null;      // { right, bottom } px of the cigarette centre, once the user has moved it
  function place() {
    let cx, bottom;
    if (custom) { cx = innerWidth - custom.right; bottom = custom.bottom; }
    else {
      const col = document.querySelector('[data-testid="sidebarColumn"]');
      const r = col && col.getBoundingClientRect();
      cx = r && r.width > 200 ? r.left + r.width / 2 : innerWidth - 170;
      bottom = ORIGIN_UP;
    }
    cx = Math.max(HIT_W / 2, Math.min(innerWidth - HIT_W / 2, cx));
    bottom = Math.max(HIT_H / 2, Math.min(innerHeight - HIT_H / 2, bottom));
    box.style.left = `${Math.round(cx - BOX_W / 2)}px`;
    box.style.top = `${Math.round(innerHeight - bottom + ORIGIN_UP - BOX_H)}px`;
    return { cx, bottom };
  }
  place();
  addEventListener('resize', place);
  let placeTries = 0;                   // the column renders after the script does
  const placeTimer = setInterval(() => { place(); if (++placeTries > 20) clearInterval(placeTimer); }, 500);

  let light = null;
  function syncTheme() {
    const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(document.body).backgroundColor || '');
    const [r, g, b, a = 1] = m ? m[1].split(',').map(Number) : [0, 0, 0, 1];
    const isLight = a > 0.5 && (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
    if (isLight === light) return;
    light = isLight;
    box.classList.toggle('light', light);
    fx.setDark(light ? 1 : 0);
    cloud.setLight(light);
  }
  syncTheme();
  setInterval(syncTheme, 2000);

  /* ---------------------------------------------------------------- input */
  // scrolling the page is the drag
  let energy = 0, lastY = scrollY, lastActive = -1e9;
  function pull(px) { energy = Math.min(energy + Math.min(Math.abs(px), 160), 900); lastActive = performance.now(); }
  document.addEventListener('scroll', () => {
    if (panel.isOpen || away) { lastY = scrollY; return; }
    const d = scrollY - lastY; lastY = scrollY;
    pull(d !== 0 ? d : 30);             // 0 = something other than the window scrolled
    tracker.scroll(d);
    if (mode) vape.feed(d || 30);
  }, { passive: true, capture: true });

  // the stub shrinks away, the pack rises, flips open and hands over the next one
  let fading = false, relightId = 0;
  function relight(force = false) {
    if ((fading && !force) || pack.anim?.kind === 'take') return;
    fading = true; stage.target = 0; packK.target = 1;
    const run = ++relightId, id = tracker.cigBrand, { left, opened } = tracker.take(id);
    pack.take({ left, refill: opened, brand: id, onOut: () => {
      cig.reset(); cig.setBrand(id); stage.target = 1;
      setTimeout(() => { if (run !== relightId) return; cig.light(); fading = false; persist(); }, 350);
      packK.hideAt = performance.now() + 1200;
    } });
  }

  // click = ash (or a fresh one when it's out) · long press = stub · drag = move
  let press = null;
  hit.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); hit.setPointerCapture(e.pointerId);
    press = { x: e.clientX, y: e.clientY, moved: false, long: false, from: place() };
    press.timer = setTimeout(() => { if (press && !press.moved && !mode) { press.long = true; cig.stub(); } }, LONG_PRESS);
  });
  hit.addEventListener('pointermove', (e) => {
    if (!press) return;
    const dx = e.clientX - press.x, dy = e.clientY - press.y;
    if (!press.moved && Math.hypot(dx, dy) < 6) return;
    if (press.long) return;
    press.moved = true; clearTimeout(press.timer); hit.classList.add('moving');
    custom = { right: innerWidth - (press.from.cx + dx), bottom: press.from.bottom - dy };
    place();
  });
  const release = (e) => {
    if (!press) return;
    peekUi();
    clearTimeout(press.timer); hit.classList.remove('moving');
    const p = press; press = null;
    if (p.moved) { const at = place(); custom = { right: innerWidth - at.cx, bottom: at.bottom }; save({ pos: custom }); return; }
    if (p.long || e.type === 'pointercancel') return;
    if (mode) { panel.open(); return; }
    if (cig.state === 'lit') cig.ash();
    else if (cig.state === 'out') relight();
    else if (cig.state === 'fresh') cig.light();
  };
  hit.addEventListener('pointerup', release);
  hit.addEventListener('pointercancel', release);
  hit.addEventListener('contextmenu', (e) => e.preventDefault());

  /* ---------------------------------------------------------- persistence */
  // one cigarette per sitting: reloading the page must not hand out a fresh one
  function persist() { save({ state: cig.state === 'out' || cig.state === 'stubbing' ? 'out' : cig.state === 'fresh' ? 'fresh' : 'lit', burn: cig.burn, t: Date.now() }); }
  {
    const s = load(), age = Date.now() - (s.t || 0);
    if (s.state === 'out' && age < RESUME_WINDOW) cig.restore(s.burn, true);
    else if (s.state === 'lit' && age < RESUME_WINDOW && s.burn < L - 0.2) cig.restore(s.burn - pace.idle * age / 1000, false);
    else if (mode) { stage.k = stage.target = 0; }
    else if (tracker.hand) setTimeout(() => cig.light(), 700);
    else { stage.k = stage.target = 0; setTimeout(relight, 700); }
  }
  setInterval(persist, 2000);
  addEventListener('pagehide', () => { persist(); tracker.flush(true); });

  /* ----------------------------------------------------------------- loop */
  let last = performance.now(), time = 0, asleep = false;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 1 / 24);
    last = now;

    if (!away && now - lastActive < 2500 && !document.hidden) tracker.active(dt * 1000);
    tracker.flush();
    syncChip(now);
    const canPop = !mode && cig.canPop;
    if (popBtn.hidden === canPop) popBtn.hidden = !canPop;
    if (away) return;                   // frozen where you left it

    const out = !mode && cig.state === 'out';
    dim.classList.toggle('on', out || (!mode && cig.state === 'stubbing' && cig.impact));
    hit.title = mode ? 'Stats' : out ? 'Light another' : '';
    // nothing moves once it is out and the last smoke has gone
    if (out && cig.wisp < 0.01 && fx.count === 0 && !fading && packK.k < 0.01) { if (asleep) return; asleep = true; }
    else asleep = false;

    time += dt; timeU.value = time;
    energy *= Math.exp(-dt / 0.28);
    const target = 1 - Math.exp(-energy / 260);
    if (mode) { vape.update(dt, time, target); packK.target = 0; } else cig.update(dt, time, target);
    if (packK.hideAt && now > packK.hideAt && !pack.busy) { packK.target = 0; packK.hideAt = 0; }
    packK.k += (packK.target - packK.k) * (1 - Math.exp(-dt / 0.12));
    pack.root.scale.setScalar(Math.max(1e-3, 0.85 * packK.k));
    pack.root.visible = packK.k > 0.01;
    if (pack.root.visible) pack.update(dt, time);
    stage.k += (stage.target - stage.k) * (1 - Math.exp(-dt / 0.09));
    cig.yawG.scale.setScalar(Math.max(1e-3, stage.k));
    cig.yawG.visible = !mode && stage.k > 0.01;
    fx.update(dt, time);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  if (mode) vape.show();
  labelBrand();
  return (window.__cigOverlay = { cig, vape, cloud, fx, pack, tracker, panel, pull, relight, place, setBrand });
}
