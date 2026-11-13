# cig

Scrolling X is a cigarette for your eyes. **cig** puts a real-time 3D cigarette (or a Geek Bar) over your feed that you smoke by scrolling, and it keeps count: cigarettes, packs, puffs, tar, nicotine and time spent scrolling.

It runs two ways:

- **Chrome extension.** A floating overlay on `x.com` / `twitter.com`.
- **Standalone demo.** A full-screen page (`index.html`) for playing with it on its own.

Everything is plain ES modules and Three.js (r170, vendored in `vendor/three`). There is no build step and nothing to `npm install`.

## Install the extension (Chrome, Edge, Brave, Arc)

1. Get the code: `git clone https://github.com/wesamjawich/cig.git`, or download the ZIP from GitHub and unzip it.
2. Open `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked** and pick the `cig` folder, the one with `manifest.json` in it.
5. Open or reload [x.com](https://x.com) and start scrolling.

To update later, `git pull`, then hit the reload icon on the extension card and refresh X.

## Run the demo

ES modules don't load from `file://`, so serve the folder:

```sh
cd cig
python3 -m http.server 5173
```

Then open:

- <http://localhost:5173/> for the full-screen demo
- <http://localhost:5173/dev/mock.html> for the X overlay on a fake feed, handy for working on the extension without X

## What's in it

- **Cigarette.** A shader-driven burning coal, ash that grows and falls, and smoke that curls. Scrolling is a drag: the harder you scroll, the more it glows and burns.
- **The pack.** A 3D flip-top box of 20 (7-6-7). When a cigarette is finished the lid opens and the next one slides out. After the 20th, a fresh pack spins in.
- **Brands**, each with its own cigarette, pack art and tar / nicotine / CO values:
  - Classic Gold
  - Menthol Pop: crush the capsule
  - Seven Stars
  - Mevius Original
  - Black Devil
  - Kretek Clove
- **Geek Bar Pulse** (Fcuking Fab, Blue Razz Ice):
  - Scrolling is a draw. Stop and you exhale a GPU fluid-sim cloud across the screen, sized by how much you scrolled.
  - Five seconds of non-stop scrolling (eight with Realistic cigs on) hits a **blinker**: the screen flashes, it cuts off, and you get the biggest cloud.
  - 15,000 puffs a device, with battery and e-liquid on its screen.
- **Stats screen**, laid out like the back of whichever pack you're holding (or styled like the Geek Bar's screen when you're vaping):
  - This session, today and all time
  - A 14-day chart, recent sessions and a brand breakdown
  - A tar calculator, or a nicotine calculator when vaping
- **Tracking:**
  - A gap of more than 20 minutes starts a new scrolling session.
  - Everything is stored in `localStorage` and never leaves your browser.
  - The extension and the demo keep separate histories.

## Realistic cigs

The stats screen has a **Realistic cigs** switch under *Pace*. It makes everything last longer, at real-world pace:

| | Default | Realistic cigs |
| --- | --- | --- |
| One cigarette, steady scrolling | ~20 s | ~5 min (about 10 puffs, like a real one) |
| Left burning untouched | ~7 min | ~10 min |
| Geek Bar blinker | 5 s draw | 8 s draw |
| A pause that ends a hit | 0.4 s | 0.9 s |

## Controls

**Demo**

| Key / action | Does |
| --- | --- |
| Scroll, or hold **Space** / **Drag** | Take a drag, or a hit on the Geek Bar |
| **L** | Light, or take a new one |
| **A** | Tap the ash |
| **S** | Stub it out |
| **P** | Pop the menthol capsule |
| **B** / **Shift+B** | Next / previous brand, Geek Bar included |
| **T**, or click the pack / Geek Bar | Stats screen (**Esc** closes it) |
| **H**, or Stats → **Put it away** | Hide it and pause all tracking; press again (or **Bring it back**) to carry on where you left off |
| Drag on the cigarette | Spin it |

**On X**

| Action | Does |
| --- | --- |
| Scroll the feed | Smoke / vape |
| Click the cigarette | Tap the ash, or light the next one when it's out |
| Long-press the cigarette | Stub it out |
| Drag it | Move it anywhere (the position is remembered) |
| Click the pill above it | Stats screen and brand picker |
| Click the Geek Bar | Stats screen |
| Hover it: **‹ brand ›** / **Pop** | Switch brand / crush the menthol capsule |
| **Alt+B** / **Alt+Shift+B** | Next / previous brand, Geek Bar included |
| **Alt+P** | Pop the menthol capsule |
| **Alt+T** | Stats screen (**Esc** closes it) |
| Hover: **Hide**, **Alt+H**, or Stats → **Put it away** | Hide it and pause tracking; click the small pill left behind (or **Alt+H**) to bring it back |

X already uses the plain letter keys (J/K, L, B, T…), so on X the shortcuts sit on **Alt / Option** and are ignored while you're typing. Swapping brands keeps each brand's own pack count; a cigarette that's already lit just changes brand, and the next one comes out of the new brand's pack.

## Project layout

```
manifest.json      MV3 manifest: content script on x.com / twitter.com
ext/loader.js      content script, imports src/overlay.js from the extension
index.html         standalone demo (import map → vendor/three)
dev/mock.html      fake X feed for testing the overlay
src/
  main.js          demo scene, input, HUD
  overlay.js       X overlay in a shadow root
  cigarette.js     cigarette mesh + burn/ash/smoke shader
  fx.js            particle smoke, ash flakes, sparks, flame
  pack.js          3D flip-top pack of 20
  vape.js          Geek Bar Pulse: model, screen, draw / blinker logic
  cloud.js         full-screen exhale (WebGL fluid sim, 2D sprite fallback)
  brands.js        brand looks, pack art colours, tar / nic / CO
  stats.js         tracker: sessions, days, all-time, packs, puffs
  panel.js         stats screen + calculators
```

## Notes

- Health numbers are rough label-style estimates for fun, not medical advice. "Life, est." uses the often-quoted ~20 minutes per cigarette. Geek Bar nicotine is 16 mL × 5% ÷ 15,000 puffs ≈ 0.053 mg a puff.
- The exhale's fluid solver is adapted from [PavelDoGreat/WebGL-Fluid-Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) (MIT, © 2017 Pavel Dobryakov).
- Brand names and pack designs belong to their owners; they're used here as parody.
