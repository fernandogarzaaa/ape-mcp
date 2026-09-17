/**
 * Suite registry.
 *
 * Adding a defect class means adding probes here and nothing else — the audit
 * runner and the pure conclusion logic never learn their names.
 */
import { behavioralSuite } from "./behavioral.js";
import { codeSuite } from "./code.js";
import { jsonSuite } from "./json.js";
import { mathSuite } from "./math.js";
export const SUITES = {
    code: codeSuite,
    json: jsonSuite,
    math: mathSuite,
    behavioral: behavioralSuite,
};
export function suiteNames() {
    return Object.keys(SUITES).sort();
}
export function getSuite(name) {
    return SUITES[name];
}
export { codeSuite, jsonSuite, mathSuite, behavioralSuite };
//# sourceMappingURL=index.js.map