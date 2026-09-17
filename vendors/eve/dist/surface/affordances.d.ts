import type { TextAffordance } from "./textFrame.js";
/**
 * Strip ANSI escape sequences so perceived text matches what a human reads.
 *
 * The escape byte is optional in the pattern because both forms reach EVE:
 * live process output carries the real `ESC [ … m`, while transcripts pasted
 * into issues and captured to files have often already lost the escape byte
 * and kept the visible bracket. A reader sees neither, so both go.
 */
export declare function stripAnsi(text: string): string;
/**
 * Detect what the operator can act on next. Three affordance kinds:
 * a command the output suggests, a documented subcommand in a help
 * listing, and a prompt awaiting input.
 *
 * Order matters: a help entry is checked before the prompt heuristic so a
 * section header like "Commands:" does not masquerade as an input prompt.
 */
export declare function detectAffordances(lines: readonly string[]): TextAffordance[];
//# sourceMappingURL=affordances.d.ts.map