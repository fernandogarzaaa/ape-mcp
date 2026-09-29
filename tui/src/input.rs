//! Single-line text editor for prompts (objective, run id, ...).
//! Pure logic, no I/O: fully unit-tested.

/// Terminal input normalized by the main loop: arrow keys are first-class
/// citizens (Up/Down move selection, Left/Right move the editor cursor);
/// printable characters fall through as `Char`. `j`/`k` are handled by each
/// screen as secondary (vim-style) aliases, never the only way to move.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Key {
    Up,
    Down,
    Left,
    Right,
    Enter,
    Esc,
    Backspace,
    Char(char),
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct LineEditor {
    chars: Vec<char>,
    cursor: usize,
}

impl LineEditor {
    pub fn new() -> Self {
        Self::default()
    }

    /// Prefilled editor. Only exercised by tests today; kept as the obvious
    /// constructor for pre-filled prompts (retained deliberately).
    #[allow(dead_code)]
    pub fn with_text(s: &str) -> Self {
        let chars: Vec<char> = s.chars().collect();
        let cursor = chars.len();
        Self { chars, cursor }
    }

    pub fn insert(&mut self, c: char) {
        self.chars.insert(self.cursor, c);
        self.cursor += 1;
    }

    pub fn backspace(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
            self.chars.remove(self.cursor);
        }
    }

    pub fn move_left(&mut self) {
        self.cursor = self.cursor.saturating_sub(1);
    }

    pub fn move_right(&mut self) {
        if self.cursor < self.chars.len() {
            self.cursor += 1;
        }
    }

    pub fn text(&self) -> String {
        self.chars.iter().collect()
    }

    pub fn is_empty(&self) -> bool {
        self.chars.is_empty()
    }

    /// Cursor column (chars, not bytes). Test-covered; render uses it once
    /// positional cursor drawing lands.
    #[allow(dead_code)]
    pub fn cursor(&self) -> usize {
        self.cursor
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn insert_and_text() {
        let mut e = LineEditor::new();
        for c in "hi!".chars() {
            e.insert(c);
        }
        assert_eq!(e.text(), "hi!");
        assert_eq!(e.cursor(), 3);
    }

    #[test]
    fn backspace_at_start_is_noop() {
        let mut e = LineEditor::new();
        e.backspace();
        assert!(e.is_empty(), "backspace on empty editor does nothing");
        e.insert('a');
        e.move_left();
        e.backspace();
        assert_eq!(e.text(), "a", "backspace at column 0 deletes nothing");
        e.move_right();
        e.backspace();
        assert!(e.is_empty(), "backspace after the char deletes it");
    }

    #[test]
    fn cursor_clamps() {
        let mut e = LineEditor::with_text("ab");
        e.move_right();
        e.move_right();
        assert_eq!(e.cursor(), 2);
        e.insert('c');
        assert_eq!(e.text(), "abc");
    }

    #[test]
    fn mid_line_edit() {
        let mut e = LineEditor::with_text("ac");
        e.move_left();
        e.insert('b');
        assert_eq!(e.text(), "abc");
    }
}
