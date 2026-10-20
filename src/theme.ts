// Applies the user's theme and chart colours to a page (popup or settings).

import { inTauri } from "./data";
import { setLanguage } from "./i18n";
import type { Settings } from "./types";

export function applySettings(s: Settings, root: HTMLElement = document.documentElement) {
  if (s.theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = s.theme;
  root.style.setProperty("--blue", s.colors.primary);
  root.style.setProperty("--green", s.colors.secondary);
  setLanguage(s.language);
}

/** Loads the settings once and follows every later change. */
export async function followSettings(onChange?: (s: Settings) => void) {
  if (!inTauri) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const { listen } = await import("@tauri-apps/api/event");
  const apply = (s: Settings) => {
    applySettings(s);
    onChange?.(s);
  };
  apply(await invoke<Settings>("get_settings"));
  await listen<Settings>("settings", (e) => apply(e.payload));
}
