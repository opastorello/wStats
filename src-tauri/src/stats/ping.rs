//! ICMP echo to one host every few seconds, on its own thread: `IcmpSendEcho` blocks
//! for up to the timeout and must never stall the sampler.

use parking_lot::RwLock;
use std::net::{IpAddr, ToSocketAddrs};
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;
use windows::Win32::NetworkManagement::IpHelper::{ICMP_ECHO_REPLY, IcmpCloseHandle, IcmpCreateFile, IcmpSendEcho};

const NONE: u32 = u32::MAX;
const PERIOD: Duration = Duration::from_secs(3);
const TIMEOUT_MS: u32 = 1500;

pub struct Pinger {
    pub host: RwLock<String>,
    last: AtomicU32,
}

impl Pinger {
    pub fn spawn(host: String) -> Arc<Self> {
        let me = Arc::new(Self { host: RwLock::new(host), last: AtomicU32::new(NONE) });
        let worker = me.clone();
        std::thread::Builder::new()
            .name("ping".into())
            .spawn(move || worker.run())
            .expect("spawn ping thread");
        me
    }

    pub fn last(&self) -> Option<u32> {
        let v = self.last.load(Ordering::Relaxed);
        (v != NONE).then_some(v)
    }

    fn run(&self) {
        let Ok(handle) = (unsafe { IcmpCreateFile() }) else { return };
        loop {
            let host = self.host.read().clone();
            let rtt = resolve_v4(&host).and_then(|ip| echo(handle, ip));
            self.last.store(rtt.unwrap_or(NONE), Ordering::Relaxed);
            std::thread::sleep(PERIOD);
        }
        #[allow(unreachable_code)]
        unsafe {
            let _ = IcmpCloseHandle(handle);
        }
    }
}

fn resolve_v4(host: &str) -> Option<[u8; 4]> {
    if let Ok(IpAddr::V4(ip)) = host.parse() {
        return Some(ip.octets());
    }
    (host, 0).to_socket_addrs().ok()?.find_map(|a| match a.ip() {
        IpAddr::V4(ip) => Some(ip.octets()),
        _ => None,
    })
}

fn echo(handle: windows::Win32::Foundation::HANDLE, ip: [u8; 4]) -> Option<u32> {
    let payload = *b"wStats-ping";
    let mut reply = vec![0u8; size_of::<ICMP_ECHO_REPLY>() + payload.len() + 8];
    let n = unsafe {
        IcmpSendEcho(
            handle,
            u32::from_ne_bytes(ip),
            payload.as_ptr().cast(),
            payload.len() as u16,
            None,
            reply.as_mut_ptr().cast(),
            reply.len() as u32,
            TIMEOUT_MS,
        )
    };
    if n == 0 {
        return None;
    }
    let r = unsafe { &*reply.as_ptr().cast::<ICMP_ECHO_REPLY>() };
    (r.Status == 0).then_some(r.RoundTripTime)
}
