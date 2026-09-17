/**
 * Probes: the adversarial inputs an audit fires at a verifier.
 *
 * A probe pairs a task with a candidate completion and states what a *correct*
 * verifier must do with it. Two kinds, and both are mandatory:
 *
 *   - **exploit probes** (`expect: "reject"`) — a completion that satisfies the
 *     defect but not the task. A verifier that accepts one has the defect.
 *   - **control probes** (`expect: "accept"`) — a genuinely correct completion.
 *
 * Controls are not optional garnish. Without them a verifier that rejects
 * everything scores a perfect zero false-accept rate while being useless. This
 * is the same tension the acceptance layer met as coverage-versus-false-ship,
 * and it has the same resolution: report both rates, never one.
 *
 * A suite is content-addressed. An audit result is meaningless unless it names
 * which probes produced it, so the suite digest is recorded with every finding.
 */
import { hashCanonical } from "../shared/canonical.js";
/** Content hash over the suite. Recorded with every audit. */
export function suiteDigest(suite) {
    return hashCanonical(suite);
}
export function exploitProbes(suite) {
    return suite.probes.filter((p) => p.expect === "reject");
}
export function controlProbes(suite) {
    return suite.probes.filter((p) => p.expect === "accept");
}
/**
 * A suite is only diagnostic if every defect class it claims to test has at
 * least one exploit probe, and the suite as a whole has at least one control.
 * Checked before every audit — an audit run against a malformed suite would
 * report clean results for defects it never probed.
 */
export function validateSuite(suite) {
    const errors = [];
    if (suite.probes.length === 0) {
        errors.push("suite contains no probes");
        return errors;
    }
    if (controlProbes(suite).length === 0) {
        errors.push("suite has no control probes; without them a verifier that rejects everything " +
            "scores a perfect false-accept rate while being useless");
    }
    const ids = new Set();
    for (const probe of suite.probes) {
        if (ids.has(probe.id))
            errors.push(`duplicate probe id "${probe.id}"`);
        ids.add(probe.id);
        if (probe.domain !== suite.domain) {
            errors.push(`probe "${probe.id}" is domain ${probe.domain} in a ${suite.domain} suite`);
        }
    }
    const claimed = new Set(exploitProbes(suite).map((p) => p.defect_class));
    for (const probe of suite.probes) {
        if (probe.expect === "reject" && !claimed.has(probe.defect_class)) {
            errors.push(`defect class "${probe.defect_class}" has no exploit probe`);
        }
    }
    return errors;
}
//# sourceMappingURL=probe.js.map