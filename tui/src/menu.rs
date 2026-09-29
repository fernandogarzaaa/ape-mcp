//! Main menu + run/check flows. Pure state machine; the main loop executes
//! [`MenuEffect`]s (subprocess calls) and feeds results back via `apply_*`.
use super::input::LineEditor;
use crate::ape;

pub const MENU_ITEMS: [&str; 6] = [
    "Run an agent",
    "Check a run",
    "Profiles",
    "Doctor",
    "Console info",
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
    ConsoleInfo,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MenuEffect {
    LoadProfiles,
    LoadDoctor,
    StartRun { profile: String, objective: String },
    FetchStatus(String),
}

/// One-line human summary of an `ape_agent_status` result object.
/// Strings render bare (no JSON quotes); other JSON renders compact.
pub fn status_text(result: &serde_json::Value) -> String {
    fn show(v: Option<&serde_json::Value>) -> String {
        match v {
            None => String::new(),
            Some(serde_json::Value::String(s)) => s.clone(),
            Some(other) => other.to_string(),
        }
    }
    let outcome = result
        .get("outcome")
        .and_then(|o| o.as_str())
        .unwrap_or("")
        .chars()
        .take(400)
        .collect::<String>();
    format!(
        "status={} stop={} steps={} cost_usd={}\n{}",
        show(result.get("status")),
        show(result.get("stop_reason")),
        show(result.get("step_count")),
        show(result.get("total_cost")),
        outcome
    )
}

pub struct Menu {
    pub view: MenuView,
    profiles_cache: Vec<(String, String)>,
}

impl Menu {
    pub fn new() -> Self {
        Self { view: MenuView::Main { selected: 0 }, profiles_cache: Vec::new() }
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
    /// Text-entry views consume printable chars into their editors.
    pub fn on_key(&mut self, c: char) -> (Vec<MenuEffect>, bool) {
        match &mut self.view {
            MenuView::Main { selected } => match c {
                'j' => {
                    Self::move_sel(selected, MENU_ITEMS.len(), true);
                    (vec![], false)
                }
                'k' => {
                    Self::move_sel(selected, MENU_ITEMS.len(), false);
                    (vec![], false)
                }
                '\r' => match *selected {
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
                    _ => (vec![], true),
                },
                _ => (vec![], false),
            },
            MenuView::RunProfile { profiles, selected } => match c {
                'j' => {
                    Self::move_sel(selected, profiles.len(), true);
                    (vec![], false)
                }
                'k' => {
                    Self::move_sel(selected, profiles.len(), false);
                    (vec![], false)
                }
                '\r' => {
                    if let Some((name, _)) = profiles.get(*selected).cloned() {
                        self.view = MenuView::RunObjective { profile: name, editor: LineEditor::new() };
                    }
                    (vec![], false)
                }
                _ => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
            },
            MenuView::RunObjective { profile, editor } => match c {
                '\r' => {
                    if editor.is_empty() {
                        return (vec![], false);
                    }
                    let objective = editor.text();
                    (vec![MenuEffect::StartRun { profile: profile.clone(), objective }], false)
                }
                '\x08' | '\x7f' => {
                    editor.backspace();
                    (vec![], false)
                }
                _ if !c.is_control() => {
                    editor.insert(c);
                    (vec![], false)
                }
                _ => {
                    self.view = MenuView::RunProfile { profiles: self.profiles_cache.clone(), selected: 0 };
                    (vec![], false)
                }
            },
            MenuView::RunProgress { .. } => {
                // Esc handled by the main loop via Nav-ish convention: any key
                // except nothing... polling continues; Esc abandons polling and
                // the run keeps going server-side.
                if c == '\x1b' {
                    self.view = MenuView::Main { selected: 0 };
                }
                (vec![], false)
            }
            MenuView::RunDone { .. }
            | MenuView::CheckShow { .. }
            | MenuView::DoctorShow { .. }
            | MenuView::ConsoleInfo => {
                self.view = MenuView::Main { selected: 0 };
                (vec![], false)
            }
            MenuView::ProfilesList { profiles, offset } => match c {
                'j' => {
                    *offset = (*offset + 1).min(profiles.len().saturating_sub(1));
                    (vec![], false)
                }
                'k' => {
                    *offset = offset.saturating_sub(1);
                    (vec![], false)
                }
                _ => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
            },
            MenuView::CheckId { editor } => match c {
                '\r' => {
                    if editor.is_empty() {
                        return (vec![], false);
                    }
                    (vec![MenuEffect::FetchStatus(editor.text())], false)
                }
                '\x08' | '\x7f' => {
                    editor.backspace();
                    (vec![], false)
                }
                _ if !c.is_control() => {
                    editor.insert(c);
                    (vec![], false)
                }
                _ => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
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
            MenuView::ProfilesList { profiles: p, .. } => {
                *p = profiles;
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

    pub fn apply_status(&mut self, status: &serde_json::Value) {
        self.view = MenuView::CheckShow { text: status_text(status) };
    }

    pub fn apply_doctor(&mut self, text: String) {
        self.view = MenuView::DoctorShow { text };
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
        m.on_key('j');
        assert!(matches!(m.view, MenuView::Main { selected: 1 }));
        let (fx, quit) = m.on_key('\r');
        assert!(!quit);
        assert!(matches!(m.view, MenuView::CheckId { .. }));
        assert_eq!(fx, vec![]);
    }

    #[test]
    fn quit_entry_quits() {
        let mut m = Menu::new();
        for _ in 0..5 {
            m.on_key('j');
        }
        let (_, quit) = m.on_key('\r');
        assert!(quit);
    }

    #[test]
    fn run_flow_stages_profile_then_objective() {
        let mut m = Menu::new();
        let (fx, _) = m.on_key('\r'); // Run an agent
        assert_eq!(fx, vec![MenuEffect::LoadProfiles]);
        m.apply_profiles(vec![("repo-triage".to_string(), "t".to_string())]);
        assert!(matches!(m.view, MenuView::RunProfile { .. }));
        m.on_key('\r');
        assert!(matches!(m.view, MenuView::RunObjective { .. }));
        // Empty objective does not start.
        let (fx2, _) = m.on_key('\r');
        assert_eq!(fx2, vec![]);
        // Esc from empty states goes back without effects.
        let mut m2 = Menu::new();
        m2.view = MenuView::RunProfile { profiles: vec![], selected: 0 };
        m2.on_key('x');
        assert!(matches!(m2.view, MenuView::Main { .. }));
    }

    #[test]
    fn objective_enter_starts_run() {
        let mut m = Menu::new();
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("do it") };
        let (fx, _) = m.on_key('\r');
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
        let v: serde_json::Value = serde_json::from_str(r#"{"status":"done","stop_reason":"explicit_final_answer","step_count":3,"total_cost":0.02,"outcome":"fine"}"#).unwrap();
        let t = status_text(&v);
        assert!(t.contains("status=done"));
        assert!(t.contains("fine"));
    }
}
