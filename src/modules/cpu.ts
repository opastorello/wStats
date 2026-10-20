import { stackedBars } from "../charts";
import type { State } from "../data";
import { duration, ghz, int, pct, pctFine } from "../format";
import { t } from "../i18n";
import type { Gpu } from "../types";
import { bucket, minutes } from "../history";
import { card, gauge, h, legend, procList, rangedGraph, setText } from "../ui";
import { footer, type Module } from "./common";

/** "Intel(R) Arc(TM) 140V GPU (16GB)" -> "Arc 140V GPU". */
export function shortGpuName(name: string) {
  return name
    .replace(/\((R|TM)\)/gi, "")
    .replace(/^(Intel|NVIDIA|AMD|Advanced Micro Devices, Inc\.)\s+/i, "")
    .replace(/\s*\(\d+GB\)/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Integrated GPUs live in shared memory; discrete ones in their own VRAM. */
export function gpuMemPct(g: Gpu) {
  const discrete = g.dedicatedTotal > 512 * 1024 ** 2;
  const used = discrete ? g.dedicatedUsed : g.sharedUsed;
  const total = discrete ? g.dedicatedTotal : g.sharedTotal;
  return total ? (used / total) * 100 : 0;
}

export const engine = (g: Gpu, name: string) =>
  g.engines.filter(([n]) => n.toLowerCase().startsWith(name.toLowerCase())).reduce((m, [, v]) => Math.max(m, v), 0);

export function gpuGauges() {
  const gs = [gauge(t.gpu, "sm"), gauge("MEM", "sm"), gauge("3D", "sm"), gauge(t.video.toUpperCase(), "sm")];
  return {
    el: h("div", "gauges gauges-4", ...gs.map((g) => g.el)),
    set(g: Gpu) {
      const vals = [g.util, gpuMemPct(g), engine(g, "3D"), engine(g, "Video")];
      vals.forEach((v, i) => gs[i].set(pct(v), [{ value: v / 100, color: "--blue" }]));
    },
  };
}

export function cpuModule(): Module {
  // Usage graph
  const usage = card(t.cpu);
  const graph = rangedGraph("cpu", "graph-cpu");
  const user = legend("--blue", t.user);
  const sys = legend("--green", t.system);
  usage.el.append(graph.el, h("div", "legend-pair", user.el, sys.el));
  let last: State | null = null;
  const draw = (hist: State["history"]) => {
    const r = graph.tabs.value;
    if (r === "live") {
      stackedBars(graph.canvas, [
        { data: hist.cpuUser, color: "--blue" },
        { data: hist.cpuSystem, color: "--green" },
      ]);
      return;
    }
    minutes().then((m) => {
      const u = bucket(m, r, (x) => x.cu);
      const s = bucket(m, r, (x) => x.cs);
      stackedBars(graph.canvas, [{ data: u, color: "--blue" }, { data: s, color: "--green" }], 100, u.length);
    });
  };
  graph.tabs.onChange = () => last && draw(last.history);

  // Cores
  const cores = card(undefined, "cores-card");
  const coreRow = h("div", "core-rings");
  const eff = legend("--green", t.effCores);
  const perf = legend("--blue", t.perfCores);
  cores.el.append(coreRow, eff.el, perf.el);
  let coreGauges: ReturnType<typeof gauge>[] = [];

  // Processes
  const procs = card(t.processes);
  const plist = procList(1);
  procs.el.append(plist.el);

  // GPU
  const gpu = card(t.gpu);
  const gg = gpuGauges();
  gpu.el.append(gg.el);

  const counts = card(t.procsThreads, "row-card");
  const uptime = card(t.uptime, "row-card");

  const el = h(
    "div",
    "module",
    usage.el,
    cores.el,
    procs.el,
    gpu.el,
    counts.el,
    uptime.el,
    footer("taskmgr", "eventvwr", "terminal", "perfmon", "resmon"),
  );

  return {
    el,
    update(st) {
      last = st;
      const { snapshot: s, history: hist } = st;
      const c = s.cpu;
      setText(usage.right!, `${ghz(c.freqMhz).v} GHz`);
      draw(hist);
      user.set(pct(c.user));
      sys.set(pct(c.system));

      if (coreGauges.length !== c.cores.length) {
        coreGauges = c.cores.map(() => gauge("", "xs"));
        coreRow.replaceChildren(...coreGauges.map((g) => g.el));
        coreRow.style.setProperty("--n", String(Math.min(c.cores.length, 12)));
      }
      const top = Math.max(...c.coreClasses);
      const hybrid = c.coreClasses.some((k) => k !== top);
      const avg = (pick: (k: number) => boolean) => {
        const v = c.cores.filter((_, i) => pick(c.coreClasses[i]));
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
      };
      c.cores.forEach((v, i) => {
        const color = hybrid && c.coreClasses[i] !== top ? "--green" : "--blue";
        coreGauges[i].set({ v: "", u: "" }, [{ value: v / 100, color }]);
      });
      eff.el.hidden = !hybrid;
      if (hybrid) {
        setText(perf.name, t.perfCores);
        eff.set(pct(avg((k) => k !== top)));
        perf.set(pct(avg((k) => k === top)));
      } else {
        setText(perf.name, t.cores);
        perf.set(pct(c.total));
      }

      procs.el.hidden = !s.procs;
      if (s.procs) plist.set(s.procs.byCpu.slice(0, 5), (p) => [pctFine(p.cpu)]);

      const g = s.gpus[0];
      gpu.el.hidden = !g;
      if (g) {
        setText(gpu.right!, shortGpuName(g.name));
        gg.set(g);
      }
      setText(counts.right!, `${int(c.processes)} · ${int(c.threads)}`);
      setText(uptime.right!, duration(s.system.uptimeSecs));
    },
  };
}
