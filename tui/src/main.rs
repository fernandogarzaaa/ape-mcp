//! `ape-tui`: visual terminal frontend for ape-mcp.
//! Frontend only: every action shells out to `node bin/ape-mcp.js` through
//! [`ape`]; no tool behavior is reimplemented here. Non-TTY stdin (pipes/CI)
//! prints a one-line pointer and exits without taking over the terminal.
mod ape;
mod input;
mod md;
mod menu;
mod onboard;
mod screens;
#[cfg(test)]
mod snap;

use ape::{envelope_result, BridgeResult};
use crossterm::{
    event::{self, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use input::{Key, LineEditor};
use menu::{Menu, MenuEffect, MenuView};
use onboard::{Effect as OnboardEffect, Onboard};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Alignment, Constraint, Direction, Layout},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame, Terminal,
};
use screens::{render_welcome, welcome_input, Nav, Screen};
use std::io::{self, IsTerminal};
use std::path::PathBuf;
use std::time::{Duration, Instant};

const VERSION_CRATE: &str = env!("CARGO_PKG_VERSION");

/// Display version: the release version passed by the `ape-mcp tui`
/// launcher (`APE_TUI_VERSION` from package.json), falling back to the TUI
/// crate version when launched some other way (cargo, direct binary).
fn tui_version() -> String {
    std::env::var("APE_TUI_VERSION").unwrap_or_else(|_| VERSION_CRATE.to_string())
}

struct Ctx {
    node_bin: String,
    ape_js: PathBuf,
}

impl Ctx {
    fn resolve() -> Result<Self, String> {
        let exe = std::env::current_exe().map_err(|e| format!("current exe: {e}"))?;
        let env_js = std::env::var("APE_MCP_JS").ok();
        match ape::resolve_ape_js(&exe, env_js.as_deref()) {
            Some(ape_js) => Ok(Self { node_bin: "node".to_string(), ape_js }),
            None => Err("cannot locate bin/ape-mcp.js (set APE_MCP_JS)".to_string()),
        }
    }

    fn tool(&self, tool: &str, args_json: &str) -> Result<BridgeResult, String> {
        ape::run_tool(&self.node_bin, &self.ape_js, tool, args_json)
    }

    fn cli(&self, args: &[&str]) -> Result<BridgeResult, String> {
        ape::run_cli(&self.node_bin, &self.ape_js, args)
    }
}

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    if !io::stdin().is_terminal() {
        eprintln!("ape is interactive: run it in a terminal, or use `ape-mcp` for scripted use.");
        std::process::exit(2);
    }
    let force_onboard = args.iter().any(|a| a == "--onboard");
    if let Err(e) = run(force_onboard) {
        disable_raw_mode().ok();
        // Never strand the user in the alternate screen on a crash path.
        execute!(io::stdout(), LeaveAlternateScreen).ok();
        eprintln!("ape error: {e}");
        std::process::exit(1);
    }
}

enum Top {
    Welcome,
    Onboard(Onboard),
    Menu(Menu),
}

fn run(force_onboard: bool) -> io::Result<()> {
    let ctx = Ctx::resolve().map_err(io::Error::other)?;
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut top = Top::Welcome;
    let mut quit = false;
    // Timestamp of the last status poll (demo + run progress share it).
    let mut last_poll = Instant::now();

    while !quit {
        terminal.draw(|f| render(&top, f))?;
        drive_effects(&mut top, &ctx, &mut last_poll);

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                // Ctrl-C always quits.
                if key.code == KeyCode::Char('c') && key.modifiers.contains(KeyModifiers::CONTROL) {
                    break;
                }
                // Normalize once: arrows are first-class, characters pass
                // through, everything else is ignored (never a trap).
                let input = match key.code {
                    KeyCode::Up => Some(Key::Up),
                    KeyCode::Down => Some(Key::Down),
                    KeyCode::Left => Some(Key::Left),
                    KeyCode::Right => Some(Key::Right),
                    KeyCode::Enter => Some(Key::Enter),
                    KeyCode::Esc => Some(Key::Esc),
                    KeyCode::Backspace => Some(Key::Backspace),
                    KeyCode::Delete => Some(Key::Backspace),
                    KeyCode::Char(c) => Some(Key::Char(c)),
                    _ => None,
                };
                if let Some(k) = input {
                    quit = handle_key(&mut top, &ctx, k, force_onboard);
                }
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}

/// Returns true when the app should quit.
fn handle_key(top: &mut Top, ctx: &Ctx, key: Key, force_onboard: bool) -> bool {
    use onboard::Flow;
    match top {
        Top::Welcome => match welcome_input(key) {
            Nav::Quit => true,
            Nav::Goto(Screen::Onboard) => {
                if force_onboard || !ape::is_onboarded() {
                    let mut ob = Onboard::new();
                    let initial: Vec<OnboardEffect> = ob.effects();
                    for fx in initial {
                        exec_onboard_effect(&mut ob, ctx, fx);
                    }
                    *top = Top::Onboard(ob);
                } else {
                    *top = Top::Menu(Menu::new());
                }
                false
            }
            Nav::Goto(_) => false,
            Nav::Stay => false,
        },
        Top::Onboard(ob) => {
            let (fx, flow) = ob.on_key(key);
            for f in fx {
                exec_onboard_effect(ob, ctx, f);
            }
            match flow {
                Flow::Stay => false,
                Flow::Done => {
                    *top = Top::Menu(Menu::new());
                    false
                }
                Flow::ToWelcome => {
                    *top = Top::Welcome;
                    false
                }
                Flow::ToMenu => {
                    // Stop watching a running demo: the throwaway profile was
                    // already loaded server-side, so deleting it is safe and
                    // avoids leaking one file per abandoned watch.
                    ob.apply_demo_finished();
                    *top = Top::Menu(Menu::new());
                    false
                }
            }
        }
        Top::Menu(menu) => {
            let (fx, quit) = menu.on_key(key);
            for f in fx {
                exec_menu_effect(menu, ctx, f);
            }
            quit
        }
    }
}

/// Effects that run without waiting for input (demo + run-progress polling).
fn drive_effects(top: &mut Top, ctx: &Ctx, last_poll: &mut Instant) {
    // Demo polling (onboarding).
    if let Top::Onboard(ob) = top {
        let run_id = match &ob.demo {
            onboard::DemoState::Polling { run_id } => Some(run_id.clone()),
            _ => None,
        };
        if let Some(id) = run_id {
            if last_poll.elapsed() >= Duration::from_secs(2) {
                *last_poll = Instant::now();
                if let Ok(BridgeResult::Json(v)) =
                    ctx.tool("ape_agent_status", &format!(r#"{{"run_id":{id:?}}}"#))
                {
                    if let Some(r) = envelope_result(&v) {
                        let status = r.get("status").and_then(|s| s.as_str()).unwrap_or("running");
                        let summary = r
                            .get("outcome")
                            .and_then(|o| o.as_str())
                            .unwrap_or("")
                            .chars()
                            .take(500)
                            .collect::<String>();
                        if ob.apply_demo_poll(status, &summary) {
                            ob.apply_demo_finished();
                            let _ = ape::mark_onboarded();
                        }
                    }
                }
            }
        }
        return;
    }
    // Run-progress polling (menu).
    if let Top::Menu(menu) = top {
        let run_id = match &menu.view {
            MenuView::RunProgress { run_id, .. } => Some(run_id.clone()),
            _ => None,
        };
        if let Some(id) = run_id {
            if last_poll.elapsed() >= Duration::from_secs(1) {
                *last_poll = Instant::now();
                if let Ok(BridgeResult::Json(v)) =
                    ctx.tool("ape_agent_status", &format!(r#"{{"run_id":{id:?}}}"#))
                {
                    if let Some(r) = envelope_result(&v) {
                        menu.apply_poll(r);
                    }
                }
            }
        }
    }
}

fn exec_onboard_effect(ob: &mut Onboard, ctx: &Ctx, fx: OnboardEffect) {
    use OnboardEffect::*;
    match fx {
        LoadDoctor => {
            let text = match ctx.cli(&["doctor"]) {
                Ok(BridgeResult::Text(t)) => t,
                Ok(BridgeResult::Json(v)) => v.to_string(),
                Err(e) => format!("doctor failed: {e}"),
            };
            ob.apply_doctor(&text);
        }
        LoadStatus => match ctx.tool("ape_status", "{}") {
            Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                Some(r) => ob.apply_status(r),
                None => ob.apply_status(&serde_json::Value::Null),
            },
            _ => ob.apply_status(&serde_json::Value::Null),
        },
        LoadProfiles => match ctx.tool("ape_agent_profiles", "{}") {
            Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                Some(r) => ob.apply_profiles(onboard::profile_list(r)),
                None => ob.apply_profiles(vec![]),
            },
            _ => ob.apply_profiles(vec![]),
        },
        SaveDefault(name) => {
            ape::save_default_profile(&name).ok();
        }
        DemoStart => match ape::write_demo_profile() {
            Err(e) => ob.apply_demo_start_failed(format!("temp profile: {e}")),
            Ok(path) => {
                let args = r#"{"profile":"ape-demo","objective":"onboarding demo"}"#.to_string();
                match ctx.tool("ape_agent_run", &args) {
                    Ok(BridgeResult::Json(v)) => {
                        match envelope_result(&v)
                            .and_then(|r| r.get("run_id"))
                            .and_then(|s| s.as_str())
                        {
                            Some(id) => ob.apply_demo_started(id.to_string(), path),
                            None => {
                                std::fs::remove_file(&path).ok();
                                ob.apply_demo_start_failed("no run_id in response".to_string());
                            }
                        }
                    }
                    Ok(_) => {
                        std::fs::remove_file(&path).ok();
                        ob.apply_demo_start_failed("unexpected response".to_string());
                    }
                    Err(e) => {
                        std::fs::remove_file(&path).ok();
                        ob.apply_demo_start_failed(e);
                    }
                }
            }
        },
        // Polling and completion are driven by drive_effects / on_key.
        Complete => {}
    }
}

fn exec_menu_effect(menu: &mut Menu, ctx: &Ctx, fx: MenuEffect) {
    use MenuEffect::*;
    match fx {
        LoadProfiles => match ctx.tool("ape_agent_profiles", "{}") {
            Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                Some(r) => menu.apply_profiles(onboard::profile_list(r), onboard::profile_limits(r)),
                None => menu.apply_profiles(vec![], Default::default()),
            },
            _ => menu.apply_profiles(vec![], Default::default()),
        },
        LoadDoctor => {
            let text = match ctx.cli(&["doctor"]) {
                Ok(BridgeResult::Text(t)) => t,
                Ok(BridgeResult::Json(v)) => v.to_string(),
                Err(e) => format!("doctor failed: {e}"),
            };
            menu.apply_doctor(text);
        }
        LoadStatus => match ctx.tool("ape_status", "{}") {
            Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                Some(r) => menu.apply_status(r),
                None => menu.apply_status(&serde_json::Value::Null),
            },
            _ => menu.apply_status(&serde_json::Value::Null),
        },
        LoadRuns => match ctx.tool("ape_agent_list", r#"{"limit":20}"#) {
            Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                Some(r) => {
                    let runs = r
                        .get("runs")
                        .and_then(|x| x.as_array())
                        .map(|a| a.iter().map(menu::RunRow::from_json).collect())
                        .unwrap_or_default();
                    menu.apply_runs(runs, String::new());
                }
                None => menu.apply_runs(vec![], "list failed: no result envelope".to_string()),
            },
            Err(e) => menu.apply_runs(vec![], format!("list failed: {e}")),
            _ => {}
        },
        LoadLedger => match ctx.tool("ape_ledger", r#"{"limit":100}"#) {
            Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                Some(r) => {
                    let entries: Vec<menu::LedgerEntry> = r
                        .get("entries")
                        .and_then(|x| x.as_array())
                        .map(|a| a.iter().map(menu::LedgerEntry::from_json).collect())
                        .unwrap_or_default();
                    let note = r
                        .get("note")
                        .and_then(|x| x.as_str())
                        .or(if entries.is_empty() { Some("no entries match") } else { None })
                        .unwrap_or("")
                        .to_string();
                    let note = if r.get("truncated").and_then(|x| x.as_bool()).unwrap_or(false) {
                        format!("{note} — showing newest 100")
                    } else {
                        note
                    };
                    menu.apply_ledger(entries, note);
                }
                None => menu.apply_ledger(vec![], "ledger failed: no result envelope".to_string()),
            },
            Err(e) => menu.apply_ledger(vec![], format!("ledger failed: {e}")),
            _ => {}
        },
        LoadTasks => match ctx.tool("ape_orchestrate", r#"{"op":"graph"}"#) {
            Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                Some(r) => {
                    let text = r
                        .get("output")
                        .and_then(|x| x.as_str())
                        .map(str::to_string)
                        .unwrap_or_else(|| r.to_string());
                    menu.apply_tasks(text);
                }
                None => menu.apply_tasks("tasks failed: no result envelope".to_string()),
            },
            Err(e) => menu.apply_tasks(format!("tasks failed: {e}")),
            _ => {}
        },
        StartRun { profile, objective } => {
            let args = serde_json::json!({ "profile": profile, "objective": objective }).to_string();
            match ctx.tool("ape_agent_run", &args) {
                Ok(BridgeResult::Json(v)) => {
                    match envelope_result(&v)
                        .and_then(|r| r.get("run_id"))
                        .and_then(|s| s.as_str())
                    {
                        Some(id) => menu.apply_run_started(id.to_string(), profile),
                        None => {
                            menu.view = MenuView::RunDone {
                                run_id: String::new(),
                                summary: "start failed: no run_id in response".to_string(),
                            }
                        }
                    }
                }
                Ok(_) => {
                    menu.view = MenuView::RunDone { run_id: String::new(), summary: "start failed: unexpected response".to_string() }
                }
                Err(e) => {
                    menu.view = MenuView::RunDone { run_id: String::new(), summary: format!("start failed: {e}") }
                }
            }
        }
        CancelRun { run_id } => {
            // Real cancel: the runtime kills the worker and marks the row
            // stopped/cancelled (proven via CLI on a delayed mock run). The
            // id stays on screen so the run remains pollable by id.
            match ctx.tool("ape_agent_cancel", &format!(r#"{{"run_id":{run_id:?}}}"#)) {
                Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                    Some(r) => menu.apply_cancelled(run_id, r),
                    None => menu.apply_cancelled(
                        run_id,
                        &serde_json::json!({"status":"unknown","outcome":"cancel sent, no result envelope"}),
                    ),
                },
                Err(e) => menu.apply_cancelled(
                    run_id,
                    &serde_json::json!({"status":"error","outcome":e}),
                ),
                _ => {}
            }
        }
        FetchStatus(run_id) => {
            // Open into the LIVE progress view when the run is still going
            // (same polling path as a fresh start), else the done view.
            // Either way the id stays visible and pollable.
            match ctx.tool("ape_agent_status", &format!(r#"{{"run_id":{run_id:?}}}"#)) {
                Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                    Some(r) => {
                        let running = r.get("status").and_then(|s| s.as_str()) == Some("running");
                        if running {
                            let id = r.get("run_id").and_then(|x| x.as_str()).unwrap_or(&run_id).to_string();
                            let profile = r.get("profile").and_then(|x| x.as_str()).unwrap_or("?").to_string();
                            menu.apply_run_started(id, profile);
                            menu.apply_poll(r);
                        } else {
                            menu.apply_check_status(r);
                        }
                    }
                    None => menu.apply_check_status(&serde_json::json!({
                        "status": "unknown", "stop_reason": null,
                        "step_count": 0, "total_cost": 0, "outcome": "no result envelope"
                    })),
                },
                Err(e) => menu.apply_check_status(&serde_json::json!({
                    "status": "error", "stop_reason": null,
                    "step_count": 0, "total_cost": 0, "outcome": e
                })),
                _ => {}
            }
        }
    }
}


fn render(top: &Top, f: &mut Frame) {
    match top {
        Top::Welcome => render_welcome(f, &tui_version()),
        Top::Onboard(ob) => render_onboard(ob, f),
        Top::Menu(menu) => render_menu(menu, f),
    }
}

fn render_onboard(ob: &Onboard, f: &mut Frame) {
    use onboard::Step;
    let area = f.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(2), Constraint::Length(2)])
        .split(area);
    let title = match ob.step {
        Step::Doctor => "Onboarding 1/4 · Doctor",
        Step::Provider => "Onboarding 2/4 · Provider",
        Step::Profile => "Onboarding 3/4 · Default profile (↑/↓ + Enter)",
        Step::Demo => "Onboarding 4/4 · Demo run",
        Step::Done => "Onboarding complete",
    };
    let footer = match ob.step {
        Step::Doctor | Step::Provider => "[Enter] continue   [Esc] back   [Ctrl-C] quit",
        Step::Profile => "[↑/↓] move   [Enter] choose   [Esc] back",
        Step::Demo => match &ob.demo {
            onboard::DemoState::Polling { .. } => "[Esc] stop watching (run keeps going)",
            onboard::DemoState::Failed(_) => "[Enter] back to profiles, pick again",
            onboard::DemoState::Finished { .. } => "[Enter] finish",
            onboard::DemoState::Idle => "starting…",
        },
        Step::Done => "",
    };
    let mut lines: Vec<Line> = vec![];
    match ob.step {
        Step::Doctor => {
            if !ob.doctor_loaded {
                lines.push(Line::from("checking…"));
            } else if ob.doctor.is_empty() {
                lines.push(Line::from("doctor produced no parseable lines."));
            } else {
                for d in &ob.doctor {
                    let mark = if d.ok { "ok  " } else { "FAIL" };
                    let color = if d.ok { Color::Green } else { Color::Red };
                    lines.push(Line::from(vec![
                        Span::styled(mark, Style::default().fg(color)),
                        Span::raw(format!(" {}", d.text)),
                    ]));
                }
                let fails = ob.doctor.iter().filter(|d| !d.ok).count();
                if fails > 0 {
                    lines.push(Line::from(""));
                    lines.push(Line::from(Span::styled(
                        format!(
                            "{fails} check(s) failing — you can continue; run `ape-mcp doctor` later for details."
                        ),
                        Style::default().fg(Color::Yellow),
                    )));
                }
            }
        }
        Step::Provider => {
            lines.push(Line::from(ob.provider.as_deref().unwrap_or("detecting…")));
        }
        Step::Profile => {
            for (i, (name, desc)) in ob.profiles.iter().enumerate() {
                let style = if i == ob.selected {
                    Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                };
                lines.push(Line::from(Span::styled(format!("  {name} — {desc}"), style)));
            }
            if ob.profiles.is_empty() {
                lines.push(Line::from(if ob.profiles_loaded {
                    "no profiles reported — Esc goes back, Enter does nothing here."
                } else {
                    "loading profiles…"
                }));
            }
        }
        Step::Demo => {
            use onboard::DemoState::*;
            match &ob.demo {
                Idle => lines.push(Line::from("starting demo run…")),
                Polling { run_id } => {
                    lines.push(Line::from(format!("demo running: {run_id}")));
                    lines.push(Line::from("watching status — Esc cancels watching (the run keeps going)"));
                }
                Failed(e) => {
                    lines.push(Line::from(Span::styled(
                        format!("demo failed: {e}"),
                        Style::default().fg(Color::Red),
                    )));
                    lines.push(Line::from(
                        "the demo needs a working provider — press Enter to go back and pick again.",
                    ));
                }
                Finished { summary } => {
                    lines.push(Line::from(Span::styled(
                        "demo finished — you have seen the whole loop:",
                        Style::default().fg(Color::Green),
                    )));
                    for l in summary.lines() {
                        lines.push(Line::from(l.to_string()));
                    }
                }
            }
        }
        Step::Done => {
            lines.push(Line::from("onboarding complete. Opening menu…"));
        }
    }
    f.render_widget(
        Paragraph::new(lines).block(Block::default().borders(Borders::ALL).title(title)),
        chunks[0],
    );
    f.render_widget(
        Paragraph::new(footer).alignment(Alignment::Center),
        chunks[1],
    );
    // Status line: provider once known this session, always the real version.
    f.render_widget(
        Paragraph::new(format!(
            "provider: {} · ape-mcp {}",
            ob.provider.as_deref().unwrap_or("…"),
            tui_version(),
        ))
        .alignment(Alignment::Center),
        chunks[2],
    );
}

fn render_menu(menu: &Menu, f: &mut Frame) {
    use menu::MenuView::*;
    let area = f.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(2), Constraint::Length(2)])
        .split(area);
    let mut lines: Vec<Line> = vec![];
    let mut footer = "[Enter] select   [Esc] back   [q] quit";
    match &menu.view {
        Main { selected } => {
            for (i, item) in menu::MENU_ITEMS.iter().enumerate() {
                let style = if i == *selected {
                    Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                };
                lines.push(Line::from(Span::styled(format!("  {item}"), style)));
            }
            footer = "[↑/↓] move   [Enter] select   [q] quit";
        }
        RunProfile { profiles, selected } => {
            lines.push(Line::from("pick a profile (Esc back):"));
            for (i, (name, desc)) in profiles.iter().enumerate() {
                let style = if i == *selected {
                    Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                };
                lines.push(Line::from(Span::styled(format!("  {name} — {desc}"), style)));
            }
            if profiles.is_empty() {
                lines.push(Line::from("loading profiles…"));
            }
            footer = "[↑/↓] move   [Enter] choose   [Esc] back";
        }
        RunObjective { profile, editor } => {
            lines.push(Line::from(format!("objective for {profile} (Enter runs, Esc back):")));
            lines.push(editor_line(editor));
            footer = "[←/→] move in text   [Enter] run   [Esc] back";
        }
        RunProgress { run_id, profile, blocks, budget, last_status, selected, expanded, .. } => {
            lines.push(Line::from(format!("run {run_id} [{profile}] — {last_status}:")));
            // Budget meter first: always visible while the run is live.
            lines.push(Line::from(Span::styled(
                budget.meter(),
                Style::default().fg(Color::Yellow),
            )));
            // Timeline grows by append; the screen shows the tail with an
            // honest count when older blocks scrolled out of view.
            const TAIL: usize = 20;
            let skip = blocks.len().saturating_sub(TAIL);
            if skip > 0 {
                lines.push(Line::from(format!("… {skip} earlier step(s) — poll by id for the full ledger")));
            }
            if blocks.is_empty() {
                lines.push(Line::from("run started — waiting for the first step…"));
            }
            for (bi, b) in blocks.iter().enumerate().skip(skip) {
                let is_sel = bi == *selected;
                let mut style = Style::default().add_modifier(Modifier::BOLD);
                if b.denied {
                    style = style.fg(Color::Red);
                }
                let marker = if is_sel { "> " } else { "  " };
                lines.push(Line::from(vec![
                    Span::raw(marker),
                    Span::styled(b.header(), style),
                ]));
                if is_sel && *expanded {
                    // Full result_summary, one Line per source line (never a
                    // joined multi-line Line). The ledger stores max 300
                    // chars per step (runs.js appendStep): a full-length
                    // summary says so honestly instead of implying more.
                    // Denied blocks show the parsed reason INSTEAD of the raw
                    // marker line (which just repeats it).
                    let show_raw = !(b.denied && !b.denied_reason.is_empty());
                    if show_raw {
                        for l in b.summary.lines() {
                            lines.push(Line::from(format!("    {l}")));
                        }
                    }
                    if b.summary.lines().count() == 0 {
                        lines.push(Line::from("    (empty result)"));
                    }
                    if b.summary.chars().count() >= 300 {
                        lines.push(Line::from(Span::styled(
                            "    …[ledger stores max 300 chars per step]",
                            Style::default().fg(Color::DarkGray),
                        )));
                    }
                    if b.denied {
                        if b.denied_reason.is_empty() {
                            lines.push(Line::from(Span::styled(
                                "    reason recorded in the run receipt/audit, not in this step row",
                                Style::default().fg(Color::DarkGray),
                            )));
                        } else {
                            lines.push(Line::from(Span::styled(
                                format!("    reason: {}", b.denied_reason),
                                Style::default().fg(Color::Yellow),
                            )));
                        }
                    }
                } else if !b.body().is_empty() {
                    lines.push(Line::from(format!("  {}", b.body())));
                }
            }
            footer = "[↑/↓] step   [Enter] expand   [Esc] cancel run (stays pollable by id)";
        }
        RunDone { run_id, summary } => {
            lines.push(Line::from(Span::styled("finished:", Style::default().fg(Color::Green))));
            if !run_id.is_empty() {
                lines.push(Line::from(format!("run {run_id}")));
            }
            // Head line plain, outcome as markdown: status_text guarantees
            // the head has no newline, so the split is exact.
            let mut parts = summary.splitn(2, '\n');
            if let Some(head) = parts.next() {
                lines.push(Line::from(head.to_string()));
            }
            if let Some(outcome) = parts.next() {
                lines.extend(md::render_markdown(outcome));
            }
            footer = "[any key] back to menu";
        }
        RunCancelled { run_id, summary } => {
            lines.push(Line::from(Span::styled(
                "cancelled — worker stopped.",
                Style::default().fg(Color::Yellow),
            )));
            lines.push(Line::from(format!("run {run_id} (still pollable via Check a run)")));
            for l in summary.lines() {
                lines.push(Line::from(l.to_string()));
            }
            footer = "[any key] back to menu";
        }
        CheckId { editor } => {
            lines.push(Line::from("run id (Enter checks, Esc back):"));
            lines.push(editor_line(editor));
            footer = "[←/→] move in text   [Enter] check   [Esc] back";
        }
        CheckShow { text } => {
            for l in text.lines().take(30) {
                lines.push(Line::from(l.to_string()));
            }
            footer = "[any key] back to menu";
        }
        ProfilesList { profiles, offset } => {
            for (name, desc) in profiles.iter().skip(*offset).take(20) {
                lines.push(Line::from(format!("  {name} — {desc}")));
            }
            footer = "[↑/↓] scroll   [Esc] back";
        }
        DoctorShow { text } => {
            for l in text.lines().take(30) {
                let style = if l.trim_start().starts_with("FAIL") {
                    Style::default().fg(Color::Red)
                } else {
                    Style::default()
                };
                lines.push(Line::from(Span::styled(l.to_string(), style)));
            }
            footer = "[any key] back to menu";
        }
        StatusShow { text } => {
            for l in text.lines() {
                lines.push(Line::from(l.to_string()));
            }
            footer = "[any key] back to menu";
        }
        RunsList { runs, selected, offset, note } => {
            const PAGE: usize = 15;
            if runs.is_empty() {
                lines.push(Line::from(if note.is_empty() { "no runs yet — start one with Run an agent." } else { note.as_str() }));
            }
            for (i, row) in runs.iter().enumerate().skip(*offset).take(PAGE) {
                let style = if i == *selected {
                    Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                };
                lines.push(Line::from(Span::styled(format!("  {}", row.line()), style)));
            }
            let end = (*offset + PAGE).min(runs.len().max(1));
            footer = if runs.is_empty() {
                "[Esc] back"
            } else {
                // Static footer text per screen would need allocation; the
                // range is baked into the last line instead.
                lines.push(Line::from(format!("showing {}–{} of {}", offset + 1, end, runs.len())));
                "[↑/↓] move   [Enter] open (live if running)   [Esc] back"
            };
        }
        LedgerList { entries, offset, filter, note } => {
            const PAGE: usize = 15;
            let shown: Vec<&menu::LedgerEntry> = entries.iter().filter(|e| filter.matches(e)).collect();
            // Entries carry no run id or status (audit stream, not run
            // ledger): the filter is by kind, said on screen.
            lines.push(Line::from(format!("audit stream · filter: {} (f cycles)", filter.label())));
            if shown.is_empty() {
                lines.push(Line::from(if note.is_empty() { "no entries match." } else { note.as_str() }));
            }
            let offset = (*offset).min(shown.len().saturating_sub(1));
            for e in shown.iter().skip(offset).take(PAGE) {
                lines.push(Line::from(e.line()));
            }
            footer = "[↑/↓] scroll   [f] filter   [Esc] back";
        }
        TasksShow { text } => {
            // Skein graph as its own CLI text: real fields only, one Line
            // per source line. Errors (no python, no graph) render as-is —
            // never a blank screen.
            let mut shown = 0;
            for l in text.lines().take(30) {
                lines.push(Line::from(l.to_string()));
                shown += 1;
            }
            if shown == 0 {
                lines.push(Line::from("empty graph — add nodes with ape_orchestrate node-add."));
            }
            footer = "[any key] back to menu";
        }
        ConsoleInfo => {
            lines.push(Line::from("browser console: run `ape-mcp serve` in another terminal,"));
            lines.push(Line::from("then open the printed URL (Live Trace, Runs, Ledger)."));
            footer = "[any key] back to menu";
        }
    }
    f.render_widget(
        Paragraph::new(lines).block(Block::default().borders(Borders::ALL).title(" APE ")),
        chunks[0],
    );
    f.render_widget(Paragraph::new(footer).alignment(Alignment::Center), chunks[1]);
    f.render_widget(
        Paragraph::new(menu.status_line(&tui_version())).alignment(Alignment::Center),
        chunks[2],
    );
}

/// Text-entry line with the cursor block drawn at the real cursor column
/// (char-safe split), so ←/→ movement is visible instead of implied.
fn editor_line(editor: &LineEditor) -> Line<'static> {
    let col = editor.cursor();
    let mut before = String::new();
    let mut after = String::new();
    for (i, c) in editor.text().chars().enumerate() {
        if i < col {
            before.push(c);
        } else {
            after.push(c);
        }
    }
    let style = Style::default().fg(Color::Cyan);
    Line::from(vec![
        Span::raw("> "),
        Span::styled(before, style),
        Span::styled("█", style.add_modifier(Modifier::BOLD)),
        Span::styled(after, style),
    ])
}
