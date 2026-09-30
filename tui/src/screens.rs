//! Screens: welcome is fully implemented; onboard/menu land in Milestone 2.
//! Each screen is a pure render + input-transition pair so navigation logic
//! is unit-testable without a terminal.
use super::input::Key;
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub const BANNER: &str = include_str!("../assets/ape.txt");

/// Side art for the main menu: "APE-MCP" in box-drawing capitals, 6 rows.
/// NOTE: built from a text description, not from the reference screenshot
/// (no image arrived) — letterforms are an interpretation, flagged as such.
/// One Line per row; each letter has its own color.
///
/// Layout contract (see main.rs): shown only when the terminal fits menu +
/// art + gutter; never shrunk or wrapped; main menu only; NO_COLOR strips
/// styling but keeps the shapes.
pub const SIDE_GLYPHS: [[&str; 6]; 7] = [
    // A — cyan
    [" ┌──┐ ", " │  │ ", " ├──┤ ", " │  │ ", " │  │ ", " │  │ "],
    // P — red
    [" ┌──┐ ", " │  │ ", " ├──┘ ", " │    ", " │    ", " │    "],
    // E — yellow
    [" ┌───┐", " │    ", " ├─── ", " │    ", " │    ", " └───┘"],
    // - — dark gray
    ["    ", "    ", " ─── ", "    ", "    ", "    "],
    // M — green
    ["┌─┐┌─┐", "│ ││ │", "│ ││ │", "│ ││ │", "│ ││ │", "│ ││ │"],
    // C — blue
    [" ┌───┐", " │    ", " │    ", " │    ", " │    ", " └───┘"],
    // P — magenta
    [" ┌──┐ ", " │  │ ", " ├──┘ ", " │    ", " │    ", " │    "],
];

pub const SIDE_COLORS: [Color; 7] = [
    Color::Cyan,
    Color::Red,
    Color::Yellow,
    Color::DarkGray,
    Color::Green,
    Color::Blue,
    Color::Magenta,
];

/// Art width in columns (glyphs joined with one-space gutters). Rows are
/// padded to their glyph width at render (trailing spaces don't survive
/// file writes), so this measures padded widths, not raw string lengths.
pub fn side_art_width() -> usize {
    let mut w = 0;
    for (li, glyph) in SIDE_GLYPHS.iter().enumerate() {
        if li > 0 {
            w += 1;
        }
        w += glyph.iter().map(|r| r.chars().count()).max().unwrap_or(0);
    }
    w
}

/// Show the art only when menu + art + gutter fit; never shrink or wrap it.
/// Minimum menu width 30, gutter 4, plus the art width.
pub fn art_visible(term_width: u16) -> bool {
    term_width as usize >= 30 + 4 + side_art_width()
}

/// One styled Line per art row, or plain when NO_COLOR is set.
pub fn side_art_lines() -> Vec<Line<'static>> {
    let plain = std::env::var("NO_COLOR").is_ok();
    let widths: Vec<usize> = SIDE_GLYPHS
        .iter()
        .map(|g| g.iter().map(|r| r.chars().count()).max().unwrap_or(0))
        .collect();
    (0..6)
        .map(|row| {
            let mut spans = vec![];
            for (li, glyph) in SIDE_GLYPHS.iter().enumerate() {
                if li > 0 {
                    spans.push(Span::raw(" "));
                }
                let mut text = glyph[row].to_string();
                let pad = widths[li].saturating_sub(text.chars().count());
                text.extend(std::iter::repeat(' ').take(pad));
                if plain {
                    spans.push(Span::raw(text));
                } else {
                    spans.push(Span::styled(text, Style::default().fg(SIDE_COLORS[li])));
                }
            }
            Line::from(spans)
        })
        .collect()
}

#[derive(Debug, PartialEq, Clone, Copy)]
#[allow(dead_code)] // Welcome/Menu are navigation vocabulary for future flows.
pub enum Screen {
    Welcome,
    Onboard,
    Menu,
}

#[derive(Debug, PartialEq)]
#[allow(dead_code)] // Stay is the explicit do-nothing transition.
pub enum Nav {
    Stay,
    Quit,
    Goto(Screen),
}

/// Key input transition for the welcome screen. Pure: easy to test.
/// `q`/Esc quit; anything else (arrows included) moves forward.
pub fn welcome_input(key: Key) -> Nav {
    match key {
        Key::Char('q') | Key::Char('Q') | Key::Esc => Nav::Quit,
        _ => Nav::Goto(Screen::Onboard),
    }
}

pub fn render_welcome(f: &mut Frame, version: &str) {
    let area = f.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(3)])
        .split(area);
    // One Line per art line: a single multi-line Line gets *wrapped* by
    // ratatui instead of split, which collapsed the banner to ~1.5 lines.
    let cyan = Style::default().fg(Color::Cyan);
    let mut body = vec![Line::from("")];
    body.extend(BANNER.lines().map(|l| Line::from(Span::styled(l, cyan))));
    body.push(Line::from(""));
    body.push(Line::from(Span::styled(
        format!("ape-mcp {version} · budgets · receipts · guardrails"),
        Style::default().fg(Color::DarkGray),
    )));
    f.render_widget(
        Paragraph::new(body).alignment(Alignment::Center).block(
            Block::default()
                .borders(Borders::ALL)
                .title(" APE "),
        ),
        chunks[0],
    );
    f.render_widget(
        Paragraph::new("[Enter] continue   [q] quit").alignment(Alignment::Center),
        chunks[1],
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn side_art_threshold() {
        let w = side_art_width();
        assert!((40..=60).contains(&w), "art is ~50 cols, got {w}");
        assert!(art_visible(120), "120 cols shows art");
        assert!(!art_visible(80), "80 cols hides art");
        assert!(!art_visible(w as u16 + 30), "need menu + gutter too");
        assert!(art_visible(w as u16 + 34));
    }

    #[test]
    fn side_art_six_lines_plain_under_no_color() {
        // NOTE: single-env-test pattern — env vars are process-global.
        let prev = std::env::var("NO_COLOR").ok();
        std::env::set_var("NO_COLOR", "1");
        let lines = side_art_lines();
        assert_eq!(lines.len(), 6);
        assert!(lines.iter().all(|l| l.spans.iter().all(|s| s.style.fg.is_none())));
        match prev {
            Some(v) => std::env::set_var("NO_COLOR", v),
            None => std::env::remove_var("NO_COLOR"),
        }
        let styled = side_art_lines();
        assert!(styled.iter().any(|l| l.spans.iter().any(|s| s.style.fg.is_some())));
    }

    #[test]
    fn banner_asset_loads() {
        assert!(BANNER.lines().count() >= 6, "banner is full-height ASCII art");
        assert!(BANNER.contains('_') && BANNER.contains('|'), "banner is block art");
    }

    #[test]
    fn welcome_quits_on_q_or_esc() {
        assert_eq!(welcome_input(Key::Char('q')), Nav::Quit);
        assert_eq!(welcome_input(Key::Char('Q')), Nav::Quit);
        assert_eq!(welcome_input(Key::Esc), Nav::Quit);
    }

    #[test]
    fn welcome_advances_on_anything_else() {
        assert_eq!(welcome_input(Key::Enter), Nav::Goto(Screen::Onboard));
        assert_eq!(welcome_input(Key::Char(' ')), Nav::Goto(Screen::Onboard));
        assert_eq!(welcome_input(Key::Down), Nav::Goto(Screen::Onboard));
    }

    #[test]
    fn welcome_renders_banner_and_hints() {
        use ratatui::{backend::TestBackend, Terminal};
        let backend = TestBackend::new(80, 24);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(|f| render_welcome(f, "0.1.0")).unwrap();
        let text = terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(|c| c.symbol())
            .collect::<String>();
        assert!(text.contains("___"), "banner visible");
        assert!(text.contains("0.1.0"), "version visible");
        assert!(text.contains("Enter"), "hint visible");
    }
}
