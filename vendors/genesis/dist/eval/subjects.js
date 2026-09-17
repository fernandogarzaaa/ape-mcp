/**
 * Subject adapters: run an arbitrary system under test without an SDK.
 *
 * - command: `python agent.py {input}` / `{task_file}` — task JSON via temp file,
 *   input string interpolated; stdout is the output (JSON parsed when possible).
 * - http: POST the task to an endpoint, read the response body.
 * - inline: deterministic local transforms (echo/upper/lower/reverse/identity)
 *   for reproducible examples and self-evaluation.
 *
 * Every execution is bounded, redacted, and returns a Trial-shaped result.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redact } from "../shared/redact.js";
import { SubprocessRunner } from "../evidence/runner.js";
import { mulberry32 } from "./stats.js";
export function createSubject(spec, runner = new SubprocessRunner()) {
    if (spec.inline)
        return new InlineSubject(spec.name ?? `inline:${spec.inline}`, spec.inline);
    if (spec.http)
        return new HttpSubject(spec.name ?? spec.http.url, spec);
    if (spec.command)
        return new CommandSubject(spec.name ?? spec.command, spec, runner);
    throw new Error("subject: one of command, http, or inline is required");
}
function taskInputText(task) {
    const i = task.input;
    return typeof i === "string" ? i : JSON.stringify(i);
}
function hashString(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}
/** Deterministic local subject. The backbone of reproducible examples. */
export class InlineSubject {
    name;
    #kind;
    constructor(name, kind) {
        this.name = name;
        this.#kind = kind;
    }
    describe() {
        return { kind: "inline", transform: this.#kind };
    }
    async run(task, repetition, seed) {
        const started = Date.now();
        const input = taskInputText(task);
        let output;
        switch (this.#kind) {
            case "echo":
            case "identity":
                output = task.input;
                break;
            case "empty":
                // Degenerate policy: doing nothing. Must score ~0 anywhere.
                output = "";
                break;
            case "random": {
                // Degenerate policy: deterministic gibberish (seeded, reproducible).
                // Must score ~0 anywhere; anything higher implicates the reward.
                const seedNum = typeof seed === "number" ? seed : hashString(`${task.id}:${String(seed ?? repetition)}`);
                const rand = mulberry32(seedNum);
                const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
                output = Array.from({ length: 64 }, () => alphabet[Math.floor(rand() * alphabet.length)]).join("");
                break;
            }
            case "upper":
                output = input.toUpperCase();
                break;
            case "lower":
                output = input.toLowerCase();
                break;
            case "reverse":
                output = [...input].reverse().join("");
                break;
            case "double": {
                const n = Number(input);
                output = Number.isFinite(n) ? String(n * 2) : input;
                break;
            }
            case "prefix-ok":
                output = `OK: ${input}`;
                break;
            default:
                return {
                    output: null, raw_stdout: "", raw_stderr: "",
                    exit_code: null, duration_ms: Date.now() - started,
                    timed_out: false, error: `unknown inline subject "${this.#kind}"`,
                };
        }
        return {
            output, raw_stdout: String(output), raw_stderr: "",
            exit_code: 0, duration_ms: Date.now() - started,
            timed_out: false, error: null,
        };
    }
}
/** Arbitrary command. Zero integration cost: point at any executable. */
export class CommandSubject {
    name;
    #spec;
    #runner;
    constructor(name, spec, runner) {
        this.name = name;
        this.#spec = spec;
        this.#runner = runner;
    }
    describe() {
        return { kind: "command", command: this.#spec.command, timeout_ms: this.#spec.timeout_ms };
    }
    async run(task) {
        const started = Date.now();
        const dir = mkdtempSync(join(tmpdir(), "genesis-task-"));
        try {
            const taskFile = join(dir, "task.json");
            writeFileSync(taskFile, JSON.stringify(task, null, 2), "utf8");
            const input = taskInputText(task);
            const parts = splitCommand(this.#spec.command).map((p) => p.replaceAll("{task_file}", taskFile).replaceAll("{input}", input));
            const hasPlaceholder = this.#spec.command.includes("{task_file}") || this.#spec.command.includes("{input}");
            const command = hasPlaceholder ? parts : [...parts, taskFile];
            const result = await this.#runner.run(command, {
                cwd: process.cwd(),
                timeoutMs: this.#spec.timeout_ms ?? 60_000,
                env: this.#spec.env,
            });
            if (result.spawn_error) {
                return {
                    output: null, raw_stdout: redact(result.stdout), raw_stderr: redact(result.stderr),
                    exit_code: result.exit_code, duration_ms: Date.now() - started,
                    timed_out: false, error: result.spawn_error,
                };
            }
            if (result.timed_out) {
                return {
                    output: null, raw_stdout: redact(result.stdout), raw_stderr: redact(result.stderr),
                    exit_code: result.exit_code, duration_ms: Date.now() - started,
                    timed_out: true, error: `subject timed out`,
                };
            }
            const out = result.stdout.trim();
            let output = out;
            if (out.startsWith("{") || out.startsWith("[")) {
                try {
                    output = JSON.parse(out);
                }
                catch {
                    output = out;
                }
            }
            return {
                output, raw_stdout: redact(result.stdout), raw_stderr: redact(result.stderr),
                exit_code: result.exit_code, duration_ms: Date.now() - started,
                timed_out: false, error: result.exit_code !== 0 ? `exit ${result.exit_code}` : null,
            };
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
}
/** HTTP subject: POST {task} and read the body. */
export class HttpSubject {
    name;
    #spec;
    constructor(name, spec) {
        this.name = name;
        this.#spec = spec;
    }
    describe() {
        return { kind: "http", url: this.#spec.http?.url, method: this.#spec.http?.method ?? "POST" };
    }
    async run(task) {
        const started = Date.now();
        const http = this.#spec.http;
        if (!http) {
            return {
                output: null, raw_stdout: "", raw_stderr: "", exit_code: null,
                duration_ms: 0, timed_out: false, error: "http subject missing url",
            };
        }
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), this.#spec.timeout_ms ?? 60_000);
            try {
                const res = await fetch(http.url, {
                    method: http.method ?? "POST",
                    headers: { "content-type": "application/json", ...(http.headers ?? {}) },
                    body: JSON.stringify({ task }),
                    signal: controller.signal,
                });
                // The deadline covers the body too: headers resolving first must not
                // disarm the timeout while a stalled body streams forever.
                const text = await res.text();
                let output = text;
                try {
                    output = JSON.parse(text);
                }
                catch {
                    output = text;
                }
                return {
                    output, raw_stdout: redact(text), raw_stderr: "",
                    exit_code: res.ok ? 0 : res.status, duration_ms: Date.now() - started,
                    timed_out: false, error: res.ok ? null : `http ${res.status}`,
                };
            }
            finally {
                clearTimeout(timer);
            }
        }
        catch (error) {
            return {
                output: null, raw_stdout: "", raw_stderr: "",
                exit_code: null, duration_ms: Date.now() - started,
                timed_out: error.name === "AbortError", error: error.message,
            };
        }
    }
}
/** Split a command string respecting single/double quotes. */
export function splitCommand(command) {
    const out = [];
    let cur = "";
    let quote = null;
    for (let i = 0; i < command.length; i++) {
        const ch = command[i];
        if (quote) {
            if (ch === quote)
                quote = null;
            else
                cur += ch;
        }
        else if (ch === '"' || ch === "'")
            quote = ch;
        else if (/\s/.test(ch)) {
            if (cur) {
                out.push(cur);
                cur = "";
            }
        }
        else
            cur += ch;
    }
    if (cur)
        out.push(cur);
    return out;
}
//# sourceMappingURL=subjects.js.map