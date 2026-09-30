//! Main menu + run/check flows. Pure state machine; the main loop executes
//! [`MenuEffect`]s (subprocess calls) and feeds results back via `apply_*`.
use super::input::{Key, LineEditor};
use crate::ape;
use std::collections::HashMap;

pub const MENU_ITEMS: [&str; 7] = [
    "Run an agent",
    "Check a run",
    "Profiles",
    "Doctor",
    "Console info",
    "Status",
    "Quit",
];

#[derive(Debug, Clone, PartialEq)]
pub enum MenuView {
    Main { selected: usize },
    RunProfile { profiles: Vec<(String, String)>, selected: usize },
    RunObjective { profile: String, editor: LineEditor },
    RunProgress { run_id: String, profile: String, blocks: Vec<StepBlock>, seen: usize, budget: Budget, last_status: String },
    RunDone { run_id: String, summary: String },
    RunCancelled { run_id: String, summary: String },
    CheckId { editor: LineEditor },
    CheckShow { text: String },
    ProfilesList { profiles: Vec<(String, String)>, offset: usize },
    DoctorShow { text: String },
    StatusShow { text: String },
    ConsoleInfo,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MenuEffect {
    LoadProfiles,
    LoadDoctor,
    LoadStatus,
    StartRun { profile: String, objective: String },
    FetchStatus(String),
    CancelRun { run_id: String },
}

/// Budget limits for one profile, from `ape_agent_profiles` (same call that
/// feeds the picker — no second round-trip). All optional: a profile may
/// omit any ceiling, and then the meter shows spent only.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct ProfileLimits {
    pub max_steps: Option<i64>,
    pub max_usd: Option<f64>,
    pub max_tokens: Option<i64>,
}

/// Live budget: spent (from each `ape_agent_status` poll of the run row)
/// against limits (captured at start). Renders text-only, no graphics deps.
#[derive(Debug, Clone, PartialEq, Default)]
pub struct Budget {
    pub spent_usd: f64,
    pub spent_tokens: i64,
    pub steps: i64,
    pub limit_usd: Option<f64>,
    pub limit_tokens: Option<i64>,
    pub limit_steps: Option<i64>,
}

fn fmt_usd(v: f64) -> String {
    if v == 0.0 {
        return "0".to_string();
    }
    let s = format!("{v:.4}");
    s.trim_end_matches('0').to_string()
}

impl Budget {
    pub fn meter(&self) -> String {
        let spent = fmt_usd(self.spent_usd);
        let steps = match self.limit_steps {
            Some(l) => format!("{}/{} steps", self.steps, l),
            None => format!("{} steps", self.steps),
        };
        let toks = match self.limit_tokens {
            Some(l) => format!("{}/{} tok", self.spent_tokens, l),
            None => format!("{} tok", self.spent_tokens),
        };
        match self.limit_usd {
            Some(l) if l > 0.0 => {
                let frac = (self.spent_usd / l).clamp(0.0, 1.0);
                let filled = (frac * 10.0).round() as usize;
                let bar: String = (0..10).map(|i| if i < filled { '█' } else { '░' }).collect();
                format!("budget ${spent}/${} · {steps} · {toks} [{bar}]", fmt_usd(l))
            }
            _ => format!("budget ${spent} · {steps} · {toks}"),
        }
    }
}

/// One ledger step as a timeline block. Only fields the runtime exposes
/// (`tool`, `duration_ms`, `tokens`, `cost`, `result_summary` + row ids) —
/// there is no per-step args payload (only `args_hash`), so none is shown.
#[derive(Debug, Clone, PartialEq)]
pub struct StepBlock {
    pub step: i64,
    pub kind: String,
    pub tool: String,
    pub duration_ms: i64,
    pub tokens: i64,
    pub cost: f64,
    pub summary: String,
}

impl StepBlock {
    fn from_json(v: &serde_json::Value) -> Self {
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        let n = |k: &str| v.get(k).and_then(|x| x.as_i64()).unwrap_or(0);
        Self {
            step: n("step"),
            kind: s("kind"),
            tool: s("tool"),
            duration_ms: n("duration_ms"),
            tokens: n("tokens"),
            cost: v.get("cost").and_then(|x| x.as_f64()).unwrap_or(0.0),
            summary: s("result_summary"),
        }
    }

    pub fn header(&self) -> String {
        let what = if self.tool.is_empty() { self.kind.clone() } else { self.tool.clone() };
        format!(
            "step {} · {} · {}ms · {} tok · ${}",
            self.step,
            if what.is_empty() { "?".to_string() } else { what },
            self.duration_ms,
            self.tokens,
            fmt_usd(self.cost),
        )
    }

    /// Summary with honest truncation: cut text ends in `…[cut]` and the
    /// full record stays in the ledger (pollable by id, step detail in M3).
    /// Newlines are flattened: one block body is one screen line, always.
    pub fn body(&self) -> String {
        let flat: String = self.summary.chars().map(|c| if c == '\n' { ' ' } else { c }).collect();
        if flat.chars().count() > 120 {
            format!("{}…[cut]", flat.chars().take(115).collect::<String>())
        } else {
            flat
        }
    }
}

/// One-line human summary of an `ape_agent_status` result object.
/// Human copy, not raw fields: `done` renders as "finished", a missing
/// stop reason is omitted (never `stop=null`), and an empty outcome adds
/// no trailing blank line. Strings render bare (no JSON quotes); other
/// JSON renders compact.
pub fn status_text(result: &serde_json::Value) -> String {
    fn show(v: Option<&serde_json::Value>) -> String {
        match v {
            None => String::new(),
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(other) => other.to_string(),
        }
    }
    fn human_status(s: &str) -> &str {
        match s {
            "done" => "finished",
            "running" => "running",
            "stopped" => "stopped",
            "failed" => "failed",
            other => other,
        }
    }
    let status = result.get("status").and_then(|s| s.as_str()).unwrap_or("unknown");
    let outcome = result
        .get("outcome")
        .and_then(|o| o.as_str())
        .unwrap_or("")
        .chars()
        .take(400)
        .collect::<String>();
    let mut head = format!(
        "{} · {} steps · ${} · {} tokens",
        human_status(status),
        show(result.get("step_count")),
        show(result.get("total_cost")),
        show(result.get("total_tokens")),
    );
    let stop = result.get("stop_reason").and_then(|s| s.as_str()).unwrap_or("");
    if !stop.is_empty() {
        head.push_str(&format!(" · stopped: {stop}"));
    }
    if outcome.is_empty() {
        head
    } else {
        format!("{head}\n{outcome}")
    }
}

/// Human-readable `ape_status` body: version, provider, engine build state.
/// Missing pieces render as "?" — never raw nulls. Pure for testability.
pub fn status_body(status: &serde_json::Value) -> String {
    fn show(v: Option<&serde_json::Value>) -> String {
        match v {
            Some(serde_json::Value::String(s)) if !s.is_empty() => s.clone(),
            Some(other) => other.to_string(),
            _ => "?".to_string(),
        }
    }
    let version = show(status.get("version"));
    let provider = status
        .get("active_provider")
        .and_then(|a| a.get("provider"))
        .and_then(|p| p.as_str())
        .filter(|p| *p != "none")
        .unwrap_or("?");
    let source = status
        .get("active_provider")
        .and_then(|a| a.get("source"))
        .and_then(|s| s.as_str())
        .unwrap_or("unconfigured");
    let mut lines = vec![
        format!("ape-mcp {version}"),
        format!("provider: {provider} ({source})"),
    ];
    if let Some(engines) = status.get("engines").and_then(|e| e.as_object()) {
        let states: Vec<String> = ["genesis", "eve", "adam", "skein"]
            .iter()
            .map(|k| format!("{k} {}", engines.get(*k).and_then(|v| v.as_str()).unwrap_or("?")))
            .collect();
        lines.push(format!("engines: {}", states.join(", ")));
    }
    if let Some(detected) = status.get("detected_providers").and_then(|d| d.as_array()) {
        let names: Vec<String> = detected.iter().filter_map(|d| d.as_str().map(str::to_string)).collect();
        if !names.is_empty() {
            lines.push(format!("detected: {}", names.join(", ")));
        }
    }
    lines.join("\n")
}

pub struct Menu {
    pub view: MenuView,
    profiles_cache: Vec<(String, String)>,
    limits_cache: HashMap<String, ProfileLimits>,
    provider_cache: Option<String>,
    default_profile: Option<String>,
}

impl Menu {
    pub fn new() -> Self {
        Self {
            view: MenuView::Main { selected: 0 },
            profiles_cache: Vec::new(),
            limits_cache: HashMap::new(),
            provider_cache: None,
            // Local state, read once: the onboarded default, if any.
            default_profile: ape::load_default_profile(),
        }
    }

    /// One-line chrome for the status line: provider when a Status view has
    /// loaded it this session, default profile from local state, always
    /// truthful about what is (not) known yet. During a run it goes live:
    /// run id, profile, state, and spent cost.
    pub fn status_line(&self, version: &str) -> String {
        if let MenuView::RunProgress { run_id, profile, budget, last_status, .. } = &self.view {
            let short: String = run_id.chars().take(16).collect();
            return format!(
                "run {short} · {profile} · {last_status} · ${} · ape-mcp {version}",
                fmt_usd(budget.spent_usd),
            );
        }
        format!(
            "provider: {} · profile: {} · ape-mcp {}",
            self.provider_cache.as_deref().unwrap_or("…"),
            self.default_profile.as_deref().unwrap_or("…"),
            version,
        )
    }

    fn move_sel(selected: &mut usize, len: usize, down: bool) {
        if len == 0 {
            return;
        }
        if down {
            *selected = (*selected + 1).min(len - 1);
        } else {
            *selected = selected.saturating_sub(1);
        }
    }

    /// Key handling. Returns (effects, quit_app).
    /// Arrows are primary; `j`/`k` are secondary aliases. Text-entry views
    /// consume printable chars into their editors; only Esc navigates back,
    /// so stray control characters can never discard typed text.
    pub fn on_key(&mut self, key: Key) -> (Vec<MenuEffect>, bool) {
        match &mut self.view {
            MenuView::Main { selected } => match key {
                Key::Down | Key::Char('j') => {
                    Self::move_sel(selected, MENU_ITEMS.len(), true);
                    (vec![], false)
                }
                Key::Up | Key::Char('k') => {
                    Self::move_sel(selected, MENU_ITEMS.len(), false);
                    (vec![], false)
                }
                Key::Enter => match *selected {
                    0 => {
                        self.view = MenuView::RunProfile { profiles: vec![], selected: 0 };
                        (vec![MenuEffect::LoadProfiles], false)
                    }
                    2 => {
                        self.view = MenuView::ProfilesList { profiles: vec![], offset: 0 };
                        (vec![MenuEffect::LoadProfiles], false)
                    }
                    1 => {
                        self.view = MenuView::CheckId { editor: LineEditor::new() };
                        (vec![], false)
                    }
                    3 => (vec![MenuEffect::LoadDoctor], false),
                    4 => {
                        self.view = MenuView::ConsoleInfo;
                        (vec![], false)
                    }
                    5 => (vec![MenuEffect::LoadStatus], false),
                    _ => (vec![], true),
                },
                Key::Char('q') | Key::Char('Q') => (vec![], true),
                _ => (vec![], false),
            },
            MenuView::RunProfile { profiles, selected } => match key {
                Key::Down | Key::Char('j') => {
                    Self::move_sel(selected, profiles.len(), true);
                    (vec![], false)
                }
                Key::Up | Key::Char('k') => {
                    Self::move_sel(selected, profiles.len(), false);
                    (vec![], false)
                }
                Key::Enter => {
                    if let Some((name, _)) = profiles.get(*selected).cloned() {
                        self.view = MenuView::RunObjective { profile: name, editor: LineEditor::new() };
                    }
                    (vec![], false)
                }
                Key::Esc => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
                _ => (vec![], false),
            },
            MenuView::RunObjective { profile, editor } => match key {
                Key::Enter => {
                    if editor.is_empty() {
                        return (vec![], false);
                    }
                    let objective = editor.text();
                    (vec![MenuEffect::StartRun { profile: profile.clone(), objective }], false)
                }
                Key::Backspace => {
                    editor.backspace();
                    (vec![], false)
                }
                Key::Left => {
                    editor.move_left();
                    (vec![], false)
                }
                Key::Right => {
                    editor.move_right();
                    (vec![], false)
                }
                Key::Char(c) if !c.is_control() => {
                    editor.insert(c);
                    (vec![], false)
                }
                Key::Esc => {
                    self.view = MenuView::RunProfile { profiles: self.profiles_cache.clone(), selected: 0 };
                    (vec![], false)
                }
                _ => (vec![], false),
            },
            MenuView::RunProgress { run_id, .. } => {
                // Esc cancels the run server-side (ape_agent_cancel: the
                // worker is killed, the row goes stopped/cancelled and stays
                // pollable by id). Polling continues until the cancel lands.
                if key == Key::Esc {
                    (vec![MenuEffect::CancelRun { run_id: run_id.clone() }], false)
                } else {
                    (vec![], false)
                }
            }
            MenuView::RunDone { .. }
            | MenuView::RunCancelled { .. }
            | MenuView::CheckShow { .. }
            | MenuView::DoctorShow { .. }
            | MenuView::StatusShow { .. }
            | MenuView::ConsoleInfo => {
                self.view = MenuView::Main { selected: 0 };
                (vec![], false)
            }
            MenuView::ProfilesList { profiles, offset } => match key {
                Key::Down | Key::Char('j') => {
                    *offset = (*offset + 1).min(profiles.len().saturating_sub(1));
                    (vec![], false)
                }
                Key::Up | Key::Char('k') => {
                    *offset = offset.saturating_sub(1);
                    (vec![], false)
                }
                Key::Esc => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
                _ => (vec![], false),
            },
            MenuView::CheckId { editor } => match key {
                Key::Enter => {
                    if editor.is_empty() {
                        return (vec![], false);
                    }
                    (vec![MenuEffect::FetchStatus(editor.text())], false)
                }
                Key::Backspace => {
                    editor.backspace();
                    (vec![], false)
                }
                Key::Left => {
                    editor.move_left();
                    (vec![], false)
                }
                Key::Right => {
                    editor.move_right();
                    (vec![], false)
                }
                Key::Char(c) if !c.is_control() => {
                    editor.insert(c);
                    (vec![], false)
                }
                Key::Esc => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
                _ => (vec![], false),
            },
        }
    }

    pub fn apply_profiles(&mut self, profiles: Vec<(String, String)>, limits: HashMap<String, ProfileLimits>) {
        self.profiles_cache = profiles.clone();
        self.limits_cache = limits;
        match &mut self.view {
            MenuView::RunProfile { profiles: p, selected } => {
                *p = profiles;
                // Preselect the onboarded default so repeat runs are one Enter.
                *selected = ape::load_default_profile()
                    .and_then(|d| p.iter().position(|(n, _)| n == &d))
                    .unwrap_or(0);
            }
            MenuView::ProfilesList { profiles: p, offset } => {
                *p = profiles;
                *offset = 0;
            }
            _ => {}
        }
    }

    pub fn apply_run_started(&mut self, run_id: String, profile: String) {
        let limits = self.limits_cache.get(&profile).cloned().unwrap_or_default();
        self.view = MenuView::RunProgress {
            run_id,
            profile,
            blocks: vec![],
            seen: 0,
            budget: Budget {
                limit_usd: limits.max_usd,
                limit_tokens: limits.max_tokens,
                limit_steps: limits.max_steps,
                ..Budget::default()
            },
            last_status: "starting".to_string(),
        };
    }

    /// Feed one `ape_agent_status` poll. Appends only steps never seen (by
    /// position in the ledger array) — the timeline grows, never clears.
    /// Returns true when the run reached a terminal state.
    pub fn apply_poll(&mut self, status: &serde_json::Value) -> bool {
        let state = status.get("status").and_then(|s| s.as_str()).unwrap_or("running").to_string();
        let terminal = state != "running";
        let status_id = status.get("run_id").and_then(|r| r.as_str()).unwrap_or("").to_string();
        match &mut self.view {
            MenuView::RunProgress { run_id: view_id, blocks, seen, budget, last_status, .. } => {
                if let Some(steps) = status.get("steps").and_then(|s| s.as_array()) {
                    for s in steps.iter().skip(*seen) {
                        blocks.push(StepBlock::from_json(s));
                    }
                    *seen = steps.len();
                }
                budget.spent_usd = status.get("total_cost").and_then(|v| v.as_f64()).unwrap_or(0.0);
                budget.spent_tokens = status.get("total_tokens").and_then(|v| v.as_i64()).unwrap_or(0);
                budget.steps = status.get("step_count").and_then(|v| v.as_i64()).unwrap_or(0);
                *last_status = state.clone();
                if terminal {
                    // Prefer the view's id; the status envelope should echo
                    // it, but the id on screen must never be empty.
                    let id = if status_id.is_empty() { view_id.clone() } else { status_id };
                    self.view = MenuView::RunDone { run_id: id, summary: status_text(status) };
                    return true;
                }
            }
            _ => {}
        }
        false
    }

    /// A cancel that landed server-side: the run is stopped, its id stays
    /// visible so it remains pollable via Check a run.
    pub fn apply_cancelled(&mut self, run_id: String, status: &serde_json::Value) {
        self.view = MenuView::RunCancelled { run_id, summary: status_text(status) };
    }

    pub fn apply_check_status(&mut self, status: &serde_json::Value) {
        self.view = MenuView::CheckShow { text: status_text(status) };
    }

    pub fn apply_doctor(&mut self, text: String) {
        self.view = MenuView::DoctorShow { text };
    }

    pub fn apply_status(&mut self, status: &serde_json::Value) {
        self.provider_cache = status
            .get("active_provider")
            .and_then(|a| a.get("provider"))
            .and_then(|p| p.as_str())
            .filter(|p| *p != "none")
            .map(str::to_string);
        self.view = MenuView::StatusShow { text: status_body(status) };
    }
}

impl Default for Menu {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn main_navigation_moves_and_selects() {
        let mut m = Menu::new();
        m.on_key(Key::Down);
        assert!(matches!(m.view, MenuView::Main { selected: 1 }));
        m.on_key(Key::Up);
        assert!(matches!(m.view, MenuView::Main { selected: 0 }));
        // vim aliases still work.
        m.on_key(Key::Char('j'));
        assert!(matches!(m.view, MenuView::Main { selected: 1 }));
        let (fx, quit) = m.on_key(Key::Enter);
        assert!(!quit);
        assert!(matches!(m.view, MenuView::CheckId { .. }));
        assert_eq!(fx, vec![]);
    }

    #[test]
    fn q_quits_from_main() {
        let mut m = Menu::new();
        let (_, quit) = m.on_key(Key::Char('q'));
        assert!(quit);
        let mut m2 = Menu::new();
        let (_, quit2) = m2.on_key(Key::Char('Q'));
        assert!(quit2);
    }

    #[test]
    fn quit_entry_quits() {
        let mut m = Menu::new();
        for _ in 0..6 {
            m.on_key(Key::Char('j'));
        }
        let (_, quit) = m.on_key(Key::Enter);
        assert!(quit);
    }

    #[test]
    fn status_entry_loads_status_view() {
        let mut m = Menu::new();
        for _ in 0..5 {
            m.on_key(Key::Down);
        }
        let (fx, quit) = m.on_key(Key::Enter);
        assert!(!quit);
        assert_eq!(fx, vec![MenuEffect::LoadStatus]);
        let v: serde_json::Value = serde_json::from_str(
            r#"{"version":"1.0.4","active_provider":{"provider":"opencode","source":"opencode session"},"engines":{"genesis":"vendored","eve":"vendored","adam":"vendored","skein":"vendored"},"detected_providers":["opencode"]}"#,
        )
        .unwrap();
        m.apply_status(&v);
        assert!(matches!(m.view, MenuView::StatusShow { .. }));
        assert_eq!(m.provider_cache.as_deref(), Some("opencode"));
        assert!(m.status_line("1.0.4").contains("provider: opencode"));
        assert!(m.status_line("1.0.4").contains("ape-mcp 1.0.4"));
    }

    #[test]
    fn status_body_never_shows_raw_nulls() {
        let v: serde_json::Value = serde_json::from_str("{}").unwrap();
        let t = status_body(&v);
        assert!(!t.contains("null"), "got: {t}");
        assert!(t.contains("ape-mcp ?"), "got: {t}");
    }

    #[test]
    fn esc_leaves_subviews_but_q_types_in_editors() {
        let mut m = Menu::new();
        m.view = MenuView::CheckId { editor: LineEditor::new() };
        m.on_key(Key::Char('q'));
        match &m.view {
            MenuView::CheckId { editor } => assert_eq!(editor.text(), "q"),
            other => panic!("q must type into the editor, got {other:?}"),
        }
        m.on_key(Key::Esc);
        assert!(matches!(m.view, MenuView::Main { .. }));
    }

    #[test]
    fn stray_control_chars_keep_editor_text() {
        let mut m = Menu::new();
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("do it") };
        // A stray control char (e.g. Ctrl-S) must not nuke the typed text.
        m.on_key(Key::Char('\x13'));
        assert!(matches!(m.view, MenuView::RunObjective { .. }));
        if let MenuView::RunObjective { editor, .. } = &m.view {
            assert_eq!(editor.text(), "do it");
        }
    }

    #[test]
    fn profiles_reload_resets_scroll() {
        let mut m = Menu::new();
        m.view = MenuView::ProfilesList { profiles: vec![("a".into(), "".into())], offset: 3 };
        m.apply_profiles(vec![("a".into(), "".into()), ("b".into(), "".into())], HashMap::new());
        assert!(matches!(m.view, MenuView::ProfilesList { offset: 0, .. }));
    }

    #[test]
    fn run_flow_stages_profile_then_objective() {
        let mut m = Menu::new();
        let (fx, _) = m.on_key(Key::Enter); // Run an agent
        assert_eq!(fx, vec![MenuEffect::LoadProfiles]);
        m.apply_profiles(vec![("repo-triage".to_string(), "t".to_string())], HashMap::new());
        assert!(matches!(m.view, MenuView::RunProfile { .. }));
        m.on_key(Key::Enter);
        assert!(matches!(m.view, MenuView::RunObjective { .. }));
        // Empty objective does not start.
        let (fx2, _) = m.on_key(Key::Enter);
        assert_eq!(fx2, vec![]);
        // Esc from the objective goes back to the profile list.
        m.on_key(Key::Esc);
        assert!(matches!(m.view, MenuView::RunProfile { .. }));
    }

    #[test]
    fn objective_enter_starts_run() {
        let mut m = Menu::new();
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("do it") };
        let (fx, _) = m.on_key(Key::Enter);
        assert_eq!(fx, vec![MenuEffect::StartRun { profile: "p".to_string(), objective: "do it".to_string() }]);
    }

    #[test]
    fn poll_appends_only_new_steps_and_keeps_id() {
        let mut m = Menu::new();
        m.view = MenuView::RunProgress {
            run_id: "r".to_string(),
            profile: "p".to_string(),
            blocks: vec![],
            seen: 0,
            budget: Budget::default(),
            last_status: "starting".to_string(),
        };
        let poll1: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"r","status":"running","step_count":1,"total_cost":0.01,"total_tokens":40,"steps":[{"step":1,"kind":"tool","tool":"skein.orchestrate","duration_ms":120,"tokens":40,"cost":0.01,"result_summary":"ok"}]}"#,
        )
        .unwrap();
        assert!(!m.apply_poll(&poll1));
        // Same frame twice: no duplicates.
        assert!(!m.apply_poll(&poll1));
        let poll2: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"r","status":"done","stop_reason":"explicit_final_answer","step_count":2,"total_cost":0.02,"total_tokens":80,"outcome":"fine","steps":[{"step":1,"kind":"tool","tool":"skein.orchestrate","duration_ms":120,"tokens":40,"cost":0.01,"result_summary":"ok"},{"step":2,"kind":"tool","tool":"finish","duration_ms":5,"tokens":40,"cost":0.01,"result_summary":"fine"}]}"#,
        )
        .unwrap();
        assert!(m.apply_poll(&poll2));
        match &m.view {
            MenuView::RunDone { run_id, summary } => {
                assert_eq!(run_id, "r");
                assert!(summary.contains("finished"), "got: {summary}");
            }
            other => panic!("expected RunDone, got {other:?}"),
        }
    }

    #[test]
    fn esc_in_progress_cancels_not_detaches() {
        let mut m = Menu::new();
        m.view = MenuView::RunProgress {
            run_id: "r".to_string(),
            profile: "p".to_string(),
            blocks: vec![],
            seen: 0,
            budget: Budget::default(),
            last_status: "running".to_string(),
        };
        let (fx, quit) = m.on_key(Key::Esc);
        assert!(!quit);
        assert_eq!(fx, vec![MenuEffect::CancelRun { run_id: "r".to_string() }]);
        // Stays on the progress view until the cancel lands.
        assert!(matches!(m.view, MenuView::RunProgress { .. }));
        let v: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"r","status":"stopped","stop_reason":"cancelled","step_count":1,"total_cost":0.01,"total_tokens":40,"outcome":""}"#,
        )
        .unwrap();
        m.apply_cancelled("r".to_string(), &v);
        match &m.view {
            MenuView::RunCancelled { run_id, .. } => assert_eq!(run_id, "r"),
            other => panic!("expected RunCancelled, got {other:?}"),
        }
    }

    #[test]
    fn budget_meter_shows_limits_and_spent() {
        let b = Budget {
            spent_usd: 0.25,
            spent_tokens: 812,
            steps: 3,
            limit_usd: Some(0.5),
            limit_tokens: Some(100000),
            limit_steps: Some(10),
        };
        let t = b.meter();
        assert!(t.contains("3/10 steps"), "got: {t}");
        assert!(t.contains("812/100000 tok"), "got: {t}");
        assert!(t.contains("$0.25/$0.5"), "got: {t}");
        assert!(t.contains('█'), "bar present, got: {t}");
        let bare = Budget::default().meter();
        assert!(!bare.contains('/'), "no limits, no slashes: {bare}");
    }

    #[test]
    fn status_line_goes_live_during_runs() {
        let mut m = Menu::new();
        m.view = MenuView::RunProgress {
            run_id: "run-abc123".to_string(),
            profile: "p".to_string(),
            blocks: vec![],
            seen: 0,
            budget: Budget { spent_usd: 0.02, ..Budget::default() },
            last_status: "running".to_string(),
        };
        let t = m.status_line("1.0.4");
        assert!(t.contains("run-abc123"), "got: {t}");
        assert!(t.contains("running"), "got: {t}");
        assert!(t.contains("0.02"), "got: {t}");
    }

    #[test]
    fn status_text_shapes() {
        let v: serde_json::Value = serde_json::from_str(r#"{"status":"done","stop_reason":"explicit_final_answer","step_count":3,"total_cost":0.02,"total_tokens":120,"outcome":"fine"}"#).unwrap();
        let t = status_text(&v);
        assert!(t.contains("finished"), "done renders as finished, got: {t}");
        assert!(t.contains("explicit_final_answer"));
        assert!(t.contains("fine"));
        assert!(!t.contains("null"), "no raw nulls, got: {t}");
    }

    #[test]
    fn status_text_omits_missing_stop_and_empty_outcome() {
        let v: serde_json::Value = serde_json::from_str(r#"{"status":"running","step_count":2,"total_cost":0}"#).unwrap();
        let t = status_text(&v);
        assert!(!t.contains("null"), "got: {t}");
        assert!(!t.ends_with('\n'), "no trailing blank line, got: {t:?}");
        assert!(t.contains("running"), "got: {t}");
    }
}
