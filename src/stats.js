// Smoking ledger: every cigarette taken, every drag, every px scrolled, bucketed by
// scrolling session, by calendar day and all-time. Lives in localStorage so the X overlay
// (which runs in x.com's storage) and the demo page each keep their own history.
import { brand as getBrand, isVape } from './brands.js';

export const PACK_SIZE = 20;
const KEY = 'cig:stats:v1';
const SESSION_GAP = 20 * 60e3;        // this long without activity ends a scrolling session
const MAX_SESSIONS = 80;
const MAX_DAYS = 400;

const FIELDS = ['cigs', 'packs', 'drags', 'pops', 'smoked', 'tar', 'nic', 'co', 'activeMs', 'scrollPx', 'puffs', 'blinkers', 'vapeMs', 'devices'];
export const blank = () => Object.fromEntries(FIELDS.map((f) => [f, 0]));
export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function fresh() {
  return { v: 1, brand: 'classic', packs: {}, vapes: {}, cigBrand: null, hand: null, total: blank(), days: {}, sessions: [], brands: {}, settings: { price: 12 } };
}

export class Tracker {
  constructor({ key = KEY, gap = SESSION_GAP } = {}) {
    this.key = key; this.gap = gap;
    this.pending = blank();
    this.listeners = [];
    this.data = this._load();
    this.lastFlush = 0;
    addEventListener('storage', (e) => { if (e.key === this.key) { this.data = this._load(); this._notify(); } });
  }

  /* ---------------------------------------------------------------- storage */
  _load() {
    let d;
    try { d = JSON.parse(localStorage.getItem(this.key)); } catch { d = null; }
    if (!d || d.v !== 1) return fresh();
    const f = fresh();
    return { ...f, ...d, vapes: { ...d.vapes }, total: { ...blank(), ...d.total }, settings: { ...f.settings, ...d.settings } };
  }
  _save(d) { try { localStorage.setItem(this.key, JSON.stringify(d)); } catch { /* storage blocked or full */ } }
  // read-modify-write so two tabs don't clobber each other's counts
  _mutate(fn) {
    const d = this._load();
    const out = fn(d);
    this._save(d);
    this.data = d;
    this._notify();
    return out;
  }
  onChange(fn) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter((f) => f !== fn); }; }
  _notify() { for (const fn of this.listeners) fn(this); }

  _session(d, now) {
    let s = d.sessions[d.sessions.length - 1];
    if (!s || now - s.last > this.gap) {
      s = { id: now, start: now, last: now, ...blank(), brands: {} };
      d.sessions.push(s);
      if (d.sessions.length > MAX_SESSIONS) d.sessions.splice(0, d.sessions.length - MAX_SESSIONS);
    }
    return s;
  }
  _add(d, delta, now = Date.now()) {
    const k = dayKey(now);
    const day = (d.days[k] ||= blank());
    const s = this._session(d, now);
    for (const f of FIELDS) {
      const v = delta[f] || 0;
      if (!v) continue;
      d.total[f] = (d.total[f] || 0) + v; day[f] = (day[f] || 0) + v; s[f] = (s[f] || 0) + v;
    }
    s.last = now;
    const keys = Object.keys(d.days);
    if (keys.length > MAX_DAYS) for (const old of keys.sort().slice(0, keys.length - MAX_DAYS)) delete d.days[old];
    return s;
  }

  /* ----------------------------------------------------------------- events */
  get brand() { return this.data.brand; }
  setBrand(id) { this._mutate((d) => { d.brand = getBrand(id).id; if (!isVape(d.brand)) d.cigBrand = d.brand; }); }
  // the cigarette brand to fall back to while a vape is in hand
  get cigBrand() { const d = this.data; return isVape(d.brand) ? (d.cigBrand && !isVape(d.cigBrand) ? d.cigBrand : 'classic') : d.brand; }
  puffsLeft(id = this.brand) { const n = this.data.vapes[id]; return n == null ? getBrand(id).puffs : n; }

  // one puff on a disposable; an empty one is thrown away and a fresh one opened
  hit({ ms = 0, blinker = false } = {}, id = this.brand) {
    const b = getBrand(id);
    this.flush(true);
    return this._mutate((d) => {
      let left = d.vapes[id], opened = false;
      if (left == null || left <= 0) { left = b.puffs; opened = true; }
      left -= 1;
      d.vapes[id] = left;
      this._add(d, { puffs: 1, blinkers: blinker ? 1 : 0, vapeMs: ms, nic: b.nic, devices: opened ? 1 : 0 });
      return { left, opened };
    });
  }

  // cigarettes left in the current pack of a brand (an unopened pack counts as full)
  left(id = this.brand) { const n = this.data.packs[id]; return n == null ? PACK_SIZE : n; }
  isSealed(id = this.brand) { return this.data.packs[id] == null; }

  // shake one out; opens a new pack when the current one is empty
  take(id = this.brand) {
    this.flush(true);
    return this._mutate((d) => {
      const now = Date.now();
      let left = d.packs[id], opened = false;
      if (left == null || left <= 0) { left = PACK_SIZE; opened = true; }
      left -= 1;
      d.packs[id] = left;
      d.hand = { brand: id, t: now };
      d.brands[id] = (d.brands[id] || 0) + 1;
      const s = this._add(d, { cigs: 1, packs: opened ? 1 : 0 }, now);
      s.brands[id] = (s.brands[id] || 0) + 1;
      return { left, opened };
    });
  }
  // a taken but unlit cigarette survives a reload; once lit it is spent
  get hand() { return this.data.hand; }
  // an unlit cigarette goes back in its pack (switching brands before lighting it)
  putBack(id) {
    this._mutate((d) => {
      if (!d.hand || d.hand.brand !== id || d.packs[id] == null || d.packs[id] >= PACK_SIZE) return;
      d.packs[id] += 1; d.hand = null;
      d.brands[id] = Math.max(0, (d.brands[id] || 0) - 1);
      const s = this._add(d, { cigs: -1 });
      if (s.brands[id]) s.brands[id] -= 1;
    });
  }
  clearHand() { if (this.data.hand) this._mutate((d) => { d.hand = null; }); }

  drag() { this.pending.drags += 1; }
  pop() { this.pending.pops += 1; this.flush(true); }
  burn(frac, id = this.brand) {
    const b = getBrand(id), p = this.pending;
    p.smoked += frac; p.tar += frac * b.tar; p.nic += frac * b.nic; p.co += frac * b.co;
  }
  scroll(px) { this.pending.scrollPx += Math.abs(px); }
  active(ms) { this.pending.activeMs += ms; }

  flush(force = false) {
    const now = Date.now();
    if (!force && now - this.lastFlush < 1500) return;
    this.lastFlush = now;
    const p = this.pending;
    if (!FIELDS.some((f) => p[f])) return;
    this.pending = blank();
    this._mutate((d) => { this._add(d, p, now); });
  }

  setSetting(k, v) { this._mutate((d) => { d.settings[k] = v; }); }
  reset() {
    this.pending = blank();
    this._mutate((d) => { const f = fresh(); Object.keys(d).forEach((k) => delete d[k]); Object.assign(d, f); });
  }

  /* ------------------------------------------------------------------ views */
  // current numbers including whatever is still buffered
  snapshot(now = Date.now()) {
    const d = this.data, p = this.pending;
    const plus = (b) => { const o = { ...blank(), ...b }; for (const f of FIELDS) o[f] += p[f]; return o; };
    const last = d.sessions[d.sessions.length - 1];
    const live = last && now - last.last <= this.gap;
    const session = live ? { ...plus(last), start: last.start, last: now, brands: last.brands } : { ...plus({}), start: now, last: now, brands: {} };
    const today = plus(d.days[dayKey(now)]);
    const total = plus(d.total);
    const sessions = d.sessions.slice(0, live ? -1 : undefined).concat([session]).reverse();
    return { session, today, total, days: d.days, sessions, brands: d.brands, settings: d.settings, brand: d.brand, packs: d.packs, vapes: d.vapes };
  }
}
