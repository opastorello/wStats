use std::path::Path;
use std::process::Command;

fn main() {
    build_tap();
    let windows = tauri_build::WindowsAttributes::new().app_manifest(include_str!("wstats.manifest"));
    tauri_build::try_build(tauri_build::Attributes::new().windows_attributes(windows))
        .expect("failed to run tauri-build");
}

/// Builds the two DLLs that run inside explorer.exe (tap/) with MSVC. They are C++/WinRT
/// because that is what the XAML diagnostics API and the taskbar's XAML speak.
fn build_tap() {
    let tap = Path::new(env!("CARGO_MANIFEST_DIR")).join("../tap");
    for f in ["tap.cpp", "core.cpp", "protocol.h", "trace.h", "tap.def", "core.def", "build.cmd"] {
        println!("cargo:rerun-if-changed={}", tap.join(f).display());
    }
    // vcvars64.bat chokes on the very long PATH cargo builds up ("input line is too
    // long"), so the script gets a minimal environment of its own.
    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "build.cmd"]).current_dir(&tap).env_clear();
    for key in ["SystemRoot", "SystemDrive", "windir", "TEMP", "TMP", "USERPROFILE", "LOCALAPPDATA", "APPDATA", "ProgramFiles", "ProgramFiles(x86)", "ProgramData", "ComSpec"] {
        if let Some(v) = std::env::var_os(key) {
            cmd.env(key, v);
        }
    }
    cmd.env("PATH", r"C:\Windows\System32;C:\Windows");
    match cmd.output() {
        Ok(out) if out.status.success() => {}
        // Without the DLLs wStats still runs, falling back to its overlay window.
        other => {
            println!("cargo:warning=tap DLLs not built; the taskbar strip will use its fallback window");
            if let Ok(out) = other {
                for line in String::from_utf8_lossy(&out.stdout).lines().filter(|l| l.contains("error")).take(5) {
                    println!("cargo:warning={line}");
                }
            }
        }
    }
}
