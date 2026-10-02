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

/// Side art for the main menu: the SAME welcome banner (one source of
/// truth — welcome screen and menu panel can never drift apart). The
/// reference red/cyan/yellow turned out to be Windows subpixel text
/// rendering, not real colors, so this renders in the single welcome
/// accent (cyan), plain under NO_COLOR.
///
/// Layout contract (see main.rs): shown only when the terminal fits menu +
/// art + gutter; never shrunk or wrapped; main menu only.
pub fn side_art_lines() -> Vec<Line<'static>> {
    let plain = std::env::var("NO_COLOR").is_ok();
    let style = Style::default().fg(Color::Cyan);
    BANNER
        .lines()
        .map(|l| {
            if plain {
                Line::from(l.to_string())
            } else {
                Line::from(Span::styled(l.to_string(), style))
            }
        })
        .collect()
}

/// Max banner line width in columns.
pub fn side_art_width() -> usize {
    BANNER.lines().map(|l| l.chars().count()).max().unwrap_or(0)
}

pub const SIDE_GUTTER: usize = 4;

/// Show the art only when everything fits: art + widest menu row (with
/// indent and block borders) + gutter. Computed, never hard-coded.
pub fn art_visible(term_width: u16) -> bool {
    term_width as usize >= side_art_width() + crate::menu::menu_min_width() + SIDE_GUTTER
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
    fn side_art_is_the_banner() {
        // One source of truth: the side panel draws BANNER itself.
        let art: Vec<String> = side_art_lines()
            .iter()
            .map(|l| l.spans.iter().map(|s| s.content.as_ref()).collect::<String>())
            .collect();
        let banner: Vec<&str> = BANNER.lines().collect();
        assert_eq!(art, banner, "side art == welcome banner rows");
        assert_eq!(side_art_width(), 61, "banner is 61 cols wide");
    }

    #[test]
    fn side_art_threshold_computed() {
        // 61 (art) + 16 (widest item + indent + borders) + 4 (gutter) = 81.
        assert_eq!(side_art_width() + crate::menu::menu_min_width() + SIDE_GUTTER, 81);
        assert!(art_visible(120), "120 cols shows art");
        assert!(art_visible(81), "exact threshold shows art");
        assert!(!art_visible(80), "one below hides art");
    }

    #[test]
    fn side_art_plain_under_no_color() {
        // NOTE: single-env-test pattern — env vars are process-global.
        let prev = std::env::var("NO_COLOR").ok();
        std::env::set_var("NO_COLOR", "1");
        let lines = side_art_lines();
        assert_eq!(lines.len(), BANNER.lines().count(), "one line per banner row");
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
