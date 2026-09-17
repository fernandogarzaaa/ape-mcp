/**
 * The CP/1 validation endpoint — how ADAM reaches EVE.
 *
 * ADAM spawns this as a subprocess, writes one line per {@link ValidationRequest}
 * and reads one line per {@link FitnessResult}. Line-delimited JSON over stdio
 * was chosen over HTTP because it needs no listener, no port allocation, no
 * service discovery and no authentication story for the common single-host
 * case — and because a subprocess boundary is a real isolation boundary for a
 * component whose job is running scenarios.
 *
 * Requests are handled strictly in order. Fitness measurement is CPU-bound
 * simulation, so concurrency would not shorten the wall clock, and serializing
 * keeps a request's stdout line unambiguously its own.
 *
 * See `protocol/cp1/SPEC.md` section 6.
 */
import { createInterface } from "node:readline";
import { openEnvelope, sealEnvelope } from "../protocol/envelope.js";
import { validateMutation } from "./fitness.js";
/**
 * Handle one request envelope, returning the response envelope.
 *
 * Exported separately from {@link serve} so the protocol behavior is testable
 * without spawning a process or touching stdio.
 */
export async function handleEnvelope(envelope, options = {}) {
    let document;
    try {
        document = openEnvelope(envelope, options.fleetKey);
    }
    catch (err) {
        return { cp: "cp1", type: "ProtocolError", detail: err.message };
    }
    const rejection = rejectIfNotAValidationRequest(document);
    if (rejection)
        return rejection;
    let result;
    try {
        result = await validateMutation(document, options);
    }
    catch (err) {
        // A measurement that could not run (an unknown scenario, a persona that
        // does not exist) is a protocol-level error, not a fitness verdict.
        // Returning a FitnessResult here would tell ADAM that simulation had an
        // opinion when it never ran.
        return {
            cp: "cp1",
            type: "ProtocolError",
            detail: `measurement failed: ${err.message}`,
        };
    }
    return sealEnvelope(result, options.fleetKey);
}
/** The CP/1 mutation kinds. Anything else is a request EVE cannot interpret. */
const MUTATION_KINDS = new Set([
    "amend_genome",
    "retire_skill",
    "reconcile_belief",
    "investigate_conflict",
]);
/**
 * The largest trial count this endpoint will accept.
 *
 * Also asserted by the schema, but enforced here too: the schema bound protects
 * the corpus, and this one protects the process actually doing the work.
 */
const MAX_TRIALS = 64;
/**
 * Validate the shape EVE depends on, before the measurement machinery sees it.
 *
 * The `authored_by` check is the important one: only ADAM may mint a Mutation
 * (CP/1 authorship is exclusive), so a request carrying a mutation attributed
 * to anything else is either a bug or an attempt to have EVE bless a proposal
 * that never went through ADAM's evolution engine.
 */
function rejectIfNotAValidationRequest(document) {
    const fail = (detail) => ({
        cp: "cp1",
        type: "ProtocolError",
        detail,
    });
    if (document.type !== "ValidationRequest") {
        return fail(`expected a ValidationRequest, received ${JSON.stringify(document.type)}`);
    }
    const mutation = document.mutation;
    if (mutation?.type !== "Mutation") {
        return fail("ValidationRequest.mutation is missing or is not a Mutation");
    }
    const author = mutation.provenance?.authored_by;
    if (author !== "adam") {
        return fail(`ValidationRequest.mutation was authored by ${JSON.stringify(author)}; only ADAM may author a Mutation`);
    }
    // `project` switches on `kind` with no default, so an unrecognised value
    // returns undefined, `explainUnprojectable` falls through the same way, and
    // ADAM receives a sealed verdict whose stated reason is the string
    // "undefined". Reject it where the value arrives.
    if (typeof mutation.kind !== "string" || !MUTATION_KINDS.has(mutation.kind)) {
        return fail(`ValidationRequest.mutation.kind ${JSON.stringify(mutation.kind)} is not a CP/1 mutation kind`);
    }
    // Without this, `request.scenario_ids.length` throws and the caller is told
    // "measurement failed: Cannot read properties of undefined", which hides the
    // real cause.
    if (!Array.isArray(document.scenario_ids)) {
        return fail("ValidationRequest.scenario_ids must be an array of scenario ids");
    }
    if (typeof document.seed !== "number" || !Number.isInteger(document.seed)) {
        return fail("ValidationRequest.seed must be an integer; determinism depends on it");
    }
    // The upper bound matters: trials multiplies with scenarios and panel size
    // into full browser sessions on a CPU-bound endpoint that handles requests
    // strictly in order, so an unbounded value blocks every later request.
    if (typeof document.trials !== "number" ||
        !Number.isInteger(document.trials) ||
        document.trials < 1 ||
        document.trials > MAX_TRIALS) {
        return fail(`ValidationRequest.trials must be an integer in [1, ${MAX_TRIALS}]`);
    }
    return null;
}
/**
 * Run the endpoint over a pair of streams until the input closes.
 *
 * Blank lines are ignored so a caller may use them as keepalive without
 * provoking a response.
 */
export async function serve(options = {}) {
    const input = options.input ?? process.stdin;
    const output = options.output ?? process.stdout;
    const log = options.onLog ?? (() => { });
    // A parent that exits mid-response closes the pipe. That is a normal end of
    // service for a subprocess endpoint, not a crash — without a listener the
    // EPIPE surfaces as an unhandled `error` event and takes the process down
    // with a stack trace.
    output.on("error", (err) => {
        if (err.code === "EPIPE")
            return;
        log(`output stream error: ${err.message}`);
    });
    input.on("error", (err) => log(`input stream error: ${err.message}`));
    const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY });
    for await (const line of lines) {
        if (line.trim() === "")
            continue;
        let envelope;
        try {
            envelope = JSON.parse(line);
        }
        catch {
            write(output, {
                cp: "cp1",
                type: "ProtocolError",
                detail: "request line is not valid JSON",
            });
            continue;
        }
        const started = Date.now();
        const response = await handleEnvelope(envelope, options);
        log(`handled request in ${Date.now() - started}ms`);
        write(output, response);
    }
}
function write(output, value) {
    output.write(`${JSON.stringify(value)}\n`);
}
//# sourceMappingURL=service.js.map