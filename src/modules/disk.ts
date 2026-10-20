import type { State } from "../data";
import { bytes, qtyText, rateShort } from "../format";
import { t } from "../i18n";
import type { Volume } from "../types";
import { card, dot, gauge, h, procHeader, procList, setText } from "../ui";
import { footer, type Module } from "./common";
import { trafficCard } from "./net";

const ACTIVE = 4 * 1024; // bytes/s below which a volume's activity light stays off

function volumeRow() {
  const g = gauge("", "xs");
  const name = h("div", "vol-name");
  const free = h("div", "vol-free");
  const r = dot("--green");
  const w = dot("--blue");
  const el = h("div", "vol", g.el, h("div", "vol-text", name, free), h("div", "vol-lights", r, w));
  return {
    el,
    set(v: Volume, read: number, write: number) {
      const used = v.total ? ((v.total - v.free) / v.total) * 100 : 0;
      g.set({ v: String(Math.round(used)), u: "" }, [{ value: used / 100, color: "--blue" }]);
      setText(name, v.label ? `${v.label} (${v.mount})` : v.mount);
      setText(free, `${qtyText(bytes(v.free))} ${t.available}`);
      r.classList.toggle("off", read < ACTIVE);
      w.classList.toggle("off", write < ACTIVE);
    },
  };
}

export function diskModule(): Module {
  const vols = card(undefined, "vols-card");
  let rows: ReturnType<typeof volumeRow>[] = [];

  const traffic = trafficCard("disk", t.read, t.write, (m) => [m.dr, m.dw]);

  const procs = card(t.processes);
  const plist = procList(2);
  procs.el.append(procHeader("R", "W"), plist.el);

  const el = h("div", "module", vols.el, traffic.el, procs.el, footer("taskmgr", "eventvwr", "terminal", "diskmgmt", "resmon"));

  return {
    el,
    update({ snapshot: s, history: hist }: State) {
      const d = s.disk;
      if (rows.length !== d.volumes.length) {
        rows = d.volumes.map(volumeRow);
        vols.el.replaceChildren(...rows.map((r) => r.el));
      }
      d.volumes.forEach((v, i) => {
        // PhysicalDisk instances are named "0 C: D:"; a volume borrows its disk's activity.
        const pd = d.disks.find((x) => x.name.split(" ").includes(v.mount));
        rows[i].set(v, pd?.read ?? 0, pd?.write ?? 0);
      });

      traffic.set(d.read, d.write, hist.diskRead, hist.diskWrite);

      procs.el.hidden = !s.procs;
      if (s.procs) plist.set(s.procs.byDisk.slice(0, 5), (p) => [rateShort(p.diskRead), rateShort(p.diskWrite)]);
    },
  };
}
