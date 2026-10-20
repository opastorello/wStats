import type { State } from "../data";
import { t } from "../i18n";
import { card, h } from "../ui";
import { footer, type Module } from "./common";
import { celsius, headlineRings, historyGraph, readingList } from "./readings";

/** Ring captions are short: the package is "CPU", the board's CPU sensor "Board", and
 * running numbers go ("Memory 1" -> "Memory"). */
const ringLabel = (id: string, label: string) => (id === "cpu-package" ? "CPU" : label.startsWith("CPU (") ? t.board : label.replace(/ \d+$/, ""));

/** Ring colour by how close a reading is to 100 °C. */
const heat = (c: number) => (c >= 85 ? "--red" : c >= 70 ? "--orange" : "--blue");

export function tempModule(): Module {
  const rings = headlineRings();

  const graphCard = card(t.temperature);
  const graph = historyGraph("temp", "--orange", 60, (m) => m.tc ?? null);
  graphCard.el.append(graph.el);

  const list = card(t.sensors);
  const temps = readingList(celsius);
  list.el.append(temps.el);

  const note = card(undefined, "note-card");
  note.el.append(h("p", "note", t.cpuTempNote));

  const el = h("div", "module", rings.el, graphCard.el, list.el, note.el, footer("taskmgr", "eventvwr", "terminal", "power", "resmon"));

  return {
    el,
    update({ snapshot: s, history: hist }: State) {
      const all = s.sensors.temps;
      rings.set(all.slice(0, 3).map((r) => ({ label: ringLabel(r.id, r.label), q: celsius(r.value), frac: r.value / 100, color: heat(r.value) })));
      graphCard.el.hidden = hist.temp.length === 0;
      graph.set(hist.temp);
      list.el.hidden = all.length === 0;
      temps.set(all);
      note.el.hidden = all.some((r) => r.id.startsWith("cpu"));
    },
  };
}
