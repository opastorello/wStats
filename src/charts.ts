// Canvas bar charts and SVG rings: thin vertical bars, one per
// sample, newest on the right; rings with a dark track and a coloured arc.

/** Reads a colour token where the canvas sits, so a themed subtree gets its own palette. */
const css = (el: Element, name: string) => getComputedStyle(el).getPropertyValue(name).trim();

/**
 * Prepares a canvas for its CSS size at device resolution; returns device-pixel metrics.
 * With `bars`, the bar width stretches so exactly that many fill the width (long ranges);
 * otherwise bars are 2 px and as many fit as the width allows (live).
 */
function prepare(canvas: HTMLCanvasElement, bars?: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(canvas.clientWidth * dpr);
  const h = Math.round(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, w, h);
  // Bars snap to whole device pixels so they stay crisp at 125%/175% scaling.
  const gap = Math.max(1, Math.round(1 * dpr));
  const bar = bars ? Math.max(1, Math.floor((w + gap) / bars) - gap) : Math.max(1, Math.round(2 * dpr));
  const count = bars ?? Math.floor((w + gap) / (bar + gap));
  return { ctx, w, h, bar, gap, count, dpr };
}

const tail = (a: Data, n: number) => a.slice(Math.max(0, a.length - n));

/** Missing samples (`null`) are drawn as gaps. */
export type Data = (number | null)[];

export interface Layer {
  data: Data;
  color: string; // CSS variable name, e.g. "--blue"
}

/** Stacked bars growing up from the bottom; `max` is the value of a full-height bar. */
export function stackedBars(canvas: HTMLCanvasElement, layers: Layer[], max = 100, bars?: number) {
  const { ctx, w, h, bar, gap, count } = prepare(canvas, bars);
  const n = Math.min(count, Math.max(...layers.map((l) => l.data.length)));
  const series = layers.map((l) => tail(l.data, n));
  const colors = layers.map((l) => css(canvas, l.color));
  for (let i = 0; i < n; i++) {
    const x = w - (n - i) * (bar + gap) + gap;
    let y = h;
    series.forEach((s, k) => {
      const v = s[i] ?? 0;
      const bh = Math.round((Math.min(v, max) / max) * h);
      if (bh <= 0) return;
      ctx.fillStyle = colors[k];
      ctx.fillRect(x, y - bh, bar, bh);
      y -= bh;
    });
  }
}

/**
 * Bars mirrored around a centre line: `up` grows upwards, `down` downwards. Both halves
 * share one scale, picked from the visible peak, so the two directions stay comparable.
 * Every sample keeps a short stub so the baseline reads as a dotted line.
 */
export function mirroredBars(canvas: HTMLCanvasElement, up: Layer, down: Layer, floor: number, bars?: number) {
  const { ctx, w, h, bar, gap, count, dpr } = prepare(canvas, bars);
  const n = Math.min(count, Math.max(up.data.length, down.data.length));
  const u = tail(up.data, n);
  const d = tail(down.data, n);
  const peak = Math.max(floor, ...u.map((v) => v ?? 0), ...d.map((v) => v ?? 0));
  const mid = Math.round(h / 2);
  const half = mid - 1;
  const stub = Math.max(1, Math.round(1.5 * dpr));
  const cu = css(canvas, up.color);
  const cd = css(canvas, down.color);
  for (let i = 0; i < n; i++) {
    const x = w - (n - i) * (bar + gap) + gap;
    if (u[i] === null && d[i] === null) continue;
    const hu = Math.max(stub, Math.round(((u[i] ?? 0) / peak) * half));
    const hd = Math.max(stub, Math.round(((d[i] ?? 0) / peak) * half));
    ctx.fillStyle = cu;
    ctx.fillRect(x, mid - hu, bar, hu);
    ctx.fillStyle = cd;
    ctx.fillRect(x, mid, bar, hd);
  }
}

/**
 * Bars coloured per sample (battery: charging vs discharging).
 * `pick` returns the colour variable for sample `i`.
 */
export function stateBars(canvas: HTMLCanvasElement, data: Data, pick: (i: number) => string, max = 100, bars?: number) {
  const { ctx, w, h, bar, gap, count } = prepare(canvas, bars);
  const n = Math.min(count, data.length);
  const offset = data.length - n;
  const cache = new Map<string, string>();
  for (let i = 0; i < n; i++) {
    const x = w - (n - i) * (bar + gap) + gap;
    const v = data[offset + i];
    if (v === null) continue;
    const bh = Math.round((Math.min(v, max) / max) * h);
    const name = pick(offset + i);
    if (!cache.has(name)) cache.set(name, css(canvas, name));
    ctx.fillStyle = cache.get(name)!;
    ctx.fillRect(x, h - bh, bar, bh);
  }
}

// ---- rings -------------------------------------------------------------------------

const SVG = "http://www.w3.org/2000/svg";

export interface Segment {
  value: number; // 0..1
  color: string; // CSS variable name
}

export interface Ring {
  el: SVGSVGElement;
  set(segments: Segment[]): void;
}

/**
 * A ring gauge. `thickness` is relative to the 100-unit viewBox. A single segment gets
 * round caps; a segmented ring uses butt joins so the colours meet cleanly.
 */
export function ring(thickness = 9, maxSegments = 1): Ring {
  const el = document.createElementNS(SVG, "svg");
  el.setAttribute("viewBox", "0 0 100 100");
  el.classList.add("ring");
  const r = 50 - thickness / 2 - 0.5;
  const mk = (cls: string) => {
    const c = document.createElementNS(SVG, "circle");
    c.setAttribute("cx", "50");
    c.setAttribute("cy", "50");
    c.setAttribute("r", String(r));
    c.setAttribute("pathLength", "100");
    c.setAttribute("stroke-width", String(thickness));
    c.setAttribute("fill", "none");
    c.classList.add(cls);
    el.appendChild(c);
    return c;
  };
  mk("ring-track");
  const arcs = Array.from({ length: maxSegments }, () => mk("ring-arc"));
  arcs.forEach((a) => a.setAttribute("stroke-linecap", maxSegments === 1 ? "round" : "butt"));
  return {
    el,
    set(segments) {
      let start = 0;
      arcs.forEach((a, i) => {
        const s = segments[i];
        const len = s ? Math.max(0, Math.min(1, s.value)) * 100 : 0;
        // A round cap on a zero-length arc still paints a dot; hide it instead.
        a.style.opacity = len < 0.5 ? "0" : "1";
        a.setAttribute("stroke-dasharray", `${len} ${100 - len}`);
        a.setAttribute("stroke-dashoffset", String(-start));
        if (s) a.style.stroke = `var(${s.color})`;
        start += len;
      });
    },
  };
}
