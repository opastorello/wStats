//! Thin wrapper over the Performance Data Helper API.
//!
//! Counters are always added by their *English* path (`PdhAddEnglishCounterW`), so the
//! same code works on a pt-BR Windows, where the localized names would be
//! `\Processador\...` and friends.

use windows::Win32::System::Performance::*;
use windows::core::{HSTRING, PCWSTR};

const PDH_FMT_NOCAP100: u32 = 0x8000;
const FORMAT: PDH_FMT = PDH_FMT(PDH_FMT_DOUBLE.0 | PDH_FMT_NOCAP100);

/// `PDH_CSTATUS_VALID_DATA` and `PDH_CSTATUS_NEW_DATA`.
fn status_ok(s: u32) -> bool {
    s == 0 || s == 1
}

pub struct Query {
    handle: PDH_HQUERY,
}

// PDH handles are not tied to the thread that opened them; each `Query` is still only
// ever used from the sampler thread.
unsafe impl Send for Query {}

#[derive(Clone, Copy)]
pub struct Counter(PDH_HCOUNTER);

unsafe impl Send for Counter {}

impl Query {
    pub fn new() -> Option<Self> {
        let mut handle = PDH_HQUERY::default();
        let rc = unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut handle) };
        (rc == 0).then_some(Self { handle })
    }

    /// Adds a counter by its English path. Returns `None` when the counter does not
    /// exist on this machine (e.g. no GPU performance counters on a VM).
    pub fn add(&self, path: &str) -> Option<Counter> {
        let mut counter = PDH_HCOUNTER::default();
        let rc = unsafe { PdhAddEnglishCounterW(self.handle, &HSTRING::from(path), 0, &mut counter) };
        if rc != 0 {
            log::debug!("pdh: counter unavailable {path} (0x{rc:08x})");
            return None;
        }
        Some(Counter(counter))
    }

    pub fn collect(&self) -> bool {
        unsafe { PdhCollectQueryData(self.handle) == 0 }
    }

    pub fn value(&self, counter: Option<Counter>) -> Option<f64> {
        let counter = counter?;
        let mut v = PDH_FMT_COUNTERVALUE::default();
        let rc = unsafe { PdhGetFormattedCounterValue(counter.0, FORMAT, None, &mut v) };
        if rc != 0 || !status_ok(v.CStatus) {
            return None;
        }
        Some(unsafe { v.Anonymous.doubleValue })
    }

    /// Values of a wildcard counter, as `(instance name, value)`.
    pub fn array(&self, counter: Option<Counter>) -> Vec<(String, f64)> {
        let Some(counter) = counter else { return Vec::new() };
        let mut size = 0u32;
        let mut count = 0u32;
        let rc = unsafe { PdhGetFormattedCounterArrayW(counter.0, FORMAT, &mut size, &mut count, None) };
        if rc != PDH_MORE_DATA || size == 0 {
            return Vec::new();
        }
        // u64 backing keeps the item array suitably aligned.
        let mut buf = vec![0u64; (size as usize).div_ceil(8)];
        let items = buf.as_mut_ptr().cast::<PDH_FMT_COUNTERVALUE_ITEM_W>();
        let rc = unsafe { PdhGetFormattedCounterArrayW(counter.0, FORMAT, &mut size, &mut count, Some(items)) };
        if rc != 0 {
            return Vec::new();
        }
        let items = unsafe { std::slice::from_raw_parts(items, count as usize) };
        items
            .iter()
            .filter(|it| status_ok(it.FmtValue.CStatus))
            .map(|it| {
                let name = unsafe { it.szName.to_string() }.unwrap_or_default();
                (name, unsafe { it.FmtValue.Anonymous.doubleValue })
            })
            .collect()
    }
}

impl Drop for Query {
    fn drop(&mut self) {
        unsafe {
            PdhCloseQuery(self.handle);
        }
    }
}
