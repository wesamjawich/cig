// 3D thumbnails for the stats screen's brand picker: one shared offscreen renderer draws each
// brand's pack (or Geek Bar) into its tile's 2D canvas. `open` 0..1 flips the lid back and tips the
// pack towards you so you can see what's left; for a Geek Bar it turns to the lit screen.
import * as THREE from '../vendor/three/build/three.module.js';
import { Pack } from './pack.js';
import { Vape } from './vape.js';
import { brand as getBrand } from './brands.js';

export const TILE_W = 128, TILE_H = 168;
const NOFX = { smoke: { spawn() {} }, setGlow() {}, setFlame() {} };
let shelf = null;

export function getShelf() {
  if (shelf) return shelf;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true }); }
  catch { return (shelf = { ok: false, draw() {} }); }
  renderer.setPixelRatio(1); renderer.setSize(TILE_W, TILE_H, false);
  renderer.setClearColor(0x000000, 0); renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  { // same little studio as the overlay, for the clearcoat and foil
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(60, 16, 8), new THREE.MeshBasicMaterial({ color: 0x24242a, side: THREE.BackSide })));
    const panel = (color, x, y, z, s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    panel(new THREE.Color(9, 8.4, 7.6), -22, 34, 22, 30);
    panel(new THREE.Color(3, 3.6, 5), 30, 14, -30, 26);
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(env, 0.04).texture; scene.environmentIntensity = 0.35;
    pmrem.dispose();
  }
  const key = new THREE.DirectionalLight(0xfff1e0, 1.7); key.position.set(-4, 8, 7);
  const rim = new THREE.DirectionalLight(0xbcd0ff, 1.2); rim.position.set(5, 3, -7);
  const fill = new THREE.DirectionalLight(0xffe2c8, 0.45); fill.position.set(4, -2, 6);
  scene.add(key, rim, fill);
  const camera = new THREE.PerspectiveCamera(24, TILE_W / TILE_H, 1, 200);

  const models = new Map();
  function model(id) {
    let m = models.get(id);
    if (m) return m;
    const b = getBrand(id);
    if (b.kind === 'vape') { const v = new Vape(scene, NOFX, { brand: id }); v.grabbed = true; m = { v, root: v.root }; }
    else { const p = new Pack(scene, id, 20); m = { p, root: p.root }; }
    models.set(id, m);
    return m;
  }
  let clock = 0;
  return (shelf = {
    ok: true,
    draw(ctx, id, left, open) {
      const m = model(id);
      for (const o of models.values()) o.root.visible = o === m;
      if (m.p) {
        const p = m.p;
        p.setCount(left); p.lidAngle = open; p.yaw = 0.45 - 0.2 * open; p.tilt = 0.12 + 0.55 * open;
        p.update(0, 0);
        camera.position.set(0, 1 + 2.5 * open, 27); camera.lookAt(0, 0.4 + 0.9 * open, 0);
      } else {
        const v = m.v;
        v.left = left; v.yaw = 0.62 + 0.75 * open; v.awakeT = open > 0.05 ? v.clock : -1e9; v.screenAt = -1;
        clock += 1 / 60; v.update(1 / 60, clock, 0);
        camera.position.set(0, 1.6, 27); camera.lookAt(0, 1, 0);
      }
      renderer.render(scene, camera);
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
      ctx.drawImage(renderer.domElement, 0, 0, ctx.canvas.width, ctx.canvas.height);
    },
  });
}
