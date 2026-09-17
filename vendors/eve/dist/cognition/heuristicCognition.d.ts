import type { Action, VisibleElement } from "../core/types.js";
import { type ExplorationStrategy, type StrategyWeights } from "../planning/strategies.js";
import type { CognitiveContext, Decision, DecisionPolicy } from "./cognition.js";
/**
 * The default, fully-offline decision policy.
 *
 * Models a human's moment-to-moment choice as a priority cascade — the same
 * one people actually run:
 *
 *  1. Something is blocking me (dialog) → deal with it.
 *  2. The page is still loading → wait (patience permitting).
 *  3. I'm too frustrated to continue → give up.
 *  4. I haven't looked at this screen yet → read it first.
 *  5. There's a field the task needs filled → fill it.
 *  6. Something looks worth clicking → click the most salient thing.
 *  7. There's more page below → scroll.
 *  8. I'm going in circles → go back.
 *  9. Nothing left → step back or give up.
 *
 * On a document surface (`src/humanity/`) the priorities are a reader's
 * rather than an operator's, and {@link HeuristicCognition.handleDocumentSurface}
 * runs its own cascade instead. In a dialogue (`src/conversation/`) they are
 * a speaker's, and {@link HeuristicCognition.handleConversationSurface} runs
 * that one.
 *
 * All stochastic choices go through the session RNG so runs are reproducible.
 */
export declare class HeuristicCognition implements DecisionPolicy {
    private readonly strategy;
    readonly name: string;
    constructor(strategy?: ExplorationStrategy);
    decide(ctx: CognitiveContext): Promise<Decision>;
    /**
     * Choose which visible affordance to act on. The default implementation is
     * salience-driven softmax selection (phase-1 behavior, unchanged).
     * Subclasses may override to substitute a different decision model.
     */
    protected chooseAffordance(ctx: CognitiveContext, goalKeywords: readonly string[], weights: StrategyWeights, effortBase: number, sig: string): Decision | null;
    protected baseConfidence(ctx: CognitiveContext): number;
    /**
     * Decide natively on a kernel tool surface — the Phase-2 replacement for
     * the Phase-1 projection (a tool call was "form fill + Enter"; an error
     * was a fake modal dialog; arguments were typed text re-parsed by the
     * adapter — projection debt ledger items 1, 3, 4).
     *
     * Returns null unless the kernel percept advertises `mcp.tool`
     * affordances, so legacy surfaces never enter this branch. Inside it, the
     * same human priorities apply, restated natively: a dead surface ends the
     * session; a busy surface is waited out; a new catalog is read before
     * anything is touched; a failure is *read*, not "dismissed"; and choosing
     * a tool produces exactly one `mcp.invoke` action with typed arguments.
     */
    private handleToolSurface;
    /**
     * Decide natively on a document surface (`src/humanity/`) — the reading
     * cascade, which is a different cascade from the operating one.
     *
     * A person driving software asks "what can I click"; a person reading asks
     * "do I understand this, and is it worth going on". So the priorities are
     * the reader's own:
     *
     *  1. I reached the end — I am done, not stuck.
     *  2. I'm too frustrated to keep reading → put it down.
     *  3. I did not follow that → read it again, if I have the patience.
     *  4. Something here answers what I came for → study it.
     *  5. I haven't read this {section} yet → skim or read it, by thoroughness.
     *  6. A reference leads where I'm trying to go → follow it.
     *  7. There is more → turn the page.
     *
     * Returns null unless the kernel percept is a document, so no existing
     * surface enters this branch and every legacy cascade is untouched.
     */
    private handleDocumentSurface;
    /**
     * Decide natively in a dialogue (`src/conversation/`) — the talking
     * cascade, which is neither the operating one nor the reading one.
     *
     * Someone driving software asks "what can I click"; someone reading asks
     * "do I understand this"; someone in a conversation asks a third thing:
     * **"did it understand *me*, and is it worth trying again?"** That question
     * has no analogue on any other surface, and the answer is what the whole
     * experience turns on:
     *
     *  1. It's still typing → wait, but patience is finite.
     *  2. It's gone → nothing left to talk to.
     *  3. I've had enough → leave.
     *  4. It didn't get me → say it differently, while I still have the will.
     *  5. I've rephrased too many times → ask for a human.
     *  6. It won't help and offered a way out → take it.
     *  7. I haven't said anything yet → open with what I came for.
     *  8. It answered → follow up on what's still missing.
     *
     * Returns null unless the kernel percept is a conversation, so no existing
     * surface enters this branch and every other cascade is untouched.
     */
    private handleConversationSurface;
    private handleDialog;
    private handleFormSubmit;
    private handleFormField;
}
/**
 * Generate the input a human would plausibly type, inferred purely from the
 * field's visible label/placeholder text.
 */
export declare function plausibleInput(field: VisibleElement, personaName: string): string;
export type { Action };
//# sourceMappingURL=heuristicCognition.d.ts.map