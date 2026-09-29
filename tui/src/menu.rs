//! Main menu + run/check flows. Pure state machine; the main loop executes
//! [`MenuEffect`]s (subprocess calls) and feeds results back via `apply_*`.
use super::input::{Key, LineEditor};
use crate::ape;

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
    RunProgress { run_id: String, profile: String, lines: Vec<String> },
    RunDone { summary: String },
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
    provider_cache: Option<String>,
    default_profile: Option<String>,
}

impl Menu {
    pub fn new() -> Self {
        Self {
            view: MenuView::Main { selected: 0 },
            profiles_cache: Vec::new(),
            provider_cache: None,
            // Local state, read once: the onboarded default, if any.
            default_profile: ape::load_default_profile(),
        }
    }

    /// One-line chrome for the status line: provider when a Status view has
    /// loaded it this session, default profile from local state, always
    /// truthful about what is (not) known yet.
    pub fn status_line(&self, version: &str) -> String {
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
            MenuView::RunProgress { .. } => {
                // Polling continues; Esc abandons watching and the run keeps
                // going server-side.
                if key == Key::Esc {
                    self.view = MenuView::Main { selected: 0 };
                }
                (vec![], false)
            }
            MenuView::RunDone { .. }
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

    pub fn apply_profiles(&mut self, profiles: Vec<(String, String)>) {
        self.profiles_cache = profiles.clone();
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
        self.view = MenuView::RunProgress { run_id, profile, lines: vec!["run started — polling status…".to_string()] };
    }

    /// Returns true when the run reached a terminal state.
    pub fn apply_poll(&mut self, status: &serde_json::Value) -> bool {
        let terminal = status.get("status").and_then(|s| s.as_str()).unwrap_or("running") != "running";
        let line = status_text(status);
        match &mut self.view {
            MenuView::RunProgress { lines, .. } => {
                lines.push(line.clone());
                if lines.len() > 12 {
                    lines.drain(..lines.len() - 12);
                }
                if terminal {
                    self.view = MenuView::RunDone { summary: line };
                    return true;
                }
            }
            _ => {}
        }
        false
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
        m.apply_profiles(vec![("a".into(), "".into()), ("b".into(), "".into())]);
        assert!(matches!(m.view, MenuView::ProfilesList { offset: 0, .. }));
    }

    #[test]
    fn run_flow_stages_profile_then_objective() {
        let mut m = Menu::new();
        let (fx, _) = m.on_key(Key::Enter); // Run an agent
        assert_eq!(fx, vec![MenuEffect::LoadProfiles]);
        m.apply_profiles(vec![("repo-triage".to_string(), "t".to_string())]);
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
    fn poll_tracks_until_terminal() {
        let mut m = Menu::new();
        m.view = MenuView::RunProgress { run_id: "r".to_string(), profile: "p".to_string(), lines: vec![] };
        let running: serde_json::Value = serde_json::from_str(r#"{"status":"running","stop_reason":null,"step_count":2,"total_cost":0.01,"outcome":""}"#).unwrap();
        assert!(!m.apply_poll(&running));
        let done: serde_json::Value = serde_json::from_str(r#"{"status":"done","stop_reason":"explicit_final_answer","step_count":3,"total_cost":0.02,"outcome":"ok"}"#).unwrap();
        assert!(m.apply_poll(&done));
        assert!(matches!(m.view, MenuView::RunDone { .. }));
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
