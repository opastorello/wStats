import type { State } from "../data";
import { t } from "../i18n";
import { card, h, legend } from "../ui";
import { footer, peak, type Module } from "./common";
import { headlineRings, historyGraph, readingList, watts } from "./readings";

/** Short ring captions by RAPL domain (ids end in _PKG, _PP0, ...). */
function ringLabel(id: string, label: string) {
  const domain = id.split("_").pop();
  return { PKG: t.package, PP0: t.cores, PP1: "GPU", DRAM: t.memory, PSYS: t.platform }[domain ?? ""] ?? label;
}

export function powerModule(): Module {
  const rings = headlineRings();

  const graphCard = card(t.powerDraw);
  const graph = historyGraph("power", "--orange", 15, (m) => m.pw ?? null);
  graphCard.el.append(graph.el);

  const list = card(t.components);
  const parts = readingList(watts);
  const batteryRow = legend(null, t.battery);
  list.el.append(parts.el, batteryRow.el);

  const note = card(undefined, "note-card");
  note.el.append(h("p", "note", t.noPowerNote));

  const el = h("div", "module", rings.el, graphCard.el, list.el, note.el, footer("power", "taskmgr", "eventvwr", "terminal", "resmon"));

  return {
    el,
    update({ snapshot: s, history: hist }: State) {
      const all = s.sensors.power;
      const top = Math.max(15, peak(hist.power, hist.power.length));
      rings.set(all.slice(0, 3).map((r) => ({ label: ringLabel(r.id, r.label), q: watts(r.value), frac: r.value / top, color: "--orange" })));
      graphCard.el.hidden = hist.power.length === 0;
      graph.set(hist.power);

      const rate = s.battery?.rateMw ?? null;
      list.el.hidden = all.length === 0 && !rate;
      parts.set(all);
      batteryRow.el.hidden = !rate;
      if (rate) {
        const w = watts(Math.abs(rate) / 1000);
        batteryRow.set({ v: `${rate > 0 ? "+" : "−"}${w.v}`, u: w.u });
      }
      note.el.hidden = all.length > 0 || !!rate;
    },
  };
}
