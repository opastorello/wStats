//! The readings go out as JSON in a named shared-memory section that any signed-in user
//! may read but only SYSTEM and administrators may write.
//!
//! Layout: magic u32, seq u32 (seqlock: odd while writing), len u32, reserved u32, then
//! `len` bytes of JSON. Mirrored in src-tauri/src/stats/service.rs.

use std::sync::atomic::{AtomicU32, Ordering, fence};
use windows::Win32::Foundation::{CloseHandle, HANDLE, HLOCAL, INVALID_HANDLE_VALUE, LocalFree};
use windows::Win32::Security::Authorization::{ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1};
use windows::Win32::Security::{PSECURITY_DESCRIPTOR, SECURITY_ATTRIBUTES};
use windows::Win32::System::Memory::{CreateFileMappingW, FILE_MAP_ALL_ACCESS, MEMORY_MAPPED_VIEW_ADDRESS, MapViewOfFile, PAGE_READWRITE, UnmapViewOfFile};
use windows::core::w;

pub const MAPPING_NAME: &str = r"Global\wStats.Sensors.v1";
pub const MAGIC: u32 = 0x5345_5357; // "WSES"
pub const HEADER: usize = 16;
pub const SIZE: usize = 64 * 1024;

pub struct Publisher {
    map: HANDLE,
    view: MEMORY_MAPPED_VIEW_ADDRESS,
}

// The view is only written from the sampling thread.
unsafe impl Send for Publisher {}

impl Publisher {
    pub fn create() -> Result<Self, String> {
        unsafe {
            // SYSTEM and administrators: full access. Authenticated users: read.
            let mut sd = PSECURITY_DESCRIPTOR::default();
            ConvertStringSecurityDescriptorToSecurityDescriptorW(w!("D:P(A;;GA;;;SY)(A;;GA;;;BA)(A;;GR;;;AU)"), SDDL_REVISION_1, &mut sd, None)
                .map_err(|e| format!("security descriptor: {e}"))?;
            let sa = SECURITY_ATTRIBUTES { nLength: size_of::<SECURITY_ATTRIBUTES>() as u32, lpSecurityDescriptor: sd.0, bInheritHandle: false.into() };
            let name = windows::core::HSTRING::from(MAPPING_NAME);
            let map = CreateFileMappingW(INVALID_HANDLE_VALUE, Some(&sa), PAGE_READWRITE, 0, SIZE as u32, &name);
            let _ = LocalFree(Some(HLOCAL(sd.0)));
            let map = map.map_err(|e| format!("shared memory: {e}"))?;
            let view = MapViewOfFile(map, FILE_MAP_ALL_ACCESS, 0, 0, SIZE);
            if view.Value.is_null() {
                let _ = CloseHandle(map);
                return Err("shared memory: cannot map".into());
            }
            let me = Self { map, view };
            (me.base() as *mut u32).write_volatile(MAGIC);
            Ok(me)
        }
    }

    fn base(&self) -> *mut u8 {
        self.view.Value as *mut u8
    }

    fn seq(&self) -> &AtomicU32 {
        unsafe { &*(self.base().add(4) as *const AtomicU32) }
    }

    pub fn publish(&self, json: &[u8]) {
        let len = json.len().min(SIZE - HEADER);
        let seq = self.seq();
        let start = seq.load(Ordering::Relaxed);
        seq.store(start.wrapping_add(1) | 1, Ordering::Relaxed);
        fence(Ordering::Release);
        unsafe {
            (self.base().add(8) as *mut u32).write_volatile(len as u32);
            std::ptr::copy_nonoverlapping(json.as_ptr(), self.base().add(HEADER), len);
        }
        fence(Ordering::Release);
        seq.store((start | 1).wrapping_add(1), Ordering::Release);
    }
}

impl Drop for Publisher {
    fn drop(&mut self) {
        unsafe {
            // Readers treat a zero length as "no service".
            (self.base().add(8) as *mut u32).write_volatile(0);
            let _ = UnmapViewOfFile(self.view);
            let _ = CloseHandle(self.map);
        }
    }
}
