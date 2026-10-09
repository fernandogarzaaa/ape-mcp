//! Main menu + run/check flows. Pure state machine; the main loop executes
//! [`MenuEffect`]s (subprocess calls) and feeds results back via `apply_*`.
use super::input::{Key, LineEditor};
use crate::ape;
use std::collections::HashMap;

pub const MENU_ITEMS: [&str; 12] = [
    "Run an agent",
    "Check a run",
    "Profiles",
    "Doctor",
    "Console info",
    "Status",
    "Runs",
    "Ledger",
    "Tasks",
    "Provider",
    "Setup again",
    "Quit",
];

#[derive(Debug, Clone, PartialEq)]
pub enum MenuView {
    Main { selected: usize },
    RunProfile { profiles: Vec<(String, String)>, selected: usize },
    RunObjective { profile: String, editor: LineEditor, slash_sel: usize },
    RunProgress { run_id: String, profile: String, blocks: Vec<StepBlock>, seen: usize, budget: Budget, last_status: String, selected: usize, expanded: bool },
    RunDone { run_id: String, summary: String },
    RunCancelled { run_id: String, summary: String },
    CheckId { editor: LineEditor },
    CheckShow { text: String, blocks: Vec<StepBlock> },
    ProfilesList { profiles: Vec<(String, String)>, offset: usize },
    DoctorShow { text: String },
    StatusShow { text: String },
    RunsList { runs: Vec<RunRow>, selected: usize, offset: usize, note: String },
    LedgerList { entries: Vec<LedgerEntry>, offset: usize, filter: LedgerFilter, note: String },
    TasksShow { text: String },
    ProviderForm(super::provider::ProviderForm),
    ConsoleInfo,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MenuEffect {
    LoadProfiles,
    LoadDoctor,
    LoadStatus,
    PrimeStatus,
    LoadRuns,
    LoadLedger,
    LoadTasks,
    Reonboard,
    Provider(super::provider::ProviderEffect),
    StartRun { profile: String, objective: String },
    FetchStatus(String),
    CancelRun { run_id: String },
}

/// One row of `ape_agent_list`: real columns only (ids, profile, state,
/// cost, steps, start time). Age is shown as the start timestamp — no
/// date library, no invented relative times.
#[derive(Debug, Clone, PartialEq)]
pub struct RunRow {
    pub run_id: String,
    pub profile: String,
    pub status: String,
    pub stop_reason: String,
    pub cost: f64,
    pub steps: i64,
    pub started: String,
}

impl RunRow {
    pub fn from_json(v: &serde_json::Value) -> Self {
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        Self {
            run_id: s("run_id"),
            profile: s("profile"),
            status: s("status"),
            stop_reason: s("stop_reason"),
            cost: v.get("total_cost").and_then(|x| x.as_f64()).unwrap_or(0.0),
            steps: v.get("step_count").and_then(|x| x.as_i64()).unwrap_or(0),
            started: s("started_at").replace('T', " ").chars().take(16).collect(),
        }
    }

    pub fn line(&self) -> String {
        let state = if self.stop_reason.is_empty() || self.status == "running" {
            self.status.clone()
        } else {
            format!("{}/{}", self.status, self.stop_reason)
        };
        format!(
            "{} · {} · {} · ${} · {} steps · {}",
            self.run_id.chars().take(16).collect::<String>(),
            self.profile,
            state,
            fmt_usd(self.cost),
            self.steps,
            self.started,
        )
    }
}

/// One `ape_ledger` entry: timestamp, kind, and a one-line human summary
/// built from real fields only (tool/verdict/suite/message, whichever the
/// entry carries — entries are heterogeneous by design).
#[derive(Debug, Clone, PartialEq)]
pub struct LedgerEntry {
    pub ts: String,
    pub kind: String,
    pub summary: String,
}

impl LedgerEntry {
    pub fn from_json(v: &serde_json::Value) -> Self {
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        let detail = ["tool", "verdict", "suite", "message", "ledger_entry", "spent_usd", "running"]
            .iter()
            .filter_map(|k| {
                let val = match v.get(*k) {
                    Some(serde_json::Value::String(x)) => x.clone(),
                    Some(other) => other.to_string(),
                    None => return None,
                };
                if val.is_empty() { None } else { Some(format!("{k}={val}")) }
            })
            .collect::<Vec<_>>()
            .join(" ");
        let summary = if detail.is_empty() {
            v.to_string().chars().take(100).collect()
        } else {
            detail.chars().take(120).collect()
        };
        Self { ts: s("ts").chars().take(19).collect(), kind: s("kind"), summary }
    }

    pub fn line(&self) -> String {
        format!("{} · {} · {}", self.ts, self.kind, self.summary)
    }
}

/// Ledger kind filter. Entries are heterogeneous and carry no run id or
/// status (audit stream, not run ledger) — filtering is by kind substring,
/// cycled with `f`. No run-id/status filter is offered because the data
/// does not have those fields; inventing one would lie.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum LedgerFilter {
    #[default]
    All,
    Destructive,
    Genesis,
}

impl LedgerFilter {
    fn next(self) -> Self {
        match self {
            LedgerFilter::All => LedgerFilter::Destructive,
            LedgerFilter::Destructive => LedgerFilter::Genesis,
            LedgerFilter::Genesis => LedgerFilter::All,
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            LedgerFilter::All => "all",
            LedgerFilter::Destructive => "destructive",
            LedgerFilter::Genesis => "genesis",
        }
    }

    pub fn matches(self, e: &LedgerEntry) -> bool {
        match self {
            LedgerFilter::All => true,
            LedgerFilter::Destructive => e.kind.contains("destructive"),
            LedgerFilter::Genesis => e.kind.contains("genesis"),
        }
    }
}

/// Slash commands: (name, menu index, blurb). Enter on a match calls the
/// SAME `goto_item` the menu uses — one implementation, two doors.
pub const SLASH_ITEMS: [(&str, usize, &str); 8] = [
    ("profile", 0, "pick a profile and run"),
    ("runs", 6, "recent runs, open one live"),
    ("ledger", 7, "governance audit stream"),
    ("tasks", 8, "skein task graph"),
    ("status", 5, "versions, provider, engines"),
    ("doctor", 3, "environment checks"),
    ("provider", 9, "choose provider and model"),
    ("setup", 10, "run setup again"),
];

/// API-key env var for a provider, if it takes one from the environment.
/// Session-based (opencode), keyless (mock, local), and unknown providers
/// return None — the UI then says what to do instead of showing commands.
pub fn key_env_for(provider: &str) -> Option<&'static str> {
    match provider {
        "anthropic" => Some("ANTHROPIC_API_KEY"),
        "openai" => Some("OPENAI_API_KEY"),
        "openrouter" => Some("OPENROUTER_API_KEY"),
        "groq" => Some("GROQ_API_KEY"),
        "nebius" => Some("APE_NEBIUS_API_KEY"),
        "google" => Some("GOOGLE_API_KEY"),
        _ => None,
    }
}

/// Menu index for the current slash text, if it matches anything.
pub fn slash_target(text: &str, sel: usize) -> Option<usize> {
    let q = text.strip_prefix('/')?.trim();
    let hits: Vec<usize> = SLASH_ITEMS
        .iter()
        .filter(|(name, _, _)| name.contains(q))
        .map(|(_, idx, _)| *idx)
        .collect();
    hits.get(sel.min(hits.len().saturating_sub(1))).copied()
}

/// Visible slash matches for the render layer (name, blurb).
pub fn slash_menu(text: &str) -> Vec<(&'static str, &'static str)> {
    let q = match text.strip_prefix('/') {
        Some(q) => q.trim(),
        None => return vec![],
    };
    SLASH_ITEMS
        .iter()
        .filter(|(name, _, _)| name.contains(q))
        .map(|(name, _, blurb)| (*name, *blurb))
        .collect()
}

/// Wrap text to a column width for list rows: word boundaries, hard-cut
/// words longer than the width, one String per visual line. Pure for tests.
pub fn wrap_text(text: &str, max: usize) -> Vec<String> {
    let max = max.max(1);
    let mut lines: Vec<String> = vec![String::new()];
    let mut push_word = |word: &str, lines: &mut Vec<String>| {
        if word.is_empty() {
            return;
        }
        // Hard-cut tokens longer than the width.
        let mut rest = word;
        while rest.chars().count() > max {
            let cut: String = rest.chars().take(max).collect();
            let cut_len = cut.len();
            let cur_is_empty = lines.last().map(|l| l.is_empty()).unwrap_or(true);
            if cur_is_empty {
                // Invariant: lines starts non-empty and is only pushed to below.
                *lines.last_mut().expect("wrap lines non-empty") = cut;
            } else {
                lines.push(cut);
            }
            lines.push(String::new());
            rest = &rest[cut_len..];
        }
        // Byte slicing on a char boundary: cut is a char prefix, so the
        // remainder starts on a boundary. (cut.len() counts bytes of whole
        // chars only.)
        let cur_is_empty = lines.last().map(|l| l.is_empty()).unwrap_or(true);
        if cur_is_empty {
            // Same invariant: only push()s happen in this function.
            *lines.last_mut().expect("wrap lines non-empty") = rest.to_string();
        } else {
            let cur_len: usize = lines.last().expect("wrap lines non-empty").chars().count();
            if cur_len + 1 + rest.chars().count() > max {
                lines.push(rest.to_string());
            } else {
                lines.last_mut().expect("wrap lines non-empty").push(' ');
                lines.last_mut().expect("wrap lines non-empty").push_str(rest);
            }
        }
    };
    for word in text.split(' ') {
        let w = word.to_string();
        push_word(&w, &mut lines);
    }
    lines.into_iter().filter(|l| !l.is_empty()).collect()
}

/// Profile rows: name line plus wrapped description lines (cap 4, honest
/// marker). Selection highlights every line of the item.
pub fn profile_lines(name: &str, desc: &str, max: usize, selected: bool) -> Vec<(String, bool)> {
    let mut out = vec![(format!("  {name}"), selected)];
    let wrapped = wrap_text(desc, max.saturating_sub(4).max(10));
    for (i, l) in wrapped.iter().enumerate() {
        if i >= 4 {
            out.push(("    …".to_string(), selected));
            break;
        }
        out.push((format!("    {l}"), selected));
    }
    out
}

/// Minimum menu column budget for the art threshold: widest item plus
/// indent plus block borders. Computed from the items, never hard-coded.
pub fn menu_min_width() -> usize {
    MENU_ITEMS.iter().map(|s| s.chars().count()).max().unwrap_or(0) + 2 + 2
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
    /// A loop policy denial (`destructive:<marker>…`). The row now carries
    /// the human reason after the marker (`…: <reason>`), so [DENIED] blocks
    /// show it from real data. Rows predating the reason (marker only) show
    /// the marker plus where the reason is not.
    pub denied: bool,
    pub denied_reason: String,
}

impl StepBlock {
    fn from_json(v: &serde_json::Value) -> Self {
        let s = |k: &str| v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string();
        let n = |k: &str| v.get(k).and_then(|x| x.as_i64()).unwrap_or(0);
        let summary = s("result_summary");
        let (denied, denied_reason) = match summary.strip_prefix("destructive:") {
            Some(rest) => match rest.find(": ") {
                Some(i) => (true, rest[i + 2..].to_string()),
                None => (true, String::new()),
            },
            None => (false, String::new()),
        };
        Self {
            step: n("step"),
            kind: s("kind"),
            tool: s("tool"),
            duration_ms: n("duration_ms"),
            tokens: n("tokens"),
            cost: v.get("cost").and_then(|x| x.as_f64()).unwrap_or(0.0),
            summary,
            denied,
            denied_reason,
        }
    }

    pub fn header(&self) -> String {
        let what = if self.tool.is_empty() { self.kind.clone() } else { self.tool.clone() };
        let what = if what.is_empty() { "?".to_string() } else { what };
        let what = if self.denied { format!("[DENIED] {what}") } else { what };
        format!(
            "step {} · {} · {}ms · {} tok · ${}",
            self.step, what, self.duration_ms, self.tokens, fmt_usd(self.cost),
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
    // Named tool-level errors (claim_required, connector_not_found, …) lead:
    // the head line must never pretend an error is a state.
    if let Some(err) = result.get("error").and_then(|e| e.as_str()) {
        let hint = result.get("hint").and_then(|h| h.as_str()).unwrap_or("");
        return if hint.is_empty() {
            format!("error: {err}")
        } else {
            format!("error: {err}\n{hint}")
        };
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
    // Outcomes are usually prose, but failures can be JSON blobs
    // (model_error payloads). Show the human message + stop reason, never
    // the raw blob; the raw text stays one expand away in the timeline.
    let outcome_raw = result
        .get("outcome")
        .and_then(|o| o.as_str())
        .unwrap_or("")
        .chars()
        .take(400)
        .collect::<String>();
    let outcome = humanize_outcome(&outcome_raw);
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

/// A JSON outcome object renders as its human fields (`error`, `message`,
/// `hint` — whichever exist), plus the stop reason lives in the head line.
/// Anything else passes through untouched.
fn humanize_outcome(outcome: &str) -> String {
    let t = outcome.trim();
    if !t.starts_with('{') {
        return outcome.to_string();
    }
    let v: serde_json::Value = match serde_json::from_str(t) {
        Ok(v) => v,
        Err(_) => return outcome.to_string(),
    };
    let obj = match v.as_object() {
        Some(o) => o,
        None => return outcome.to_string(),
    };
    let mut parts = vec![];
    for k in ["error", "message", "hint", "reason"] {
        if let Some(s) = obj.get(k).and_then(|x| x.as_str()) {
            if !s.is_empty() {
                parts.push(format!("{k}: {s}"));
            }
        }
    }
    if parts.is_empty() {
        return outcome.to_string();
    }
    parts.join("\n")
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
    model_cache: Option<String>,
    history: Vec<String>,
    hist_pos: Option<usize>,
    hist_draft: String,
    status_loaded: bool,
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
            model_cache: ape::load_provider_model().map(|(_, m)| m),
            history: Vec::new(),
            hist_pos: None,
            hist_draft: String::new(),
            status_loaded: false,
        }
    }

    /// One prime effect per menu lifetime: a single `ape_status` call on
    /// entry so the status line shows the provider without a Status visit.
    /// Quiet by design — it must never yank the user into the Status view.
    pub fn prime(&mut self) -> Vec<MenuEffect> {
        if self.status_loaded {
            return vec![];
        }
        self.status_loaded = true;
        vec![MenuEffect::PrimeStatus]
    }

    /// One-line chrome for the status line: provider when known (primed on
    /// menu entry, refreshed by Status visits), default profile from local
    /// state. Unknowns say "unknown" — never "…" and never blank.
    /// During a run it goes live: run id, profile, state, and spent cost.
    pub fn status_line(&self, version: &str) -> String {
        if let MenuView::RunProgress { run_id, profile, budget, last_status, .. } = &self.view {
            let short: String = run_id.chars().take(16).collect();
            return format!(
                "run {short} · {profile} · {last_status} · ${} · ape-mcp {version}",
                fmt_usd(budget.spent_usd),
            );
        }
        format!(
            "provider: {} · model: {} · profile: {} · ape-mcp {}",
            self.provider_cache.as_deref().unwrap_or("unknown"),
            self.model_cache.as_deref().unwrap_or("unknown"),
            self.default_profile.as_deref().unwrap_or("unknown"),
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

    /// Page window for scrollable lists: keep the selection visible.
    const PAGE: usize = 15;
    fn follow(selected: usize, offset: &mut usize) {
        if selected < *offset {
            *offset = selected;
        } else if selected >= *offset + Self::PAGE {
            *offset = selected + 1 - Self::PAGE;
        }
    }

    /// One implementation for menu selection AND slash jumps: index in,
    /// (view, effects, quit) out. Slash commands call this, never a copy.
    pub fn goto_item(&mut self, idx: usize) -> (Vec<MenuEffect>, bool) {
        match idx {
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
            6 => {
                self.view = MenuView::RunsList { runs: vec![], selected: 0, offset: 0, note: "loading runs…".to_string() };
                (vec![MenuEffect::LoadRuns], false)
            }
            7 => {
                self.view = MenuView::LedgerList { entries: vec![], offset: 0, filter: LedgerFilter::All, note: "loading ledger…".to_string() };
                (vec![MenuEffect::LoadLedger], false)
            }
                    8 => (vec![MenuEffect::LoadTasks], false),
                    9 => {
                        self.view = MenuView::ProviderForm(super::provider::ProviderForm::new());
                        (vec![MenuEffect::Provider(super::provider::ProviderEffect::LoadProviders)], false)
                    }
                    10 => (vec![MenuEffect::Reonboard], false),
                    _ => (vec![], true),
        }
    }

    /// History navigation over disjoint fields (no whole-self borrow while
    /// an editor from the view is held).
    fn history_step(
        history: &[String],
        pos: &mut Option<usize>,
        draft: &mut String,
        editor: &mut LineEditor,
        up: bool,
    ) {
        if history.is_empty() {
            return;
        }
        if up {
            match *pos {
                None => {
                    *draft = editor.text();
                    *pos = Some(history.len() - 1);
                }
                Some(i) => *pos = Some(i.saturating_sub(1)),
            }
        } else {
            match *pos {
                None => return,
                Some(i) if i + 1 >= history.len() => {
                    *pos = None;
                    let d = draft.clone();
                    editor.replace(&d);
                    return;
                }
                Some(i) => *pos = Some(i + 1),
            }
        }
        // pos is Some(i) with i < history.len(): the None arm returns above,
        // and i+1 either stays in range or resets to None. history itself is
        // non-empty (early return at function top), so indexing is safe.
        let text = history[pos.expect("history position set")].clone();
        editor.replace(&text);
    }

    fn history_push(&mut self, text: String) {
        if text.is_empty() {
            return;
        }
        if self.history.last().map(|l| l != &text).unwrap_or(true) {
            self.history.push(text);
            while self.history.len() > 50 {
                self.history.remove(0);
            }
        }
        self.hist_pos = None;
        self.hist_draft.clear();
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
                Key::Enter => {
                    let idx = *selected;
                    self.goto_item(idx)
                }
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
                        self.view = MenuView::RunObjective { profile: name, editor: LineEditor::new(), slash_sel: 0 };
                    }
                    (vec![], false)
                }
                Key::Esc => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
                _ => (vec![], false),
            },
            MenuView::RunObjective { profile, editor, slash_sel } => match key {
                Key::Enter => {
                    // Slash jump first: same goto_item the menu uses.
                    if editor.text().starts_with('/') {
                        if let Some(idx) = slash_target(&editor.text(), *slash_sel) {
                            return self.goto_item(idx);
                        }
                    }
                    if editor.is_empty() {
                        return (vec![], false);
                    }
                    // Own everything before the &mut history call below.
                    let profile = profile.clone();
                    let objective = editor.text();
                    self.history_push(objective.clone());
                    (vec![MenuEffect::StartRun { profile, objective }], false)
                }
                Key::AltEnter | Key::CtrlJ => {
                    editor.insert('\n');
                    (vec![], false)
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
                Key::Up => {
                    if editor.text().starts_with('/') {
                        let n = slash_menu(&editor.text()).len();
                        *slash_sel = (*slash_sel).saturating_sub(1).min(n.saturating_sub(1));
                    } else {
                        Self::history_step(&self.history, &mut self.hist_pos, &mut self.hist_draft, editor, true);
                    }
                    (vec![], false)
                }
                Key::Down => {
                    if editor.text().starts_with('/') {
                        let n = slash_menu(&editor.text()).len();
                        *slash_sel = (*slash_sel + 1).min(n.saturating_sub(1));
                    } else {
                        Self::history_step(&self.history, &mut self.hist_pos, &mut self.hist_draft, editor, false);
                    }
                    (vec![], false)
                }
                Key::Char(c) if !c.is_control() => {
                    editor.insert(c);
                    *slash_sel = 0;
                    (vec![], false)
                }
                Key::Esc => {
                    self.view = MenuView::RunProfile { profiles: self.profiles_cache.clone(), selected: 0 };
                    (vec![], false)
                }
                _ => (vec![], false),
            },
            MenuView::RunProgress { run_id, blocks, selected, expanded, .. } => {
                match key {
                    // Esc cancels the run server-side (ape_agent_cancel: the
                    // worker is killed, the row goes stopped/cancelled and stays
                    // pollable by id). Polling continues until the cancel lands.
                    Key::Esc => (vec![MenuEffect::CancelRun { run_id: run_id.clone() }], false),
                    // Step inspection: move across blocks, Enter expands the
                    // full result_summary (real fields only).
                    Key::Up | Key::Char('k') => {
                        *selected = selected.saturating_sub(1);
                        (vec![], false)
                    }
                    Key::Down | Key::Char('j') => {
                        *selected = (*selected + 1).min(blocks.len().saturating_sub(1));
                        (vec![], false)
                    }
                    Key::Enter => {
                        *expanded = !*expanded;
                        (vec![], false)
                    }
                    _ => (vec![], false),
                }
            }
            MenuView::RunDone { .. }
            | MenuView::RunCancelled { .. }
            | MenuView::CheckShow { .. }
            | MenuView::DoctorShow { .. }
            | MenuView::StatusShow { .. }
            | MenuView::TasksShow { .. }
            | MenuView::ConsoleInfo => {
                self.view = MenuView::Main { selected: 0 };
                (vec![], false)
            }
            MenuView::ProviderForm(form) => {
                if key == Key::Esc {
                    self.view = MenuView::Main { selected: 0 };
                    return (vec![], false);
                }
                let saved = ape::load_provider_model();
                let (fx, done) = form.on_key(key, saved);
                let fx = fx.into_iter().map(MenuEffect::Provider).collect::<Vec<_>>();
                if done {
                    self.model_cache = ape::load_provider_model().map(|(_, m)| m);
                    self.view = MenuView::Main { selected: 0 };
                }
                (fx, false)
            }
            MenuView::RunsList { runs, selected, offset, .. } => match key {
                Key::Down | Key::Char('j') => {
                    *selected = (*selected + 1).min(runs.len().saturating_sub(1));
                    Self::follow(*selected, offset);
                    (vec![], false)
                }
                Key::Up | Key::Char('k') => {
                    *selected = selected.saturating_sub(1);
                    Self::follow(*selected, offset);
                    (vec![], false)
                }
                Key::Enter => match runs.get(*selected) {
                    Some(row) => (vec![MenuEffect::FetchStatus(row.run_id.clone())], false),
                    None => (vec![], false),
                },
                Key::Esc => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
                _ => (vec![], false),
            },
            MenuView::LedgerList { offset, filter, .. } => match key {
                Key::Down | Key::Char('j') => {
                    *offset = offset.saturating_add(1);
                    (vec![], false)
                }
                Key::Up | Key::Char('k') => {
                    *offset = offset.saturating_sub(1);
                    (vec![], false)
                }
                Key::Char('f') | Key::Char('F') => {
                    *filter = filter.next();
                    *offset = 0;
                    (vec![], false)
                }
                Key::Esc => {
                    self.view = MenuView::Main { selected: 0 };
                    (vec![], false)
                }
                _ => (vec![], false),
            },
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
                    let id = editor.text();
                    self.history_push(id.clone());
                    (vec![MenuEffect::FetchStatus(id)], false)
                }
                Key::AltEnter | Key::CtrlJ => {
                    editor.insert('\n');
                    (vec![], false)
                }
                Key::Up => {
                    Self::history_step(&self.history, &mut self.hist_pos, &mut self.hist_draft, editor, true);
                    (vec![], false)
                }
                Key::Down => {
                    Self::history_step(&self.history, &mut self.hist_pos, &mut self.hist_draft, editor, false);
                    (vec![], false)
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
            selected: 0,
            expanded: false,
        };
    }

    /// Feed one `ape_agent_status` poll. Appends only steps never seen (by
    /// position in the ledger array) — the timeline grows, never clears.
    /// Spent comes from the run ROW: since live totals land per streamed
    /// step (runs.js recordStep), the row is correct mid-run — no separate
    /// aggregation needed (locked by tests/ledger-live.test.js).
    /// Returns true when the run reached a terminal state.
    pub fn apply_poll(&mut self, status: &serde_json::Value) -> bool {
        let state = status.get("status").and_then(|s| s.as_str()).unwrap_or("running").to_string();
        let terminal = state != "running";
        let status_id = status.get("run_id").and_then(|r| r.as_str()).unwrap_or("").to_string();
        match &mut self.view {
            MenuView::RunProgress { run_id: view_id, blocks, seen, budget, last_status, selected, expanded: _, .. } => {
                if let Some(steps) = status.get("steps").and_then(|s| s.as_array()) {
                    let prev = *seen;
                    for s in steps.iter().skip(*seen) {
                        blocks.push(StepBlock::from_json(s));
                    }
                    *seen = steps.len();
                    // Follow the live tail while the selection was at the
                    // end; once the user moves up, it stays where put.
                    if *selected + 1 >= prev.max(1) {
                        *selected = blocks.len().saturating_sub(1);
                    }
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
        // The done view carries the recent timeline too: a cancelled run
        // opened by id must show its interruption marker (Check 2).
        const TAIL: usize = 8;
        let blocks: Vec<StepBlock> = status
            .get("steps")
            .and_then(|s| s.as_array())
            .map(|a| {
                let n = a.len().saturating_sub(TAIL);
                a.iter().skip(n).map(StepBlock::from_json).collect()
            })
            .unwrap_or_default();
        self.view = MenuView::CheckShow { text: status_text(status), blocks };
    }

    pub fn apply_doctor(&mut self, text: String) {
        self.view = MenuView::DoctorShow { text };
    }

    pub fn apply_runs(&mut self, runs: Vec<RunRow>, note: String) {
        match &mut self.view {
            MenuView::RunsList { runs: r, selected, offset, note: n } => {
                *r = runs;
                *n = note;
                let max = r.len().saturating_sub(1);
                if *selected > max {
                    *selected = max;
                }
                let sel = *selected;
                Self::follow(sel, offset);
            }
            _ => {}
        }
    }

    pub fn apply_ledger(&mut self, entries: Vec<LedgerEntry>, note: String) {
        match &mut self.view {
            MenuView::LedgerList { entries: e, note: n, .. } => {
                *e = entries;
                *n = note;
            }
            _ => {}
        }
    }

    pub fn apply_tasks(&mut self, text: String) {
        self.view = MenuView::TasksShow { text };
    }

    pub fn apply_providers_list(&mut self, status: &serde_json::Value) {
        if let MenuView::ProviderForm(form) = &mut self.view {
            form.apply_providers(status, ape::load_provider_model());
        }
    }

    pub fn apply_provider_test(&mut self, result: &serde_json::Value) {
        if let MenuView::ProviderForm(form) = &mut self.view {
            form.apply_test(result);
        }
    }

    /// Refresh the status-line model from the saved pin (after Save).
    pub fn note_saved_model(&mut self) {
        self.model_cache = ape::load_provider_model().map(|(_, m)| m);
    }

    pub fn apply_status(&mut self, status: &serde_json::Value) {
        self.cache_provider(status);
        self.view = MenuView::StatusShow { text: status_body(status) };
    }

    /// Quiet twin: caches the provider without touching the view. The
    /// entry prime and only the prime uses this.
    pub fn apply_status_quiet(&mut self, status: &serde_json::Value) {
        self.cache_provider(status);
    }

    fn cache_provider(&mut self, status: &serde_json::Value) {
        self.provider_cache = status
            .get("active_provider")
            .and_then(|a| a.get("provider"))
            .and_then(|p| p.as_str())
            .filter(|p| *p != "none")
            .map(str::to_string);
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

    fn menu_row(id: &str, status: &str) -> RunRow {
        RunRow {
            run_id: id.to_string(),
            profile: "p".to_string(),
            status: status.to_string(),
            stop_reason: "explicit_final_answer".to_string(),
            cost: 0.02,
            steps: 3,
            started: "2026-09-30 10:11".to_string(),
        }
    }

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
        for _ in 0..11 {
            m.on_key(Key::Char('j'));
        }
        let (_, quit) = m.on_key(Key::Enter);
        assert!(quit);
    }

    #[test]
    fn provider_entry_loads_form() {
        let mut m = Menu::new();
        for _ in 0..9 {
            m.on_key(Key::Down);
        }
        let (fx, quit) = m.on_key(Key::Enter);
        assert!(!quit);
        assert_eq!(fx, vec![MenuEffect::Provider(crate::provider::ProviderEffect::LoadProviders)]);
        assert!(matches!(m.view, MenuView::ProviderForm(_)));
        // Esc leaves back to Main.
        m.on_key(Key::Esc);
        assert!(matches!(m.view, MenuView::Main { .. }));
    }

    #[test]
    fn runs_ledger_tasks_entries_emit_loads() {
        let mut m = Menu::new();
        for _ in 0..6 {
            m.on_key(Key::Down);
        }
        let (fx, _) = m.on_key(Key::Enter);
        assert_eq!(fx, vec![MenuEffect::LoadRuns]);
        assert!(matches!(m.view, MenuView::RunsList { .. }));
        let mut m = Menu::new();
        for _ in 0..7 {
            m.on_key(Key::Down);
        }
        let (fx, _) = m.on_key(Key::Enter);
        assert_eq!(fx, vec![MenuEffect::LoadLedger]);
        let mut m = Menu::new();
        for _ in 0..8 {
            m.on_key(Key::Down);
        }
        let (fx, _) = m.on_key(Key::Enter);
        assert_eq!(fx, vec![MenuEffect::LoadTasks]);
    }

    #[test]
    fn runs_enter_opens_selected_into_fetch() {
        let mut m = Menu::new();
        m.view = MenuView::RunsList {
            runs: vec![menu_row("run-a", "running"), menu_row("run-b", "done")],
            selected: 1,
            offset: 0,
            note: String::new(),
        };
        let (fx, _) = m.on_key(Key::Enter);
        assert_eq!(fx, vec![MenuEffect::FetchStatus("run-b".to_string())]);
        m.on_key(Key::Down);
        m.on_key(Key::Up);
        match &m.view {
            MenuView::RunsList { selected, .. } => assert_eq!(*selected, 0),
            other => panic!("expected RunsList, got {other:?}"),
        }
    }

    #[test]
    fn ledger_filter_cycles_and_resets_offset() {
        let mut m = Menu::new();
        m.view = MenuView::LedgerList {
            entries: vec![
                LedgerEntry { ts: "t".into(), kind: "agent.destructive".into(), summary: "s".into() },
                LedgerEntry { ts: "t".into(), kind: "genesis.audit".into(), summary: "s".into() },
            ],
            offset: 5,
            filter: LedgerFilter::All,
            note: String::new(),
        };
        m.on_key(Key::Char('f'));
        match &m.view {
            MenuView::LedgerList { filter, offset, .. } => {
                assert_eq!(*filter, LedgerFilter::Destructive);
                assert_eq!(*offset, 0);
            }
            other => panic!("expected LedgerList, got {other:?}"),
        }
        assert!(LedgerFilter::Genesis.matches(&LedgerEntry { ts: "t".into(), kind: "genesis.audit".into(), summary: "s".into() }));
        assert!(!LedgerFilter::Genesis.matches(&LedgerEntry { ts: "t".into(), kind: "agent.destructive".into(), summary: "s".into() }));
    }

    #[test]
    fn run_row_and_ledger_entry_lines() {
        let row = menu_row("run-abcdef1234567890", "done");
        assert!(row.line().contains("run-abcdef123456"), "id shortened, got: {}", row.line());
        assert!(row.line().contains("explicit_final_answer"), "stop shown, got: {}", row.line());
        let e = LedgerEntry { ts: "2026-09-30T10:11:12".into(), kind: "agent.destructive".into(), summary: "tool=x".into() };
        assert!(e.line().contains("agent.destructive"));
    }

    #[test]
    fn prime_loads_provider_quietly_once() {
        let mut m = Menu::new();
        assert_eq!(m.prime(), vec![MenuEffect::PrimeStatus]);
        assert_eq!(m.prime(), vec![], "second call is a no-op");
        let v: serde_json::Value = serde_json::from_str(
            r#"{"active_provider":{"provider":"opencode","source":"s"}}"#,
        )
        .unwrap();
        m.apply_status_quiet(&v);
        assert_eq!(m.provider_cache.as_deref(), Some("opencode"));
        assert!(matches!(m.view, MenuView::Main { .. }), "view untouched");
        assert!(m.status_line("1.0.0").contains("provider: opencode"));
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
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("do it"), slash_sel: 0 };
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
    fn ctrl_j_inserts_newline_like_alt_enter() {
        for key in [Key::AltEnter, Key::CtrlJ] {
            let mut m = Menu::new();
            m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("ab"), slash_sel: 0 };
            m.on_key(key);
            match &m.view {
                MenuView::RunObjective { editor, .. } => assert_eq!(editor.text(), "ab\n"),
                other => panic!("expected RunObjective, got {other:?}"),
            }
        }
    }

    #[test]
    fn slash_jump_uses_goto_item() {
        let mut m = Menu::new();
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("/runs"), slash_sel: 0 };
        let (fx, _) = m.on_key(Key::Enter);
        assert_eq!(fx, vec![MenuEffect::LoadRuns]);
        assert!(matches!(m.view, MenuView::RunsList { .. }));
        // Unmatched slash text sends as a literal objective.
        let mut m = Menu::new();
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("/zzz"), slash_sel: 0 };
        let (fx, _) = m.on_key(Key::Enter);
        assert!(matches!(fx[..], [MenuEffect::StartRun { .. }]));
        // Fuzzy menu navigates with Up/Down.
        assert_eq!(slash_menu("/"), vec![
            ("profile", "pick a profile and run"),
            ("runs", "recent runs, open one live"),
            ("ledger", "governance audit stream"),
            ("tasks", "skein task graph"),
            ("status", "versions, provider, engines"),
            ("doctor", "environment checks"),
            ("provider", "choose provider and model"),
            ("setup", "run setup again"),
        ]);
        assert_eq!(slash_menu("/run"), vec![("runs", "recent runs, open one live")]);
        assert_eq!(slash_target("/doc", 0), Some(3));
        assert_eq!(slash_target("/zzz", 0), None);
    }

    #[test]
    fn history_recalls_and_restores_draft() {
        let mut m = Menu::new();
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("first"), slash_sel: 0 };
        m.on_key(Key::Enter);
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("second"), slash_sel: 0 };
        m.on_key(Key::Enter);
        let mut m2 = Menu::new();
        m2.history = m.history.clone();
        m2.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("draft"), slash_sel: 0 };
        m2.on_key(Key::Up);
        match &m2.view {
            MenuView::RunObjective { editor, .. } => assert_eq!(editor.text(), "second"),
            other => panic!("expected RunObjective, got {other:?}"),
        }
        m2.on_key(Key::Up);
        match &m2.view {
            MenuView::RunObjective { editor, .. } => assert_eq!(editor.text(), "first"),
            other => panic!("expected RunObjective, got {other:?}"),
        }
        m2.on_key(Key::Down);
        m2.on_key(Key::Down);
        match &m2.view {
            MenuView::RunObjective { editor, .. } => assert_eq!(editor.text(), "draft", "draft restored past newest"),
            other => panic!("expected RunObjective, got {other:?}"),
        }
    }

    #[test]
    fn objective_enter_starts_run() {
        let mut m = Menu::new();
        m.view = MenuView::RunObjective { profile: "p".to_string(), editor: LineEditor::with_text("do it"), slash_sel: 0 };
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
            selected: 0,
            expanded: false,
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
            selected: 0,
            expanded: false,
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
            selected: 0,
            expanded: false,
        };
        let t = m.status_line("1.0.4");
        assert!(t.contains("run-abc123"), "got: {t}");
        assert!(t.contains("running"), "got: {t}");
        assert!(t.contains("0.02"), "got: {t}");
    }

    #[test]
    fn expand_toggles_and_selection_moves() {
        let mut m = Menu::new();
        m.apply_run_started("r".to_string(), "p".to_string());
        let poll: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"r","status":"running","steps":[{"step":1,"kind":"tool","tool":"a","duration_ms":1,"tokens":1,"cost":0,"result_summary":"one"},{"step":2,"kind":"tool","tool":"b","duration_ms":1,"tokens":1,"cost":0,"result_summary":"two"}]}"#,
        )
        .unwrap();
        m.apply_poll(&poll);
        m.on_key(Key::Down);
        m.on_key(Key::Down);
        m.on_key(Key::Enter);
        match &m.view {
            MenuView::RunProgress { selected, expanded, .. } => {
                assert_eq!(*selected, 1, "clamped to last block");
                assert!(*expanded);
            }
            other => panic!("expected RunProgress, got {other:?}"),
        }
        m.on_key(Key::Up);
        match &m.view {
            MenuView::RunProgress { selected, expanded, .. } => {
                assert_eq!(*selected, 0);
                assert!(*expanded, "expand survives moves");
            }
            other => panic!("expected RunProgress, got {other:?}"),
        }
    }

    #[test]
    fn denied_blocks_carry_marker_and_reason() {
        let mut m = Menu::new();
        m.apply_run_started("r".to_string(), "p".to_string());
        let poll: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"r","status":"running","steps":[{"step":1,"kind":"tool","tool":"adam.evolve","duration_ms":1,"tokens":0,"cost":0,"result_summary":"destructive:denied: this profile denies unattended destructive calls; finish with a proposal"}]}"#,
        )
        .unwrap();
        m.apply_poll(&poll);
        match &m.view {
            MenuView::RunProgress { blocks, .. } => {
                assert!(blocks[0].denied);
                assert!(blocks[0].header().contains("[DENIED]"));
                assert!(blocks[0].denied_reason.contains("denies unattended"), "got: {}", blocks[0].denied_reason);
            }
            other => panic!("expected RunProgress, got {other:?}"),
        }
        // Marker-only rows (predating the reason) still flag distinctly.
        let mut m2 = Menu::new();
        m2.apply_run_started("r".to_string(), "p".to_string());
        let old: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"r","status":"running","steps":[{"step":1,"kind":"tool","tool":"x","duration_ms":1,"tokens":0,"cost":0,"result_summary":"destructive:denied"}]}"#,
        )
        .unwrap();
        m2.apply_poll(&old);
        match &m2.view {
            MenuView::RunProgress { blocks, .. } => {
                assert!(blocks[0].denied);
                assert!(blocks[0].denied_reason.is_empty());
            }
            other => panic!("expected RunProgress, got {other:?}"),
        }
    }

    #[test]
    fn live_totals_come_from_the_run_row() {
        // Rows are live since recordStep (locked by ledger-live.test.js);
        // the TUI trusts them, including mid-run nonzero values.
        let mut m = Menu::new();
        m.apply_run_started("r".to_string(), "p".to_string());
        let poll: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"r","status":"running","step_count":1,"total_cost":0.01,"total_tokens":42,"steps":[{"step":1,"kind":"model","tool":"","duration_ms":407,"tokens":2,"cost":0,"result_summary":""},{"step":2,"kind":"tool","tool":"skein.orchestrate","duration_ms":120,"tokens":40,"cost":0.01,"result_summary":"ok"}]}"#,
        )
        .unwrap();
        m.apply_poll(&poll);
        match &m.view {
            MenuView::RunProgress { budget, blocks, .. } => {
                assert_eq!(budget.spent_tokens, 42);
                assert_eq!(budget.steps, 1);
                assert!((budget.spent_usd - 0.01).abs() < 1e-9);
                assert_eq!(blocks.len(), 2, "blocks still come from the rows");
            }
            other => panic!("expected RunProgress, got {other:?}"),
        }
    }

    #[test]
    fn check_show_carries_recent_steps() {
        let mut m = Menu::new();
        let v: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"r","status":"stopped","stop_reason":"cancelled","step_count":1,"total_cost":0.01,"total_tokens":40,"outcome":"","steps":[{"step":1,"kind":"tool","tool":"a","duration_ms":1,"tokens":1,"cost":0,"result_summary":"ok"},{"step":2,"kind":"cancel","tool":"a","duration_ms":0,"tokens":0,"cost":0,"result_summary":"interrupted:cancelled after step 1 (a) — in-flight work discarded"}]}"#,
        )
        .unwrap();
        m.apply_check_status(&v);
        match &m.view {
            MenuView::CheckShow { text, blocks } => {
                assert!(text.contains("cancelled"), "got: {text}");
                assert_eq!(blocks.len(), 2);
                assert!(blocks[1].summary.contains("interrupted:cancelled"));
            }
            other => panic!("expected CheckShow, got {other:?}"),
        }
    }

    #[test]
    fn wrap_text_breaks_words_and_cuts_long_tokens() {
        assert_eq!(wrap_text("ab cd ef", 5), vec!["ab cd", "ef"]);
        assert_eq!(wrap_text("abcdefghij", 4), vec!["abcd", "efgh", "ij"]);
        assert_eq!(wrap_text("", 10), Vec::<String>::new());
        assert_eq!(wrap_text("a b c", 1), vec!["a", "b", "c"]);
        // Char (not byte) widths: 2-wide CJK counts per char here.
        assert_eq!(wrap_text("aa bb cc", 4), vec!["aa", "bb", "cc"]);
    }

    #[test]
    fn profile_lines_caps_and_marks() {
        let rows = profile_lines("writer", "one two three four five six", 12, true);
        assert!(rows[0].0.contains("writer"));
        assert!(rows.len() <= 6, "name + 4 desc + marker, got {rows:?}");
        let long = profile_lines("w", &"word ".repeat(30), 12, false);
        assert!(long.last().unwrap().0.contains('…'), "overflow marked, got {long:?}");
    }

    #[test]
    fn json_outcome_renders_human_fields() {
        let v: serde_json::Value = serde_json::from_str(
            r#"{"status":"failed","stop_reason":"model_error","step_count":2,"total_cost":0.01,"total_tokens":50,"outcome":"{\"error\":\"opencode 500\",\"message\":\"Internal server error\"}"}"#,
        )
        .unwrap();
        let t = status_text(&v);
        assert!(t.contains("error: opencode 500"), "got: {t}");
        assert!(t.contains("model_error"), "stop reason kept, got: {t}");
        assert!(!t.contains("{\"error\""), "no raw blob, got: {t}");
        // Non-JSON prose passes through untouched.
        assert_eq!(humanize_outcome("plain words"), "plain words");
        assert_eq!(humanize_outcome(""), "");
    }

    #[test]
    fn key_env_for_known_providers() {
        assert_eq!(key_env_for("anthropic"), Some("ANTHROPIC_API_KEY"));
        assert_eq!(key_env_for("nebius"), Some("APE_NEBIUS_API_KEY"));
        assert_eq!(key_env_for("mock"), None, "keyless");
        assert_eq!(key_env_for("opencode"), None, "session-based");
        assert_eq!(key_env_for("bogus"), None, "unknown");
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
    fn status_text_omits_missing_stop_and_empty_outcome() {        let v: serde_json::Value = serde_json::from_str(r#"{"status":"running","step_count":2,"total_cost":0}"#).unwrap();
        let t = status_text(&v);
        assert!(!t.contains("null"), "got: {t}");
        assert!(!t.ends_with('\n'), "no trailing blank line, got: {t:?}");
        assert!(t.contains("running"), "got: {t}");
    }
}
