use super::model::{Disk, PhysDisk, Volume};
use super::pdh::{Counter, Query};
use crate::win::wide_to_string;
use std::time::{Duration, Instant};
use windows::Win32::Storage::FileSystem::*;
use windows::core::HSTRING;

const DRIVE_REMOVABLE: u32 = 2;
const DRIVE_FIXED: u32 = 3;
const VOLUME_REFRESH: Duration = Duration::from_secs(10);

pub struct DiskCollector {
    read: Option<Counter>,
    write: Option<Counter>,
    idle: Option<Counter>,
    volumes: Vec<Volume>,
    volumes_at: Option<Instant>,
}

impl DiskCollector {
    pub fn new(q: &Query) -> Self {
        Self {
            read: q.add(r"\PhysicalDisk(*)\Disk Read Bytes/sec"),
            write: q.add(r"\PhysicalDisk(*)\Disk Write Bytes/sec"),
            idle: q.add(r"\PhysicalDisk(*)\% Idle Time"),
            volumes: Vec::new(),
            volumes_at: None,
        }
    }

    pub fn sample(&mut self, q: &Query) -> Disk {
        let reads = q.array(self.read);
        let writes = q.array(self.write);
        let idles = q.array(self.idle);
        let lookup = |list: &[(String, f64)], name: &str| {
            list.iter().find(|(n, _)| n == name).map(|(_, v)| *v).unwrap_or(0.0)
        };

        let mut disks: Vec<PhysDisk> = reads
            .iter()
            .filter(|(n, _)| n != "_Total")
            .map(|(name, r)| PhysDisk {
                name: name.clone(),
                read: r.max(0.0),
                write: lookup(&writes, name).max(0.0),
                active: (100.0 - lookup(&idles, name)).clamp(0.0, 100.0) as f32,
            })
            .collect();
        disks.sort_by(|a, b| a.name.cmp(&b.name));

        if self.volumes_at.is_none_or(|t| t.elapsed() >= VOLUME_REFRESH) {
            self.volumes = list_volumes();
            self.volumes_at = Some(Instant::now());
        }

        Disk {
            read: disks.iter().map(|d| d.read).sum(),
            write: disks.iter().map(|d| d.write).sum(),
            active: disks.iter().map(|d| d.active).fold(0.0, f32::max),
            disks,
            volumes: self.volumes.clone(),
        }
    }
}

fn list_volumes() -> Vec<Volume> {
    let mut buf = [0u16; 512];
    let n = unsafe { GetLogicalDriveStringsW(Some(&mut buf)) } as usize;
    buf[..n.min(buf.len())]
        .split(|&c| c == 0)
        .filter(|s| !s.is_empty())
        .filter_map(|root| {
            let root = String::from_utf16_lossy(root);
            let kind = unsafe { GetDriveTypeW(&HSTRING::from(&root)) };
            if kind != DRIVE_FIXED && kind != DRIVE_REMOVABLE {
                return None;
            }
            let (mut total, mut free) = (0u64, 0u64);
            unsafe { GetDiskFreeSpaceExW(&HSTRING::from(&root), None, Some(&mut total), Some(&mut free)) }.ok()?;
            let mut label = [0u16; 261];
            let mut fs = [0u16; 261];
            let _ = unsafe {
                GetVolumeInformationW(&HSTRING::from(&root), Some(&mut label), None, None, None, Some(&mut fs))
            };
            Some(Volume {
                mount: root.trim_end_matches('\\').to_string(),
                label: wide_to_string(&label),
                fs: wide_to_string(&fs),
                total,
                free,
                removable: kind == DRIVE_REMOVABLE,
            })
        })
        .collect()
}
