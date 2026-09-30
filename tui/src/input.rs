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
    /// Alt+Enter: newline inside multiline editors (where the terminal
    /// delivers it; otherwise Enter alone sends).
    AltEnter,
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

    /// Replace the whole text (history recall). Cursor goes to the end.
    pub fn replace(&mut self, s: &str) {
        self.chars = s.chars().collect();
        self.cursor = self.chars.len();
    }

    /// (line, column) of the cursor, both 0-based. Multiline editors render
    /// the cursor block from this; single-line use ignores the line.
    pub fn line_col(&self) -> (usize, usize) {
        let mut line = 0;
        let mut col = 0;
        for (i, c) in self.chars.iter().enumerate() {
            if i == self.cursor {
                break;
            }
            if *c == '\n' {
                line += 1;
                col = 0;
            } else {
                col += 1;
            }
        }
        (line, col)
    }

    fn line_start(&self, mut pos: usize) -> usize {
        while pos > 0 && self.chars[pos - 1] != '\n' {
            pos -= 1;
        }
        pos
    }

    /// Move up one visual line, keeping the column when the line above is
    /// long enough. No-op on the first line.
    pub fn move_up(&mut self) {
        let start = self.line_start(self.cursor);
        if start == 0 {
            return;
        }
        let col = self.cursor - start;
        let prev_end = start - 1; // the '\n' ending the previous line
        let prev_start = self.line_start(prev_end);
        let prev_len = prev_end - prev_start;
        self.cursor = prev_start + col.min(prev_len);
    }

    /// Move down one visual line, keeping the column. No-op on the last.
    pub fn move_down(&mut self) {
        let start = self.line_start(self.cursor);
        let mut end = start;
        while end < self.chars.len() && self.chars[end] != '\n' {
            end += 1;
        }
        if end >= self.chars.len() {
            return; // last line (no '\n' after it)
        }
        let col = self.cursor - start;
        let next_start = end + 1;
        let mut next_end = next_start;
        while next_end < self.chars.len() && self.chars[next_end] != '\n' {
            next_end += 1;
        }
        self.cursor = next_start + col.min(next_end - next_start);
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

    #[test]
    fn multiline_up_down_keeps_column() {
        let mut e = LineEditor::with_text("abc\nde\nfghij");
        // Cursor at end (line 2, col 5). Up -> line 1, col 2 (short line).
        e.move_up();
        assert_eq!(e.line_col(), (1, 2));
        // Up -> line 0, col 2.
        e.move_up();
        assert_eq!(e.line_col(), (0, 2));
        // Up on first line: no-op.
        e.move_up();
        assert_eq!(e.line_col(), (0, 2));
        // Down -> line 1 col 2, down -> line 2 col 2, down: no-op.
        e.move_down();
        assert_eq!(e.line_col(), (1, 2));
        e.move_down();
        assert_eq!(e.line_col(), (2, 2));
        e.move_down();
        assert_eq!(e.line_col(), (2, 2));
    }

    #[test]
    fn replace_and_newline_edit() {
        let mut e = LineEditor::new();
        e.replace("hi");
        assert_eq!(e.cursor(), 2);
        e.insert('\n');
        e.insert('x');
        assert_eq!(e.text(), "hi\nx");
        assert_eq!(e.line_col(), (1, 1));
        e.backspace();
        e.backspace();
        assert_eq!(e.text(), "hi", "backspace eats the newline, then stops");
    }
}
