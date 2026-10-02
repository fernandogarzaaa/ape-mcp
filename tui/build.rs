// Embed the npm package version at build time so the TUI reports the real
// release on every launch path (direct binary, cargo, either launcher),
// even when APE_TUI_VERSION is unset. Falls back to the crate version when
// package.json is missing or unparsable (e.g. vendored crate builds).
use std::{env, fs};

fn main() {
    let manifest = std::path::Path::new(&env::var("CARGO_MANIFEST_DIR").unwrap()).join("../package.json");
    let mut version: Option<String> = None;
    if let Ok(text) = fs::read_to_string(&manifest) {
        for line in text.lines() {
            let t = line.trim();
            if let Some(rest) = t.strip_prefix("\"version\"") {
                let rest = rest.trim_start().strip_prefix(':').unwrap_or("").trim_start();
                if let Some(inner) = rest.strip_prefix('"').and_then(|s| s.split('"').next()) {
                    if !inner.is_empty() {
                        version = Some(inner.to_string());
                    }
                }
                break;
            }
        }
    }
    match version {
        Some(v) => println!("cargo:rustc-env=APE_TUI_PKG_VERSION={v}"),
        None => println!("cargo:warning=package.json version unreadable; TUI falls back to crate version"),
    }
    println!("cargo:rerun-if-changed=../package.json");
}
