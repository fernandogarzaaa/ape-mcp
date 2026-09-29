//! Bridge to the Node runtime: every TUI action shells out to
//! `node bin/ape-mcp.js run '<tool>' '<json-args>'` and parses JSON stdout.
//! The TUI never reimplements tool behavior; this module is the only place
//! that knows how to invoke it (plus `doctor`, which has plain-text output).
use std::path::{Path, PathBuf};
use std::process::Command;

/// Resolve `bin/ape-mcp.js` for a given current-exe path + environment.
/// Order: `$APE_MCP_JS` wins (dev / tests), then the prebuilt layout
/// (`vendors/ape-tui/<platform>/ape-tui[.exe]` → repo root `bin/ape-mcp.js`).
/// Pure function over explicit inputs so it is unit-testable.
pub fn resolve_ape_js(exe_path: &Path, env_ape_mcp_js: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = env_ape_mcp_js {
        if !p.is_empty() {
            return Some(PathBuf::from(p));
        }
    }
    // vendors/ape-tui/<platform>/ape-tui(.exe) → up 3 = repo root.
    let mut root = exe_path.parent()?.to_path_buf();
    for _ in 0..3 {
        root = root.parent()?.to_path_buf();
    }
    let candidate = root.join("bin").join("ape-mcp.js");
    if candidate.is_file() {
        return Some(candidate);
    }
    None
}

/// Parsed result of one runtime invocation.
#[derive(Debug, PartialEq)]
pub enum BridgeResult {
    /// `dispatchCall` JSON envelope (`resultType: complete`, ...).
    Json(serde_json::Value),
    /// Non-JSON stdout (e.g. `doctor` human-readable output).
    Text(String),
}

/// Run one APE tool through the Node CLI. `node_bin` is the node executable
/// (usually "node" from PATH); `ape_js` comes from [`resolve_ape_js`].
/// Never panics on tool failure: errors come back as `Err(String)`.
pub fn run_tool(node_bin: &str, ape_js: &Path, tool: &str, args_json: &str) -> Result<BridgeResult, String> {
    let out = Command::new(node_bin)
        .arg(ape_js)
        .arg("run")
        .arg(tool)
        .arg(args_json)
        .output()
        .map_err(|e| format!("spawn node failed: {e}"))?;
    if !out.status.success() {
        return Err(format!(
            "ape exited {}: {}",
            out.status.code().unwrap_or(-1),
            String::from_utf8_lossy(&out.stderr).chars().take(300).collect::<String>()
        ));
    }
    let text = String::from_utf8_lossy(&out.stdout).trim().to_string();
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(v) => Ok(BridgeResult::Json(v)),
        Err(_) => Ok(BridgeResult::Text(text)),
    }
}

/// Extract the tool `result` from a `dispatchCall` envelope, if present.
pub fn envelope_result(v: &serde_json::Value) -> Option<&serde_json::Value> {
    v.get("structuredContent")?.get("result")
}

/// Run an arbitrary `ape-mcp` CLI command (`doctor`, ...) and capture output.
/// Used for non-tool commands; output is human-readable text, not JSON.
pub fn run_cli(node_bin: &str, ape_js: &Path, args: &[&str]) -> Result<BridgeResult, String> {
    let out = Command::new(node_bin)
        .arg(ape_js)
        .args(args)
        .output()
        .map_err(|e| format!("spawn node failed: {e}"))?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&out.stdout),
        String::from_utf8_lossy(&out.stderr)
    );
    let text = text.trim().to_string();
    match serde_json::from_str::<serde_json::Value>(&text) {
        Ok(v) => Ok(BridgeResult::Json(v)),
        Err(_) => Ok(BridgeResult::Text(text)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn resolve_prefers_env() {
        let got = resolve_ape_js(Path::new("/x/vendors/ape-tui/linux/ape-tui"), Some("/custom/ape-mcp.js")).unwrap();
        assert_eq!(got, PathBuf::from("/custom/ape-mcp.js"));
    }

    #[test]
    fn resolve_ignores_empty_env() {
        // Empty env falls through to layout probing (which misses here).
        assert!(resolve_ape_js(Path::new("/x/vendors/ape-tui/linux/ape-tui"), Some("")).is_none());
    }

    #[test]
    fn resolve_prebuilt_layout() {
        // Build a fake repo tree: <root>/bin/ape-mcp.js + deep exe path.
        let root = std::env::temp_dir().join(format!("ape-tui-test-{}", std::process::id()));
        let exe = root.join("vendors").join("ape-tui").join("linux").join("ape-tui");
        fs::create_dir_all(exe.parent().unwrap()).unwrap();
        fs::create_dir_all(root.join("bin")).unwrap();
        fs::write(root.join("bin").join("ape-mcp.js"), "// stub").unwrap();
        let got = resolve_ape_js(&exe, None).unwrap();
        assert_eq!(got, root.join("bin").join("ape-mcp.js"));
        fs::remove_dir_all(&root).ok();
    }

    #[test]
    fn envelope_result_picks_nested_result() {
        let v: serde_json::Value =
            serde_json::from_str(r#"{"resultType":"complete","structuredContent":{"tool":"ape_status","ok":true,"result":{"version":"1.0.0"}}}"#).unwrap();
        assert_eq!(envelope_result(&v).unwrap().get("version").unwrap(), "1.0.0");
    }

    #[test]
    fn envelope_result_absent_without_envelope() {
        let v: serde_json::Value = serde_json::from_str(r#"{"error":"x"}"#).unwrap();
        assert!(envelope_result(&v).is_none());
    }
}

/// Data dir mirror of `src/trace.js dataDir()`: `$APE_DATA_DIR`, else `./.ape`.
pub fn data_dir() -> PathBuf {
    match std::env::var("APE_DATA_DIR") {
        Ok(d) if !d.is_empty() => PathBuf::from(d),
        _ => std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(".ape"),
    }
}

/// First-run marker. Absence means onboarding has never completed here.
pub fn onboarded_marker() -> PathBuf {
    data_dir().join("onboarded")
}

pub fn is_onboarded() -> bool {
    onboarded_marker().is_file()
}

pub fn mark_onboarded() -> std::io::Result<()> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir)?;
    std::fs::write(onboarded_marker(), "1\n")
}

/// Minimal user config (today: default profile only). JSON, best-effort reads.
pub fn config_path() -> PathBuf {
    data_dir().join("config.json")
}

pub fn save_default_profile(name: &str) -> std::io::Result<()> {
    let dir = data_dir();
    std::fs::create_dir_all(&dir)?;
    let body = serde_json::json!({ "default_profile": name });
    std::fs::write(config_path(), serde_json::to_string_pretty(&body).unwrap_or_default())
}

pub fn load_default_profile() -> Option<String> {
    let text = std::fs::read_to_string(config_path()).ok()?;
    serde_json::from_str::<serde_json::Value>(&text)
        .ok()?
        .get("default_profile")?
        .as_str()
        .map(str::to_string)
}

/// A throwaway mock-provider profile for the onboarding demo: a real run
/// through the real loop at zero cost (mock plan finishes immediately).
/// Written into the user profiles dir so `loadProfile` finds it; caller deletes.
pub fn write_demo_profile() -> std::io::Result<PathBuf> {
    let dir = data_dir().join("profiles");
    std::fs::create_dir_all(&dir)?;
    let path = dir.join("ape-demo.yaml");
    std::fs::write(
        &path,
        "name: ape-demo\ndescription: onboarding demo (mock, deleted after)\nmodel:\n  provider: mock\n  id: mock-model\nsystem: demo\ntools:\n  - builtin: finish\nlimits:\n  max_steps: 3\n  max_tokens: 10000\n  max_wall_seconds: 60\n  max_usd: 0.01\n",
    )?;
    Ok(path)
}

#[cfg(test)]
mod local_state_tests {
    use super::*;

    // NOTE: single test on purpose — APE_DATA_DIR is process-global and Rust
    // runs tests on threads, so two tests touching it would race.
    #[test]
    fn local_state_roundtrip() {
        let tmp = std::env::temp_dir().join(format!("ape-tui-state-{}", std::process::id()));
        let _guard = EnvGuard::set("APE_DATA_DIR", tmp.to_str().unwrap());
        assert!(!is_onboarded());
        mark_onboarded().unwrap();
        assert!(is_onboarded());
        save_default_profile("repo-triage").unwrap();
        assert_eq!(load_default_profile().as_deref(), Some("repo-triage"));
        let p = write_demo_profile().unwrap();
        let text = std::fs::read_to_string(&p).unwrap();
        assert!(text.contains("provider: mock"));
        assert!(text.contains("builtin: finish"));
        std::fs::remove_dir_all(&tmp).ok();
    }

    /// Restores the previous env value on drop (including "was absent").
    struct EnvGuard {
        key: &'static str,
        prev: Option<String>,
    }
    impl EnvGuard {
        fn set(key: &'static str, val: &str) -> Self {
            let prev = std::env::var(key).ok();
            std::env::set_var(key, val);
            Self { key, prev }
        }
    }
    impl Drop for EnvGuard {
        fn drop(&mut self) {
            match &self.prev {
                Some(v) => std::env::set_var(self.key, v),
                None => std::env::remove_var(self.key),
            }
        }
    }
}
