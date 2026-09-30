//! Markdown → ratatui lines for run outcomes: headings, lists, inline code,
//! fenced code with real syntect highlighting, quotes, rules, links.
//! One [`Line`] per logical source line — never join lines into one Line
//! (that is the wrap-bug class: ratatui wraps those instead of breaking).
//! Unknown languages and highlighter failures degrade to plain text.
use pulldown_cmark::{CodeBlockKind, Event, Parser, Tag, TagEnd};
use ratatui::{
    style::{Color, Modifier, Style},
    text::{Line, Span},
};
use std::sync::OnceLock;
use syntect::{easy::HighlightLines, highlighting::ThemeSet, parsing::SyntaxSet, util::LinesWithEndings};

fn syntax_set() -> &'static SyntaxSet {
    static SET: OnceLock<SyntaxSet> = OnceLock::new();
    SET.get_or_init(SyntaxSet::load_defaults_newlines)
}

fn theme_for(mode: ThemeMode) -> &'static syntect::highlighting::Theme {
    static THEMES: OnceLock<ThemeSet> = OnceLock::new();
    static DARK: OnceLock<syntect::highlighting::Theme> = OnceLock::new();
    static LIGHT: OnceLock<syntect::highlighting::Theme> = OnceLock::new();
    let set = THEMES.get_or_init(ThemeSet::load_defaults);
    match mode {
        ThemeMode::Dark => DARK.get_or_init(|| {
            set.themes
                .get("base16-ocean.dark")
                .cloned()
                .unwrap_or_else(syntect::highlighting::Theme::default)
        }),
        ThemeMode::Light => LIGHT.get_or_init(|| {
            set.themes
                .get("InspiredGitHub")
                .cloned()
                .unwrap_or_else(syntect::highlighting::Theme::default)
        }),
    }
}

fn syn_color(c: syntect::highlighting::Color) -> Color {
    Color::Rgb(c.r, c.g, c.b)
}

fn text_style(bold: bool, italic: bool, code: bool) -> Style {
    let mut s = Style::default();
    if bold {
        s = s.add_modifier(Modifier::BOLD);
    }
    if italic {
        s = s.add_modifier(Modifier::ITALIC);
    }
    if code {
        s = s.fg(Color::Yellow);
    }
    s
}

/// Terminal theme for syntax highlighting. Detection order:
/// `APE_TUI_THEME` (light|dark) wins; otherwise `COLORFGBG`'s background
/// number (>6 means a light background — xterm convention); otherwise dark.
/// Windows conhost/Terminal expose no theme signal, so the env override is
/// the documented path there.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum ThemeMode {
    #[default]
    Dark,
    Light,
}

pub fn theme_mode() -> ThemeMode {
    if let Ok(v) = std::env::var("APE_TUI_THEME") {
        match v.to_ascii_lowercase().as_str() {
            "light" => return ThemeMode::Light,
            "dark" => return ThemeMode::Dark,
            _ => {}
        }
    }
    if let Ok(bg) = std::env::var("COLORFGBG") {
        // Trailing "default" means the terminal default (dark consoles);
        // only a numeric high background flips to light.
        if let Some(last) = bg.rsplit(';').next().and_then(|s| {
            if s.eq_ignore_ascii_case("default") {
                None
            } else {
                s.parse::<u8>().ok()
            }
        }) {
            if last > 6 {
                return ThemeMode::Light;
            }
        }
    }
    ThemeMode::Dark
}

/// Highlight one fenced block into one Line per source line.
fn highlight_block(lang: &str, code: &str, mode: ThemeMode) -> Vec<Line<'static>> {
    let syntax = syntax_set()
        .find_syntax_by_token(lang)
        .unwrap_or_else(|| syntax_set().find_syntax_plain_text());
    let mut out = vec![];
    match HighlightLines::new(syntax, theme_for(mode)) {
        h => {
            let mut h = h;
            for line in LinesWithEndings::from(code) {
                // Strip the trailing newline: one source line, one Line.
                let line = line.strip_suffix('\n').unwrap_or(line);
                match h.highlight_line(line, syntax_set()) {
                    Ok(ranges) => out.push(Line::from(
                        ranges
                            .into_iter()
                            .map(|(style, text)| {
                                Span::styled(text.to_string(), Style::default().fg(syn_color(style.foreground)))
                            })
                            .collect::<Vec<_>>(),
                    )),
                    Err(_) => out.push(Line::from(line.to_string())),
                }
            }
        }
    }
    if out.is_empty() {
        out.push(Line::from(""));
    }
    out
}

fn flush_line(cur: &mut Vec<Span<'static>>, lines: &mut Vec<Line<'static>>) {
    lines.push(Line::from(std::mem::take(cur)));
}

fn push_text(
    t: &str,
    cur: &mut Vec<Span<'static>>,
    lines: &mut Vec<Line<'static>>,
    bold: bool,
    italic: bool,
    code: bool,
    inline_code: bool,
) {
    // A Text event never carries newlines from pulldown except inside
    // code spans (handled separately): split defensively anyway — one
    // logical line per Line, always (the wrap-bug class).
    for (i, part) in t.split('\n').enumerate() {
        if i > 0 {
            flush_line(cur, lines);
        }
        if !part.is_empty() || inline_code {
            cur.push(Span::styled(part.to_string(), text_style(bold, italic, code || inline_code)));
        }
    }
}

pub fn render_markdown(text: &str) -> Vec<Line<'static>> {
    render_markdown_themed(text, theme_mode())
}

pub fn render_markdown_themed(text: &str, mode: ThemeMode) -> Vec<Line<'static>> {
    let mut lines: Vec<Line<'static>> = vec![];
    let mut cur: Vec<Span<'static>> = vec![];
    let mut bold = false;
    let mut italic = false;
    let mut inline_code = false;
    let mut list_depth: usize = 0;
    let mut in_code = false;
    let mut code_lang = String::new();
    let mut code_buf = String::new();
    let mut quote = false;
    let mut pending_link: Option<String> = None;

    for ev in Parser::new(text) {
        match ev {
            Event::Start(Tag::Heading { level, .. }) => {
                let hashes = "#".repeat(level as usize);
                cur.push(Span::styled(
                    format!("{hashes} "),
                    Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD),
                ));
                bold = true;
            }
            Event::End(TagEnd::Heading(..)) => {
                bold = false;
                flush_line(&mut cur, &mut lines);
            }
            Event::Start(Tag::List(..)) => list_depth += 1,
            Event::End(TagEnd::List(..)) => list_depth = list_depth.saturating_sub(1),
            Event::Start(Tag::Item) => {
                let pad = "  ".repeat(list_depth.saturating_sub(1));
                cur.push(Span::raw(format!("{pad}• ")));
            }
            Event::End(TagEnd::Item) => flush_line(&mut cur, &mut lines),
            // Paragraph end flushes: without this, a paragraph runs into
            // whatever opens next (e.g. the first list bullet lands on the
            // paragraph's line).
            Event::End(TagEnd::Paragraph) => flush_line(&mut cur, &mut lines),
            Event::Start(Tag::CodeBlock(kind)) => {
                in_code = true;
                code_lang = match kind {
                    CodeBlockKind::Fenced(info) => info.split([' ', ',']).next().unwrap_or("").to_string(),
                    CodeBlockKind::Indented => String::new(),
                };
                code_buf.clear();
            }
            Event::End(TagEnd::CodeBlock) => {
                in_code = false;
                lines.extend(highlight_block(&code_lang, &code_buf, mode));
                code_buf.clear();
            }
            Event::Start(Tag::BlockQuote(_)) => quote = true,
            Event::End(TagEnd::BlockQuote(_)) => {
                quote = false;
                flush_line(&mut cur, &mut lines);
            }
            Event::Start(Tag::Emphasis) => italic = true,
            Event::End(TagEnd::Emphasis) => italic = false,
            Event::Start(Tag::Strong) => bold = true,
            Event::End(TagEnd::Strong) => bold = false,
            Event::Start(Tag::Link { dest_url, .. }) => {
                pending_link = Some(dest_url.to_string());
            }
            Event::End(TagEnd::Link) => {
                if let Some(url) = pending_link.take() {
                    cur.push(Span::styled(format!(" ({url})"), Style::default().fg(Color::DarkGray)));
                }
            }
            Event::Start(Tag::Image { dest_url, .. }) => {
                cur.push(Span::styled(
                    format!("[image: {dest_url}]"),
                    Style::default().fg(Color::DarkGray),
                ));
            }
            Event::End(TagEnd::Image) => {}
            Event::Start(_) | Event::End(_) => {}
            Event::Text(t) => {
                if in_code {
                    code_buf.push_str(&t);
                } else if quote && cur.is_empty() {
                    cur.push(Span::styled("│ ", Style::default().fg(Color::DarkGray)));
                    push_text(&t, &mut cur, &mut lines, bold, italic, false, inline_code);
                } else {
                    push_text(&t, &mut cur, &mut lines, bold, italic, false, inline_code);
                }
            }
            Event::Code(c) => {
                cur.push(Span::styled(c.to_string(), text_style(bold, italic, true)));
            }
            Event::Html(h) | Event::InlineHtml(h) => {
                push_text(&h, &mut cur, &mut lines, bold, italic, false, inline_code)
            }
            Event::FootnoteReference(_) => {}
            Event::InlineMath(m) | Event::DisplayMath(m) => {
                cur.push(Span::styled(m.to_string(), text_style(bold, italic, true)));
            }
            Event::SoftBreak | Event::HardBreak => flush_line(&mut cur, &mut lines),
            Event::Rule => lines.push(Line::from(Span::styled(
                "─".repeat(30),
                Style::default().fg(Color::DarkGray),
            ))),
            Event::TaskListMarker(done) => {
                cur.push(Span::raw(if done { "[x] ".to_string() } else { "[ ] ".to_string() }));
            }
        }
    }
    if !cur.is_empty() {
        lines.push(Line::from(cur));
    }
    // Paragraph ends leave an empty trailing line; trim empties at the end
    // so outcomes don't dangle blank space (spacing between blocks stays).
    while lines.last().map(|l| l.width() == 0).unwrap_or(false) {
        lines.pop();
    }
    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    fn flat(lines: &[Line]) -> String {
        lines
            .iter()
            .map(|l| l.spans.iter().map(|s| s.content.as_ref()).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[test]
    fn headings_lists_code_and_quote() {
        let out = render_markdown("# Title\n\n- one\n- two\n\n> note\n\n`x`\n");
        let t = flat(&out);
        assert!(t.contains("# Title"), "heading kept, got:\n{t}");
        assert!(t.contains("• one") && t.contains("• two"), "bullets, got:\n{t}");
        assert!(t.contains("│ note"), "quote, got:\n{t}");
        assert!(out.iter().any(|l| l
            .spans
            .iter()
            .any(|s| s.content == "x" && s.style.fg == Some(Color::Yellow))), "inline code tinted");
    }

    #[test]
    fn fenced_block_highlights_rust() {
        let out = render_markdown("```rust\nfn main() {}\n```\n");
        assert_eq!(out.len(), 1, "one source line, one Line");
        let spans = &out[0].spans;
        assert!(spans.len() > 1, "highlighted into styled runs, got {spans:?}");
        assert!(spans.iter().any(|s| matches!(s.style.fg, Some(Color::Rgb(..)))), "real syntect colors");
        assert_eq!(flat(&out), "fn main() {}");
    }

    #[test]
    fn unknown_language_degrades_to_plain() {
        let out = render_markdown("```nosuchlang\nhello world\n```\n");
        assert_eq!(flat(&out), "hello world");
    }

    #[test]
    fn one_line_per_line_never_joined() {
        let out = render_markdown("a\nb\n\nc\n");
        for l in &out {
            assert!(!l.spans.iter().any(|s| s.content.contains('\n')), "no embedded newlines");
        }
        assert!(flat(&out).contains('a') && flat(&out).contains('c'));
    }

    #[test]
    fn empty_and_plain() {
        assert!(render_markdown("").is_empty());
        let out = render_markdown("just text");
        assert_eq!(flat(&out), "just text");
    }

    #[test]
    fn theme_override_and_colorfgbg() {
        // Env override wins; COLORFGBG background >6 means light; else dark.
        // NOTE: single test on purpose — env vars are process-global and
        // Rust runs tests on threads, so split tests would race.
        let prev_theme = std::env::var("APE_TUI_THEME").ok();
        let prev_bg = std::env::var("COLORFGBG").ok();
        std::env::remove_var("COLORFGBG");
        std::env::set_var("APE_TUI_THEME", "light");
        assert_eq!(theme_mode(), ThemeMode::Light);
        std::env::set_var("APE_TUI_THEME", "dark");
        assert_eq!(theme_mode(), ThemeMode::Dark);
        std::env::set_var("APE_TUI_THEME", "banana");
        assert_eq!(theme_mode(), ThemeMode::Dark, "unknown value falls back");
        std::env::remove_var("APE_TUI_THEME");
        std::env::set_var("COLORFGBG", "0;default;15");
        assert_eq!(theme_mode(), ThemeMode::Light);
        std::env::set_var("COLORFGBG", "0;default;0");
        assert_eq!(theme_mode(), ThemeMode::Dark);
        std::env::remove_var("COLORFGBG");
        assert_eq!(theme_mode(), ThemeMode::Dark, "no signal means dark");
        match (prev_theme, prev_bg) {
            (Some(t), Some(b)) => {
                std::env::set_var("APE_TUI_THEME", t);
                std::env::set_var("COLORFGBG", b);
            }
            (Some(t), None) => {
                std::env::set_var("APE_TUI_THEME", t);
                std::env::remove_var("COLORFGBG");
            }
            (None, Some(b)) => {
                std::env::remove_var("APE_TUI_THEME");
                std::env::set_var("COLORFGBG", b);
            }
            (None, None) => {
                std::env::remove_var("APE_TUI_THEME");
                std::env::remove_var("COLORFGBG");
            }
        }
    }

    #[test]
    fn light_theme_highlights_too() {
        let out = render_markdown_themed("```rust\nfn main() {}\n```\n", ThemeMode::Light);
        assert_eq!(flat(&out), "fn main() {}");
        assert!(out[0].spans.iter().any(|s| matches!(s.style.fg, Some(Color::Rgb(..)))));
    }
}
