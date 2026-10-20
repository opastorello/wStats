//! The language of the text Rust produces itself: menus, sensor labels, messages. The
//! web pages translate their own text (src/i18n.ts); both follow `Settings::language`.

use crate::config::Language;
use std::sync::atomic::{AtomicU8, Ordering};

static CURRENT: AtomicU8 = AtomicU8::new(0);

/// Sets the language; true if it changed.
pub fn set(lang: Language) -> bool {
    let v = match lang {
        Language::Auto => 0,
        Language::Pt => 1,
        Language::En => 2,
    };
    CURRENT.swap(v, Ordering::Relaxed) != v
}

/// Whether text should be in Portuguese ("auto" asks Windows' display language).
pub fn pt() -> bool {
    match CURRENT.load(Ordering::Relaxed) {
        1 => true,
        2 => false,
        _ => system_is_pt(),
    }
}

/// `pt` or `en`, by the current language.
pub fn tr(pt_text: &'static str, en_text: &'static str) -> &'static str {
    if pt() { pt_text } else { en_text }
}

fn system_is_pt() -> bool {
    const LANG_PORTUGUESE: u16 = 0x16;
    let id = unsafe { windows::Win32::Globalization::GetUserDefaultUILanguage() };
    id & 0x3ff == LANG_PORTUGUESE
}
