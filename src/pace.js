// How fast things burn. "Quick" is the arcade pace; "realistic" follows the measured numbers:
// ~10 two-second puffs over ~5 min per cigarette (NIDA), ~10 min to smoulder out untouched,
// vape puffs ~3 s on average, disposables cutting off around 8–10 s.
export const PACES = {
  quick: { idle: 0.0125, drag: 0.22, blink: 5, gap: 0.4 },
  real: { idle: 0.0085, drag: 0.0085, blink: 8, gap: 0.9 },
};
export const pace = { ...PACES.quick, realistic: false };
export function setPace(realistic) { Object.assign(pace, realistic ? PACES.real : PACES.quick, { realistic: !!realistic }); }
