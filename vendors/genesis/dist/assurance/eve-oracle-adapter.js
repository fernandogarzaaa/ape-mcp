/**
 * EveOracleAdapter — audits EVE's own goal-achievement oracle, rather than
 * treating EVE as a source of evidence (that is `src/evidence/behavioral/
 * eve.ts`, a different subsystem with a different job).
 *
 * Formalizes `docs/assurance/findings/EVE-001-goal-signal-text-match.md` as
 * reusable machinery. EVE's `goalAchieved` is decided by whether every
 * configured success signal is a lowercase substring of all currently visible
 * screen text (experience-validation-engine's `src/engine/session.ts`, the
 * "goal success check"), with no distinction between text an operator merely
 * saw and an action an operator took. A behavioral probe here fixes the app,
 * goal, and persona, and varies the candidate success-signal configuration —
 * the thing under test, playing the role a submitted completion plays for an
 * RLVR verifier.
 *
 * This does not fit `VerifierAdapter`'s {task_file, completion_file}
 * subprocess contract: EVE takes no agent-submitted completion file to grade.
 * It runs a full simulated session from a config and writes `report.json`
 * into `--out`. This adapter drives exactly that interface, the same one
 * `src/evidence/behavioral/eve.ts` drives, for a different purpose: not
 * "collect one observation for a contract," but "try many candidate signal
 * configurations and see which ones the oracle wrongly accepts."
 *
 * EVE's config loader parses file contents as YAML regardless of extension,
 * and JSON is valid YAML — confirmed against the real CLI before relying on
 * it here — so no YAML-writing dependency is needed; the config is written as
 * plain JSON to a `.yaml`-named path.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { redact } from "../shared/redact.js";
export class EveOracleAdapter {
    #config;
    #runner;
    constructor(config, runner) {
        this.#config = config;
        this.#runner = runner;
    }
    get name() {
        return "eve-oracle";
    }
    describe() {
        return {
            bin: this.#config.bin ?? ["npx", "eve"],
            timeout_ms: this.#config.timeout_ms,
        };
    }
    async judge(probe) {
        const started = Date.now();
        const task = probe.task;
        if (!task.url || !task.persona || !task.goal) {
            return errorResponse("probe.task must set url, persona, and goal for the eve-oracle judge");
        }
        let signals;
        try {
            const parsed = JSON.parse(probe.completion);
            if (!Array.isArray(parsed) || !parsed.every((s) => typeof s === "string")) {
                throw new Error("not a string array");
            }
            signals = parsed;
        }
        catch {
            return errorResponse(`probe "${probe.id}": completion must be a JSON array of success-signal strings`);
        }
        const outDir = mkdtempSync(join(tmpdir(), "genesis-eve-oracle-"));
        const configFile = join(outDir, "config.yaml");
        try {
            writeFileSync(configFile, JSON.stringify({
                url: task.url,
                persona: task.persona,
                goal: task.goal,
                goalSuccessSignals: signals,
                seed: task.seed ?? 1,
                maxSteps: 60,
                headless: true,
                screenshots: false,
            }), "utf8");
            const bin = this.#config.bin ?? ["npx", "eve"];
            const command = [...bin, "run", task.url, "--config", configFile, "--out", outDir, "--quiet"];
            const result = await this.#runner.run(command, {
                cwd: this.#config.cwd ?? process.cwd(),
                timeoutMs: this.#config.timeout_ms,
            });
            if (result.spawn_error) {
                return errorResponse(`failed to run eve: ${result.spawn_error}`, result.exit_code, started);
            }
            if (result.timed_out) {
                return {
                    observed: "unresponsive",
                    exit_code: result.exit_code,
                    raw_reward: null,
                    stdout: redact(diagnostic(command, result.stdout, result.stderr, null)),
                    stderr: "",
                    duration_ms: Date.now() - started,
                    note: `eve did not return within ${this.#config.timeout_ms}ms`,
                };
            }
            let session = null;
            let readError = null;
            try {
                session = JSON.parse(readFileSync(join(outDir, "report.json"), "utf8"));
            }
            catch (error) {
                readError = error instanceof Error ? error.message : String(error);
            }
            if (!session || typeof session.goalAchieved !== "boolean") {
                return {
                    observed: "error",
                    exit_code: result.exit_code,
                    raw_reward: null,
                    stdout: redact(diagnostic(command, result.stdout, result.stderr, null)),
                    stderr: "",
                    duration_ms: Date.now() - started,
                    note: readError ?? "eve did not write a report.json with a boolean goalAchieved",
                };
            }
            const observed = session.goalAchieved ? "accept" : "reject";
            return {
                observed,
                exit_code: result.exit_code,
                raw_reward: session.usage?.steps ?? null,
                stdout: redact(diagnostic(command, result.stdout, result.stderr, session)),
                stderr: "",
                duration_ms: Date.now() - started,
                note: `goalAchieved=${session.goalAchieved} steps=${session.usage?.steps ?? "?"}`,
            };
        }
        finally {
            rmSync(outDir, { recursive: true, force: true });
        }
    }
}
function diagnostic(command, stdout, stderr, session) {
    return [
        `$ ${command.join(" ")}`,
        "--- eve stdout ---",
        stdout,
        "--- eve stderr ---",
        stderr,
        session
            ? `--- report.json (excerpt) ---\n${JSON.stringify({ goalAchieved: session.goalAchieved, usage: session.usage }, null, 2)}`
            : "(no report.json read)",
    ].join("\n");
}
function errorResponse(note, exit_code = null, started = Date.now()) {
    return {
        observed: "error",
        exit_code,
        raw_reward: null,
        stdout: "",
        stderr: "",
        duration_ms: Date.now() - started,
        note,
    };
}
//# sourceMappingURL=eve-oracle-adapter.js.map