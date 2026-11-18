import type { Hourly } from "./types";

// Pure helpers for the end-to-end view: one row of the synthetic hourly table at a time.
export interface Snapshot {
  hour: number; label: string; ambientC: number; itKw: number; facilityKw: number; pue: number;
  coolingKwth: number; cop: number; compressorKw: number; gridKw: number; pvUsedKw: number;
  load: number;                 // IT load between the lowest and highest hour of the year, 0 to 1
}

export function hourLabel(start: string, hour: number): string {
  const [d, t] = start.split("T"), [y, m, day] = d.split("-").map(Number), [hh] = (t ?? "00").split(":").map(Number);
  const ms = Date.UTC(y, m - 1, day, hh) + hour * 3_600_000;
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function col(h: Hourly, name: string): number[] { return h.columns[name] ?? []; }

export function snapshot(h: Hourly, hour: number): Snapshot {
  const n = h.hours, i = ((Math.floor(hour) % n) + n) % n;
  const it = col(h, "it_kw"), fac = col(h, "facility_kw");
  let lo = Infinity, hi = -Infinity;
  for (const v of it) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const itKw = it[i] ?? 0, facilityKw = fac[i] ?? 0;
  return {
    hour: i, label: hourLabel(h.start, i), ambientC: col(h, "ambient_c")[i] ?? NaN, itKw, facilityKw,
    pue: itKw > 0 ? facilityKw / itKw : NaN, coolingKwth: col(h, "cooling_kwth")[i] ?? 0, cop: col(h, "cop")[i] ?? NaN,
    compressorKw: col(h, "compressor_kw")[i] ?? 0, gridKw: col(h, "grid_kw")[i] ?? 0, pvUsedKw: col(h, "pv_used_kw")[i] ?? 0,
    load: hi > lo ? (itKw - lo) / (hi - lo) : 0.5,
  };
}

// index of the highest or lowest value of a column
export function extremeHour(h: Hourly, column: string, kind: "max" | "min"): number {
  const v = col(h, column); let best = 0;
  for (let i = 1; i < v.length; i++) if (kind === "max" ? v[i] > v[best] : v[i] < v[best]) best = i;
  return best;
}

// visual speeds only: proportional to load, not physical velocities
export function flowSpeeds(s: { itKw: number; coolingKwth: number }, max: { itKw: number; coolingKwth: number }): { power: number; cooling: number } {
  const k = (v: number, m: number) => (m > 0 ? 0.35 + 0.65 * Math.min(1, Math.max(0, v / m)) : 0.35);
  return { power: 3 * k(s.itKw, max.itKw), cooling: 2 * k(s.coolingKwth, max.coolingKwth) };
}

export const SPEED_CHOICES: [string, number][] = [["1 h per second", 1], ["6 h per second", 6], ["1 day per second", 24], ["1 week per second", 168]];
