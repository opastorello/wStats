use super::model::Cpu;
use super::pdh::{Counter, Query};
use crate::win::reg_string;
use std::collections::HashMap;
use windows::Win32::System::ProcessStatus::{GetPerformanceInfo, PERFORMANCE_INFORMATION};
use windows::Win32::System::Registry::HKEY_LOCAL_MACHINE;
use windows::Win32::System::SystemInformation::*;

pub struct CpuCollector {
    utility: Option<Counter>,
    privileged: Option<Counter>,
    cores: Option<Counter>,
    performance: Option<Counter>,
    frequency: Option<Counter>,
    name: String,
    /// `(group, index)` -> efficiency class.
    classes: HashMap<(u16, u32), u8>,
    physical_cores: u32,
}

impl CpuCollector {
    pub fn new(q: &Query) -> Self {
        let (classes, physical_cores) = core_topology();
        Self {
            utility: q.add(r"\Processor Information(_Total)\% Processor Utility"),
            privileged: q.add(r"\Processor Information(_Total)\% Privileged Utility"),
            cores: q.add(r"\Processor Information(*)\% Processor Utility"),
            performance: q.add(r"\Processor Information(_Total)\% Processor Performance"),
            frequency: q.add(r"\Processor Information(_Total)\Processor Frequency"),
            name: reg_string(
                HKEY_LOCAL_MACHINE,
                r"HARDWARE\DESCRIPTION\System\CentralProcessor\0",
                "ProcessorNameString",
            )
            .map(|s| s.trim().to_string())
            .unwrap_or_default(),
            classes,
            physical_cores,
        }
    }

    pub fn sample(&self, q: &Query) -> Cpu {
        let total = q.value(self.utility).unwrap_or(0.0).clamp(0.0, 100.0) as f32;
        let system = (q.value(self.privileged).unwrap_or(0.0) as f32).clamp(0.0, total);

        let mut cores: Vec<((u16, u32), f32)> = q
            .array(self.cores)
            .into_iter()
            .filter_map(|(name, v)| parse_instance(&name).map(|k| (k, v.clamp(0.0, 100.0) as f32)))
            .collect();
        cores.sort_by_key(|(k, _)| *k);

        let base = q.value(self.frequency).unwrap_or(0.0) as f32;
        let perf = q.value(self.performance).unwrap_or(100.0) as f32;

        let mut pi = PERFORMANCE_INFORMATION::default();
        let _ = unsafe { GetPerformanceInfo(&mut pi, size_of::<PERFORMANCE_INFORMATION>() as u32) };

        Cpu {
            name: self.name.clone(),
            total,
            user: total - system,
            system,
            core_classes: cores.iter().map(|(k, _)| self.classes.get(k).copied().unwrap_or(0)).collect(),
            cores: cores.into_iter().map(|(_, v)| v).collect(),
            physical_cores: self.physical_cores,
            temp_c: None, // filled in from the sensor service
            freq_mhz: base * perf / 100.0,
            base_mhz: base,
            processes: pi.ProcessCount,
            threads: pi.ThreadCount,
            handles: pi.HandleCount,
        }
    }
}

/// `"0,3"` -> `(0, 3)`; `_Total` rows (`"_Total"`, `"0,_Total"`) are skipped.
fn parse_instance(name: &str) -> Option<(u16, u32)> {
    let (g, i) = name.split_once(',')?;
    Some((g.parse().ok()?, i.parse().ok()?))
}

/// Efficiency class of every logical processor, plus the physical core count.
fn core_topology() -> (HashMap<(u16, u32), u8>, u32) {
    let mut map = HashMap::new();
    let mut len = 0u32;
    unsafe {
        let _ = GetLogicalProcessorInformationEx(RelationProcessorCore, None, &mut len);
    }
    if len == 0 {
        return (map, 0);
    }
    let mut buf = vec![0u64; (len as usize).div_ceil(8)];
    let base = buf.as_mut_ptr().cast::<u8>();
    if unsafe {
        GetLogicalProcessorInformationEx(RelationProcessorCore, Some(base.cast()), &mut len)
    }
    .is_err()
    {
        return (map, 0);
    }
    let mut offset = 0usize;
    let mut physical = 0;
    while offset < len as usize {
        let info = unsafe { &*base.add(offset).cast::<SYSTEM_LOGICAL_PROCESSOR_INFORMATION_EX>() };
        let core = unsafe { &info.Anonymous.Processor };
        physical += 1;
        let groups = unsafe { std::slice::from_raw_parts(core.GroupMask.as_ptr(), core.GroupCount as usize) };
        for g in groups {
            for bit in 0..usize::BITS {
                if g.Mask & (1usize << bit) != 0 {
                    map.insert((g.Group, bit), core.EfficiencyClass);
                }
            }
        }
        offset += info.Size as usize;
    }
    (map, physical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn instance_names() {
        assert_eq!(parse_instance("0,3"), Some((0, 3)));
        assert_eq!(parse_instance("1,12"), Some((1, 12)));
        assert_eq!(parse_instance("0,_Total"), None);
        assert_eq!(parse_instance("_Total"), None);
    }

    #[test]
    fn topology_covers_every_logical_cpu() {
        let (map, physical) = core_topology();
        let logical = std::thread::available_parallelism().unwrap().get();
        assert_eq!(map.len(), logical);
        assert!(physical >= 1 && physical as usize <= logical);
    }
}
