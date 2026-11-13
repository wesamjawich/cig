// The stats screen, laid out like the back of the current brand's pack: session / today / all-time numbers, a 14-day chart, recent sessions,
// a tar calculator and the brand picker. Plain DOM so it works in a page or a shadow root.
import { BRANDS, brand as getBrand, isVape } from './brands.js';
import { PACK_SIZE, dayKey } from './stats.js';
import { pace, setPace } from './pace.js';
import { getShelf, TILE_W, TILE_H } from './packview.js';

const LIFE_MIN_PER_CIG = 20;          // rough published estimate of life lost per cigarette
const PX_TO_M = 0.0254 / 96;          // CSS px are 1/96 inch
const JAR_G = 250;                    // the tar jar holds about a cup

const CSS = `
.cp-scrim{position:fixed;inset:0;z-index:2147483646;display:flex;align-items:center;justify-content:center;padding:18px;
  background:rgba(8,7,6,.62);opacity:0;transition:opacity .18s ease}
.cp-scrim.on{opacity:1}
.cp-scrim[hidden]{display:none}
.cp-card{--bg:#222;--bg2:#111;--ink:#eee;--acc:#c9a24a;--word:Georgia,serif;
  width:min(780px,100%);max-height:calc(100vh - 36px);overflow:auto;border-radius:3px;color:var(--ink);
  font:13px/1.35 "Helvetica Neue",Helvetica,Arial,sans-serif;font-variant-numeric:tabular-nums;
  background:linear-gradient(180deg,var(--bg),var(--bg2));box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 0 0 1px rgba(255,255,255,.08);
  transform:translateY(10px);transition:transform .2s ease;scrollbar-width:thin}
.cp-scrim.on .cp-card{transform:none}
.cp-card button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;padding:0}
.cp-lid{display:flex;align-items:center;gap:18px;padding:12px 22px 11px;border-bottom:1px solid rgba(0,0,0,.45);
  box-shadow:0 1px 0 rgba(255,255,255,.12);font-size:11px;letter-spacing:.14em;text-transform:uppercase}
.cp-tabs{display:flex;gap:16px;flex:1}
.cp-tabs button{opacity:.55;padding-bottom:2px;border-bottom:1.5px solid transparent;letter-spacing:inherit;text-transform:inherit}
.cp-tabs button.on{opacity:1;border-color:currentColor}
.cp-away{opacity:.7;margin-right:6px}.cp-away:hover{opacity:1}.cp-away[hidden]{display:none}
.cp-x{opacity:.7}.cp-x:hover,.cp-tabs button:hover{opacity:1}
.cp-body{padding:18px 22px 20px}
.cp-mast{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px}
.cp-word{font:600 30px/1 var(--word);letter-spacing:.01em}
.cp-count{font-size:11px;letter-spacing:.12em;text-transform:uppercase;opacity:.75;white-space:nowrap}
.cp-warn{background:#fff;color:#000;border:6px solid #000;outline:8px solid #fff;margin:8px 8px 22px;padding:16px 18px;
  font:700 21px/1.22 "Helvetica Neue",Helvetica,Arial,sans-serif;text-align:center;text-wrap:balance}
.cp-cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
@media (max-width:660px){.cp-cols{grid-template-columns:1fr}}
.cp-panel{background:#fbfaf6;color:#151515;padding:12px 14px 13px;border-radius:1px}
.cp-panel+.cp-panel{margin-top:14px}
.cp-panel h3{margin:0 0 8px;font:700 10.5px/1 "Helvetica Neue",Arial,sans-serif;letter-spacing:.16em;text-transform:uppercase;
  padding-bottom:6px;border-bottom:2px solid #151515}
.cp-tbl{width:100%;border-collapse:collapse}
.cp-tbl td{padding:4px 0;border-bottom:1px solid #d9d6cc;vertical-align:baseline}
.cp-tbl tr:last-child td{border-bottom:0}
.cp-tbl td:nth-child(2){text-align:right;font-weight:700;white-space:nowrap;padding-left:10px}
.cp-tbl small{display:block;color:#6d6a62;font-size:11px}
.cp-tbl tr.hi td{font-size:15px}
.cp-in{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:10px}
.cp-in label{font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:#6d6a62}
.cp-in input{display:block;width:100%;box-sizing:border-box;margin-top:3px;border:0;border-bottom:1.5px solid #151515;background:none;
  font:700 17px "Helvetica Neue",Arial,sans-serif;color:#151515;padding:2px 0;outline:0}
.cp-in input:focus{border-color:#b3261e}
.cp-calc{display:flex;gap:12px;align-items:flex-start}
.cp-jar{flex:none}
.cp-res{flex:1}
.cp-note{margin-top:8px;font-size:10.5px;color:#6d6a62}
.cp-bars{display:flex;align-items:flex-end;gap:3px;height:70px;padding-top:14px;border-bottom:1.5px solid #151515}
.cp-bar{flex:1;background:#151515;min-height:1px;position:relative}
.cp-bar.today{background:#b3261e}
.cp-bar span{position:absolute;bottom:100%;left:0;right:0;text-align:center;font-size:9px;margin-bottom:2px}
.cp-days{display:flex;gap:3px;font-size:9px;color:#6d6a62;margin-top:3px}.cp-days div{flex:1;text-align:center}
.cp-sess div{display:flex;gap:8px;padding:4px 0;border-bottom:1px solid #d9d6cc;align-items:baseline}
.cp-sess div:last-child{border-bottom:0}
.cp-sess span{flex:1}.cp-sess em{color:#6d6a62;font-style:normal;font-size:11px}
.cp-brands{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
.cp-brand{display:flex;flex-direction:column;align-items:center;gap:5px;padding:4px 2px 6px;text-align:center;border:1.5px solid transparent;border-radius:2px}
.cp-brand.on{border-color:#151515}
.cp-brand:hover{background:rgba(0,0,0,.04)}
.cp-sw{width:30px;height:44px;border-radius:1.5px;position:relative;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.35)}
.cp-sw i{position:absolute;left:0;right:0;top:0;height:30%}
.cp-sw b{position:absolute;left:4px;right:4px;bottom:4px;height:22%;background:#fff;outline:1.5px solid #000;outline-offset:-2px}
.cp-brand{position:relative}
.cp-card canvas.cp-pk{display:block;position:static!important;inset:auto!important;width:64px!important;height:84px!important;opacity:1!important;
  filter:none!important;-webkit-mask-image:none!important;mask-image:none!important;transition:none!important;cursor:inherit;touch-action:auto}
.cp-left{position:absolute;top:4px;left:50%;transform:translate(-50%,-4px);opacity:0;transition:opacity .15s ease,transform .15s ease;pointer-events:none;
  background:#151515;color:#fff;font:700 10px/1 "Helvetica Neue",Arial,sans-serif;padding:4px 6px;border-radius:2px;white-space:nowrap}
.cp-brand:hover .cp-left,.cp-brand:focus-visible .cp-left{opacity:1;transform:translate(-50%,0)}
.cp-vape .cp-left{background:#040406;color:#ffd400;border:1px solid #ffd400;border-radius:8px}
.cp-bn{font-size:11px;font-weight:700;line-height:1.15}
.cp-real{display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer}.cp-real input{width:16px;height:16px;accent-color:currentColor}
.cp-realp{margin:6px 0 0;font-size:11px;line-height:1.4;opacity:.75}
.cp-bl{font-size:10px;color:#6d6a62}
.cp-split{display:flex;height:6px;margin-top:10px;background:#e7e4da}
.cp-foot{display:grid;grid-template-columns:auto 1fr auto;gap:16px;align-items:end;margin-top:20px}
.cp-code{background:#fff;padding:6px 8px 3px;color:#000;font-size:9px;letter-spacing:.2em;text-align:center}
.cp-code svg{display:block}
.cp-fine{font-size:10px;line-height:1.45;opacity:.72}
.cp-stamp{border:1.5px solid currentColor;padding:5px 8px;font-size:9.5px;letter-spacing:.12em;text-transform:uppercase;text-align:center;line-height:1.3;opacity:.85}
.cp-reset{text-decoration:underline;opacity:.8}
.cp-card.cp-vape{--g1:#ff5f8f;--g2:#ffb27a;border-radius:26px;color:#f4f4f6;
  background:radial-gradient(110% 70% at 0% 0%,color-mix(in srgb,var(--g1) 36%,transparent),transparent 62%),
    radial-gradient(110% 80% at 100% 100%,color-mix(in srgb,var(--g2) 30%,transparent),transparent 60%),#0b0b10;
  box-shadow:0 30px 80px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.1)}
.cp-vape .cp-lid{border-bottom:1px solid rgba(255,255,255,.08);box-shadow:none}
.cp-vape .cp-tabs button.on{color:#ffd400;border-color:#ffd400}
.cp-vape .cp-word{font:800 30px/1 "Avenir Next",Futura,"Helvetica Neue",Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase}
.cp-vape .cp-word small{display:block;font-size:11px;letter-spacing:.38em;font-weight:600;margin-top:7px;color:var(--g1)}
.cp-vape .cp-warn{background:#040406;color:rgba(255,233,176,.85);border:2px solid #ffd400;outline:0;border-radius:22px;margin:4px 0 20px;padding:16px 18px 12px;
  box-shadow:0 0 22px rgba(255,212,0,.28),inset 0 0 18px rgba(255,212,0,.08);font:600 11px/1.3 "Helvetica Neue",Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase}
.cp-scr{display:grid;grid-template-columns:1fr 1.7fr 1fr;align-items:end;gap:10px;margin-bottom:12px}
.cp-scr div{display:flex;flex-direction:column;align-items:center;gap:7px}
.cp-scr svg{display:block;filter:drop-shadow(0 0 6px rgba(255,170,40,.55))}
.cp-scr em{font-style:normal;font-size:9.5px;letter-spacing:.18em;color:rgba(255,233,176,.6)}
.cp-vape .cp-panel{background:rgba(255,255,255,.045);color:#f4f4f6;border:1px solid rgba(255,255,255,.09);border-radius:16px}
.cp-vape .cp-panel h3{border-bottom:1px solid rgba(255,212,0,.5);color:#ffd400}
.cp-vape .cp-tbl td,.cp-vape .cp-sess div{border-bottom-color:rgba(255,255,255,.08)}
.cp-vape .cp-tbl small,.cp-vape .cp-note,.cp-vape .cp-days,.cp-vape .cp-sess em,.cp-vape .cp-bl,.cp-vape .cp-in label{color:rgba(244,244,246,.55)}
.cp-vape .cp-in input{color:#fff;border-bottom-color:#ffd400}
.cp-vape .cp-bars{border-bottom-color:rgba(255,255,255,.3)}
.cp-vape .cp-bar{background:linear-gradient(180deg,var(--g1),var(--g2));border-radius:3px 3px 0 0}
.cp-vape .cp-bar.today{background:#ffd400}
.cp-vape .cp-brand.on{border-color:#ffd400}
.cp-vape .cp-brand:hover{background:rgba(255,255,255,.06)}
.cp-vape .cp-split{background:rgba(255,255,255,.08)}
.cp-vape .cp-code{border-radius:6px}
.cp-vape .cp-stamp{background:#fff;color:#000;border:3px solid #000;outline:3px solid #fff;outline-offset:0;font-weight:800;letter-spacing:.01em;text-transform:none;font-size:11px;opacity:1;max-width:190px}
.cp-sw.vape{border-radius:6px}
.cp-sw.vape i{left:auto;right:5px;top:-1px;width:11px;height:20%;background:rgba(255,255,255,.6);border-radius:3px}
.cp-sw.vape b{left:2px;right:auto;top:14%;bottom:14%;width:5px;height:auto;background:#111;outline:1px solid #ffd400;outline-offset:0;border-radius:2px}
`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function fmtDur(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ${String(m % 60).padStart(2, '0')}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
const fmtMg = (mg) => (mg < 1000 ? `${mg.toFixed(mg < 10 ? 1 : 0)} mg` : `${(mg / 1000).toFixed(mg < 1e5 ? 2 : 1)} g`);
const fmtDist = (px) => { const m = px * PX_TO_M; return m < 1000 ? `${m.toFixed(m < 10 ? 1 : 0)} m` : `${(m / 1000).toFixed(2)} km`; };
const fmtMoney = (v) => `$${v < 100 ? v.toFixed(2) : Math.round(v).toLocaleString()}`;
const fmtPacks = (cigs) => (cigs / PACK_SIZE).toFixed(cigs % PACK_SIZE ? 2 : 0);
const fmtLife = (min) => (min < 120 ? `${Math.round(min)} min` : min < 2880 ? `${(min / 60).toFixed(1)} h` : `${(min / 1440).toFixed(1)} days`);

function jar(fill) {
  const h = 78, top = 14, y = top + (h - top) * (1 - Math.min(1, fill));
  return `<svg viewBox="0 0 64 96" width="64" height="96" aria-hidden="true">
    <defs><clipPath id="cpjar"><path d="M12 14h40v6c6 3 8 8 8 14v52a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V34c0-6 2-11 8-14z"/></clipPath>
    <linearGradient id="cptar" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#5a3a1c"/><stop offset="1" stop-color="#140b05"/></linearGradient></defs>
    <g clip-path="url(#cpjar)"><rect x="0" y="0" width="64" height="96" fill="rgba(0,0,0,.04)"/>
    <rect x="0" y="${y.toFixed(1)}" width="64" height="96" fill="url(#cptar)"/>
    <rect x="9" y="26" width="5" height="54" rx="2.5" fill="rgba(255,255,255,.18)"/></g>
    <path d="M12 14h40v6c6 3 8 8 8 14v52a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6V34c0-6 2-11 8-14z" fill="none" stroke="#151515" stroke-width="1.5"/>
    <rect x="10" y="6" width="44" height="9" rx="2" fill="#6b6b72"/></svg>`;
}

const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
const SEG_R = { a: [1, 0, 4, 1], b: [5, 1, 1, 3.5], c: [5, 5.5, 1, 3.5], d: [1, 9, 4, 1], e: [0, 5.5, 1, 3.5], f: [0, 1, 1, 3.5], g: [1, 4.5, 4, 1] };
// seven-segment digits, like the Pulse's screen
function seg7(n, h = 30, on = '#ffaa28') {
  const str = String(n), w = str.length * 7.4 - 0.6;
  let out = '';
  [...str].forEach((ch, i) => {
    const lit = SEG[ch] || '';
    for (const [k, [x, y, sw, sh]] of Object.entries(SEG_R)) {
      out += `<rect x="${(i * 7.4 + x + (10 - y) * 0.08).toFixed(2)}" y="${y}" width="${sw}" height="${sh}" rx=".35" fill="${lit.includes(k) ? on : 'rgba(255,170,40,.09)'}"/>`;
    }
  });
  return `<svg viewBox="0 0 ${w.toFixed(1)} 10" width="${((w * h) / 10).toFixed(0)}" height="${h}" role="img" aria-label="${str}">${out}</svg>`;
}
const ICON = {
  bolt: '<svg viewBox="0 0 12 20" width="11" height="18" aria-hidden="true"><path d="M7 0 0 11h5l-2 9 9-12H7z" fill="#ffd400"/></svg>',
  drop: '<svg viewBox="0 0 14 20" width="12" height="18" aria-hidden="true"><path d="M7 0C10 5 14 9 14 13a7 7 0 0 1-14 0C0 9 4 5 7 0z" fill="#ffd400"/></svg>',
};
// e-liquid capsule gauge for the vape calculator: fills per device, ×N underneath
function capsule(dev) {
  const fill = dev <= 0 ? 0 : dev % 1 || 1, y = 8 + 80 * (1 - fill);
  return `<svg viewBox="0 0 44 112" width="44" height="112" aria-hidden="true">
    <defs><clipPath id="cpcap"><rect x="6" y="8" width="32" height="80" rx="16"/></clipPath>
    <linearGradient id="cpliq" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--g1)"/><stop offset="1" style="stop-color:var(--g2)"/></linearGradient></defs>
    <g clip-path="url(#cpcap)"><rect x="0" y="${y.toFixed(1)}" width="44" height="100" fill="url(#cpliq)"/></g>
    <rect x="6" y="8" width="32" height="80" rx="16" fill="none" stroke="#ffd400" stroke-width="2"/>
    <text x="22" y="106" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">×${dev.toFixed(dev < 10 ? 1 : 0)}</text></svg>`;
}

export function createPanel(root, tracker, { onBrand, away: awayCtl } = {}) {
  const style = document.createElement('style');
  style.textContent = CSS;
  (root instanceof ShadowRoot ? root : document.head).appendChild(style);

  const scrim = document.createElement('div');
  scrim.className = 'cp-scrim'; scrim.hidden = true;
  scrim.innerHTML = `<div class="cp-card" role="dialog" aria-modal="true" aria-label="Smoking stats">
    <div class="cp-lid"><div class="cp-tabs" role="tablist">
        <button data-tab="session" role="tab">This session</button>
        <button data-tab="today" role="tab">Today</button>
        <button data-tab="total" role="tab">All time</button>
      </div><button class="cp-away" title="Hide it and pause tracking"></button><button class="cp-x" title="Close (Esc)">Close</button></div>
    <div class="cp-body">
      <div class="cp-mast"><div class="cp-word"></div><div class="cp-count"></div></div>
      <div class="cp-warn" role="status"></div>
      <div class="cp-cols">
        <div>
          <section class="cp-panel"><h3>Contents</h3><table class="cp-tbl"></table></section>
          <section class="cp-panel"><h3 data-l="calc">Tar calculator</h3>
            <div class="cp-in">
              <label><span data-l="perDay">Cigs a day</span><input type="number" min="0" max="200" step="1" data-k="perDay"></label>
              <label>Years<input type="number" min="0" max="80" step="1" data-k="years"></label>
              <label><span data-l="price">$ a pack</span><input type="number" min="0" max="100" step="0.5" data-k="price"></label>
            </div>
            <div class="cp-calc"><div class="cp-jar"></div><table class="cp-tbl cp-res"></table></div>
            <div class="cp-note"></div></section>
        </div>
        <div>
          <section class="cp-panel"><h3>Last 14 days</h3><div class="cp-bars"></div><div class="cp-days"></div></section>
          <section class="cp-panel"><h3>Recent sessions</h3><div class="cp-sess"></div></section>
          <section class="cp-panel"><h3>Brand</h3><div class="cp-brands"></div><div class="cp-split"></div></section>
          <section class="cp-panel"><h3>Pace</h3><label class="cp-real"><input type="checkbox"> <b>Realistic cigs</b></label><p class="cp-realp"></p></section>
        </div>
      </div>
      <div class="cp-foot"><div class="cp-code"></div>
        <div class="cp-fine"><span class="cp-fine-t"></span>
          <button class="cp-reset" title="Wipe all stats">Reset ledger</button></div>
        <div class="cp-stamp"></div></div>
    </div>
  </div>`;
  (root instanceof ShadowRoot ? root : document.body).appendChild(scrim);

  const $ = (s) => scrim.querySelector(s);
  const $$ = (s) => [...scrim.querySelectorAll(s)];
  let tab = 'session', timer = 0;
  const calc = { perDay: null, years: 1 }, calcV = { perDay: null, years: 1 };
  let vape = false;

  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) close(); });
  $('.cp-x').addEventListener('click', () => close());
  setPace(!!tracker.snapshot().settings.realistic);
  $('.cp-real input').addEventListener('change', (e) => { tracker.setSetting('realistic', e.target.checked); setPace(e.target.checked); render(); });
  $('.cp-away').hidden = !awayCtl;
  $('.cp-away').addEventListener('click', () => { awayCtl.toggle(); render(); });
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.tab; render(); }));
  $('.cp-reset').addEventListener('click', () => {
    if (confirm('Wipe every cigarette, pack and session from the ledger?')) { tracker.reset(); calc.perDay = calcV.perDay = null; render(true); }
  });
  $$('.cp-in input').forEach((inp) => inp.addEventListener('input', () => {
    const v = Math.max(0, Number(inp.value) || 0);
    if (inp.dataset.k === 'price') tracker.setSetting(vape ? 'vprice' : 'price', v); else (vape ? calcV : calc)[inp.dataset.k] = v;
    renderCalc(false);
  }));
  // keep the host page (X's own shortcuts) out of it while typing
  for (const ev of ['keydown', 'keyup', 'keypress', 'wheel']) scrim.addEventListener(ev, (e) => {
    if (ev === 'keydown' && e.key === 'Escape') close();
    e.stopPropagation();
  });

  function brandsUsed(snap) {
    const n = Object.values(snap.brands).reduce((a, b) => a + b, 0);
    if (!n) return { tar: getBrand(snap.brand).tar, nic: getBrand(snap.brand).nic, n: 0 };
    let tar = 0, nic = 0;
    for (const [id, c] of Object.entries(snap.brands)) { tar += getBrand(id).tar * c; nic += getBrand(id).nic * c; }
    return { tar: tar / n, nic: nic / n, n };
  }
  function avgPerDay(snap) {
    const days = Object.values(snap.days).filter((d) => d.cigs > 0);
    return days.length ? days.reduce((a, d) => a + d.cigs, 0) / days.length : 0;
  }

  // brand picker: a 3D pack (or Geek Bar) per brand; hovering opens it to show what's left
  let tiles = null, animRaf = 0;
  const ease = (x) => x * x * (3 - 2 * x);
  const leftOf = (b, snap) => (b.kind === 'vape' ? snap.vapes[b.id] ?? b.puffs : snap.packs[b.id] ?? PACK_SIZE);
  function animate() {
    animRaf = 0;
    let more = false;
    for (const t of tiles) {
      const target = t.hover ? 1 : 0;
      if (t.open === target && !t.dirty && !(t.hover && t.b.kind === 'vape')) continue;
      t.open += (target - t.open) * 0.2;
      if (Math.abs(t.open - target) < 0.004) t.open = target;
      t.dirty = false;
      getShelf().draw(t.ctx, t.b.id, t.left, ease(t.open));
      if (t.open !== target || (t.hover && t.b.kind === 'vape')) more = true;
    }
    if (more && !scrim.hidden) animRaf = requestAnimationFrame(animate);
  }
  const kick = () => { if (!animRaf && tiles) animRaf = requestAnimationFrame(animate); };

  function renderBrands(snap) {
    if (!tiles) {
      $('.cp-brands').innerHTML = BRANDS.map((b) => {
        const name = b.kind === 'vape' ? (b.short === 'Geek Bar' ? 'Geek Bar Pulse' : `Geek Bar ${b.short}`) : b.name;
        return `<button class="cp-brand" data-brand="${b.id}" title="${esc(b.blurb)}"><canvas class="cp-pk" width="${TILE_W}" height="${TILE_H}"></canvas>
          <span class="cp-left"></span><div><div class="cp-bn">${esc(name)}</div><div class="cp-bl"></div></div></button>`;
      }).join('');
      tiles = BRANDS.map((b) => {
        const el = scrim.querySelector(`[data-brand="${b.id}"]`);
        const t = { b, el, ctx: el.querySelector('canvas').getContext('2d'), open: 0, hover: false, left: -1, dirty: true };
        const on = () => { t.hover = true; kick(); }, off = () => { t.hover = false; kick(); };
        el.addEventListener('pointerenter', on); el.addEventListener('pointerleave', off);
        el.addEventListener('focus', on); el.addEventListener('blur', off);
        el.addEventListener('click', () => {
          if (b.id === tracker.brand) return;
          onBrand ? onBrand(b.id) : tracker.setBrand(b.id);
          render(true);
        });
        return t;
      });
    }
    for (const t of tiles) {
      const b = t.b, v = b.kind === 'vape', left = leftOf(b, snap);
      t.el.classList.toggle('on', b.id === snap.brand);
      if (left !== t.left) { t.left = left; t.dirty = true; }
      t.el.querySelector('.cp-left').textContent = v ? `${left.toLocaleString()} puffs left` : `${left} of ${PACK_SIZE} left`;
      const status = v ? `${left.toLocaleString()} puffs` : snap.packs[b.id] == null ? 'sealed' : `${left} / ${PACK_SIZE}`;
      t.el.querySelector('.cp-bl').textContent = `${status} · ${v ? `${b.nicPct}% nic` : `${b.tar} mg`}`;
    }
    kick();
  }

  const WORD = { roof: 'Georgia, "Times New Roman", serif', wave: '"Helvetica Neue", Arial, sans-serif', stars: '"Times New Roman", Times, serif',
    arc: 'Optima, Candara, "Gill Sans", sans-serif', devil: '"Chalkduster", "Marker Felt", fantasy', kretek: 'Georgia, serif' };
  const WHEN = { session: 'This session', today: 'Today', total: 'Since you started' };

  function barcode(seed) {
    let x = 0, out = '', r = seed >>> 0 || 7;
    for (let i = 0; i < 46; i++) { r = (r * 1103515245 + 12345) >>> 0; const w = 1 + (r >>> 29) % 3; if (i % 2 === 0) out += `<rect x="${x}" y="0" width="${w}" height="34"/>`; x += w; }
    return `<svg viewBox="0 0 ${x} 34" width="${x * 1.4}" height="34" aria-hidden="true">${out}</svg>`;
  }

  function renderNumbers(snap) {
    const s = snap[tab], now = Date.now(), b = getBrand(snap.brand);
    const span = tab === 'session' ? now - s.start : null;
    const pace = s.activeMs > 60e3 ? (s.cigs / (s.activeMs / 3.6e6)) : null;
    const m = s.scrollPx * PX_TO_M;
    const card = $('.cp-card');
    card.style.setProperty('--bg', b.pack.bg); card.style.setProperty('--bg2', b.pack.bg2 || b.pack.bg);
    card.style.setProperty('--ink', b.pack.ink); card.style.setProperty('--word', WORD[b.pack.style] || WORD.roof);
    $('.cp-fine-t').textContent = vape
      ? `${b.puffs.toLocaleString()} puffs · ${b.ml} mL · ${b.nicPct}% nicotine · 650 mAh · dual mesh coil. Hold a draw ${pace.blink} s and it blinks. Estimates only, not medical advice. `
      : 'Made by your thumb under licence from the feed. Figures are estimates from brand averages; life cost uses a rough 20 minutes per cigarette and is not medical advice. ';
    if (vape) return renderVape(snap, s, b, span, m);
    $('.cp-word').textContent = b.name;
    $('.cp-count').textContent = `${tracker.left()} of ${PACK_SIZE} cigarettes left`;
    $('.cp-warn').innerHTML = `${WHEN[tab]} you smoked ${s.cigs} cigarette${s.cigs === 1 ? '' : 's'} (${fmtPacks(s.cigs)} pack${s.cigs === PACK_SIZE ? '' : 's'}) in ${fmtDur(s.activeMs)} of scrolling`;
    const row = (k, v, note, hi) => `<tr${hi ? ' class="hi"' : ''}><td>${k}${note ? `<small>${note}</small>` : ''}</td><td>${v}</td></tr>`;
    $('.cp-tbl').innerHTML = [
      row('Cigarettes', s.cigs, `${s.smoked.toFixed(1)} actually burnt`, 1),
      row('Packs', fmtPacks(s.cigs), `${s.packs} opened`, 1),
      row('Tar', fmtMg(s.tar), `${((s.tar / 1000) / JAR_G * 100).toFixed(2)}% of a jar`, 1),
      row('Nicotine', fmtMg(s.nic)), row('Carbon monoxide', fmtMg(s.co)),
      row('Drags', s.drags, s.cigs ? `${(s.drags / s.cigs).toFixed(1)} per cigarette` : ''),
      row('Capsules popped', s.pops),
      row('Time scrolling', fmtDur(s.activeMs), span != null ? `session open ${fmtDur(span)}` : ''),
      row('Distance scrolled', fmtDist(s.scrollPx), m > 33 ? `${(m / 330).toFixed(2)} Eiffel Towers` : `${Math.round(m * 100 / 1.75)}% of your height`),
      row('Pace', pace == null ? '—' : `${pace.toFixed(1)} an hour`),
      row('Spent', fmtMoney((s.cigs / PACK_SIZE) * (snap.settings.price || 0))),
      row('Life, est.', fmtLife(s.smoked * LIFE_MIN_PER_CIG)),
    ].join('');
    const lot = `${dayKey(s.start).replace(/-/g, '')}${String(snap.total.cigs).padStart(4, '0')}`;
    $('.cp-code').innerHTML = `${barcode(snap.total.cigs * 31 + snap.total.packs + 5)}${lot}`;
    $('.cp-stamp').innerHTML = `Scroll duty paid<br>${b.tar} mg tar · ${b.nic} mg nic · ${b.co} mg CO`;
  }

  function renderVape(snap, s, b, span, m) {
    const card = $('.cp-card');
    card.style.setProperty('--g1', b.device.top); card.style.setProperty('--g2', b.device.bot);
    const left = tracker.puffsLeft(), used = b.puffs - left;
    $('.cp-word').innerHTML = `Geek Bar<small>Pulse · ${esc(b.flavour)}</small>`;
    $('.cp-count').textContent = `${left.toLocaleString()} of ${b.puffs.toLocaleString()} puffs left`;
    const puffs = s.puffs || 0, blinks = s.blinkers || 0, ms = s.vapeMs || 0;
    $('.cp-warn').innerHTML = `<div class="cp-scr">
      <div>${ICON.bolt}${seg7(Math.round(100 - (used % 600) / 6), 30)}<em>Battery</em></div>
      <div>${seg7(puffs, 52)}<em>Puffs</em></div>
      <div>${ICON.drop}${seg7(Math.ceil((100 * left) / b.puffs), 30)}<em>E-liquid</em></div></div>
      ${WHEN[tab]}: ${blinks} blinker${blinks === 1 ? '' : 's'} in ${fmtDur(s.activeMs)} of scrolling`;
    const pace = s.activeMs > 60e3 ? puffs / (s.activeMs / 3.6e6) : null;
    const price = snap.settings.vprice ?? b.price;
    const row = (k, v, note, hi) => `<tr${hi ? ' class="hi"' : ''}><td>${k}${note ? `<small>${note}</small>` : ''}</td><td>${v}</td></tr>`;
    $('.cp-tbl').innerHTML = [
      row('Puffs', puffs.toLocaleString(), puffs ? `${(ms / puffs / 1000).toFixed(1)} s average draw` : 'scroll to take a hit', 1),
      row('Blinkers', blinks, puffs ? `${Math.round((100 * blinks) / puffs)}% of puffs held ${pace.blink} s` : '', 1),
      row('Nicotine', fmtMg(s.nic), s.nic ? `about ${(s.nic / 0.8).toFixed(1)} cigarettes’ worth by label` : '', 1),
      row('E-liquid', `${((puffs * b.ml) / b.puffs).toFixed(2)} mL`),
      row('Devices', s.devices || 0, 'opened'),
      row('Time on the bar', fmtDur(ms)),
      row('Time scrolling', fmtDur(s.activeMs), span != null ? `session open ${fmtDur(span)}` : ''),
      row('Distance scrolled', fmtDist(s.scrollPx), m > 33 ? `${(m / 330).toFixed(2)} Eiffel Towers` : `${Math.round(m * 100 / 1.75)}% of your height`),
      row('Pace', pace == null ? '—' : `${pace.toFixed(0)} puffs an hour`),
      row('Spent', fmtMoney((puffs / b.puffs) * price)),
      s.cigs ? row('Cigarettes too', s.cigs, `${fmtMg(s.tar)} tar`) : '',
    ].join('');
    $('.cp-code').innerHTML = `${barcode(snap.total.puffs * 17 + 3)}${dayKey(s.start).replace(/-/g, '')}${String(snap.total.puffs).padStart(5, '0')}`;
    $('.cp-stamp').textContent = 'WARNING: This product contains nicotine. Nicotine is an addictive chemical.';
  }

  function renderHistory(snap) {
    const vk = vape ? 'puffs' : 'cigs';
    const days = [], now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      days.push({ k: dayKey(d.getTime()), d, v: (snap.days[dayKey(d.getTime())] || {})[vk] || 0 });
    }
    days[13].v = snap.today[vk] || 0;
    const max = Math.max(vape ? 30 : 5, ...days.map((d) => d.v));
    $('.cp-bars').innerHTML = days.map((d, i) =>
      `<div class="cp-bar${i === 13 ? ' today' : ''}" style="height:${(d.v / max) * 100}%" title="${d.k}: ${d.v} ${vape ? 'puffs' : `cigarettes (${fmtPacks(d.v)} packs)`}">${d.v ? `<span>${d.v}</span>` : ''}</div>`).join('');
    $('.cp-days').innerHTML = days.map((d) => `<div>${'SMTWTFS'[d.d.getDay()]}</div>`).join('');
    const sess = snap.sessions.filter((s) => s.cigs || s.puffs || s.activeMs > 5000).slice(0, 5);
    $('.cp-sess').innerHTML = sess.length ? sess.map((s, i) => {
      const d = new Date(s.start);
      const when = dayKey(s.start) === dayKey() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
      return `<div><span>${i === 0 && snap.sessions[0] === s ? 'Now' : when} <em>· ${fmtDur(s.last - s.start)} open, ${fmtDur(s.activeMs)} scrolling</em></span>
        ${vape ? `<b>${s.puffs || 0} puff${s.puffs === 1 ? '' : 's'}</b><em>${s.blinkers || 0} blink</em>` : `<b>${s.cigs} cig${s.cigs === 1 ? '' : 's'}</b><em>${fmtPacks(s.cigs)} pk</em>`}</div>`;
    }).join('') : '<div><em>No sessions yet. Go scroll something.</em></div>';
    const total = Object.values(snap.brands).reduce((a, b) => a + b, 0) || 1;
    $('.cp-split').innerHTML = BRANDS.filter((b) => snap.brands[b.id]).map((b) =>
      `<i style="width:${(snap.brands[b.id] / total) * 100}%;background:${b.pack.style === 'roof' ? b.pack.accent : b.pack.bg2 || b.pack.accent}" title="${esc(b.name)}: ${snap.brands[b.id]}"></i>`).join('');
  }

  function renderCalc(fillInputs) {
    const snap = tracker.snapshot();
    $('[data-l="perDay"]').textContent = vape ? 'Puffs a day' : 'Cigs a day';
    $('[data-l="price"]').textContent = vape ? '$ a device' : '$ a pack';
    $('[data-l="calc"]').textContent = vape ? 'Nicotine calculator' : 'Tar calculator';
    if (vape) return renderCalcVape(snap, fillInputs);
    const avg = avgPerDay(snap), mix = brandsUsed(snap);
    if (calc.perDay == null) calc.perDay = Math.max(1, Math.round(avg) || 10);
    const price = snap.settings.price || 0;
    if (fillInputs) {
      scrim.querySelector('[data-k="perDay"]').value = calc.perDay;
      scrim.querySelector('[data-k="years"]').value = calc.years;
      scrim.querySelector('[data-k="price"]').value = price;
    }
    const cigs = calc.perDay * 365.25 * calc.years;
    const tarG = (cigs * mix.tar) / 1000;
    $('.cp-jar').innerHTML = jar(tarG / JAR_G);
    const r = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    $('.cp-res').innerHTML = [
      r('Cigarettes', Math.round(cigs).toLocaleString()), r('Packs', Math.round(cigs / PACK_SIZE).toLocaleString()),
      r('Tar', `${tarG.toFixed(tarG < 10 ? 1 : 0)} g`), r('Tar jars', (tarG / JAR_G).toFixed(2)),
      r('Nicotine', `${((cigs * mix.nic) / 1000).toFixed(1)} g`), r('Cost', fmtMoney((cigs / PACK_SIZE) * price)),
      r('Life, est.', fmtLife(cigs * LIFE_MIN_PER_CIG)), r('Pack-years', ((calc.perDay / PACK_SIZE) * calc.years).toFixed(2)),
    ].join('');
    $('.cp-note').textContent = `${mix.n ? `Your mix averages ${mix.tar.toFixed(1)} mg tar per cigarette` : `${getBrand(snap.brand).name}: ${mix.tar} mg tar per cigarette`}`
      + `${avg ? ` · you average ${avg.toFixed(1)} a day` : ''}. Jar ≈ ${JAR_G} g. Life ≈ ${LIFE_MIN_PER_CIG} min per cigarette, a rough estimate.`;
  }

  function renderCalcVape(snap, fillInputs) {
    const b = getBrand(snap.brand);
    const days = Object.values(snap.days).filter((d) => d.puffs > 0);
    const avg = days.length ? days.reduce((a, d) => a + d.puffs, 0) / days.length : 0;
    if (calcV.perDay == null) calcV.perDay = Math.max(1, Math.round(avg) || 300);
    const price = snap.settings.vprice ?? b.price;
    if (fillInputs) {
      scrim.querySelector('[data-k="perDay"]').value = calcV.perDay;
      scrim.querySelector('[data-k="years"]').value = calcV.years;
      scrim.querySelector('[data-k="price"]').value = price;
    }
    const t = snap.total, puffs = calcV.perDay * 365.25 * calcV.years, dev = puffs / b.puffs;
    const blinkRate = t.puffs ? t.blinkers / t.puffs : 0, drawS = t.puffs ? t.vapeMs / t.puffs / 1000 : 2.5;
    const ml = (puffs * b.ml) / b.puffs, nicG = (puffs * b.nic) / 1000;
    $('.cp-jar').innerHTML = capsule(dev);
    const r = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;
    $('.cp-res').innerHTML = [
      r('Puffs', Math.round(puffs).toLocaleString()), r('Devices', dev.toFixed(dev < 10 ? 1 : 0)),
      r('Nicotine', `${nicG.toFixed(nicG < 10 ? 2 : 1)} g`), r('E-liquid', ml < 1000 ? `${ml.toFixed(0)} mL` : `${(ml / 1000).toFixed(2)} L`),
      r('Cost', fmtMoney(dev * price)), r('Blinkers', Math.round(puffs * blinkRate).toLocaleString()),
      r('On the bar', fmtLife((puffs * drawS) / 60)), r('Cigarettes’ nicotine', Math.round((puffs * b.nic) / 0.8).toLocaleString()),
    ].join('');
    $('.cp-note').textContent = `${b.ml} mL at ${b.nicPct}% over ${b.puffs.toLocaleString()} puffs ≈ ${b.nic} mg nicotine a puff`
      + `${avg ? ` · you average ${Math.round(avg)} puffs a day` : ''}. Cigarette comparison uses Classic Gold’s 0.8 mg label nicotine. Rough estimates.`;
  }

  function render(full = false) {
    const snap = tracker.snapshot();
    const was = vape;
    vape = isVape(snap.brand);
    $('.cp-card').classList.toggle('cp-vape', vape);
    $('.cp-real input').checked = pace.realistic;
    $('.cp-realp').textContent = pace.realistic
      ? 'On: everything lasts longer, at real-world pace. A cigarette takes about 5 min of scrolling (about 10 puffs, like a real one); a blinker is an 8 s draw.'
      : 'Turn on to make everything last longer, at real-world pace: about 5 min of scrolling per cigarette and an 8 s blinker, instead of about 20 s and 5 s.';
    if (awayCtl) $('.cp-away').textContent = awayCtl.get() ? 'Bring it back' : 'Put it away';
    if (was !== vape) full = true;
    $$('[data-tab]').forEach((b) => { b.classList.toggle('on', b.dataset.tab === tab); b.setAttribute('aria-selected', b.dataset.tab === tab); });
    renderBrands(snap); renderNumbers(snap); renderHistory(snap);
    if (full) renderCalc(true);
  }

  // Escape closes even when focus is still on the page behind the panel
  function onEsc(e) { if (e.key === 'Escape') { e.stopPropagation(); close(); } }

  function open() {
    if (scrim.classList.contains('on')) return;
    clearInterval(timer);
    scrim.hidden = false; calc.perDay = calcV.perDay = null;
    addEventListener('keydown', onEsc, true);
    render(true);
    requestAnimationFrame(() => scrim.classList.add('on'));
    timer = setInterval(() => render(false), 1000);
  }
  function close() {
    if (!scrim.classList.contains('on')) return;
    clearInterval(timer);
    cancelAnimationFrame(animRaf); animRaf = 0;
    if (tiles) for (const t of tiles) { t.hover = false; t.open = 0; t.dirty = true; }
    removeEventListener('keydown', onEsc, true);
    scrim.classList.remove('on');
    setTimeout(() => { if (!scrim.classList.contains('on')) scrim.hidden = true; }, 200);
  }
  return { open, close, toggle: () => (scrim.hidden ? open() : close()), get isOpen() { return !scrim.hidden; }, render };
}
