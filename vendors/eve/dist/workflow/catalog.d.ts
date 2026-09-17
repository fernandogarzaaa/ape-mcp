/**
 * Workflow catalog: perceptual signatures of common product workflows.
 *
 * A workflow is recognized purely from what is visible — URL fragments,
 * titles, headings and control labels — the same way a person recognizes "oh,
 * this is a login page" without seeing any code.
 */
export type WorkflowKind = "login" | "signup" | "forgot-password" | "dashboard" | "create" | "edit" | "delete" | "export" | "import" | "upload" | "download" | "settings" | "notifications" | "search" | "profile" | "navigation" | "form" | "wizard" | "confirmation" | "checkout" | "onboarding" | "help" | "unknown";
export interface WorkflowSignature {
    readonly kind: WorkflowKind;
    /** Matched against URL + title (strong signal). */
    readonly urlHints: readonly RegExp[];
    /** Matched against headings and prominent labels (medium signal). */
    readonly contentHints: readonly RegExp[];
    /** Labels of controls that typically belong to this workflow. */
    readonly controlHints: readonly RegExp[];
}
export declare const WORKFLOW_SIGNATURES: readonly WorkflowSignature[];
//# sourceMappingURL=catalog.d.ts.map