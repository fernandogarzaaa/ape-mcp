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
import type { Runner } from "../evidence/runner.js";
import type { Probe } from "./probe.js";
import type { Judge, VerifierResponse } from "./verifier.js";
export interface EveOracleConfig {
    /** How to invoke EVE. Defaults to `["npx", "eve"]`. */
    readonly bin?: readonly string[];
    readonly timeout_ms: number;
    readonly cwd?: string;
}
/**
 * What a behavioral probe's `task` must carry. `completion` is a JSON-encoded
 * array of candidate success signals — the configuration under test.
 */
export interface EveProbeTask {
    readonly url: string;
    readonly persona: string;
    readonly goal: string;
    readonly seed: number | string;
}
export declare class EveOracleAdapter implements Judge {
    #private;
    constructor(config: EveOracleConfig, runner: Runner);
    get name(): string;
    describe(): Record<string, unknown>;
    judge(probe: Probe): Promise<VerifierResponse>;
}
//# sourceMappingURL=eve-oracle-adapter.d.ts.map