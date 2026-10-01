//! M0 snapshot harness: scripted keystrokes through the REAL state machines
//! (`welcome_input`, `Onboard::on_key`, `Menu::on_key`) + real renderers,
//! captured via ratatui `TestBackend` into `snapshots/` as plain text.
//! No pty, no API key, deterministic. Run with `npm run tui:snap`
//! (runs the real-entrypoint capture first, then this).
//!
//! Data provenance per snapshot:
//! - canned: hand-written backend stand-ins (doctor lines, profiles).
//! - real: `snapshots/real-status.json` from `scripts/tui-capture.mjs`
//!   (a genuine mock run through `ape-mcp run` + `ape_agent_status`,
//!   stretched by APE_MOCK_STEP_DELAY_MS so real `running` frames exist).
//!
//! Volatile bits (run ids) are normalized to `run-<id>` so diffs are clean.
#[cfg(test)]
mod snap_impl {
    use crate::input::Key;
    use crate::menu::{self, Menu, MenuView};
    use crate::onboard::{DemoState, Onboard, Step};
    use crate::screens::render_welcome;
    use crate::{render_menu, render_onboard};
    use ratatui::{backend::TestBackend, Terminal};
    use std::path::PathBuf;

    fn snap_dir() -> PathBuf {
        if let Ok(d) = std::env::var("SNAP_DIR") {
            return PathBuf::from(d);
        }
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../snapshots")
    }

    fn normalize(mut text: String) -> String {
        let mut out = String::with_capacity(text.len());
        let mut rest = text.as_str();
        // run-<12 hex> -> run-<id>
        while let Some(i) = rest.find("run-") {
            out.push_str(&rest[..i]);
            let tail = &rest[i + 4..];
            let hexlen = tail.chars().take_while(|c| c.is_ascii_hexdigit() || *c == '-').count();
            if hexlen >= 4 {
                out.push_str("run-<id>");
                rest = &tail[hexlen..];
            } else {
                out.push_str("run-");
                rest = tail;
            }
        }
        out.push_str(rest);
        text = out;
        text
    }

    fn shot(name: &str, w: u16, h: u16, draw: impl FnOnce(&mut ratatui::Frame)) {
        let backend = TestBackend::new(w, h);
        let mut terminal = Terminal::new(backend).unwrap();
        terminal.draw(draw).unwrap();
        let buf = terminal.backend().buffer().clone();
        let mut lines: Vec<String> = vec![];
        for y in 0..h {
            let mut row = String::new();
            for x in 0..w {
                row.push_str(buf[(x, y)].symbol());
            }
            lines.push(row.trim_end().to_string());
        }
        while lines.last().map(|l| l.is_empty()).unwrap_or(false) {
            lines.pop();
        }
        let dir = snap_dir();
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(format!("{name}-{w}x{h}.txt")), normalize(lines.join("\n") + "\n")).unwrap();
        println!("snap: {name}-{w}x{h}");
    }

    fn canned_profiles() -> Vec<(String, String)> {
        vec![
            ("deep-researcher".to_string(), "Broad web research".to_string()),
            ("fact-checker".to_string(), "Verifies a single claim".to_string()),
            ("writer".to_string(), "Drafts prose".to_string()),
        ]
    }

    fn canned_doctor() -> &'static str {
        "ok    node>=22.5\nok    node:sqlite\nFAIL  vendors/adam\n"
    }

    fn canned_status() -> serde_json::Value {
        serde_json::from_str(r#"{"active_provider":{"provider":"opencode","source":"opencode session"},"provider_sources":[{"provider":"opencode","source":"opencode session","default_model":"muse-spark"},{"provider":"mock","source":"builtin","default_model":"mock-model"}]}"#).unwrap()
    }

    fn canned_limits() -> std::collections::HashMap<String, menu::ProfileLimits> {
        [("repo-triage".to_string(), menu::ProfileLimits {
            max_steps: Some(12),
            max_usd: Some(0.5),
            max_tokens: Some(120000),
        })]
        .into_iter()
        .collect()
    }

    fn canned_poll(i: usize, terminal: bool) -> serde_json::Value {
        let steps: Vec<String> = (1..=i)
            .map(|n| {
                format!(
                    r#"{{"step":{n},"kind":"tool","tool":"skein.orchestrate","duration_ms":120,"tokens":40,"cost":0.01,"result_summary":"ok {n}"}}"#
                )
            })
            .collect();
        serde_json::from_str(&format!(
            r#"{{"run_id":"run-abc123","status":"{}","stop_reason":{},"step_count":{},"total_cost":0.01,"total_tokens":80,"outcome":"{}","steps":[{}]}}"#,
            if terminal { "done" } else { "running" },
            if terminal { "\"explicit_final_answer\"" } else { "null" },
            i,
            if terminal { "snapshot ok" } else { "" },
            steps.join(","),
        ))
        .unwrap()
    }

    /// Real status samples when the capture script has run; otherwise None
    /// (caller falls back to canned and says so in the report).
    fn real_samples() -> Option<Vec<serde_json::Value>> {
        let text = std::fs::read_to_string(snap_dir().join("real-status.json")).ok()?;
        let v: serde_json::Value = serde_json::from_str(&text).ok()?;
        v.get("samples")?.as_array().cloned()
    }

    #[test]
    fn snap_all() {
        for (w, h) in [(120u16, 40u16), (80u16, 24u16)] {
            shot("welcome", w, h, |f| render_welcome(f, "1.0.4"));
        }

        // --- Onboarding: real key flow Doctor -> Provider -> Profile.
        let mut ob = Onboard::new();
        ob.apply_doctor(canned_doctor());
        shot("onboard-doctor", 80, 24, |f| render_onboard(&ob, f));
        let (fx, _) = ob.on_key(Key::Enter);
        assert_eq!(fx.len(), 1, "doctor->provider requests LoadProviders");
        ob.apply_providers(&canned_status());
        shot("onboard-provider", 80, 24, |f| render_onboard(&ob, f));
        let _ = ob.on_key(Key::Enter);
        ob.apply_profiles(canned_profiles());
        ob.on_key(Key::Down);
        for (w, h) in [(120u16, 40u16), (80u16, 24u16)] {
            shot("onboard-profile", w, h, |f| render_onboard(&ob, f));
        }

        // --- Demo states.
        for (name, demo) in [
            ("onboard-demo-polling", DemoState::Polling { run_id: "run-abc123".to_string() }),
            ("onboard-demo-failed", DemoState::Failed("no model provider detected".to_string())),
            (
                "onboard-demo-finished",
                DemoState::Finished { summary: "status=done stop=explicit_final_answer steps=2 cost_usd=0".to_string() },
            ),
        ] {
            let mut ob = Onboard::new();
            ob.step = Step::Demo;
            ob.demo = demo;
            shot(name, 80, 24, |f| render_onboard(&ob, f));
        }

        // --- Menu: real key flow down/down + enter into CheckId, typing.
        let mut m = Menu::new();
        m.on_key(Key::Down);
        m.on_key(Key::Down);
        for (w, h) in [(120u16, 40u16), (80u16, 24u16)] {
            shot("menu-main", w, h, |f| {
                let mut m2 = Menu::new();
                m2.on_key(Key::Down);
                m2.on_key(Key::Down);
                render_menu(&m2, f);
            });
        }
        // Threshold pair: art at exactly 81 cols, gone at 80 (covered by
        // menu-main-80x24 above).
        shot("menu-art-edge", 81, 24, |f| {
            let mut m2 = Menu::new();
            render_menu(&m2, f);
        });
        let _ = m;
        let mut m = Menu::new();
        let (fx, _) = m.on_key(Key::Enter); // Run an agent
        assert_eq!(fx, vec![menu::MenuEffect::LoadProfiles]);
        m.apply_profiles(canned_profiles(), canned_limits());
        m.on_key(Key::Down);
        shot("menu-run-profile", 80, 24, |f| render_menu(&m, f));
        let _ = m.on_key(Key::Enter); // -> RunObjective
        for c in "triage the inbox".chars() {
            m.on_key(Key::Char(c));
        }
        m.on_key(Key::Left);
        m.on_key(Key::Left);
        shot("menu-objective", 80, 24, |f| render_menu(&m, f));
        // Multiline objective (Alt+Enter newline) with cursor on line 2.
        let mut m = Menu::new();
        m.view = MenuView::RunObjective {
            profile: "repo-triage".to_string(),
            editor: crate::input::LineEditor::new(),
            slash_sel: 0,
        };
        for c in "triage the inbox".chars() {
            m.on_key(Key::Char(c));
        }
        m.on_key(Key::AltEnter);
        for c in "starting with login".chars() {
            m.on_key(Key::Char(c));
        }
        m.on_key(Key::Left);
        m.on_key(Key::Left);
        shot("menu-objective-multi", 80, 24, |f| render_menu(&m, f));
        // Slash menu: fuzzy matches, same destinations as the menu.
        let mut m = Menu::new();
        m.view = MenuView::RunObjective {
            profile: "repo-triage".to_string(),
            editor: crate::input::LineEditor::with_text("/ru"),
            slash_sel: 0,
        };
        shot("menu-slash", 80, 24, |f| render_menu(&m, f));

        // --- Run progress: drive apply_poll with REAL samples so the
        // timeline diff/append path is exercised, not hand-built.
        let real = real_samples();
        let running_frames: Vec<serde_json::Value> = real
            .as_ref()
            .map(|s| {
                s.iter()
                    .filter(|v| v.get("status").and_then(|x| x.as_str()) != Some("done"))
                    .cloned()
                    .collect()
            })
            .unwrap_or_default();
        let done_value = real
            .as_ref()
            .and_then(|s| s.iter().find(|v| v.get("status").and_then(|x| x.as_str()) == Some("done")).cloned())
            .unwrap_or_else(|| canned_poll(2, true));
        // Start a real run flow: profile pick carries limits into the budget.
        let mut m = Menu::new();
        m.apply_profiles(canned_profiles(), canned_limits());
        m.apply_run_started(
            done_value.get("run_id").and_then(|r| r.as_str()).unwrap_or("run-abc123").to_string(),
            "repo-triage".to_string(),
        );
        // Feed the first two genuine running frames (or canned fallback).
        let frames: Vec<serde_json::Value> = if running_frames.len() >= 2 {
            running_frames[..2].to_vec()
        } else {
            vec![canned_poll(1, false), canned_poll(2, false)]
        };
        for fr in &frames {
            m.apply_poll(fr);
        }
        for (w, h) in [(120u16, 40u16), (80u16, 24u16)] {
            shot("menu-progress", w, h, |f| {
                let mut m2 = Menu::new();
                m2.apply_run_started("run-abc123".to_string(), "repo-triage".to_string());
                m2.apply_poll(&canned_poll(1, false));
                m2.apply_poll(&canned_poll(2, false));
                render_menu(&m2, f);
            });
        }
        // Real-data progress frame (80x24 only; ids normalized).
        shot("menu-progress-real", 80, 24, |f| render_menu(&m, f));
        // Expanded step: full summary lines, one Line each.
        m.on_key(Key::Up);
        m.on_key(Key::Enter);
        shot("menu-progress-expanded", 80, 24, |f| render_menu(&m, f));
        // Natural finish keeps the id.
        let mut m = Menu::new();
        m.apply_run_started(
            done_value.get("run_id").and_then(|r| r.as_str()).unwrap_or("run-abc123").to_string(),
            "repo-triage".to_string(),
        );
        m.apply_poll(&done_value);
        shot("menu-done", 80, 24, |f| render_menu(&m, f));
        // Model-error JSON outcome renders human, not raw.
        let mut m = Menu::new();
        let err_status: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"run-abc123","status":"failed","stop_reason":"model_error","step_count":2,"total_cost":0.01,"total_tokens":50,"outcome":"{\"error\":\"opencode 500\",\"message\":\"Internal server error\"}"}"#,
        )
        .unwrap();
        m.apply_run_started("run-abc123".to_string(), "repo-triage".to_string());
        m.apply_poll(&err_status);
        shot("menu-done-error", 80, 24, |f| render_menu(&m, f));
        // Markdown outcome (canned text, real renderer): headings, list,
        // inline code, and a highlighted fenced block.
        let mut m = Menu::new();
        m.view = MenuView::RunDone {
            run_id: "run-abc123".to_string(),
            summary: "finished · 3 steps · $0.02 · 120 tokens · stopped: explicit_final_answer\n# Verdict\n\nThe claim holds:\n\n- checked `ledger.ts` against the receipt\n- reran the probe twice\n\n```js\nconst ok = verify(receipt);\n```\n\nDone.".to_string(),
        };
        for (w, h) in [(120u16, 40u16), (80u16, 24u16)] {
            shot("menu-done-md", w, h, |f| render_menu(&m, f));
        }
        // Cancelled run keeps the id and stays pollable.
        let mut m = Menu::new();
        m.apply_run_started("run-abc123".to_string(), "repo-triage".to_string());
        m.apply_poll(&canned_poll(1, false));
        let cancelled: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"run-abc123","status":"stopped","stop_reason":"cancelled","step_count":1,"total_cost":0.01,"total_tokens":40,"outcome":""}"#,
        )
        .unwrap();
        m.apply_cancelled("run-abc123".to_string(), &cancelled);
        shot("menu-cancelled", 80, 24, |f| render_menu(&m, f));
        // Denied block expanded: marker + reason from the row.
        let mut m = Menu::new();
        m.apply_profiles(canned_profiles(), canned_limits());
        m.apply_run_started("run-abc123".to_string(), "repo-triage".to_string());
        let denied: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"run-abc123","status":"running","step_count":1,"total_cost":0,"total_tokens":2,"steps":[{"step":1,"kind":"model","tool":"","duration_ms":407,"tokens":2,"cost":0,"result_summary":""},{"step":2,"kind":"tool","tool":"adam.evolve","duration_ms":1,"tokens":0,"cost":0,"result_summary":"destructive:denied: this profile denies unattended destructive calls; finish with a proposal"}]}"#,
        )
        .unwrap();
        m.apply_poll(&denied);
        m.on_key(Key::Enter);
        shot("menu-denied", 80, 24, |f| render_menu(&m, f));

        // --- Check flow.
        let mut m = Menu::new();
        m.view = MenuView::CheckId { editor: crate::input::LineEditor::new() };
        for c in "run-abc123".chars() {
            m.on_key(Key::Char(c));
        }
        shot("menu-check-id", 80, 24, |f| render_menu(&m, f));
        let mut m = Menu::new();
        m.view = MenuView::CheckShow { text: menu::status_text(&done_value), blocks: vec![] };
        shot("menu-check-show", 80, 24, |f| render_menu(&m, f));
        // Check 2 proof: a cancelled run opened by id shows its marker.
        let cancelled_status: serde_json::Value = serde_json::from_str(
            r#"{"run_id":"run-abc123","status":"stopped","stop_reason":"cancelled","step_count":1,"total_cost":0.01,"total_tokens":40,"outcome":"","steps":[{"step":1,"kind":"tool","tool":"skein.orchestrate","duration_ms":120,"tokens":40,"cost":0.01,"result_summary":"ok"},{"step":2,"kind":"cancel","tool":"skein.orchestrate","duration_ms":0,"tokens":0,"cost":0,"result_summary":"interrupted:cancelled after step 1 (skein.orchestrate) — in-flight work discarded, no graceful drain"}]}"#,
        )
        .unwrap();
        let mut m = Menu::new();
        m.apply_check_status(&cancelled_status);
        shot("menu-check-cancelled", 80, 24, |f| render_menu(&m, f));

        // --- Lists / info.
        let mut m = Menu::new();
        m.apply_profiles(canned_profiles(), canned_limits());
        m.view = MenuView::ProfilesList { profiles: canned_profiles(), offset: 0 };
        shot("menu-profiles", 80, 24, |f| render_menu(&m, f));
        let mut m = Menu::new();
        m.view = MenuView::DoctorShow { text: "ok    node>=22.5\nFAIL  vendors/adam".to_string() };
        shot("menu-doctor", 80, 24, |f| render_menu(&m, f));
        // --- Status view (real shape, canned values).
        let mut m = Menu::new();
        let status: serde_json::Value = serde_json::from_str(
            r#"{"version":"1.0.4","protocol":"2026-07-28","active_provider":{"provider":"opencode","source":"opencode session"},"engines":{"genesis":"vendored","eve":"vendored","adam":"vendored","skein":"vendored"},"detected_providers":["opencode"]}"#,
        )
        .unwrap();
        m.apply_status(&status);
        shot("menu-status", 80, 24, |f| render_menu(&m, f));
        // --- Provider view (shared form, canned status) + tested state.
        let mut m = Menu::new();
        m.view = MenuView::ProviderForm(crate::provider::ProviderForm::new());
        m.apply_providers_list(
            &serde_json::from_str(
                r#"{"active_provider":{"provider":"opencode","source":"opencode session"},"provider_sources":[{"provider":"opencode","source":"opencode session","default_model":"muse-spark"},{"provider":"mock","source":"builtin","default_model":"mock-model"}]}"#,
            )
            .unwrap(),
        );
        shot("menu-provider", 80, 24, |f| render_menu(&m, f));
        if let MenuView::ProviderForm(form) = &mut m.view {
            form.apply_test(&serde_json::from_str(r#"{"ok":true,"latency_ms":321,"cost_usd":0.001}"#).unwrap());
        }
        shot("menu-provider-tested", 80, 24, |f| render_menu(&m, f));
        let mut m = Menu::new();
        m.view = MenuView::ConsoleInfo;
        shot("menu-console", 80, 24, |f| render_menu(&m, f));

        // --- M4 views: Runs / Ledger / Tasks (canned data, real paths).
        let mut m = Menu::new();
        m.view = MenuView::RunsList { runs: vec![], selected: 0, offset: 0, note: "loading runs…".to_string() };
        m.apply_runs(
            vec![
                (("run-aaa111", "repo-triage", "running", "", 0.01, 3, "2026-09-30 10:11")),
                (("run-bbb222", "writer", "done", "explicit_final_answer", 0.12, 8, "2026-09-30 09:02")),
                (("run-ccc333", "fact-checker", "stopped", "cancelled", 0.0, 1, "2026-09-29 18:44")),
            ]
            .into_iter()
            .map(|(id, profile, status, stop, cost, steps, started)| menu::RunRow {
                run_id: id.to_string(),
                profile: profile.to_string(),
                status: status.to_string(),
                stop_reason: stop.to_string(),
                cost,
                steps,
                started: started.to_string(),
            })
            .collect(),
            String::new(),
        );
        m.on_key(Key::Down);
        for (w, h) in [(120u16, 40u16), (80u16, 24u16)] {
            shot("menu-runs", w, h, |f| {
                let mut m2 = Menu::new();
                m2.view = MenuView::RunsList { runs: vec![], selected: 0, offset: 0, note: String::new() };
                m2.apply_runs(
                    vec![menu::RunRow {
                        run_id: "run-aaa111".to_string(),
                        profile: "repo-triage".to_string(),
                        status: "running".to_string(),
                        stop_reason: String::new(),
                        cost: 0.01,
                        steps: 3,
                        started: "2026-09-30 10:11".to_string(),
                    }],
                    String::new(),
                );
                render_menu(&m2, f);
            });
        }
        shot("menu-runs-full", 80, 24, |f| render_menu(&m, f));
        // Empty runs.
        let mut m = Menu::new();
        m.view = MenuView::RunsList { runs: vec![], selected: 0, offset: 0, note: String::new() };
        shot("menu-runs-empty", 80, 24, |f| render_menu(&m, f));

        // Ledger: entries + filter cycle + empty.
        let mut m = Menu::new();
        m.view = MenuView::LedgerList {
            entries: vec![],
            offset: 0,
            filter: menu::LedgerFilter::All,
            note: "loading ledger…".to_string(),
        };
        m.apply_ledger(
            vec![
                menu::LedgerEntry { ts: "2026-09-30T10:11:12".to_string(), kind: "agent.destructive".to_string(), summary: "tool=ape_evolve verdict=denied".to_string() },
                menu::LedgerEntry { ts: "2026-09-30T09:02:00".to_string(), kind: "genesis.audit".to_string(), summary: "suite=code verdict=SOUND".to_string() },
            ],
            String::new(),
        );
        shot("menu-ledger", 80, 24, |f| render_menu(&m, f));
        m.on_key(Key::Char('f'));
        shot("menu-ledger-filtered", 80, 24, |f| render_menu(&m, f));
        let mut m = Menu::new();
        m.view = MenuView::LedgerList {
            entries: vec![],
            offset: 0,
            filter: menu::LedgerFilter::All,
            note: "no entries yet".to_string(),
        };
        shot("menu-ledger-empty", 80, 24, |f| render_menu(&m, f));

        // Tasks: graph text + error state.
        let mut m = Menu::new();
        m.view = MenuView::TasksShow {
            text: "graph: 3 nodes\n- plan [done]\n- execute [claimed by worker-1]\n- verify [open]".to_string(),
        };
        shot("menu-tasks", 80, 24, |f| render_menu(&m, f));
        let mut m = Menu::new();
        m.view = MenuView::TasksShow {
            text: "tasks failed: engine_not_configured (skein needs python)".to_string(),
        };
        shot("menu-tasks-error", 80, 24, |f| render_menu(&m, f));
    }
}
