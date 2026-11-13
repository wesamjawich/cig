// Cigarette "brands": how the stick looks, how its pack is printed, and what one costs your lungs.
// tar / nic / co are mg per cigarette, rough label-style figures, used by the stats tar calculator.
// Colours are linear-ish 0..1 for the shader; pack colours are CSS.

const C = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

export const BRANDS = [
  {
    id: 'classic', name: 'Classic Gold', short: 'Classic', blurb: 'Cork tip, twin gold rings.',
    tar: 10, nic: 0.8, co: 10,
    look: {
      paper: [0.90, 0.89, 0.86], tipA: [0.74, 0.46, 0.20], tipB: [0.92, 0.72, 0.40], cork: 1,
      band: [1.0, 0.76, 0.33], bandMetal: 1, bands: [1, 1], filter: [0.90, 0.88, 0.83], charcoal: 0,
      stars: 0, print: [0, 0, 0], tobacco: [1, 1, 1],
    },
    pack: { bg: '#f4efe4', ink: '#141414', accent: '#c9a046', accent2: '#8d1d1d', style: 'roof' },
  },
  {
    id: 'menthol', name: 'Menthol Pop', short: 'Menthol', blurb: 'Click the capsule for an icy hit.',
    tar: 8, nic: 0.6, co: 8, capsule: true, mint: [0.55, 0.95, 0.82],
    look: {
      paper: [0.93, 0.94, 0.93], tipA: [0.93, 0.95, 0.94], tipB: [0.97, 0.98, 0.97], cork: 0.15,
      band: [0.25, 0.78, 0.62], bandMetal: 0.25, bands: [1, 0], filter: [0.93, 0.94, 0.92], charcoal: 0,
      stars: 0, print: [0, 0, 0], tobacco: [1, 1, 1],
    },
    pack: { bg: '#0f8a73', bg2: '#5fd6b8', ink: '#ffffff', accent: '#d8fff4', accent2: '#0a4d42', style: 'wave' },
  },
  {
    id: 'sevenstars', name: 'Seven Stars', short: '7 Stars', blurb: 'The first charcoal filter. Silver stars on white.',
    tar: 14, nic: 1.2, co: 13,
    look: {
      paper: [0.95, 0.95, 0.94], tipA: [0.95, 0.95, 0.95], tipB: [0.98, 0.98, 0.98], cork: 0.1,
      band: C('#8f97ab'), bandMetal: 1, bands: [0, 1], filter: [0.86, 0.86, 0.85], charcoal: 1,
      stars: 1, print: C('#1c2250'), tobacco: [1, 1, 1],
    },
    pack: { bg: '#f4f4f1', bg2: '#dcdcd8', ink: '#141414', accent: '#a9abb0', accent2: '#c2a35c', tab: '#1c2250', style: 'stars' },
  },
  {
    id: 'mevius', name: 'Mevius Original', short: 'Mevius', blurb: 'Formerly Mild Seven. Gold arc on navy.',
    tar: 10, nic: 0.8, co: 9,
    look: {
      paper: [0.95, 0.95, 0.95], tipA: [0.94, 0.94, 0.94], tipB: [0.98, 0.98, 0.98], cork: 0.05,
      band: C('#2b3a9e'), bandMetal: 0.35, bands: [0, 1], filter: [0.92, 0.92, 0.92], charcoal: 1,
      stars: 0, print: C('#2b3a9e'), tobacco: [1, 1, 1],
    },
    pack: { bg: '#232a86', bg2: '#0c0f3d', ink: '#d9b25a', accent: '#f4efe3', accent2: '#7d88e0', style: 'arc' },
  },
  {
    id: 'blackdevil', name: 'Black Devil', short: 'Devil', blurb: 'Matte black paper, gold ring, sweet smoke.',
    tar: 7, nic: 0.5, co: 10, smoke: { tint: [0.62, 0.55, 0.52], amount: 0.16 },
    look: {
      paper: [0.035, 0.033, 0.035], tipA: [0.03, 0.03, 0.032], tipB: [0.07, 0.065, 0.07], cork: 0.25,
      band: C('#d1a64e'), bandMetal: 1, bands: [1, 0], filter: [0.10, 0.10, 0.10], charcoal: 0,
      stars: 0, print: C('#c9a24a'), tobacco: [0.9, 0.8, 0.8],
    },
    pack: { bg: '#0a0a0a', bg2: '#1b1b1d', ink: '#cfd0d2', accent: '#d42a2f', accent2: '#c9a24a', style: 'devil' },
  },
  {
    id: 'kretek', name: 'Kretek Clove', short: 'Kretek', blurb: 'Brown paper, clove that crackles.',
    tar: 18, nic: 1.4, co: 16, crackle: 1, smoke: { tint: [0.78, 0.70, 0.60], amount: 0.14 },
    look: {
      paper: [0.32, 0.20, 0.12], tipA: [0.52, 0.30, 0.13], tipB: [0.70, 0.48, 0.24], cork: 1,
      band: [0.95, 0.72, 0.30], bandMetal: 1, bands: [1, 0], filter: [0.82, 0.76, 0.66], charcoal: 0,
      stars: 0, print: [0, 0, 0], tobacco: [0.75, 0.62, 0.55],
    },
    pack: { bg: '#3a1f12', bg2: '#5e3418', ink: '#f1d79a', accent: '#d8a548', accent2: '#a3261c', style: 'kretek' },
  },
  // disposable vapes: no tar, nicotine per puff (16 mL × 50 mg/mL ÷ 15,000 puffs)
  {
    id: 'geekbar', kind: 'vape', name: 'Geek Bar Pulse', short: 'Geek Bar', flavour: 'Fcuking Fab', blurb: '15,000 puffs, full-screen display. Scroll till it blinks.',
    tar: 0, nic: 0.053, co: 0, puffs: 15000, ml: 16, nicPct: 5, price: 20,
    device: { top: '#ff5f8f', bot: '#ffb27a', shell: '#ffd6e2', led: '#ff8a3d' },
    pack: { bg: '#ff5f8f', bg2: '#ffb27a', ink: '#ffffff', accent: '#ffd400', accent2: '#ff8a3d', style: 'vape' },
  },
  {
    id: 'geekbar-blue', kind: 'vape', name: 'Geek Bar Pulse', short: 'Blue Razz', flavour: 'Blue Razz Ice', blurb: '15,000 puffs of blue. Scroll till it blinks.',
    tar: 0, nic: 0.053, co: 0, puffs: 15000, ml: 16, nicPct: 5, price: 20,
    device: { top: '#3f6bff', bot: '#9a5cff', shell: '#d4defc', led: '#5aa0ff' },
    pack: { bg: '#3f6bff', bg2: '#9a5cff', ink: '#ffffff', accent: '#ffd400', accent2: '#5aa0ff', style: 'vape' },
  },
];

const BY_ID = Object.fromEntries(BRANDS.map((b) => [b.id, b]));
export const brand = (id) => BY_ID[id] || BRANDS[0];
export const isVape = (id) => brand(id).kind === 'vape';
