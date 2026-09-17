/**
 * Behavioral-domain probe suite for EVE's own oracle.
 *
 * Formalizes `docs/assurance/findings/EVE-001-goal-signal-text-match.md` as
 * machinery: same app (EVE's built-in `mock:` DEMO_APP), same goal, same
 * persona, same seed across every probe — the only variable is which
 * success-signal configuration is under test. Verified against the real `eve`
 * binary; see `tests/assurance.test.ts`.
 *
 * The two exploit probes and the control probe are a controlled minimal
 * triple, not three independent examples: `exploit-label-only` and
 * `control-terminal-screen` follow the *identical* trajectory through the
 * dashboard (landing → pricing → signup → dashboard) and diverge only on
 * signal choice, which is what makes the comparison clean — the difference in
 * outcome cannot be attributed to anything but the word chosen.
 */
import type { ProbeSuite } from "../probe.js";
export declare const behavioralSuite: ProbeSuite;
//# sourceMappingURL=behavioral.d.ts.map