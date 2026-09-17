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
import { type SignedEnvelope } from "../protocol/envelope.js";
import { type ValidateOptions } from "./fitness.js";
export interface ServiceOptions extends ValidateOptions {
    /**
     * Shared secret for envelope signing. When set, incoming envelopes must carry
     * a valid HMAC and outgoing ones are signed. Unset is correct for the stdio
     * case, where the parent process already controls the child.
     */
    readonly fleetKey?: Buffer | string;
    /** Sink for diagnostics. Never stdout — that carries the protocol. */
    readonly onLog?: (line: string) => void;
}
/** A request that could not even be understood, reported in the same framing. */
export interface ProtocolError {
    readonly cp: "cp1";
    readonly type: "ProtocolError";
    readonly detail: string;
}
/**
 * Handle one request envelope, returning the response envelope.
 *
 * Exported separately from {@link serve} so the protocol behavior is testable
 * without spawning a process or touching stdio.
 */
export declare function handleEnvelope(envelope: SignedEnvelope, options?: ServiceOptions): Promise<SignedEnvelope | ProtocolError>;
/**
 * Run the endpoint over a pair of streams until the input closes.
 *
 * Blank lines are ignored so a caller may use them as keepalive without
 * provoking a response.
 */
export declare function serve(options?: ServiceOptions & {
    input?: NodeJS.ReadableStream;
    output?: NodeJS.WritableStream;
}): Promise<void>;
//# sourceMappingURL=service.d.ts.map