/**
 * Conversation quality — what actually happened in the dialogue.
 *
 * The session loop records what the operator *did*: what they asked, where
 * they rephrased, whether they left. This is the other half — the judgment a
 * person forms about the thing they were talking to.
 *
 * The failure modes measured here are the ones people describe when they
 * complain about a bot, and none of them are visible to a functional test of
 * that bot. It answered a different question. It asked for something I'd
 * already told it. It never once admitted it was lost. There was no way to
 * reach a person. It took nine seconds to say nothing.
 *
 * Pure and deterministic: the same transcript and persona always produce the
 * same analysis, so it can be asserted on in tests and diffed across builds.
 */
import type { ConversationTurn } from "../core/kernel.js";
import type { Finding } from "../core/types.js";
import type { Persona } from "../personas/persona.js";
import type { ClassifiedTurn, ConversationKind } from "./types.js";
export interface ConversationAnalysis {
    readonly address: string;
    readonly kind: ConversationKind;
    readonly persona: string;
    /** 0..100 — did it understand what was asked, across the conversation. */
    readonly understanding: number;
    /** 0..100 — did it show it understood, and remember what it was told. */
    readonly grounding: number;
    /** 0..100 — what happened when it failed: a route out, or a wall. */
    readonly recovery: number;
    readonly turnCount: number;
    readonly operatorTurns: number;
    /** Times the operator had to say the same thing again. */
    readonly repairAttempts: number;
    /** Replies where the surface admitted it did not understand. */
    readonly admittedMisses: number;
    /** Replies that answered something else without admitting anything. */
    readonly silentMisses: number;
    readonly everOfferedHandoff: boolean;
    readonly meanLatencyMs: number | null;
    readonly maxLatencyMs: number | null;
    readonly findings: readonly Omit<Finding, "id" | "timestamp">[];
}
export interface AnalyzeConversationInput {
    readonly address: string;
    readonly kind: ConversationKind;
    /**
     * The transcript, carrying the surface's own classification where the
     * backend supplied one. Plain {@link ConversationTurn}s are accepted and
     * fall back to reading the wording.
     */
    readonly turns: readonly (ConversationTurn | ClassifiedTurn)[];
    readonly repairAttempts: number;
    readonly persona: Persona;
    /** Whether the operator ended up with what they came for. */
    readonly goalAchieved: boolean;
    readonly goal: string;
}
export declare function analyzeConversation(input: AnalyzeConversationInput): ConversationAnalysis;
//# sourceMappingURL=analysis.d.ts.map