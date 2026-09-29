//! Onboarding flow: Doctor → Provider → Profile → Demo → Done.
//! Pure state machine plus an [`Effect`] list the main loop executes
//! (subprocess calls stay out of here so every transition is unit-testable).
//!
//! ```text
//! Doctor --enter--> Provider --enter--> Profile --enter--> Demo --done--> Done
//!    ^                  ^                  ^   (Esc goes back anywhere safe)
//!    └────── LoadDoctor    └─ LoadStatus    └─ LoadProfiles + SaveDefault
//! ```

/// One parsed `ape-mcp doctor` line.
#[derive(Debug, Clone, PartialEq)]
pub struct DoctorLine {
    pub ok: bool,
    pub text: String,
}

/// Parse `doctor` stdout: `ok ...` / `FAIL ...` lines matter, the rest is noise.
pub fn parse_doctor(text: &str) -> Vec<DoctorLine> {
    text.lines()
        .filter_map(|l| {
            let t = l.trim();
            if t.starts_with("ok") {
                Some(DoctorLine { ok: true, text: t.to_string() })
            } else if t.starts_with("FAIL") {
                Some(DoctorLine { ok: false, text: t.to_string() })
            } else {
                None
            }
        })
        .collect()
}

/// One-line provider summary from an `ape_status` result object.
pub fn provider_summary(result: &serde_json::Value) -> String {
    let active = result.get("active_provider");
    let provider = active
        .and_then(|a| a.get("provider"))
        .and_then(|p| p.as_str())
        .unwrap_or("none");
    let source = active
        .and_then(|a| a.get("source"))
        .and_then(|s| s.as_str())
        .unwrap_or("unconfigured");
    if provider == "none" {
        return "no model provider detected — set APE_ANTHROPIC_API_KEY or APE_OPENAI_API_KEY".to_string();
    }
    format!("using {provider} ({source})")
}

/// `(name, description)` pairs from an `ape_agent_profiles` result object.
/// Missing descriptions default to ""; entries without names are skipped.
pub fn profile_list(result: &serde_json::Value) -> Vec<(String, String)> {
    result
        .get("profiles")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    Some((
                        p.get("name")?.as_str()?.to_string(),
                        p.get("description").and_then(|d| d.as_str()).unwrap_or("").to_string(),
                    ))
                })
                .collect()
        })
        .unwrap_or_default()
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Step {
    Doctor,
    Provider,
    Profile,
    Demo,
    Done,
}

/// Side effects the main loop must perform, in order.
#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    LoadDoctor,
    LoadStatus,
    LoadProfiles,
    SaveDefault(String),
    DemoStart,
    DemoPoll(String),
    DemoFinish { run_id: String },
    Complete,
}

#[derive(Debug, Clone, PartialEq)]
pub enum DemoState {
    Idle,
    Starting,
    Polling { run_id: String },
    Failed(String),
    Finished { summary: String },
}

pub struct Onboard {
    pub step: Step,
    pub doctor: Vec<DoctorLine>,
    pub doctor_loaded: bool,
    pub provider: Option<String>,
    pub profiles: Vec<(String, String)>,
    pub profiles_loaded: bool,
    pub selected: usize,
    pub demo: DemoState,
    pub demo_profile_path: Option<std::path::PathBuf>,
}

impl Onboard {
    pub fn new() -> Self {
        Self {
            step: Step::Doctor,
            doctor: Vec::new(),
            doctor_loaded: false,
            provider: None,
            profiles: Vec::new(),
            profiles_loaded: false,
            selected: 0,
            demo: DemoState::Idle,
            demo_profile_path: None,
        }
    }

    /// Effects required right now (called after entering a step).
    pub fn effects(&mut self) -> Vec<Effect> {
        match self.step {
            Step::Doctor if !self.doctor_loaded => vec![Effect::LoadDoctor],
            Step::Provider if self.provider.is_none() => vec![Effect::LoadStatus],
            Step::Profile if !self.profiles_loaded => vec![Effect::LoadProfiles],
            Step::Demo => match &self.demo {
                DemoState::Idle => vec![Effect::DemoStart],
                _ => vec![],
            },
            _ => vec![],
        }
    }

    pub fn apply_doctor(&mut self, text: &str) {
        self.doctor = parse_doctor(text);
        self.doctor_loaded = true;
    }

    pub fn apply_status(&mut self, result: &serde_json::Value) {
        self.provider = Some(provider_summary(result));
    }

    pub fn apply_profiles(&mut self, profiles: Vec<(String, String)>) {
        self.profiles = profiles;
        self.profiles_loaded = true;
        self.selected = 0;
    }

    pub fn apply_demo_started(&mut self, run_id: String, profile_path: std::path::PathBuf) {
        self.demo = DemoState::Polling { run_id };
        self.demo_profile_path = Some(profile_path);
    }

    pub fn apply_demo_start_failed(&mut self, err: String) {
        self.demo = DemoState::Failed(err);
    }

    /// Returns true when the demo reached a terminal state this call.
    pub fn apply_demo_poll(&mut self, status: &str, summary: &str) -> bool {
        if status != "running" {
            self.demo = DemoState::Finished { summary: summary.to_string() };
            return true;
        }
        false
    }

    pub fn apply_demo_finished(&mut self) {
        if let Some(p) = self.demo_profile_path.take() {
            std::fs::remove_file(p).ok();
        }
    }

    /// Key handling. Returns (effects, finished-entire-flow).
    pub fn on_key(&mut self, c: char) -> (Vec<Effect>, bool) {
        match self.step {
            Step::Doctor => match c {
                '\r' => {
                    self.step = Step::Provider;
                    (self.effects(), false)
                }
                _ => (vec![], false),
            },
            Step::Provider => match c {
                '\r' => {
                    self.step = Step::Profile;
                    (self.effects(), false)
                }
                _ => (vec![], false),
            },
            Step::Profile => match c {
                'k' if self.selected > 0 => {
                    self.selected -= 1;
                    (vec![], false)
                }
                'j' if self.selected + 1 < self.profiles.len() => {
                    self.selected += 1;
                    (vec![], false)
                }
                '\r' => {
                    if let Some((name, _)) = self.profiles.get(self.selected).cloned() {
                        self.step = Step::Demo;
                        let mut fx = vec![Effect::SaveDefault(name)];
                        fx.extend(self.effects());
                        (fx, false)
                    } else {
                        (vec![], false)
                    }
                }
                _ => (vec![], false),
            },
            Step::Demo => match (&self.demo, c) {
                (DemoState::Finished { .. }, '\r') => {
                    self.step = Step::Done;
                    (vec![Effect::Complete], true)
                }
                _ => (vec![], false),
            },
            Step::Done => (vec![], true),
        }
    }
}

impl Default for Onboard {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn doctor_parses_ok_and_fail() {
        let lines = parse_doctor("ok    node>=22.5\nFAIL  vendors/adam\negess hosts:\n     x\n");
        assert_eq!(lines.len(), 2);
        assert!(lines[0].ok);
        assert!(!lines[1].ok);
    }

    #[test]
    fn provider_summary_shapes() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{"active_provider":{"provider":"opencode","source":"opencode session"}}"#,
        )
        .unwrap();
        assert_eq!(provider_summary(&v), "using opencode (opencode session)");
        let empty: serde_json::Value = serde_json::from_str("{}").unwrap();
        assert!(provider_summary(&empty).contains("no model provider"));
    }

    #[test]
    fn profile_list_extracts_pairs() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{"profiles":[{"name":"a","description":"A"},{"name":"b"}]}"#,
        )
        .unwrap();
        // Missing description defaults to ""; missing name is skipped.
        assert_eq!(
            profile_list(&v),
            vec![("a".to_string(), "A".to_string()), ("b".to_string(), "".to_string())]
        );
    }

    #[test]
    fn flow_requests_effects_in_order() {
        let mut o = Onboard::new();
        assert_eq!(o.effects(), vec![Effect::LoadDoctor]);
        o.apply_doctor("ok    x\n");
        assert_eq!(o.effects(), vec![]);
        let (fx, done) = o.on_key('\r');
        assert!(!done);
        assert_eq!(o.step, Step::Provider);
        assert_eq!(fx, vec![Effect::LoadStatus]);
    }

    #[test]
    fn profile_enter_saves_default_and_starts_demo() {
        let mut o = Onboard::new();
        o.step = Step::Profile;
        o.profiles = vec![("repo-triage".to_string(), "triage".to_string())];
        o.profiles_loaded = true;
        let (fx, done) = o.on_key('\r');
        assert!(!done);
        assert_eq!(o.step, Step::Demo);
        assert!(fx.contains(&Effect::SaveDefault("repo-triage".to_string())));
        assert!(fx.contains(&Effect::DemoStart));
    }

    #[test]
    fn demo_poll_marks_terminal() {
        let mut o = Onboard::new();
        o.demo = DemoState::Polling { run_id: "r".to_string() };
        assert!(!o.apply_demo_poll("running", ""));
        assert!(o.apply_demo_poll("done", "ok"));
        assert!(matches!(o.demo, DemoState::Finished { .. }));
    }

    #[test]
    fn demo_finish_requires_finished_state() {
        let mut o = Onboard::new();
        o.step = Step::Demo;
        o.demo = DemoState::Finished { summary: "s".to_string() };
        let (fx, done) = o.on_key('\r');
        assert!(done);
        assert_eq!(fx, vec![Effect::Complete]);
        // Polling demo does not finish on Enter.
        let mut o2 = Onboard::new();
        o2.step = Step::Demo;
        o2.demo = DemoState::Polling { run_id: "r".to_string() };
        let (_, done2) = o2.on_key('\r');
        assert!(!done2);
    }
}
