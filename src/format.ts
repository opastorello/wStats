import { locale, t } from "./i18n";

/** A number and its unit, kept apart so the unit can be drawn smaller. */
export interface Qty {
  v: string;
  u: string;
}

const nf = (digits: number) =>
  new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
const nf0 = nf(0);
const nf1 = nf(1);
const nf2 = nf(2);

const UNITS = ["B", "KB", "MB", "GB", "TB"];

/** `5.9 GB`, `851 MB`, `274.7 GB`: megabytes and below are whole, gigabytes keep one decimal. */
export function bytes(n: number): Qty {
  let i = 0;
  while (n >= 1024 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  if (n >= 999.5 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  const digits = i >= 3 || (i > 0 && n < 10) ? 1 : 0;
  return { v: (digits ? nf1 : nf0).format(n), u: UNITS[i] };
}

/** Transfer rate with KB/s as the smallest unit: `0 KB/s`, `530 KB/s`, `1,3 MB/s`. */
export function rate(bps: number): Qty {
  let n = bps / 1024;
  let i = 1;
  while (n >= 999.5 && i < UNITS.length - 1) {
    n /= 1024;
    i++;
  }
  const digits = i >= 2 && n < 100 ? 1 : 0;
  return { v: (digits ? nf1 : nf0).format(n), u: `${UNITS[i]}/s` };
}

/** Compact rate for narrow columns: `140K`, `8,8M`. */
export function rateShort(bps: number): Qty {
  if (bps < 512) return { v: "–", u: "" };
  const q = rate(bps);
  return { v: q.v, u: q.u[0] };
}

export const pct = (n: number): Qty => ({ v: nf0.format(Math.round(n)), u: "%" });

/** One decimal under 10%, so small processes do not all read "0%". */
export const pctFine = (n: number): Qty => ({ v: (n < 9.95 ? nf1 : nf0).format(n), u: "%" });

export const ghz = (mhz: number): Qty => ({ v: nf2.format(mhz / 1000), u: "GHz" });

export const int = (n: number) => nf0.format(n);

export function duration(secs: number): string {
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d > 0) return `${d} ${t.days(d)}, ${h} ${t.hours(h)}`;
  if (h > 0) return `${h} ${t.hours(h)}, ${m} ${t.min}`;
  return `${m} ${t.min}`;
}

export const qtyText = (q: Qty) => (q.u ? `${q.v} ${q.u}` : q.v);

/** Milliwatts as watts with one decimal: `7,2 W`. */
export const watts = (mw: number): Qty => ({ v: nf1.format(Math.abs(mw) / 1000), u: "W" });

/** Milliwatt-hours as watt-hours: `54,0 Wh`. */
export const wattHours = (mwh: number): Qty => ({ v: nf1.format(mwh / 1000), u: "Wh" });
