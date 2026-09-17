import { tokenize } from "../cognition/mentalModel.js";
let goalCounter = 0;
/**
 * Conventional associations a software user carries: pursuing "reset my
 * password" makes "Log in" relevant, pursuing "export" makes "Settings"
 * relevant, and so on. Applied when deriving keywords from a goal
 * description so salience reflects human semantic knowledge, not just
 * string overlap.
 */
const KEYWORD_ASSOCIATIONS = {
    password: ["log", "login", "account", "forgot", "sign"],
    login: ["log", "sign", "account", "email"],
    account: ["sign", "login", "profile", "settings"],
    signup: ["sign", "register", "started", "create"],
    register: ["sign", "started", "create"],
    buy: ["pricing", "checkout", "cart", "plans"],
    purchase: ["pricing", "checkout", "cart"],
    subscribe: ["pricing", "plans", "billing"],
    export: ["settings", "download", "data"],
    import: ["settings", "upload", "data"],
    notification: ["settings", "preferences", "alerts"],
    profile: ["account", "settings", "avatar"],
    search: ["find", "filter"],
    help: ["support", "docs", "faq", "contact"],
    cancel: ["settings", "account", "billing", "subscription"],
};
function expandKeywords(base) {
    const expanded = new Set(base);
    for (const keyword of base) {
        for (const assoc of KEYWORD_ASSOCIATIONS[keyword] ?? [])
            expanded.add(assoc);
    }
    return [...expanded];
}
export function createGoal(description, options = {}) {
    goalCounter += 1;
    return {
        id: `goal-${goalCounter}`,
        description,
        keywords: options.keywords ?? expandKeywords(tokenize(description)),
        successSignals: options.successSignals ?? [],
        status: "active",
        effortSteps: 0,
        priority: options.priority ?? 1,
    };
}
export class GoalStack {
    stack = [];
    completed = [];
    constructor(root) {
        this.stack.push(root);
    }
    get current() {
        const top = this.stack[this.stack.length - 1];
        if (!top)
            throw new Error("Goal stack is empty");
        return top;
    }
    get root() {
        const bottom = this.stack[0] ?? this.completed[0];
        if (!bottom)
            throw new Error("Goal stack is empty");
        return bottom;
    }
    /** The current subgoal, if the operator has pushed one atop the root. */
    get subgoal() {
        return this.stack.length > 1 ? this.current : null;
    }
    push(goal) {
        this.stack.push(goal);
    }
    /** Mark the current goal resolved and pop it (root goal is never popped). */
    resolve(status) {
        const top = this.current;
        top.status = status;
        if (this.stack.length > 1) {
            this.stack.pop();
            this.completed.push(top);
        }
    }
    tickEffort() {
        this.current.effortSteps += 1;
    }
    history() {
        return [...this.completed, ...this.stack];
    }
    depth() {
        return this.stack.length;
    }
}
//# sourceMappingURL=goals.js.map