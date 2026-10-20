import type { State } from "../data";
import { bytes, pct, qtyText } from "../format";
import { t } from "../i18n";
import { card, gauge, h, legend, procList, setText } from "../ui";
import { footer, type Module } from "./common";

/**
 * Memory split the way the ring draws it. Windows has no "wired"/"compressed" pair like
 * macOS; the closest honest mapping of Task Manager's composition is:
 * apps (in use minus kernel), kernel (non-paged pool, never leaves RAM), modified pages.
 */
export function memParts(m: State["snapshot"]["mem"]) {
  const kernel = Math.min(m.nonpagedPool, m.used);
  const modified = Math.min(m.modified, m.used - kernel);
  const apps = Math.max(0, m.used - kernel - modified);
  return { apps, kernel, modified };
}

/** Commit charge against the commit limit: the Windows analogue of memory pressure. */
export const pressure = (m: State["snapshot"]["mem"]) => (m.commitLimit ? (m.committed / m.commitLimit) * 100 : 0);

export function memModule(): Module {
  const rings = card(undefined, "rings-card");
  const press = gauge(t.pressure, "lg");
  const mem = gauge(t.memRing, "lg", 3);
  rings.el.append(h("div", "gauges gauges-2", press.el, mem.el));

  const parts = card();
  const apps = legend("--blue", t.apps);
  const kernel = legend("--green", t.kernel);
  const modified = legend("--yellow", t.modified);
  const cached = legend("--text-3", t.cached);
  const free = legend("--track", t.free);
  parts.el.append(apps.el, kernel.el, modified.el, cached.el, free.el);

  const procs = card(t.processes);
  const plist = procList(1);
  procs.el.append(plist.el);

  const commit = card();
  const committed = legend(null, t.committed);
  const paged = legend(null, t.pagedPool);
  const nonpaged = legend(null, t.nonpagedPool);
  commit.el.append(committed.el, paged.el, nonpaged.el);

  const swap = card(t.pageFile);
  const bar = h("div", "meter", h("div", "meter-fill"));
  (bar.firstChild as HTMLElement).style.background = "var(--orange)";
  swap.el.append(bar);

  const el = h(
    "div",
    "module",
    rings.el,
    parts.el,
    procs.el,
    commit.el,
    swap.el,
    footer("taskmgr", "eventvwr", "terminal", "resmon", "perfmon"),
  );

  return {
    el,
    update({ snapshot: s }) {
      const m = s.mem;
      const p = memParts(m);
      const pr = pressure(m);
      press.set(pct(pr), [{ value: pr / 100, color: pr > 90 ? "--red" : pr > 75 ? "--yellow" : "--green" }]);
      mem.set(pct(m.usedPct), [
        { value: p.apps / m.total, color: "--blue" },
        { value: p.kernel / m.total, color: "--green" },
        { value: p.modified / m.total, color: "--yellow" },
      ]);
      apps.set(bytes(p.apps));
      kernel.set(bytes(p.kernel));
      modified.set(bytes(p.modified));
      cached.set(bytes(m.cached));
      free.set(bytes(m.free));

      procs.el.hidden = !s.procs;
      if (s.procs) plist.set(s.procs.byMem.slice(0, 5), (r) => [bytes(r.mem)]);

      committed.set(bytes(m.committed));
      setText(committed.name, `${t.committed} (${t.of} ${qtyText(bytes(m.commitLimit))})`);
      paged.set(bytes(m.pagedPool));
      nonpaged.set(bytes(m.nonpagedPool));

      swap.el.hidden = m.swapTotal === 0;
      setText(swap.right!, `${qtyText(bytes(m.swapUsed))} ${t.of} ${qtyText(bytes(m.swapTotal))}`);
      (bar.firstChild as HTMLElement).style.width = `${m.swapTotal ? (m.swapUsed / m.swapTotal) * 100 : 0}%`;
    },
  };
}
