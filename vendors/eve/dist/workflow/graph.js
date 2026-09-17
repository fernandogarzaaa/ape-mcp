import { screenSignature } from "../memory/memory.js";
import { detectWorkflow } from "./detector.js";
export class WorkflowGraph {
    nodes = new Map();
    transitions = new Map();
    lastSignature = null;
    observe(percept, step, arrivedVia, errorPerceived) {
        const signature = screenSignature(percept);
        let node = this.nodes.get(signature);
        const match = detectWorkflow(percept);
        if (!node) {
            node = {
                signature,
                url: percept.url,
                title: percept.title,
                kind: match.kind,
                kindConfidence: match.confidence,
                visits: 0,
                errorSteps: [],
                firstSeenStep: step,
            };
            this.nodes.set(signature, node);
        }
        else if (match.confidence > node.kindConfidence) {
            node.kind = match.kind;
            node.kindConfidence = match.confidence;
        }
        node.visits += 1;
        node.url = percept.url;
        node.title = percept.title;
        if (errorPerceived)
            node.errorSteps.push(step);
        if (this.lastSignature && this.lastSignature !== signature && arrivedVia) {
            const key = `${this.lastSignature}=>${signature}`;
            const existing = this.transitions.get(key);
            if (existing)
                existing.count += 1;
            else
                this.transitions.set(key, {
                    from: this.lastSignature,
                    to: signature,
                    via: arrivedVia,
                    count: 1,
                });
        }
        this.lastSignature = signature;
        return node;
    }
    allNodes() {
        return [...this.nodes.values()];
    }
    allTransitions() {
        return [...this.transitions.values()];
    }
    /**
     * Group discovered screens into workflows and judge completion: a workflow
     * counts as completed when the operator both entered it and subsequently
     * reached a confirmation-like screen or returned to a dashboard.
     */
    discoveredWorkflows() {
        const byKind = new Map();
        for (const node of this.nodes.values()) {
            if (node.kind === "unknown")
                continue;
            const list = byKind.get(node.kind) ?? [];
            list.push(node);
            byKind.set(node.kind, list);
        }
        const confirmationSigs = new Set([...this.nodes.values()]
            .filter((n) => n.kind === "confirmation" || n.kind === "dashboard")
            .map((n) => n.signature));
        const result = [];
        for (const [kind, screens] of byKind) {
            if (kind === "confirmation")
                continue;
            const completed = screens.some((screen) => [...this.transitions.values()].some((t) => t.from === screen.signature && confirmationSigs.has(t.to)));
            const errorCount = screens.reduce((n, s) => n + s.errorSteps.length, 0);
            result.push({ kind, screens, completed, errorCount });
        }
        return result.sort((a, b) => a.kind.localeCompare(b.kind));
    }
    /** Fraction of discovered screens revisited more than twice (wandering). */
    revisitRatio() {
        const nodes = this.allNodes();
        if (nodes.length === 0)
            return 0;
        return nodes.filter((n) => n.visits > 2).length / nodes.length;
    }
}
//# sourceMappingURL=graph.js.map