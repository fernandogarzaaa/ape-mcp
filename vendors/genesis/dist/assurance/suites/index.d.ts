/**
 * Suite registry.
 *
 * Adding a defect class means adding probes here and nothing else — the audit
 * runner and the pure conclusion logic never learn their names.
 */
import type { ProbeSuite } from "../probe.js";
import { behavioralSuite } from "./behavioral.js";
import { codeSuite } from "./code.js";
import { jsonSuite } from "./json.js";
import { mathSuite } from "./math.js";
export declare const SUITES: Readonly<Record<string, ProbeSuite>>;
export declare function suiteNames(): string[];
export declare function getSuite(name: string): ProbeSuite | undefined;
export { codeSuite, jsonSuite, mathSuite, behavioralSuite };
//# sourceMappingURL=index.d.ts.map