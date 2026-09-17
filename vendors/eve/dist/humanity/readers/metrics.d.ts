/**
 * Metric recognition.
 *
 * "Revenue: $1.24M (up 14% QoQ)" is not a sentence — it is a claim a reader
 * is expected to act on. Pulling out the value, its unit and, crucially,
 * whether the artifact offered a *baseline* is what lets the comprehension
 * model say the thing every analytics reader thinks and rarely says out
 * loud: "compared to what?"
 */
import type { MetricDetail } from "../types.js";
/**
 * Parse a line as a metric, or return null when it is prose.
 *
 * Deliberately conservative: a line only counts when a short label is
 * followed by something that *starts* with a quantity. "We grew 14% last
 * year" is a sentence about a number, not a metric a dashboard is asserting,
 * and treating it as one would flood analytics reports with false positives.
 */
export declare function parseMetric(line: string): MetricDetail | null;
//# sourceMappingURL=metrics.d.ts.map