//! Provider picker shared by onboarding and the menu: one state machine,
//! no duplicated logic. Lists detected providers (name + source + default
//! model), lets the user pick one, edit the model, and run a one-call
//! connection test — all through effects the main loop executes.
use super::input::{Key, LineEditor};

/// One detected provider row. No key material, ever.
#[derive(Debug, Clone, PartialEq)]
pub struct ProviderPick {
    pub name: String,
    pub source: String,
    pub default_model: String,
    pub saved: bool,
}

#[derive(Debug, Clone, PartialEq, Default)]
pub enum TestState {
    #[default]
    Idle,
    Running,
    Ok { latency_ms: i64, cost: f64 },
    Failed { error: String },
}

#[derive(Debug, Clone, PartialEq)]
pub enum ProviderEffect {
    LoadProviders,
    Save { provider: String, model: String },
    Test { provider: String, model: String },
}

#[derive(Debug, Clone, PartialEq, Default)]
pub struct ProviderForm {
    pub providers: Vec<ProviderPick>,
    pub loaded: bool,
    pub selected: usize,
    pub editor: LineEditor,
    edited: bool,
    last_default: String,
    pub test: TestState,
    /// Set when Enter requested advance but a fresh test is still needed.
    /// Cleared by any navigation/edit or when the test result lands.
    pub pending_continue: bool,
    last_tested: Option<(String, String)>,
}

impl ProviderForm {
    pub fn new() -> Self {
        Self {
            providers: vec![],
            loaded: false,
            selected: 0,
            editor: LineEditor::new(),
            edited: false,
            last_default: String::new(),
            test: TestState::Idle,
            pending_continue: false,
            last_tested: None,
        }
    }

    /// Parse an `ape_status` result into rows. Preselects the saved provider
    /// (from the TUI config) or the active one, else the first row.
    pub fn apply_providers(&mut self, status: &serde_json::Value, saved: Option<(String, String)>) {
        let mut rows = vec![];
        if let Some(arr) = status.get("provider_sources").and_then(|v| v.as_array()) {
            for p in arr {
                let name = p.get("provider").and_then(|x| x.as_str()).unwrap_or("").to_string();
                if name.is_empty() {
                    continue;
                }
                rows.push(ProviderPick {
                    source: p.get("source").and_then(|x| x.as_str()).unwrap_or("?").to_string(),
                    default_model: p.get("default_model").and_then(|x| x.as_str()).unwrap_or("").to_string(),
                    saved: saved.as_ref().map(|(sp, _)| sp == &name).unwrap_or(false),
                    name,
                });
            }
        }
        self.providers = rows;
        self.loaded = true;
        self.test = TestState::Idle;
        // Preselect: saved > active > first.
        let active = status
            .get("active_provider")
            .and_then(|a| a.get("provider"))
            .and_then(|p| p.as_str())
            .unwrap_or("");
        self.selected = saved
            .as_ref()
            .and_then(|(sp, _)| self.providers.iter().position(|r| &r.name == sp))
            .or_else(|| {
                if active.is_empty() || active == "none" {
                    None
                } else {
                    self.providers.iter().position(|r| r.name == active)
                }
            })
            .unwrap_or(0);
        self.refill_model(saved);
    }

    /// Fill the model editor from the selected row's default, unless the
    /// user already typed something different.
    fn refill_model(&mut self, saved: Option<(String, String)>) {
        let (def, saved_model) = match self.providers.get(self.selected) {
            Some(r) => (
                r.default_model.clone(),
                saved.and_then(|(sp, sm)| if sp == r.name { Some(sm) } else { None }),
            ),
            None => (String::new(), None),
        };
        // Prefer an explicitly saved model for this provider.
        let want = saved_model.unwrap_or(def);
        if !self.edited || self.editor.text() == self.last_default {
            self.editor.replace(&want);
            self.edited = false;
        }
        self.last_default = want;
    }

    pub fn current(&self) -> Option<(String, String)> {
        self.providers.get(self.selected).map(|r| {
            let model = self.editor.text();
            let model = if model.trim().is_empty() { r.default_model.clone() } else { model };
            (r.name.clone(), model)
        })
    }

    /// True when the last passing test covers exactly the current
    /// provider+model (changing either invalidates it).
    pub fn tested_current(&self) -> bool {
        match (&self.last_tested, self.current()) {
            (Some(tested), Some(cur)) => tested == &cur,
            _ => false,
        }
    }

    /// Consume a pending test-and-continue: Some(pin) exactly when a test
    /// was requested via Enter and the passing result covers the current
    /// selection. The caller saves the pin and advances.
    pub fn take_pending_advance(&mut self) -> Option<(String, String)> {
        // Consume only on success: a failed take must not eat the pending
        // flag, or the later passing result finds nothing to advance.
        if self.pending_continue && self.tested_current() {
            self.pending_continue = false;
            self.current()
        } else {
            None
        }
    }

    pub fn apply_test(&mut self, result: &serde_json::Value) {
        if result.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
            if let Some(cur) = self.current() {
                self.last_tested = Some(cur);
            }
            self.test = TestState::Ok {
                latency_ms: result.get("latency_ms").and_then(|v| v.as_i64()).unwrap_or(0),
                cost: result.get("cost_usd").and_then(|v| v.as_f64()).unwrap_or(0.0),
            };
        } else {
            // Prefer the verbatim upstream text; fall back to the code.
            let err = result
                .get("message")
                .and_then(|v| v.as_str())
                .or_else(|| result.get("error").and_then(|v| v.as_str()))
                .unwrap_or("unknown failure")
                .to_string();
            self.test = TestState::Failed { error: err.chars().take(200).collect() };
        }
    }

    /// Key handling. Returns (effects, done-selecting). Enter saves;
    /// the caller advances (onboard) or leaves (menu).
    pub fn on_key(&mut self, key: Key, saved: Option<(String, String)>) -> (Vec<ProviderEffect>, bool) {
        match key {
            Key::Down | Key::Char('j') => {
                if !self.providers.is_empty() {
                    self.selected = (self.selected + 1).min(self.providers.len() - 1);
                    self.refill_model(saved);
                }
                self.pending_continue = false;
                (vec![], false)
            }
            Key::Up | Key::Char('k') => {
                self.selected = self.selected.saturating_sub(1);
                self.refill_model(saved);
                self.pending_continue = false;
                (vec![], false)
            }
            Key::F5 => match self.current() {
                Some((provider, model)) => {
                    self.pending_continue = false;
                    (vec![ProviderEffect::Test { provider, model }], false)
                }
                None => (vec![], false),
            },
            Key::Enter => match self.current() {
                Some((provider, model)) => {
                    if provider == "mock" {
                        // Mock needs no test: save and continue directly.
                        (vec![ProviderEffect::Save { provider, model }], true)
                    } else if self.tested_current() {
                        (vec![ProviderEffect::Save { provider, model }], true)
                    } else {
                        // Gate: test first, advance when it passes.
                        self.pending_continue = true;
                        (vec![ProviderEffect::Test { provider, model }], false)
                    }
                }
                None => (vec![], false),
            },
            Key::Backspace => {
                self.editor.backspace();
                self.edited = true;
                (vec![], false)
            }
            Key::Left => {
                self.editor.move_left();
                (vec![], false)
            }
            Key::Right => {
                self.editor.move_right();
                (vec![], false)
            }
            Key::Char(c) if !c.is_control() => {
                self.editor.insert(c);
                self.edited = true;
                (vec![], false)
            }
            _ => (vec![], false),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn status() -> serde_json::Value {
        serde_json::from_str(
            r#"{"active_provider":{"provider":"opencode","source":"opencode session"},"provider_sources":[{"provider":"opencode","source":"opencode session","default_model":"muse-spark"},{"provider":"mock","source":"builtin","default_model":"mock-model"}]}"#,
        )
        .unwrap()
    }

    #[test]
    fn preselects_saved_then_active() {
        let mut f = ProviderForm::new();
        f.apply_providers(&status(), Some(("mock".into(), "mock-model".into())));
        assert_eq!(f.selected, 1, "saved wins");
        assert!(f.providers[1].saved);
        let mut f2 = ProviderForm::new();
        f2.apply_providers(&status(), None);
        assert_eq!(f2.selected, 0, "active otherwise");
        assert_eq!(f2.editor.text(), "muse-spark", "default prefilled");
    }

    #[test]
    fn typing_survives_selection_moves() {
        let mut f = ProviderForm::new();
        f.apply_providers(&status(), None);
        // Prefill appends: typing extends the default, then moving keeps it.
        for c in "custom-x".chars() {
            f.on_key(Key::Char(c), None);
        }
        assert_eq!(f.editor.text(), "muse-sparkcustom-x");
        f.on_key(Key::Down, None);
        assert_eq!(f.editor.text(), "muse-sparkcustom-x", "typed model kept");
        // Untouched editor refills on move.
        let mut g = ProviderForm::new();
        g.apply_providers(&status(), None);
        g.on_key(Key::Down, None);
        assert_eq!(g.editor.text(), "mock-model");
    }

    #[test]
    fn enter_gates_on_a_passing_test() {
        let mut f = ProviderForm::new();
        f.apply_providers(&status(), None); // opencode selected, untested
        let (fx, done) = f.on_key(Key::Enter, None);
        assert!(!done, "no advance before a passing test");
        assert!(matches!(fx[0], ProviderEffect::Test { .. }));
        f.apply_test(&serde_json::from_str(r#"{"ok":false,"error":"nope"}"#).unwrap());
        assert_eq!(f.take_pending_advance(), None, "failed test advances nothing");
        f.apply_test(&serde_json::from_str(r#"{"ok":true}"#).unwrap());
        assert_eq!(
            f.take_pending_advance(),
            Some(("opencode".to_string(), "muse-spark".to_string()))
        );
        assert_eq!(f.take_pending_advance(), None, "single-shot");
        // Mock skips the gate entirely.
        let mut g = ProviderForm::new();
        g.apply_providers(&status(), None);
        g.on_key(Key::Down, None);
        let (fx, done) = g.on_key(Key::Enter, None);
        assert!(done);
        assert!(matches!(fx[0], ProviderEffect::Save { .. }));
    }

    #[test]
    fn enter_saves_after_test_or_immediately_for_mock() {
        // Real provider: Enter tests; a second Enter after Ok saves.
        let mut f = ProviderForm::new();
        f.apply_providers(&status(), None);
        let (fx, done) = f.on_key(Key::Enter, None);
        assert!(!done);
        assert!(matches!(fx[0], ProviderEffect::Test { .. }));
        f.apply_test(&serde_json::from_str(r#"{"ok":true}"#).unwrap());
        let (fx, done) = f.on_key(Key::Enter, None);
        assert!(done, "tested pair saves on Enter");
        assert!(matches!(fx[0], ProviderEffect::Save { .. }));
        // F5 tests explicitly without advancing.
        let (fx, done) = f.on_key(Key::F5, None);
        assert!(!done);
        assert!(matches!(fx[0], ProviderEffect::Test { .. }));
    }

    #[test]
    fn test_results_shape() {
        let mut f = ProviderForm::new();
        f.apply_test(&serde_json::from_str(r#"{"ok":true,"latency_ms":321,"cost_usd":0.001}"#).unwrap());
        assert!(matches!(f.test, TestState::Ok { .. }));
        f.apply_test(&serde_json::from_str(r#"{"ok":false,"error":"provider_unavailable"}"#).unwrap());
        assert!(matches!(f.test, TestState::Failed { .. }));
    }
}
