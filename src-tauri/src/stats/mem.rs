use super::model::Mem;
use super::pdh::{Counter, Query};
use windows::Win32::System::ProcessStatus::{GetPerformanceInfo, PERFORMANCE_INFORMATION};
use windows::Win32::System::SystemInformation::*;

pub struct MemCollector {
    modified: Option<Counter>,
    standby: [Option<Counter>; 3],
    free: Option<Counter>,
    swap_pct: Option<Counter>,
    installed: u64,
}

impl MemCollector {
    pub fn new(q: &Query) -> Self {
        let mut kb = 0u64;
        let _ = unsafe { GetPhysicallyInstalledSystemMemory(&mut kb) };
        Self {
            modified: q.add(r"\Memory\Modified Page List Bytes"),
            standby: [
                q.add(r"\Memory\Standby Cache Core Bytes"),
                q.add(r"\Memory\Standby Cache Normal Priority Bytes"),
                q.add(r"\Memory\Standby Cache Reserve Bytes"),
            ],
            free: q.add(r"\Memory\Free & Zero Page List Bytes"),
            swap_pct: q.add(r"\Paging File(_Total)\% Usage"),
            installed: kb * 1024,
        }
    }

    pub fn sample(&self, q: &Query) -> Mem {
        let mut ms = MEMORYSTATUSEX { dwLength: size_of::<MEMORYSTATUSEX>() as u32, ..Default::default() };
        let _ = unsafe { GlobalMemoryStatusEx(&mut ms) };
        let mut pi = PERFORMANCE_INFORMATION::default();
        let _ = unsafe { GetPerformanceInfo(&mut pi, size_of::<PERFORMANCE_INFORMATION>() as u32) };
        let page = pi.PageSize as u64;

        let total = ms.ullTotalPhys;
        let available = ms.ullAvailPhys;
        let used = total.saturating_sub(available);
        let commit_limit = pi.CommitLimit as u64 * page;
        // The page file is whatever the commit limit adds on top of physical memory.
        let swap_total = commit_limit.saturating_sub(total);
        let swap_pct = q.value(self.swap_pct).unwrap_or(0.0).clamp(0.0, 100.0);
        let bytes = |c| q.value(c).unwrap_or(0.0).max(0.0) as u64;

        Mem {
            total,
            installed: self.installed.max(total),
            used,
            available,
            cached: self.standby.iter().map(|c| bytes(*c)).sum(),
            modified: bytes(self.modified),
            free: bytes(self.free),
            committed: pi.CommitTotal as u64 * page,
            commit_limit,
            paged_pool: pi.KernelPaged as u64 * page,
            nonpaged_pool: pi.KernelNonpaged as u64 * page,
            swap_used: (swap_total as f64 * swap_pct / 100.0) as u64,
            swap_total,
            used_pct: if total > 0 { used as f32 * 100.0 / total as f32 } else { 0.0 },
        }
    }
}
