//! Screens: welcome is fully implemented; onboard/menu land in Milestone 2.
//! Each screen is a pure render + input-transition pair so navigation logic
//! is unit-testable without a terminal.
use ratatui::{
    layout::{Alignment, Constraint, Direction, Layout},
    style::{Color, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph},
    Frame,
};

pub const BANNER: &str = include_str!("../assets/ape.txt");

#[derive(Debug, PartialEq, Clone, Copy)]
pub enum Screen {
    Welcome,
    /// Milestone 2: onboarding gallery + guided demo.
    Onboard,
    /// Milestone 2: main menu.
    Menu,
}

#[derive(Debug, PartialEq)]
pub enum Nav {
    Stay,
    Quit,
    Goto(Screen),
}

/// Key input transition for the welcome screen. Pure: easy to test.
pub fn welcome_input(key: char) -> Nav {
    match key {
        'q' | 'Q' => Nav::Quit,
        _ => Nav::Goto(Screen::Onboard),
    }
}

pub fn render_welcome(f: &mut Frame, version: &str) {
    let area = f.area();
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(3)])
        .split(area);
    let body = vec![
        Line::from(""),
        Line::from(Span::styled(
            BANNER.trim_end(),
            Style::default().fg(Color::Cyan),
        )),
        Line::from(""),
        Line::from(Span::styled(
            format!("ape-mcp {version} · budgets · receipts · guardrails"),
            Style::default().fg(Color::DarkGray),
        )),
    ];
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
    fn banner_asset_loads() {
        assert!(BANNER.contains("APE"), "banner names the product");
        assert!(BANNER.lines().count() >= 3, "banner is multi-line art");
    }

    #[test]
    fn welcome_quits_on_q() {
        assert_eq!(welcome_input('q'), Nav::Quit);
        assert_eq!(welcome_input('Q'), Nav::Quit);
    }

    #[test]
    fn welcome_advances_on_anything_else() {
        assert_eq!(welcome_input('\r'), Nav::Goto(Screen::Onboard));
        assert_eq!(welcome_input(' '), Nav::Goto(Screen::Onboard));
    }

    #[test]
    fn welcome_renders_banner_and_hints() {
        use ratatui::{backend::TestBackend, Terminal};
        let backend = TestBackend::new(60, 20);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(|f| render_welcome(f, "0.1.0")).unwrap();
        let text = terminal
            .backend()
            .buffer()
            .content()
            .iter()
            .map(|c| c.symbol())
            .collect::<String>();
        assert!(text.contains("APE"), "banner visible");
        assert!(text.contains("0.1.0"), "version visible");
        assert!(text.contains("Enter"), "hint visible");
    }
}
