import { stackedBars } from "../charts";
import type { State } from "../data";
import { bytes, pctFine, qtyText } from "../format";
import { t } from "../i18n";
import { bucket, minutes } from "../history";
import { card, h, legend, rangedGraph, setText } from "../ui";
import { footer, type Module } from "./common";
import { gpuGauges, shortGpuName } from "./cpu";


export function gpuModule(): Module {
  const usage = card(t.gpu);
  const graph = rangedGraph("gpu", "graph-cpu");
  usage.el.append(graph.el);
  let last: number[] = [];
  const draw = () => {
    const r = graph.tabs.value;
    if (r === "live") return stackedBars(graph.canvas, [{ data: last, color: "--blue" }]);
    minutes().then((m) => {
      const g = bucket(m, r, (x) => x.gpu);
      stackedBars(graph.canvas, [{ data: g, color: "--blue" }], 100, g.length);
    });
  };
  graph.tabs.onChange = draw;

  const rings = card();
  const gg = gpuGauges();
  rings.el.append(gg.el);

  const engines = card(t.engines);
  const engineList = h("div");
  engines.el.append(engineList);
  let engineRows = new Map<string, ReturnType<typeof legend>>();

  const memory = card();
  const ded = legend(null, t.dedicated);
  const shr = legend(null, t.shared);
  memory.el.append(ded.el, shr.el);

  const el = h("div", "module", usage.el, rings.el, engines.el, memory.el, footer("taskmgr", "eventvwr", "terminal", "dxdiag", "resmon"));

  return {
    el,
    update({ snapshot: s, history: hist }: State) {
      const g = s.gpus[0];
      if (!g) return;
      setText(usage.right!, shortGpuName(g.name));
      last = hist.gpus[0] ?? [];
      draw();
      gg.set(g);

      const shown = g.engines.filter(([, v], i) => i < 5 || v > 0.5);
      const names = shown.map(([n]) => n).join("|");
      if (names !== [...engineRows.keys()].join("|")) {
        engineRows = new Map(shown.map(([n]) => [n, legend(null, t.engineNames[n] ?? n)]));
        engineList.replaceChildren(...[...engineRows.values()].map((r) => r.el));
      }
      shown.forEach(([n, v]) => engineRows.get(n)!.set(pctFine(v)));

      ded.el.hidden = g.dedicatedTotal === 0;
      ded.set(bytes(g.dedicatedUsed));
      setText(ded.name, `${t.dedicated} (${t.of} ${qtyText(bytes(g.dedicatedTotal))})`);
      shr.set(bytes(g.sharedUsed));
      setText(shr.name, `${t.shared} (${t.of} ${qtyText(bytes(g.sharedTotal))})`);
    },
  };
}
