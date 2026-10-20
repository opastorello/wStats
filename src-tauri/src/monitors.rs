//! Monitors, for choosing which taskbar hosts the strip.

use crate::win::wide_to_string;
use serde::Serialize;
use std::collections::HashMap;
use windows::Win32::Devices::Display::*;
use windows::Win32::Foundation::{LPARAM, RECT};
use windows::Win32::Graphics::Gdi::*;
use windows::core::BOOL;

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Monitor {
    /// GDI device name (`\\.\DISPLAY1`): stable across reboots for the same port.
    pub id: String,
    /// Friendly name from the EDID ("DELL U2720Q"); empty for some built-in panels.
    pub name: String,
    pub width: i32,
    pub height: i32,
    pub primary: bool,
    #[serde(skip)]
    pub rect: RECT,
}

pub fn list() -> Vec<Monitor> {
    let names = friendly_names();
    let mut out: Vec<Monitor> = Vec::new();
    unsafe extern "system" fn each(mon: HMONITOR, _: HDC, _: *mut RECT, data: LPARAM) -> BOOL {
        let out = unsafe { &mut *(data.0 as *mut Vec<(HMONITOR, MONITORINFOEXW)>) };
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
        if unsafe { GetMonitorInfoW(mon, &mut info.monitorInfo) }.as_bool() {
            out.push((mon, info));
        }
        true.into()
    }
    let mut raw: Vec<(HMONITOR, MONITORINFOEXW)> = Vec::new();
    unsafe {
        let _ = EnumDisplayMonitors(None, None, Some(each), LPARAM(&mut raw as *mut _ as isize));
    }
    for (_, info) in raw {
        let r = info.monitorInfo.rcMonitor;
        let id = wide_to_string(&info.szDevice);
        out.push(Monitor {
            name: names.get(&id).cloned().unwrap_or_default(),
            id,
            width: r.right - r.left,
            height: r.bottom - r.top,
            primary: info.monitorInfo.dwFlags & 1 != 0, // MONITORINFOF_PRIMARY
            rect: r,
        });
    }
    // Primary first, then left to right.
    out.sort_by_key(|m| (!m.primary, m.rect.left, m.rect.top));
    out
}

/// The monitor with this id, or the primary when it is gone (unplugged, renumbered).
pub fn resolve(id: Option<&str>) -> Option<Monitor> {
    let all = list();
    id.and_then(|id| all.iter().find(|m| m.id == id).cloned()).or_else(|| all.into_iter().find(|m| m.primary))
}

/// GDI device name -> EDID friendly name, through the DisplayConfig API.
fn friendly_names() -> HashMap<String, String> {
    let mut map = HashMap::new();
    unsafe {
        let (mut np, mut nm) = (0u32, 0u32);
        if GetDisplayConfigBufferSizes(QDC_ONLY_ACTIVE_PATHS, &mut np, &mut nm).is_err() {
            return map;
        }
        let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); np as usize];
        let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); nm as usize];
        if QueryDisplayConfig(QDC_ONLY_ACTIVE_PATHS, &mut np, paths.as_mut_ptr(), &mut nm, modes.as_mut_ptr(), None).is_err() {
            return map;
        }
        for p in &paths[..np as usize] {
            let mut src = DISPLAYCONFIG_SOURCE_DEVICE_NAME::default();
            src.header = DISPLAYCONFIG_DEVICE_INFO_HEADER {
                r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
                size: size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32,
                adapterId: p.sourceInfo.adapterId,
                id: p.sourceInfo.id,
            };
            let mut tgt = DISPLAYCONFIG_TARGET_DEVICE_NAME::default();
            tgt.header = DISPLAYCONFIG_DEVICE_INFO_HEADER {
                r#type: DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
                size: size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32,
                adapterId: p.targetInfo.adapterId,
                id: p.targetInfo.id,
            };
            if DisplayConfigGetDeviceInfo(&mut src.header) == 0 && DisplayConfigGetDeviceInfo(&mut tgt.header) == 0 {
                let name = wide_to_string(&tgt.monitorFriendlyDeviceName);
                if !name.is_empty() {
                    map.insert(wide_to_string(&src.viewGdiDeviceName), name);
                }
            }
        }
    }
    map
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_a_primary_monitor() {
        let all = super::list();
        for m in &all {
            println!("{} {:?} {}x{} primary={}", m.id, m.name, m.width, m.height, m.primary);
        }
        assert_eq!(all.iter().filter(|m| m.primary).count(), 1);
        assert!(super::resolve(Some("nope")).unwrap().primary, "unknown id falls back to primary");
    }
}
