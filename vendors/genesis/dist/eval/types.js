/**
 * Genesis evaluation domain model.
 *
 * Universal hierarchy:
 *
 *   Evaluation
 *   ├── Claim          — what someone wants to establish empirically
 *   ├── Specification  — machine-readable plan compiled from the claim
 *   ├── Subject        — the system under test (via adapter, never SDK-locked)
 *   ├── Baseline       — what the candidate is compared against
 *   ├── Dataset        — immutable, versioned, digested task population
 *   ├── Task           — one unit of work
 *   ├── Trial          — one execution of one task (repetitions × seeds)
 *   ├── Observation    — what was observed (never confused with the claim)
 *   ├── Evidence       — observation + provenance + digest
 *   ├── Metric         — composable measurement over trials
 *   ├── Evaluator      — deterministic / reference / LLM / human / oracle / composite
 *   ├── Finding        — actionable failure/success explanation
 *   ├── StatisticalResult — estimates with method, assumptions, uncertainty
 *   └── Verdict        — SUPPORTED | FALSIFIED | INCONCLUSIVE | INVALID | UNTESTED
 *
 * Evaluator-assurance verdicts (SOUND | EXPLOITABLE | UNRELIABLE | OVER_STRICT)
 * live in `src/assurance/findings.ts` and are deliberately NOT merged here:
 * a verdict about a system and a verdict about an evaluator are different
 * claims with different evidence. They interoperate via `evaluatorAudit`
 * references on findings, not via a shared enum.
 */
export {};
//# sourceMappingURL=types.js.map