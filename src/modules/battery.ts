import { stateBars } from "../charts";
import type { State } from "../data";
import { duration, int, pct, qtyText, watts, wattHours } from "../format";
import { t } from "../i18n";
import { bucket, minutes } from "../history";
import { card, gauge, h, legend, rangedGraph, setText } from "../ui";
import { footer, type Module } from "./common";

export function batteryModule(): Module {
  const rings = card(undefined, "rings-card");
  const level = gauge(t.battery, "lg");
  const health = gauge(t.health, "lg");
  rings.el.append(h("div", "gauges gauges-2", level.el, health.el));

  const history = card();
  const graph = rangedGraph("battery", "graph-battery", "24h");
  history.el.append(graph.el);
  let live: State["history"] | null = null;
  const draw = () => {
    const r = graph.tabs.value;
    if (r === "live") {
      const hist = live;
      if (hist) stateBars(graph.canvas, hist.battery, (i) => (hist.batteryCharging[i] ? "--green" : "--blue"));
      return;
    }
    minutes().then((m) => {
      const level = bucket(m, r, (x) => x.bat);
      const charging = bucket(m, r, (x) => (x.bat === null ? null : x.chg));
      stateBars(graph.canvas, level, (i) => ((charging[i] ?? 0) > 0.5 ? "--green" : "--blue"), 100, level.length);
    });
  };
  graph.tabs.onChange = draw;

  const info = card();
  const status = legend(null, t.status);
  const left = legend(null, t.timeLeft);
  const power = legend(null, t.power);
  const saver = legend(null, t.saver);
  info.el.append(status.el, left.el, power.el, saver.el);

  const health_ = card(t.health);
  const cycles = legend(null, t.cycles);
  const capacity = legend(null, t.capacity);
  const voltage = legend(null, t.voltage);
  health_.el.append(cycles.el, capacity.el, voltage.el);

  const el = h("div", "module", rings.el, history.el, info.el, health_.el, footer("taskmgr", "eventvwr", "terminal", "power", "resmon"));

  return {
    el,
    update({ snapshot: s, history: hist }: State) {
      const b = s.battery;
      if (!b) return;
      level.set(pct(b.percent), [{ value: b.percent / 100, color: b.charging ? "--green" : b.percent <= 20 ? "--red" : "--blue" }]);
      if (b.health === null) health.set({ v: "—", u: "" }, [{ value: 0, color: "--green" }]);
      else health.set(pct(b.health), [{ value: b.health / 100, color: b.health < 60 ? "--orange" : "--green" }]);
      live = hist;
      draw();

      setText(
        status.el.querySelector(".v")!,
        b.charging ? t.charging : b.plugged ? t.pluggedFull : t.onBattery,
      );
      left.el.hidden = b.plugged;
      left.set({ v: b.secsLeft ? duration(b.secsLeft) : t.calculating, u: "" });
      saver.set({ v: b.saver ? t.on : t.off, u: "" });
      power.el.hidden = b.rateMw === null;
      if (b.rateMw !== null) {
        const w = watts(b.rateMw);
        power.set({ v: `${b.rateMw > 0 ? "+" : "−"}${w.v}`, u: w.u });
      }

      health_.el.hidden = b.health === null && b.cycles === null;
      cycles.el.hidden = b.cycles === null;
      cycles.set({ v: b.cycles !== null ? int(b.cycles) : "", u: "" });
      capacity.el.hidden = b.fullMwh === null;
      if (b.fullMwh !== null && b.designMwh !== null) {
        capacity.set({ v: `${qtyText(wattHours(b.fullMwh))} ${t.of} ${qtyText(wattHours(b.designMwh))}`, u: "" });
      }
      voltage.el.hidden = b.voltageMv === null;
      if (b.voltageMv !== null) voltage.set({ v: (b.voltageMv / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }), u: "V" });
    },
  };
}
