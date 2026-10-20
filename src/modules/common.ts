import { appIcon, launch, type State } from "../data";
import { t } from "../i18n";
import { h } from "../ui";

export interface Module {
  el: HTMLElement;
  update(s: State): void;
}

interface Shortcut {
  id: string;
  exe: string;
}

const SYS = "C:\\Windows\\System32\\";

export const SHORTCUTS: Record<string, Shortcut> = {
  taskmgr: { id: "taskmgr", exe: `${SYS}Taskmgr.exe` },
  resmon: { id: "resmon", exe: `${SYS}resmon.exe` },
  perfmon: { id: "perfmon", exe: `${SYS}perfmon.exe` },
  eventvwr: { id: "eventvwr", exe: `${SYS}eventvwr.exe` },
  terminal: { id: "terminal", exe: `${SYS}cmd.exe` },
  netconn: { id: "netconn", exe: `${SYS}ncpa.cpl` },
  diskmgmt: { id: "diskmgmt", exe: `${SYS}diskmgmt.msc` },
  power: { id: "power", exe: `${SYS}powercfg.cpl` },
  dxdiag: { id: "dxdiag", exe: `${SYS}dxdiag.exe` },
};

/** The bottom card of every popup: quick-launch icons, the fourth one per module. */
export function footer(...ids: string[]) {
  const el = h("section", "card footer");
  for (const id of ids) {
    const s = SHORTCUTS[id];
    const img = h("img", "footer-icon");
    img.alt = "";
    const title = t.shortcuts[id] ?? id;
    appIcon(s.exe, title).then((src) => (img.src = src));
    const btn = h("button", "footer-btn", img);
    btn.title = title;
    btn.onclick = () => launch(s.id);
    el.append(btn);
  }
  return el;
}

/** Peak of the visible window of a series, for the "Upload 113 KB/s" line. */
export const peak = (a: (number | null)[], n = 100) => Math.max(0, ...a.slice(-n).map((v) => v ?? 0));
