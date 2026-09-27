import { clamp01 } from "../core/random.js";
import { sensitiveStateKey } from "../memory/surfaceIdentity.js";
import { tokenize, visibleText } from "./mentalModel.js";
const FEEDBACK_RE = /\b(saved|sent|success|done|added|created|updated|deleted|removed|confirmed|thank you|welcome|copied|applied|error|failed|invalid|required)\b/i;
/**
 * Build a rich expectation from a base prediction and the element being
 * acted on. Latency expectations scale with the perceived "weight" of the
 * action — navigation and submission feel like they should take longer than
 * toggling a checkbox.
 */
export function buildExpectation(base, target, actionKind) {
    const label = target?.text ?? "";
    const navigational = target?.role === "link" ||
        target?.role === "tab" ||
        target?.role === "menuitem" ||
        /\b(next|continue|log ?in|sign ?in|sign ?up|submit|go|open|view|settings|dashboard)\b/i.test(label);
    const committing = /\b(save|submit|pay|create|send|confirm|delete|remove|publish|order)\b/i.test(label);
    let destination = "same";
    if (actionKind === "back")
        destination = "back";
    else if (navigational)
        destination = "new";
    else if (base.expectsChange)
        destination = "same";
    // Doherty threshold ~400ms; weightier actions get more tolerance.
    const expectedLatencyMs = committing ? 1500 : navigational ? 900 : 400;
    return {
        base,
        destination,
        expectedLatencyMs,
        expectsVisualChange: base.expectsChange,
        expectsFeedback: committing || FEEDBACK_RE.test(label),
    };
}
/**
 * Score a rich expectation against what actually happened.
 */
export function scoreExpectation(expectation, before, after, perceivedLatencyMs) {
    const violations = [];
    const dimScores = {
        outcome: 1,
        destination: 1,
        latency: 1,
        "visual-change": 1,
        feedback: 1,
    };
    const beforeSig = sensitiveStateKey(before);
    const afterSig = sensitiveStateKey(after);
    const changed = beforeSig !== afterSig;
    const afterText = visibleText(after).toLowerCase();
    // Outcome: expected signals present?
    const signals = expectation.base.expectedSignals;
    if (signals.length > 0) {
        const hit = signals.filter((s) => afterText.includes(s.toLowerCase())).length / signals.length;
        dimScores.outcome = hit;
        if (hit < 0.5)
            violations.push("outcome");
    }
    // Destination.
    const destOk = (() => {
        switch (expectation.destination) {
            case "same":
                return !changed || afterSig === beforeSig ? 1 : 0.3;
            case "new":
                return changed ? 1 : 0;
            case "back":
                return changed ? 1 : 0.5;
            default: {
                return after.title.toLowerCase().includes(expectation.destination.titleHint.toLowerCase())
                    ? 1
                    : changed
                        ? 0.5
                        : 0;
            }
        }
    })();
    dimScores.destination = destOk;
    if (destOk < 0.5)
        violations.push("destination");
    // Latency.
    const latencyRatio = perceivedLatencyMs / Math.max(200, expectation.expectedLatencyMs);
    const latencyScore = latencyRatio <= 1 ? 1 : clamp01(1 - (latencyRatio - 1) * 0.4);
    dimScores.latency = latencyScore;
    if (latencyScore < 0.5)
        violations.push("latency");
    // Visual change.
    if (expectation.expectsVisualChange) {
        dimScores["visual-change"] = changed || significantChange(before, after) ? 1 : 0;
        if (dimScores["visual-change"] < 0.5)
            violations.push("visual-change");
    }
    // Feedback.
    if (expectation.expectsFeedback) {
        const gotFeedback = FEEDBACK_RE.test(afterText) || after.dialogs.length > 0;
        dimScores.feedback = gotFeedback ? 1 : 0.2;
        if (!gotFeedback)
            violations.push("feedback");
    }
    const active = Object.keys(dimScores).filter((d) => {
        if (d === "outcome")
            return signals.length > 0;
        if (d === "visual-change")
            return expectation.expectsVisualChange;
        if (d === "feedback")
            return expectation.expectsFeedback;
        return true;
    });
    const matchScore = active.reduce((s, d) => s + dimScores[d], 0) / Math.max(1, active.length);
    const violationSeverity = violations.length === 0 ? 0 : 1 - Math.min(...violations.map((d) => dimScores[d]));
    return {
        matchScore: Number(matchScore.toFixed(3)),
        surprise: Number((1 - matchScore).toFixed(3)),
        violationSeverity: Number(violationSeverity.toFixed(3)),
        violations,
        perceivedLatencyMs,
    };
}
function significantChange(before, after) {
    const a = new Set(tokenize(visibleText(before)));
    const b = new Set(tokenize(visibleText(after)));
    if (a.size === 0 && b.size === 0)
        return false;
    let inter = 0;
    for (const t of a)
        if (b.has(t))
            inter += 1;
    const union = a.size + b.size - inter;
    return union === 0 ? false : inter / union < 0.75;
}
/**
 * Tracks streaks of expectation violations. Repeated violations compound
 * frustration and trust damage beyond isolated ones (learned
 * unpredictability).
 */
export class ViolationStreak {
    streak = 0;
    total = 0;
    register(score) {
        if (score.violationSeverity > 0.4) {
            this.streak += 1;
            this.total += 1;
        }
        else {
            this.streak = 0;
        }
        return this.streak;
    }
    current() {
        return this.streak;
    }
    totalViolations() {
        return this.total;
    }
}
//# sourceMappingURL=expectation.js.map