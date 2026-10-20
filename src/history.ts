// The long history (24 h of one-minute averages kept by Rust), bucketed for the graphs.

import { inTauri } from "./data";
import { t } from "./i18n";

export type Range = "live" | "1h" | "24h";

export interface Minute {
  t: number; // minutes since the epoch
  cu: number;
  cs: number;
  mem: number;
  nu: number;
  nd: number;
  dr: number;
  dw: number;
  gpu: number;
  bat: number | null;
  chg: number;
  pw?: number | null;
  tc?: number | null;
  fan?: number | null;
  npu?: number | null;
}

export type Series = (number | null)[];

let cache: { at: number; data: Promise<Minute[]> } | null = null;

/** Fetched at most every 20 s: minutes only change once a minute. */
export function minutes(): Promise<Minute[]> {
  if (!cache || Date.now() - cache.at > 20_000) {
    cache = { at: Date.now(), data: load() };
  }
  return cache.data;
}

async function load(): Promise<Minute[]> {
  if (!inTauri) return mockMinutes();
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<Minute[]>("get_long_history").catch(() => []);
}

/** Buckets per range: 1 h = 60 one-minute bars, 24 h = 96 bars of 15 minutes. */
const SHAPE: Record<Exclude<Range, "live">, { span: number; buckets: number }> = {
  "1h": { span: 60, buckets: 60 },
  "24h": { span: 24 * 60, buckets: 96 },
};

/**
 * Averages `pick` over each bucket ending now. Buckets with no minutes (wStats was not
 * running) are `null`, which the charts draw as a gap.
 */
export function bucket(data: Minute[], range: Exclude<Range, "live">, pick: (m: Minute) => number | null): Series {
  const { span, buckets } = SHAPE[range];
  const per = span / buckets;
  const now = Math.floor(Date.now() / 60_000);
  const start = now - span;
  const sum = new Array<number>(buckets).fill(0);
  const count = new Array<number>(buckets).fill(0);
  for (const m of data) {
    if (m.t < start || m.t >= now) continue;
    const v = pick(m);
    if (v === null || Number.isNaN(v)) continue;
    const i = Math.floor((m.t - start) / per);
    sum[i] += v;
    count[i]++;
  }
  return sum.map((s, i) => (count[i] ? s / count[i] : null));
}

export const RANGES: Range[] = ["live", "1h", "24h"];
export const rangeLabel = (r: Range) => (r === "live" ? t.now : r === "1h" ? "1 h" : "24 h");

export function savedRange(key: string, fallback: Range = "live"): Range {
  try {
    const v = localStorage.getItem(`wstats.range.${key}`) as Range | null;
    return v && RANGES.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

export function saveRange(key: string, r: Range) {
  try {
    localStorage.setItem(`wstats.range.${key}`, r);
  } catch {
    /* private mode: the choice just does not stick */
  }
}

/** A day of fake minutes for the browser preview, with a two-hour gap. */
function mockMinutes(): Minute[] {
  const now = Math.floor(Date.now() / 60_000);
  const out: Minute[] = [];
  for (let t = now - 24 * 60; t < now; t++) {
    if (t > now - 9 * 60 && t < now - 7 * 60) continue;
    const day = Math.sin(((t % 1440) / 1440) * Math.PI * 2 - 1.2) * 0.5 + 0.5;
    const r = Math.abs(Math.sin(t * 12.9898) * 43758.5453) % 1;
    out.push({
      t,
      cu: 6 + day * 25 + r * 8,
      cs: 3 + day * 6 + r * 3,
      mem: 55 + day * 15,
      nu: (20 + day * 200 * r) * 1024,
      nd: (60 + day * 900 * r) * 1024,
      dr: (100 + day * 2000 * r) * 1024,
      dw: (200 + day * 1500 * r) * 1024,
      gpu: 4 + day * 20 * r,
      bat: 100 - ((t - (now - 1440)) % 400) / 5,
      chg: (t - (now - 1440)) % 400 > 330 ? 1 : 0,
      pw: 4 + day * 14 + r * 4,
      tc: 45 + day * 25 + r * 6,
      fan: 2200 + day * 2200 + r * 300,
    });
  }
  return out;
}
