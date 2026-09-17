/**
 * The verifier under test.
 *
 * Genesis invokes an arbitrary verifier as a subprocess: it writes the task and
 * the candidate completion to files, substitutes their paths into a declared
 * command template, and reads back a verdict. This is deliberately the dumbest
 * integration that could work — verifiers in the wild are Python scripts, shell
 * pipelines, and Makefile targets, and requiring them to implement an interface
 * would mean auditing only the verifiers that already care about being audited.
 *
 * Note the inversion relative to the acceptance layer: there, Genesis ran a
 * repository's checks to judge a change. Here the check *is* the subject, and
 * the completions are instruments. Same runner, opposite direction.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redact } from "../shared/redact.js";
export class VerifierAdapter {
    #config;
    #runner;
    constructor(config, runner) {
        this.#config = config;
        this.#runner = runner;
    }
    get name() {
        return this.#config.name;
    }
    get config() {
        return this.#config;
    }
    describe() {
        return {
            command: this.#config.command,
            accept: this.#config.accept,
            timeout_ms: this.#config.timeout_ms,
        };
    }
    async judge(probe) {
        const dir = mkdtempSync(join(tmpdir(), "genesis-probe-"));
        const taskFile = join(dir, "task.json");
        const completionFile = join(dir, "completion.txt");
        try {
            writeFileSync(taskFile, JSON.stringify(probe.task, null, 2), "utf8");
            writeFileSync(completionFile, probe.completion, "utf8");
            const command = this.#config.command.map((part) => part.replaceAll("{task_file}", taskFile).replaceAll("{completion_file}", completionFile));
            const started = Date.now();
            const result = await this.#runner.run(command, {
                // The invoking directory, not the probe scratch dir: verifier commands
                // are written relative to the user's cwd, and task/completion paths are
                // absolute so they resolve from anywhere.
                cwd: this.#config.cwd ?? process.cwd(),
                timeoutMs: this.#config.timeout_ms,
            });
            const duration_ms = Date.now() - started;
            if (result.spawn_error) {
                return response("error", result, duration_ms, null, `failed to run verifier: ${result.spawn_error}`);
            }
            if (result.timed_out) {
                return response("unresponsive", result, duration_ms, null, `verifier did not return within ${this.#config.timeout_ms}ms`);
            }
            return this.#interpret(result, duration_ms);
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    }
    #interpret(result, duration_ms) {
        const rule = this.#config.accept;
        if (rule.kind === "exit_zero") {
            return response(result.exit_code === 0 ? "accept" : "reject", result, duration_ms, null, null);
        }
        const parsed = parseJsonLoose(result.stdout);
        if (parsed === null) {
            return response("error", result, duration_ms, null, "verifier stdout was not parseable JSON");
        }
        if (rule.kind === "json_pass") {
            const field = rule.field ?? "pass";
            const value = parsed[field];
            if (typeof value !== "boolean") {
                return response("error", result, duration_ms, null, `field "${field}" was not a boolean`);
            }
            return response(value ? "accept" : "reject", result, duration_ms, null, null);
        }
        const field = rule.field ?? "reward";
        const threshold = rule.threshold ?? 1;
        const value = parsed[field];
        if (typeof value !== "number" || !Number.isFinite(value)) {
            return response("error", result, duration_ms, null, `field "${field}" was not a finite number`);
        }
        return response(value >= threshold ? "accept" : "reject", result, duration_ms, value, null);
    }
}
function response(observed, result, duration_ms, raw_reward, note) {
    return {
        observed,
        exit_code: result.exit_code,
        raw_reward,
        stdout: redact(result.stdout),
        stderr: redact(result.stderr),
        duration_ms,
        note,
    };
}
/** Verifiers routinely print progress around their JSON verdict. */
export function parseJsonLoose(text) {
    const trimmed = text.trim();
    if (trimmed === "")
        return null;
    const candidates = [trimmed];
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start)
        candidates.push(trimmed.slice(start, end + 1));
    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // try the next candidate
        }
    }
    return null;
}
//# sourceMappingURL=verifier.js.map