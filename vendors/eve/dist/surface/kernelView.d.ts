/**
 * `WebPerceptView` — the deprecated projection of a kernel percept back into
 * the legacy browser-flavored {@link Percept} (Phase 2 compatibility shim;
 * see `docs/kernel.md`).
 *
 * Visual kernels round-trip through `webPerceptFromVisualKernel`
 * (`src/core/kernel.ts`). Textual kernels are laid out through the same
 * char-cell geometry the CLI/MCP adapters have always used, so the legacy
 * view of a kernel-native textual surface is byte-for-byte the kind of
 * snapshot Phase-1 consumers already handled.
 *
 * This is the direction that loses fidelity by design: typed signals
 * collapse onto dialogs/loading, structured affordance metadata is dropped,
 * and non-ARIA affordance kinds map onto the nearest legacy role. Consumers
 * that need the fidelity should consume the kernel directly.
 */
import { type KernelPercept } from "../core/kernel.js";
import type { Percept } from "../core/types.js";
/** Project any kernel percept into the deprecated web view. */
export declare function webPerceptFromKernel(kernel: KernelPercept): Percept;
//# sourceMappingURL=kernelView.d.ts.map