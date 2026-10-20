// Dev-only gallery: every module in both themes, fed by the mock. Not shipped.

import "./styles/popup.css";
import { connect } from "./data";
import { type Language, setLanguage } from "./i18n";
import { MODULES } from "./modules";
import type { Module } from "./modules/common";
import type { ModuleId } from "./types";

const gallery = document.getElementById("gallery")!;
const params = new URLSearchParams(location.search);
const only = params.get("m")?.split(",") as ModuleId[] | undefined;
const ids = only ?? (Object.keys(MODULES) as ModuleId[]);
setLanguage((params.get("lang") as Language | null) ?? "auto");
// ?theme=dark|light renders one row; ?clean hides the launcher row (its app icons only
// load inside Tauri), for README screenshots.
const themes = params.get("theme") ? [params.get("theme")!] : ["dark", "light"];
if (params.has("clean")) document.body.classList.add("clean");
const mods: Module[] = [];

for (const theme of themes) {
  const row = document.createElement("div");
  row.className = "row";
  for (const id of ids) {
    const frame = document.createElement("div");
    frame.className = "frame";
    frame.dataset.theme = theme;
    const popup = document.createElement("main");
    popup.className = "popup";
    const mod = MODULES[id]();
    popup.append(mod.el);
    frame.append(popup);
    row.append(frame);
    mods.push(mod);
  }
  gallery.append(row);
}

connect((s) => mods.forEach((m) => m.update(s)));
