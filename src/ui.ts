// Tiny DOM toolkit for the popups. Everything is built once and then patched in place
// on every tick, so nothing flickers and images are not reloaded.

import type { Qty } from "./format";
import { ring, type Ring, type Segment } from "./charts";
import { appIcon } from "./data";
import { RANGES, type Range, rangeLabel, savedRange, saveRange } from "./history";
import type { ProcRow } from "./types";

type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  for (const c of children) if (c) el.append(c);
  return el;
}

export function setText(el: Element, text: string) {
  if (el.textContent !== text) el.textContent = text;
}

/** A value with its unit drawn smaller: `3,0 GB`, `13%`. */
export function qty(cls = "") {
  const v = h("span", "v");
  const u = h("span", "u");
  const el = h("span", `qty ${cls}`.trim(), v, u);
  return {
    el,
    set(q: Qty) {
      setText(v, q.v);
      setText(u, q.u);
    },
  };
}

/** A rounded card with an optional section header and an optional value on the right. */
export function card(header?: string, cls = "") {
  const el = h("section", `card ${cls}`.trim());
  let right: HTMLElement | undefined;
  if (header !== undefined) {
    right = h("span", "card-right");
    el.append(h("header", "card-head", h("span", "section", header), right));
  }
  return { el, right };
}

/** `● Label ......... value` */
export function legend(color: string | null, label: string) {
  const value = qty("legend-value");
  const name = h("span", "legend-label", label);
  const el = h("div", "legend", color ? dot(color) : null, name, value.el);
  return { el, name, set: value.set };
}

export function dot(color: string) {
  const d = h("span", "dot");
  d.style.background = `var(${color})`;
  return d;
}

/** Ring gauge with a big centred value and an uppercase caption. */
export function gauge(caption: string, size: "lg" | "md" | "sm" | "xs" = "md", segments = 1) {
  const r: Ring = ring({ lg: 7, md: 9, sm: 9, xs: 16 }[size], segments);
  const value = qty("gauge-value");
  const cap = h("span", "gauge-caption", caption);
  // The caption is always in the DOM so it can be filled later (sensor rings).
  const el = h("div", `gauge gauge-${size}`, r.el, h("div", "gauge-center", value.el, cap));
  return {
    el,
    caption: cap,
    set(q: Qty, segs: Segment[]) {
      value.set(q);
      r.set(segs);
    },
  };
}

/** A big "530 KB/s" figure with its legend dot underneath. */
export function bigFigure(color: string, label: string) {
  const value = qty("big");
  const el = h("div", "figure", value.el, h("div", "figure-label", dot(color), label));
  return { el, set: value.set };
}

/** Rows of `[icon] name ...... value(s)`. Rows are reused between ticks. */
export function procList(columns: number) {
  const el = h("div", "procs");
  const rows: { row: HTMLElement; img: HTMLImageElement; name: HTMLElement; vals: ReturnType<typeof qty>[]; exe: string }[] = [];
  return {
    el,
    set(items: ProcRow[], values: (p: ProcRow) => Qty[]) {
      while (rows.length < items.length) {
        const img = h("img", "app-icon");
        img.alt = "";
        img.decoding = "async";
        const name = h("span", "proc-name");
        const vals = Array.from({ length: columns }, () => qty("proc-value"));
        const row = h("div", "proc", img, name, ...vals.map((v) => v.el));
        el.append(row);
        rows.push({ row, img, name, vals, exe: "" });
      }
      rows.forEach((r, i) => {
        const p = items[i];
        r.row.hidden = !p;
        if (!p) return;
        setText(r.name, p.count > 1 ? `${p.name}` : p.name);
        r.name.title = p.count > 1 ? `${p.name} (${p.count})` : p.name;
        if (r.exe !== p.exe) {
          r.exe = p.exe;
          appIcon(p.exe, p.name).then((src) => {
            if (r.exe === p.exe) r.img.src = src;
          });
        }
        values(p).forEach((q, k) => r.vals[k]?.set(q));
      });
    },
  };
}

/** Column headings aligned with `procList` values (`↑ ↓`, `R W`). */
export function procHeader(...labels: string[]) {
  return h("div", "proc proc-head", h("span", "app-icon"), h("span", "proc-name"), ...labels.map((l) => h("span", "proc-value", l)));
}

/** "Agora · 1 h · 24 h" tabs above a graph; remembers the choice per graph. */
export function rangeTabs(key: string, fallback: Range = "live") {
  let value = savedRange(key, fallback);
  const el = h("div", "range-tabs");
  const buttons = RANGES.map((r) => {
    const b = h("button", r === value ? "active" : "", rangeLabel(r));
    b.onclick = (e) => {
      e.stopPropagation();
      value = r;
      saveRange(key, r);
      buttons.forEach((x, i) => x.classList.toggle("active", RANGES[i] === r));
      api.onChange?.();
    };
    return b;
  });
  el.append(...buttons);
  const api = {
    el,
    get value() {
      return value;
    },
    onChange: undefined as undefined | (() => void),
  };
  return api;
}

/** A graph canvas with range tabs over it. */
export function rangedGraph(key: string, cls: string, fallback: Range = "live") {
  const canvas = h("canvas", `graph ${cls}`);
  const tabs = rangeTabs(key, fallback);
  return { el: h("div", "graph-wrap", tabs.el, canvas), canvas, tabs };
}
