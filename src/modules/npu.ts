import type { State } from "../data";
import { bytes, pctFine } from "../format";
import { t } from "../i18n";
import type { ProcRow } from "../types";
import { card, h, legend, procList, setText } from "../ui";
import { footer, type Module } from "./common";
import { historyGraph } from "./readings";

/** `"Intel(R) AI Boost"` -> `"Intel AI Boost"`. */
const shortName = (name: string) => name.replace(/\((R|TM)\)/gi, "").replace(/\s+/g, " ").trim();

export function npuModule(): Module {
  const usage = card(t.npu);
  const graph = historyGraph("npu", "--blue", 100, (m) => m.npu ?? null);
  const now = legend(null, t.usage);
  usage.el.append(graph.el, now.el);

  const memory = card();
  const shared = legend(null, t.shared);
  memory.el.append(shared.el);

  const apps = card(t.usingNpu);
  const list = procList(1);
  const none = h("p", "note", t.noNpuApps);
  apps.el.append(list.el, none);

  const el = h("div", "module", usage.el, memory.el, apps.el, footer("taskmgr", "eventvwr", "terminal", "perfmon", "resmon"));

  return {
    el,
    update({ snapshot: s, history: hist }: State) {
      const n = s.npu;
      if (!n) return;
      setText(usage.right!, shortName(n.name));
      graph.set(hist.npu);
      now.set(pctFine(n.util));
      shared.set(bytes(n.sharedUsed));
      const rows: ProcRow[] = n.procs.slice(0, 5).map((p) => ({ name: p.name, exe: p.exe, count: 1, cpu: p.util, mem: 0, diskRead: 0, diskWrite: 0 }));
      list.set(rows, (p) => [pctFine(p.cpu)]);
      none.hidden = rows.length > 0;
    },
  };
}
