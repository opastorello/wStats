# wStats design

How wStats should look and feel: the popups, the charts, the palette and the taskbar
strip. Code follows this; change it here first.

## Popup anatomy

- Window: near-black (`#141414`) in the dark theme, radius ~16px, 1px light hairline border.
- Content is a vertical stack of **cards**: background `#1a1a1a`-ish, 1px border `rgba(255,255,255,.07)`,
  radius ~12px, 8px gap, ~14px inner padding.
- **Section header**: small, uppercase, letter-spaced, top-left of the card, in a muted
  colour. Some cards put the header on the left and a single value on the right
  ("PROCESSOS E THREADS  312 · 4.812").
- **Big numbers** (~28px, regular weight) with the unit/percent sign in a smaller size.
- **Legend rows**: coloured dot · label (secondary) · value right-aligned, tabular numbers.
- **Process rows**: app icon 18px · name · value(s) right. Network uses ↑ ↓ columns, disk uses R W.
- **Footer card**: 5 quick-launch app icons spread evenly.
- Numbers follow the Windows region (`1,18 GHz` in pt-BR); units in small caps (`KB/s`, `GB`).

## Charts

- CPU: vertical bars, 1 bar per sample, user (primary) stacked under system (secondary), ~100 bars wide.
- Network / Disk: **centred** bars — upload/read grow up (secondary), download/write grow down
  (primary), big current values above each legend dot, peak values below ("Upload 113 KB/s").
- Rings: thick track `#333`, coloured arc with round caps, big value centred, caption uppercase below.
- Memory ring is **segmented** (apps, kernel, modified), the pressure ring single colour.
- Per-core: one small ring per core in a row, efficiency cores secondary, performance cores primary.
- Battery: bars coloured by state (primary discharging, secondary charging).
- Every history graph offers Now / 1 h / 24 h.

## Palette (defaults; primary and secondary are user-configurable)

| Role | Colour |
|---|---|
| Primary (user, download, write, P-cores, app memory) | `#3478F6` |
| Secondary (system, upload, read, E-cores, kernel, pressure) | `#78C04F` |
| Yellow (modified memory) | `#F5C542` |
| Orange (page file, power, heat) | `#EF8240` |
| Red (hot) | `#EF5350` |
| Ring track | `#333333` |

## Taskbar strip

Every item is the same shape: **a graphic, then its text**. Designs are drawn for a
48-DIP bar and placed by text baseline; a taller or shorter bar centres them.

| Item | Graphic | Value |
|---|---|---|
| CPU | bar graph, user (primary) under system (secondary) | `36%` |
| GPU | bar graph | `10%` |
| MEM | ring | `67%` |
| NET | mirrored graph, upload up (secondary), download down (primary) | `↑9 ↓8`, unit on the name line |
| SSD | pie of C:'s used space | `62%` |
| BAT | battery standing up, filling from the bottom; secondary colour + bolt while charging, red at 20% or less | `84%` |
| TEMP | thermometer, column rising over 30..100 °C | `71°` |
| FAN | case fan: seven curved blades in a ring, hub in the primary colour | `2140` |
| PWR | orange lightning bolt | `18 W` |

**Label setting** (Settings › General › Taskbar › Labels) places the name:

- **Above** (default): name (10, muted) over value (14.5).
- **Below**: value over name.
- **Beside**: name in stacked letters left of the graphic, or after the value (Side: right);
  value alone, large.
- **None**: no name; the value large.
  NET then shows `↑ 9 KB/s` and `↓ 8 KB/s` on two lines (also in Beside).

**Fonts**: one family, Bahnschrift, in two widths. The normal cut wherever a name line
shares the bar (above, below, compact); the condensed cut (22) where the value is alone
(beside, none), since it is taller than wide.

**Graphics** can be turned off (Settings › Graphics): the item keeps its text alone.

**Compact mode**: two items per column, value only, each tagged by its settings icon or its
name, on the left or the right (the same Side setting as Beside). The network keeps a column
of its own, its arrows as tag. Each cell is its own click target.

**Thermometer colour**, four flat bands: the primary colour up to 70 °C, yellow 71–79,
orange 80–89, red from 90.

**Network numbers** share the larger rate's unit and keep to two digits: whole KB/s up to
99, then MB/s and GB/s with one decimal below 10. The unit sits small next to `NET`.

**Widths** are fixed per item and label setting, measured from the widest value the item
can show (`100%`, `9999`, `↑99 ↓99`), so the taskbar does not shift as numbers change.

The item whose popup is open gets a translucent rounded pill behind it.
