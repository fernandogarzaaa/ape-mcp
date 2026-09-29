//! `ape-tui`: visual terminal frontend for ape-mcp.
//! Frontend only: every action shells out to `node bin/ape-mcp.js` through
//! [`ape`]; no tool behavior is reimplemented here. Non-TTY stdin (pipes/CI)
//! prints a one-line pointer and exits without taking over the terminal.
mod ape;
mod input;
mod menu;
mod onboard;
mod screens;

use ape::{envelope_result, BridgeResult};
use crossterm::{
    event::{self, Event, KeyCode, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
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

const VERSION: &str = env!("CARGO_PKG_VERSION");

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
                match key.code {
                    KeyCode::Left => handle_arrow(&mut top, false),
                    KeyCode::Right => handle_arrow(&mut top, true),
                    KeyCode::Enter => quit = handle_key(&mut top, &ctx, '\r', force_onboard),
                    KeyCode::Char(c) => {
                        quit = handle_key(&mut top, &ctx, c, force_onboard);
                    }
                    KeyCode::Backspace => {
                        quit = handle_key(&mut top, &ctx, '\x08', force_onboard);
                    }
                    KeyCode::Esc => {
                        quit = handle_key(&mut top, &ctx, '\x1b', force_onboard);
                    }
                    _ => {}
                }
            }
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(())
}

fn handle_arrow(top: &mut Top, right: bool) {
    if let Top::Menu(menu) = top {
        match &mut menu.view {
            MenuView::RunObjective { editor, .. } | MenuView::CheckId { editor } => {
                if right {
                    editor.move_right();
                } else {
                    editor.move_left();
                }
            }
            _ => {}
        }
    }
}

/// Returns true when the app should quit.
fn handle_key(top: &mut Top, ctx: &Ctx, code: char, force_onboard: bool) -> bool {
    match top {
        Top::Welcome => match welcome_input(code) {
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
            let (fx, done) = ob.on_key(code);
            for f in fx {
                exec_onboard_effect(ob, ctx, f);
            }
            if done {
                *top = Top::Menu(Menu::new());
            }
            false
        }
        Top::Menu(menu) => {
            let (fx, quit) = menu.on_key(code);
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
                Some(r) => menu.apply_profiles(onboard::profile_list(r)),
                None => menu.apply_profiles(vec![]),
            },
            _ => menu.apply_profiles(vec![]),
        },
        LoadDoctor => {
            let text = match ctx.cli(&["doctor"]) {
                Ok(BridgeResult::Text(t)) => t,
                Ok(BridgeResult::Json(v)) => v.to_string(),
                Err(e) => format!("doctor failed: {e}"),
            };
            menu.apply_doctor(text);
        }
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
                                summary: "start failed: no run_id in response".to_string(),
                            }
                        }
                    }
                }
                Ok(_) => {
                    menu.view = MenuView::RunDone { summary: "start failed: unexpected response".to_string() }
                }
                Err(e) => {
                    menu.view = MenuView::RunDone { summary: format!("start failed: {e}") }
                }
            }
        }
        FetchStatus(run_id) => {
            match ctx.tool("ape_agent_status", &format!(r#"{{"run_id":{run_id:?}}}"#)) {
                Ok(BridgeResult::Json(v)) => match envelope_result(&v) {
                    Some(r) => menu.apply_status(r),
                    None => menu.apply_status(&serde_json::json!({
                        "status": "unknown", "stop_reason": null,
                        "step_count": 0, "total_cost": 0, "outcome": "no result envelope"
                    })),
                },
                Err(e) => menu.apply_status(&serde_json::json!({
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
        Top::Welcome => render_welcome(f, VERSION),
        Top::Onboard(ob) => render_onboard(ob, f),
        Top::Menu(menu) => render_menu(menu, f),
    }
}

fn render_onboard(ob: &Onboard, f: &mut Frame) {
    use onboard::Step;
    let area = f.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(3)])
        .split(area);
    let title = match ob.step {
        Step::Doctor => "Onboarding 1/4 · Doctor",
        Step::Provider => "Onboarding 2/4 · Provider",
        Step::Profile => "Onboarding 3/4 · Default profile (j/k + Enter)",
        Step::Demo => "Onboarding 4/4 · Demo run",
        Step::Done => "Onboarding complete",
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
                lines.push(Line::from("loading profiles…"));
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
                Failed(e) => lines.push(Line::from(Span::styled(
                    format!("demo failed: {e}"),
                    Style::default().fg(Color::Red),
                ))),
                Finished { summary } => {
                    lines.push(Line::from(Span::styled(
                        "demo finished — you have seen the whole loop:",
                        Style::default().fg(Color::Green),
                    )));
                    lines.push(Line::from(summary.as_str()));
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
        Paragraph::new("[Enter] continue   [Esc] back   [Ctrl-C] quit").alignment(Alignment::Center),
        chunks[1],
    );
}

fn render_menu(menu: &Menu, f: &mut Frame) {
    use menu::MenuView::*;
    let area = f.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(3)])
        .split(area);
    let mut lines: Vec<Line> = vec![];
    let mut footer = "[Enter] select   [q] quit";
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
            footer = "[j/k] move   [Enter] select   [q] quit";
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
        }
        RunObjective { profile, editor } => {
            lines.push(Line::from(format!("objective for {profile} (Enter runs, Esc back):")));
            lines.push(Line::from(Span::styled(
                format!("> {}█", editor.text()),
                Style::default().fg(Color::Cyan),
            )));
        }
        RunProgress { run_id, profile, lines: log } => {
            lines.push(Line::from(format!("run {run_id} [{profile}] — Esc stops watching (run continues):")));
            for l in log.iter() {
                lines.push(Line::from(l.as_str()));
            }
        }
        RunDone { summary } => {
            lines.push(Line::from(Span::styled("done:", Style::default().fg(Color::Green))));
            lines.push(Line::from(summary.as_str()));
        }
        CheckId { editor } => {
            lines.push(Line::from("run id (Enter checks, Esc back):"));
            lines.push(Line::from(format!("> {}█", editor.text())));
        }
        CheckShow { text } => {
            for l in text.lines().take(30) {
                lines.push(Line::from(l.to_string()));
            }
        }
        ProfilesList { profiles, offset } => {
            for (name, desc) in profiles.iter().skip(*offset).take(20) {
                lines.push(Line::from(format!("  {name} — {desc}")));
            }
            footer = "[j/k] scroll   [any] back";
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
        }
        ConsoleInfo => {
            lines.push(Line::from("browser console: run `ape-mcp serve` in another terminal,"));
            lines.push(Line::from("then open the printed URL (Live Trace, Runs, Ledger)."));
        }
    }
    f.render_widget(
        Paragraph::new(lines).block(Block::default().borders(Borders::ALL).title(" APE ")),
        chunks[0],
    );
    f.render_widget(Paragraph::new(footer).alignment(Alignment::Center), chunks[1]);
}
