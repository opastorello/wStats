//! Shell helpers for the popup: application icons and the footer shortcuts.

use base64::Engine;
use std::collections::HashMap;
use std::sync::{LazyLock, Mutex};
use windows::Win32::Graphics::Gdi::*;
use windows::Win32::Storage::FileSystem::FILE_FLAGS_AND_ATTRIBUTES;
use windows::Win32::UI::Shell::*;
use windows::Win32::UI::WindowsAndMessaging::*;
use windows::core::{HSTRING, PCWSTR, w};

static ICONS: LazyLock<Mutex<HashMap<String, Option<String>>>> = LazyLock::new(Default::default);

/// The icon Explorer shows for `path`, as a PNG data URL. Cached per path.
pub fn icon_data_url(path: &str) -> Option<String> {
    let key = path.to_lowercase();
    if let Some(hit) = ICONS.lock().unwrap().get(&key) {
        return hit.clone();
    }
    // SHGetFileInfo misbehaves when called from several threads at once (the popup
    // asks for a handful of icons in parallel), so extraction is serialized.
    static EXTRACT: Mutex<()> = Mutex::new(());
    let url = {
        let _guard = EXTRACT.lock().unwrap();
        load_icon(path).map(|png| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(png)))
    };
    // Failures are not cached: they can be transient.
    if url.is_some() {
        ICONS.lock().unwrap().insert(key, url.clone());
    }
    url
}

fn load_icon(path: &str) -> Option<Vec<u8>> {
    // Icon handlers are shell extensions; they need COM on whatever thread asks.
    let _ = unsafe { windows::Win32::System::Com::CoInitializeEx(None, windows::Win32::System::Com::COINIT_APARTMENTTHREADED) };
    let mut info = SHFILEINFOW::default();
    let ok = unsafe {
        SHGetFileInfoW(
            &HSTRING::from(path),
            FILE_FLAGS_AND_ATTRIBUTES(0),
            Some(&mut info),
            size_of::<SHFILEINFOW>() as u32,
            SHGFI_ICON | SHGFI_LARGEICON,
        )
    };
    if ok == 0 || info.hIcon.is_invalid() {
        return None;
    }
    let png = icon_to_png(info.hIcon);
    unsafe {
        let _ = DestroyIcon(info.hIcon);
    }
    png
}

fn icon_to_png(icon: HICON) -> Option<Vec<u8>> {
    unsafe {
        let mut ii = ICONINFO::default();
        GetIconInfo(icon, &mut ii).ok()?;
        let cleanup = |ii: &ICONINFO| {
            let _ = DeleteObject(ii.hbmColor.into());
            let _ = DeleteObject(ii.hbmMask.into());
        };
        let mut bm = BITMAP::default();
        if GetObjectW(ii.hbmColor.into(), size_of::<BITMAP>() as i32, Some((&mut bm as *mut BITMAP).cast())) == 0 {
            cleanup(&ii);
            return None;
        }
        let (w, h) = (bm.bmWidth, bm.bmHeight);
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: w,
                biHeight: -h,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };
        let mut px = vec![0u8; (w * h * 4) as usize];
        let dc = GetDC(None);
        let got = GetDIBits(dc, ii.hbmColor, 0, h as u32, Some(px.as_mut_ptr().cast()), &mut bmi, DIB_RGB_COLORS);
        // Icons without an alpha channel carry transparency in the AND mask instead.
        if got != 0 && px.chunks(4).all(|p| p[3] == 0) {
            let mut mask = vec![0u8; (w * h * 4) as usize];
            GetDIBits(dc, ii.hbmMask, 0, h as u32, Some(mask.as_mut_ptr().cast()), &mut bmi, DIB_RGB_COLORS);
            for (p, m) in px.chunks_mut(4).zip(mask.chunks(4)) {
                p[3] = if m[0] == 0 { 255 } else { 0 };
            }
        }
        ReleaseDC(None, dc);
        cleanup(&ii);
        if got == 0 {
            return None;
        }
        for p in px.chunks_mut(4) {
            p.swap(0, 2); // BGRA -> RGBA
        }
        let mut out = Vec::new();
        {
            let mut enc = png::Encoder::new(&mut out, w as u32, h as u32);
            enc.set_color(png::ColorType::Rgba);
            enc.set_depth(png::BitDepth::Eight);
            enc.write_header().ok()?.write_image_data(&px).ok()?;
        }
        Some(out)
    }
}

/// Opens one of the footer shortcuts. Ids match `SHORTCUTS` in `src/modules/common.ts`.
pub fn launch(id: &str) -> bool {
    let (file, params) = match id {
        "taskmgr" => ("taskmgr.exe", ""),
        "resmon" => ("resmon.exe", ""),
        "perfmon" => ("perfmon.exe", ""),
        "eventvwr" => ("eventvwr.msc", ""),
        "terminal" => ("wt.exe", ""),
        "netconn" => ("ncpa.cpl", ""),
        "diskmgmt" => ("diskmgmt.msc", ""),
        "power" => ("ms-settings:batterysaver", ""),
        "dxdiag" => ("dxdiag.exe", ""),
        _ => return false,
    };
    let run = |f: &str| unsafe {
        ShellExecuteW(None, w!("open"), &HSTRING::from(f), &HSTRING::from(params), PCWSTR::null(), SW_SHOWNORMAL).0 as isize > 32
    };
    // Windows Terminal is optional; fall back to the console host.
    run(file) || (id == "terminal" && run("cmd.exe"))
}

/// The "File description" of an executable ("Google Chrome" for chrome.exe), which is
/// what Task Manager shows as the app name. `None` when the file has no version info.
pub fn file_description(path: &str) -> Option<String> {
    use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
    let wpath = HSTRING::from(path);
    unsafe {
        let size = GetFileVersionInfoSizeW(&wpath, None);
        if size == 0 {
            return None;
        }
        let mut data = vec![0u8; size as usize];
        GetFileVersionInfoW(&wpath, None, size, data.as_mut_ptr().cast()).ok()?;
        let mut ptr = std::ptr::null_mut();
        let mut len = 0u32;
        // First language/codepage pair, then the localized description under it.
        if !VerQueryValueW(data.as_ptr().cast(), w!(r"\VarFileInfo\Translation"), &mut ptr, &mut len).as_bool() || len < 4 {
            return None;
        }
        let pair = *(ptr as *const [u16; 2]);
        let key = HSTRING::from(format!(r"\StringFileInfo\{:04x}{:04x}\FileDescription", pair[0], pair[1]));
        if !VerQueryValueW(data.as_ptr().cast(), &key, &mut ptr, &mut len).as_bool() || len == 0 {
            return None;
        }
        let s = String::from_utf16_lossy(std::slice::from_raw_parts(ptr as *const u16, len as usize));
        let s = s.trim_end_matches('\0').trim().to_string();
        (!s.is_empty()).then_some(s)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn system_tool_icons() {
        for exe in ["Taskmgr.exe", "eventvwr.exe", "cmd.exe", "perfmon.exe", "resmon.exe", "dxdiag.exe", "ncpa.cpl", "diskmgmt.msc"] {
            let path = format!(r"C:\Windows\System32\{exe}");
            println!("{exe}: {}", icon_data_url(&path).map(|u| u.len()).unwrap_or(0));
        }
        assert!(icon_data_url(r"C:\Windows\System32\cmd.exe").is_some());
    }
}
