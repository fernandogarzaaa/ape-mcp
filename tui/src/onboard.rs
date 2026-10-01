//! Onboarding flow: Doctor → Provider → Profile → Connectors → FirstRun → Done.
//! Pure state machine plus an [`Effect`] list the main loop executes
//! (subprocess calls stay out of here so every transition is unit-testable).
//!
//! ```text
//! Doctor --enter--> Provider --enter--> Profile --enter--> Connectors --any--> FirstRun --done--> Done
//!   ^ (Esc)            ^ (Esc)            ^ (Esc)              ^ (Esc)             ^ (Esc detaches)
//!   └─ welcome      └─ Doctor          └─ Provider         └─ Profile          └─ menu (run continues)
//! ```
//! Esc always goes back somewhere safe; no step is a trap. The Provider
//! step gates real providers on a passing connection test; mock-only is an
//! explicit, labeled choice.
use super::input::Key;

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

/// Budget limits per profile from the SAME `ape_agent_profiles` result
/// object — one round-trip feeds both the picker and the run budget meter.
/// Profiles without a limits block (or without a name) are skipped; the run
/// view then shows spent only.
pub fn profile_limits(
    result: &serde_json::Value,
) -> std::collections::HashMap<String, super::menu::ProfileLimits> {
    use super::menu::ProfileLimits;
    result
        .get("profiles")
        .and_then(|p| p.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let name = p.get("name")?.as_str()?.to_string();
                    let lim = p.get("limits")?;
                    Some((
                        name,
                        ProfileLimits {
                            max_steps: lim.get("max_steps").and_then(|v| v.as_i64()),
                            max_usd: lim.get("max_usd").and_then(|v| v.as_f64()),
                            max_tokens: lim.get("max_tokens").and_then(|v| v.as_i64()),
                        },
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
    Connectors,
    FirstRun,
    Done,
}

/// Side effects the main loop must perform, in order.
#[derive(Debug, Clone, PartialEq)]
pub enum Effect {
    LoadDoctor,
    LoadProviders,
    LoadProfiles,
    LoadConnectors,
    SaveDefault(String),
    SaveProvider { provider: String, model: String },
    TestProvider { provider: String, model: String },
    StartFirstRun { profile: String, objective: String, mock: bool },
    Complete,
}

/// First-run state: an objective editor plus the live poll view once the
/// run starts. Mock-only runs use the throwaway ape-demo profile and say so.
pub struct FirstRun {
    pub editor: super::input::LineEditor,
    pub run_id: Option<String>,
    pub polls: Vec<String>,
    pub mock: bool,
    pub error: Option<String>,
    pub finished: bool,
}

impl FirstRun {
    pub fn new(objective: String) -> Self {
        let mut editor = super::input::LineEditor::new();
        editor.replace(&objective);
        Self { editor, run_id: None, polls: vec![], mock: false, error: None, finished: false }
    }
}

pub struct Onboard {
    pub step: Step,
    pub doctor: Vec<DoctorLine>,
    pub doctor_loaded: bool,
    pub provider: Option<String>,
    pub form: super::provider::ProviderForm,
    pub profiles: Vec<(String, String)>,
    pub profile_limits: std::collections::HashMap<String, super::menu::ProfileLimits>,
    pub profiles_loaded: bool,
    pub selected: usize,
    pub chosen_profile: Option<String>,
    pub connectors: Vec<String>,
    pub connectors_loaded: bool,
    pub firstrun: FirstRun,
    pub firstrun_started: bool,
}

impl Onboard {
    pub fn new() -> Self {
        Self {
            step: Step::Doctor,
            doctor: Vec::new(),
            doctor_loaded: false,
            provider: None,
            form: super::provider::ProviderForm::new(),
            profiles: Vec::new(),
            profile_limits: Default::default(),
            profiles_loaded: false,
            selected: 0,
            chosen_profile: None,
            connectors: vec![],
            connectors_loaded: false,
            firstrun: FirstRun::new(String::new()),
            firstrun_started: false,
        }
    }

    /// Effects required right now (called after entering a step).
    pub fn effects(&mut self) -> Vec<Effect> {
        match self.step {
            Step::Doctor if !self.doctor_loaded => vec![Effect::LoadDoctor],
            Step::Provider if !self.form.loaded => vec![Effect::LoadProviders],
            Step::Profile if !self.profiles_loaded => vec![Effect::LoadProfiles],
            Step::Connectors if !self.connectors_loaded => vec![Effect::LoadConnectors],
            _ => vec![],
        }
    }

    pub fn apply_doctor(&mut self, text: &str) {
        self.doctor = parse_doctor(text);
        self.doctor_loaded = true;
    }

    pub fn apply_providers(&mut self, status: &serde_json::Value) {
        self.form.apply_providers(status, crate::ape::load_provider_model());
        self.provider = Some(provider_summary(status));
    }

    pub fn apply_test(&mut self, result: &serde_json::Value) {
        self.form.apply_test(result);
    }

    pub fn apply_profiles(
        &mut self,
        profiles: Vec<(String, String)>,
        limits: std::collections::HashMap<String, super::menu::ProfileLimits>,
    ) {
        self.profiles = profiles;
        self.profile_limits = limits;
        self.profiles_loaded = true;
        self.selected = 0;
    }

    pub fn apply_connectors(&mut self, names: Vec<String>) {
        self.connectors = names;
        self.connectors_loaded = true;
    }

    /// Feed one `ape_agent_status` poll for the first run. Returns true on
    /// reaching a terminal state (the step then waits for Enter to Done).
    pub fn apply_first_poll(&mut self, status: &serde_json::Value) -> bool {
        let state = status.get("status").and_then(|s| s.as_str()).unwrap_or("running");
        let line = super::menu::status_text(status);
        self.firstrun.polls.push(line.clone());
        if self.firstrun.polls.len() > 12 {
            self.firstrun.polls.drain(..self.firstrun.polls.len() - 12);
        }
        if state != "running" {
            self.firstrun.finished = true;
            return true;
        }
        false
    }

    /// Remove the throwaway ape-demo profile. Safe once the run started
    /// (the worker already loaded it); keeps one file per abandoned watch
    /// from leaking into the user profiles dir.
    pub fn cleanup_demo_profile(&self) {
        let p = crate::ape::data_dir().join("profiles").join("ape-demo.yaml");
        std::fs::remove_file(p).ok();
    }

    /// Consume a pending test-and-continue after a passing test: the pin to
    /// save, if the gate is satisfied. Single-shot.
    pub fn take_pending_advance(&mut self) -> Option<(String, String)> {
        if self.step == Step::Provider {
            self.form.take_pending_advance()
        } else {
            None
        }
    }

    /// Key handling. Returns (effects, flow).
    /// Arrows are primary; `j`/`k` are secondary aliases on the profile pick.
    pub fn on_key(&mut self, key: Key) -> (Vec<Effect>, Flow) {
        match self.step {
            Step::Doctor => match key {
                Key::Enter => {
                    self.step = Step::Provider;
                    (self.effects(), Flow::Stay)
                }
                Key::Esc => (vec![], Flow::ToWelcome),
                _ => (vec![], Flow::Stay),
            },
            Step::Provider => {
                if key == Key::Esc {
                    self.step = Step::Doctor;
                    return (vec![], Flow::Stay);
                }
                let saved = crate::ape::load_provider_model();
                let (fx, done) = self.form.on_key(key, saved);
                let mut out = fx
                    .into_iter()
                    .map(|e| match e {
                        super::provider::ProviderEffect::LoadProviders => Effect::LoadProviders,
                        super::provider::ProviderEffect::Save { provider, model } => {
                            Effect::SaveProvider { provider, model }
                        }
                        super::provider::ProviderEffect::Test { provider, model } => {
                            Effect::TestProvider { provider, model }
                        }
                    })
                    .collect::<Vec<_>>();
                if done {
                    self.step = Step::Profile;
                    out.extend(self.effects());
                }
                (out, Flow::Stay)
            }
            Step::Profile => match key {
                Key::Up | Key::Char('k') if self.selected > 0 => {
                    self.selected -= 1;
                    (vec![], Flow::Stay)
                }
                Key::Down | Key::Char('j') if self.selected + 1 < self.profiles.len() => {
                    self.selected += 1;
                    (vec![], Flow::Stay)
                }
                Key::Enter => {
                    if let Some((name, _)) = self.profiles.get(self.selected).cloned() {
                        self.chosen_profile = Some(name.clone());
                        self.step = Step::Connectors;
                        let mut fx = vec![Effect::SaveDefault(name)];
                        fx.extend(self.effects());
                        (fx, Flow::Stay)
                    } else {
                        (vec![], Flow::Stay)
                    }
                }
                Key::Esc => {
                    self.step = Step::Provider;
                    (vec![], Flow::Stay)
                }
                _ => (vec![], Flow::Stay),
            },
            Step::Connectors => match key {
                // Informational by design ("skip for now" is fine): any key
                // continues, Esc goes back. M8 starters land on this step.
                Key::Esc => {
                    self.step = Step::Profile;
                    (vec![], Flow::Stay)
                }
                _ => {
                    self.step = Step::FirstRun;
                    self.start_firstrun();
                    // Mock-only choices reuse the throwaway mock profile and
                    // say so on screen; real pins run the chosen profile.
                    let mock = self.saved_is_mock();
                    self.firstrun.mock = mock;
                    let fx = if mock {
                        vec![Effect::StartFirstRun {
                            profile: "ape-demo".to_string(),
                            objective: self.firstrun.editor.text(),
                            mock: true,
                        }]
                    } else if let Some(name) = self.chosen_profile.clone() {
                        vec![Effect::StartFirstRun {
                            profile: name,
                            objective: self.firstrun.editor.text(),
                            mock: false,
                        }]
                    } else {
                        vec![]
                    };
                    (fx, Flow::Stay)
                }
            },
            Step::FirstRun => {
                if self.firstrun.run_id.is_none() {
                    // Pre-start: editing keys + Enter starts, Esc goes back.
                    match key {
                        Key::Enter => {
                            if self.firstrun.editor.is_empty() {
                                return (vec![], Flow::Stay);
                            }
                            let mock = self.saved_is_mock();
                            self.firstrun.mock = mock;
                            let profile = if mock {
                                "ape-demo".to_string()
                            } else {
                                match self.chosen_profile.clone() {
                                    Some(n) => n,
                                    None => return (vec![], Flow::Stay),
                                }
                            };
                            let fx = vec![Effect::StartFirstRun {
                                profile,
                                objective: self.firstrun.editor.text(),
                                mock,
                            }];
                            (fx, Flow::Stay)
                        }
                        Key::Esc => {
                            self.step = Step::Connectors;
                            (vec![], Flow::Stay)
                        }
                        Key::Backspace => {
                            self.firstrun.editor.backspace();
                            (vec![], Flow::Stay)
                        }
                        Key::AltEnter => {
                            self.firstrun.editor.insert('\n');
                            (vec![], Flow::Stay)
                        }
                        Key::Left => {
                            self.firstrun.editor.move_left();
                            (vec![], Flow::Stay)
                        }
                        Key::Right => {
                            self.firstrun.editor.move_right();
                            (vec![], Flow::Stay)
                        }
                        Key::Char(c) if !c.is_control() => {
                            self.firstrun.editor.insert(c);
                            (vec![], Flow::Stay)
                        }
                        _ => (vec![], Flow::Stay),
                    }
                } else if self.firstrun.finished {
                    // Terminal: Enter shows the Done summary.
                    self.step = Step::Done;
                    (vec![Effect::Complete], Flow::Stay)
                } else {
                    // Watching: Esc detaches to the menu (run continues).
                    if key == Key::Esc {
                        (vec![], Flow::ToMenu)
                    } else {
                        (vec![], Flow::Stay)
                    }
                }
            }
            Step::Done => match key {
                // Next steps: Enter opens the menu, r jumps to Runs, p to
                // the Provider screen. Anything else also lands on the menu.
                Key::Char('r') | Key::Char('R') => (vec![], Flow::DoneGoto(DoneGoto::Runs)),
                Key::Char('p') | Key::Char('P') => (vec![], Flow::DoneGoto(DoneGoto::Provider)),
                _ => (vec![], Flow::Done),
            },
        }
    }

    /// Whether the saved pin is mock-only (mock runs skip real setup).
    fn saved_is_mock(&self) -> bool {
        crate::ape::load_provider_model()
            .map(|(p, _)| p == "mock")
            .unwrap_or(false)
    }

    /// Prefill the first-run objective from the chosen profile.
    fn start_firstrun(&mut self) {
        let sample = match self.chosen_profile.as_deref() {
            Some("fact-checker") => "Verify one claim with a live source, verdict first.",
            Some("writer") => "Draft a three-paragraph brief from this objective.",
            Some("deep-researcher") => "Research one question, cite sources, end with a verdict.",
            _ => "Triage one small task end to end, then finish with a summary.",
        };
        self.firstrun = FirstRun::new(sample.to_string());
        self.firstrun_started = false;
    }
}

/// Where the flow goes after a keypress. `ToWelcome`/`ToMenu` unwind the
/// whole onboarding stack; the main loop owns that transition.
/// `DoneGoto` carries the Done screen's jump target into the menu.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DoneGoto {
    Main,
    Runs,
    Provider,
}

/// Where the flow goes after a keypress. `ToWelcome`/`ToMenu` unwind the
/// whole onboarding stack; the main loop owns that transition.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Flow {
    Stay,
    Done,
    DoneGoto(DoneGoto),
    ToWelcome,
    ToMenu,
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
    fn profile_limits_extract_per_profile() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{"profiles":[{"name":"a","limits":{"max_steps":10,"max_usd":0.5}},{"name":"b"}]}"#,
        )
        .unwrap();
        let lim = profile_limits(&v);
        assert_eq!(lim["a"].max_steps, Some(10));
        assert_eq!(lim["a"].max_usd, Some(0.5));
        assert!(lim.get("b").is_none(), "no limits block, no entry");
    }

    #[test]
    fn flow_requests_effects_in_order() {
        let mut o = Onboard::new();
        assert_eq!(o.effects(), vec![Effect::LoadDoctor]);
        o.apply_doctor("ok    x\n");
        assert_eq!(o.effects(), vec![]);
        let (fx, flow) = o.on_key(Key::Enter);
        assert_eq!(flow, Flow::Stay);
        assert_eq!(o.step, Step::Provider);
        assert_eq!(fx, vec![Effect::LoadProviders]);
    }

    #[test]
    fn provider_enter_saves_and_advances() {
        let mut o = Onboard::new();
        o.step = Step::Provider;
        o.apply_providers(
            &serde_json::from_str(r#"{"provider_sources":[{"provider":"mock","source":"builtin","default_model":"mock-model"}]}"#).unwrap(),
        );
        let (fx, flow) = o.on_key(Key::Enter);
        assert_eq!(flow, Flow::Stay);
        assert_eq!(o.step, Step::Profile);
        assert!(fx.iter().any(|e| matches!(e, Effect::SaveProvider { .. })), "saves pin, got {fx:?}");
        assert!(fx.iter().any(|e| matches!(e, Effect::LoadProfiles)), "then loads profiles");
    }

    #[test]
    fn esc_walks_back_to_welcome() {
        let mut o = Onboard::new();
        let (_, flow) = o.on_key(Key::Esc);
        assert_eq!(flow, Flow::ToWelcome);
        o.step = Step::Provider;
        let (_, flow) = o.on_key(Key::Esc);
        assert_eq!(flow, Flow::Stay);
        assert_eq!(o.step, Step::Doctor);
        o.step = Step::Profile;
        let (_, flow) = o.on_key(Key::Esc);
        assert_eq!(o.step, Step::Provider);
        assert_eq!(flow, Flow::Stay);
    }

    #[test]
    fn arrows_move_profile_selection() {
        let mut o = Onboard::new();
        o.step = Step::Profile;
        o.profiles = vec![("a".into(), "".into()), ("b".into(), "".into())];
        o.on_key(Key::Down);
        assert_eq!(o.selected, 1);
        o.on_key(Key::Down);
        assert_eq!(o.selected, 1, "clamps at the end");
        o.on_key(Key::Up);
        assert_eq!(o.selected, 0);
        o.on_key(Key::Char('j'));
        assert_eq!(o.selected, 1, "vim alias still works");
    }

    #[test]    #[test]
    fn esc_during_polling_exits_to_menu() {
        let mut o = Onboard::new();
        o.step = Step::FirstRun;
        o.firstrun.run_id = Some("r".to_string());
        let (_, flow) = o.on_key(Key::Esc);
        assert_eq!(flow, Flow::ToMenu);
        // ...but Enter while polling does nothing (no accidental finish).
        let mut o2 = Onboard::new();
        o2.step = Step::FirstRun;
        o2.firstrun.run_id = Some("r".to_string());
        let (_, flow2) = o2.on_key(Key::Enter);
        assert_eq!(flow2, Flow::Stay);
    }

    #[test]
    fn start_failed_returns_to_editing() {
        let mut o = Onboard::new();
        o.step = Step::FirstRun;
        o.firstrun.error = Some("boom".to_string());
        let (_, flow) = o.on_key(Key::Enter);
        assert_eq!(flow, Flow::Stay, "retries the start");
        let (_, flow) = o.on_key(Key::Esc);
        assert_eq!(flow, Flow::Stay);
        assert_eq!(o.step, Step::Connectors);
    }

    #[test]
    fn profile_enter_saves_default_and_goes_connectors() {
        let mut o = Onboard::new();
        o.step = Step::Profile;
        o.profiles = vec![("repo-triage".to_string(), "triage".to_string())];
        o.profiles_loaded = true;
        let (fx, flow) = o.on_key(Key::Enter);
        assert_eq!(flow, Flow::Stay);
        assert_eq!(o.step, Step::Connectors);
        assert!(fx.contains(&Effect::SaveDefault("repo-triage".to_string())));
        assert_eq!(o.chosen_profile.as_deref(), Some("repo-triage"));
    }

    #[test]
    fn first_poll_marks_terminal() {
        let mut o = Onboard::new();
        let v: serde_json::Value = serde_json::from_str(r#"{"status":"running","outcome":""}"#).unwrap();
        assert!(!o.apply_first_poll(&v));
        let v: serde_json::Value = serde_json::from_str(r#"{"status":"done","outcome":"ok"}"#).unwrap();
        assert!(o.apply_first_poll(&v));
        assert!(o.firstrun.finished);
        assert_eq!(o.firstrun.polls.len(), 2);
    }

    #[test]
    fn finished_first_run_goes_done_on_enter() {
        let mut o = Onboard::new();
        o.step = Step::FirstRun;
        o.firstrun.run_id = Some("r".to_string());
        o.firstrun.finished = true;
        let (fx, flow) = o.on_key(Key::Enter);
        assert_eq!(flow, Flow::Stay);
        assert_eq!(o.step, Step::Done);
        assert_eq!(fx, vec![Effect::Complete]);
        // Polling run does not finish on Enter.
        let mut o2 = Onboard::new();
        o2.step = Step::FirstRun;
        o2.firstrun.run_id = Some("r".to_string());
        let (_, flow2) = o2.on_key(Key::Enter);
        assert_eq!(flow2, Flow::Stay);
    }

    #[test]
    fn done_keys_route() {
        let mut o = Onboard::new();
        o.step = Step::Done;
        let (_, flow) = o.on_key(Key::Char('r'));
        assert_eq!(flow, Flow::DoneGoto(DoneGoto::Runs));
        let (_, flow) = o.on_key(Key::Char('p'));
        assert_eq!(flow, Flow::DoneGoto(DoneGoto::Provider));
        let (_, flow) = o.on_key(Key::Enter);
        assert_eq!(flow, Flow::Done);
    }

    #[test]
    fn provider_gate_blocks_until_tested() {
        let mut o = Onboard::new();
        o.step = Step::Provider;
        o.apply_providers(
            &serde_json::from_str(r#"{"provider_sources":[{"provider":"opencode","source":"s","default_model":"m"}]}"#).unwrap(),
        );
        // Enter without a test runs one instead of advancing.
        let (fx, flow) = o.on_key(Key::Enter);
        assert_eq!(flow, Flow::Stay);
        assert_eq!(o.step, Step::Provider);
        assert!(fx.iter().any(|e| matches!(e, Effect::TestProvider { .. })));
        // Failed test stays; passing test advances on take.
        o.apply_test(&serde_json::from_str(r#"{"ok":false,"error":"nope"}"#).unwrap());
        assert_eq!(o.take_pending_advance(), None);
        o.apply_test(&serde_json::from_str(r#"{"ok":true}"#).unwrap());
        let pin = o.take_pending_advance();
        assert_eq!(pin, Some(("opencode".to_string(), "m".to_string())));
    }
}
