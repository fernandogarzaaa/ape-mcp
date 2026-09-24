import { workingMemoryCapacity } from "../personas/persona.js";
/**
 * Availability rule (reviewer concern 12): stable-identity familiarity must
 * NEVER prove current-state availability.
 *
 * `stableIdentityKey` answers "this is basically the same place";
 * `sensitiveStateKey` answers "this is the state I'm actually in". A tried
 * affordance learned in state A (button enabled, field present) says nothing
 * about state B (button disabled, field gone). Cognition must therefore gate
 * every tried-mark read on the CURRENT percept: the label must belong to an
 * element that is interactive and enabled RIGHT NOW.
 *
 * Returns false for empty labels (never match anything by accident).
 */
export function isAffordanceAvailable(percept, label) {
    const want = label.trim().toLowerCase();
    if (!want)
        return false;
    return percept.elements.some((e) => e.interactive && !e.disabled && e.text.trim().toLowerCase() === want);
}
/**
 * A perceptual signature for "which screen am I on". Humans recognize
 * screens by their gist — URL path, title and dominant headings — not by
 * exact pixel identity.
 *
 * NOTE (P0.5): this legacy signature aliases query tabs, open dialogs and
 * form state. New code should prefer `surfaceIdentity()` from
 * `./surfaceIdentity.js`, which keeps the same "same perceptual state →
 * same identity" contract while distinguishing modal/query/interaction
 * state. Kept byte-identical for backwards compatibility.
 */
export function screenSignature(percept) {
    let path = percept.url;
    try {
        const u = new URL(percept.url);
        path = u.origin + u.pathname;
    }
    catch {
        /* non-URL locations (about:blank etc.) keep raw string */
    }
    const headings = percept.elements
        .filter((e) => e.role === "heading")
        .slice(0, 3)
        .map((e) => e.text.trim().toLowerCase().slice(0, 40))
        .join("|");
    return `${path}::${headings}`;
}
export class OperatorMemory {
    persona;
    rng;
    working = [];
    episodes = [];
    facts = new Map();
    screens = new Map();
    edges = new Map();
    navigationTrail = [];
    capacity;
    identityOf;
    constructor(persona, rng, identityOf) {
        this.persona = persona;
        this.rng = rng;
        this.capacity = workingMemoryCapacity(persona);
        // Default keeps legacy screenSignature keys (backwards compat); sessions
        // pass surfaceIdentity for query/dialog/form-state discrimination (P0.5).
        this.identityOf = identityOf ?? screenSignature;
    }
    /* ---------------- working memory ---------------- */
    hold(content, step) {
        // Duplicate thoughts refresh instead of duplicating.
        const existing = this.working.findIndex((w) => w.content === content);
        if (existing >= 0)
            this.working.splice(existing, 1);
        this.working.push({ content, step });
        while (this.working.length > this.capacity)
            this.working.shift();
    }
    /** Distraction or overload can knock an item out of working memory. */
    maybeForgetWorkingItem() {
        if (this.working.length === 0)
            return null;
        if (!this.rng.chance(this.persona.traits.distractibility * 0.3))
            return null;
        const idx = this.rng.int(0, this.working.length - 1);
        const [dropped] = this.working.splice(idx, 1);
        return dropped?.content ?? null;
    }
    currentThoughts() {
        return this.working;
    }
    /* ---------------- episodic memory ---------------- */
    recordEpisode(step, percept, action, actionDescription, outcome) {
        this.episodes.push({
            step,
            url: percept.url,
            screenSignature: this.identityOf(percept),
            action: actionDescription,
            outcome,
            strength: 1,
        });
        void action;
    }
    /** Ebbinghaus-style decay each step; retention slows forgetting. */
    decayEpisodes() {
        const retention = this.persona.traits.memoryRetention;
        const decayFactor = 0.97 + retention * 0.028; // 0.97..0.998 per step
        for (const ep of this.episodes) {
            ep.strength *= decayFactor;
            // Bad experiences are remembered longer (negativity bias).
            if (ep.outcome === "error")
                ep.strength = Math.min(1, ep.strength * 1.01);
        }
    }
    /** Episodes still recallable (strength above a noise floor). */
    recallEpisodes(filter) {
        return this.episodes.filter((ep) => ep.strength > 0.3 && (!filter || filter(ep)));
    }
    errorCount() {
        return this.episodes.filter((e) => e.outcome === "error").length;
    }
    /** Has an action with this description failed before on this screen? */
    remembersFailure(signature, actionDescription) {
        return (this.recallEpisodes((ep) => ep.screenSignature === signature &&
            ep.action === actionDescription &&
            (ep.outcome === "error" || ep.outcome === "nothing")).length > 0);
    }
    /* ---------------- semantic memory ---------------- */
    learn(fact, confidence = 0.5) {
        const key = `${fact.kind}:${fact.statement}`;
        const existing = this.facts.get(key);
        const rate = this.persona.traits.learningRate;
        if (existing) {
            existing.reinforcements += 1;
            existing.confidence = Math.min(1, existing.confidence + 0.2 * rate);
        }
        else {
            this.facts.set(key, {
                ...fact,
                confidence: confidence * (0.5 + rate * 0.5),
                reinforcements: 1,
            });
        }
    }
    knownFacts(kind) {
        const all = [...this.facts.values()].filter((f) => f.confidence > 0.25);
        return kind ? all.filter((f) => f.kind === kind) : all;
    }
    /* ---------------- spatial memory ---------------- */
    observeScreen(percept, step) {
        const sig = this.identityOf(percept);
        let node = this.screens.get(sig);
        if (!node) {
            node = {
                signature: sig,
                url: percept.url,
                title: percept.title,
                visits: 0,
                firstSeenStep: step,
                lastSeenStep: step,
                affordances: new Set(),
                triedAffordances: new Set(),
            };
            this.screens.set(sig, node);
        }
        node.visits += 1;
        node.lastSeenStep = step;
        node.url = percept.url;
        node.title = percept.title;
        for (const el of percept.elements) {
            if (el.interactive && el.text.trim())
                node.affordances.add(el.text.trim().toLowerCase());
        }
        const prev = this.navigationTrail[this.navigationTrail.length - 1];
        if (prev !== sig)
            this.navigationTrail.push(sig);
        return node;
    }
    markTried(signature, affordanceLabel) {
        this.screens.get(signature)?.triedAffordances.add(affordanceLabel.trim().toLowerCase());
    }
    recordTransition(from, to, via) {
        if (from === to)
            return;
        const key = `${from}->${to}::${via}`;
        const edge = this.edges.get(key);
        if (edge)
            edge.traversals += 1;
        else
            this.edges.set(key, { from, to, via, traversals: 1 });
    }
    knownScreens() {
        return [...this.screens.values()];
    }
    knownEdges() {
        return [...this.edges.values()];
    }
    isNovelScreen(percept) {
        const node = this.screens.get(this.identityOf(percept));
        return !node || node.visits <= 1;
    }
    /**
     * Pre-seed screens the operator remembers from previous sessions, so a
     * returning user *recognizes* them (skips re-reading) and carries forward
     * which affordances they knew about. Called once at session start when a
     * long-term memory profile is loaded; a no-op for first-ever sessions.
     */
    seedFamiliarScreens(remembered) {
        for (const r of remembered) {
            if (this.screens.has(r.signature))
                continue;
            this.screens.set(r.signature, {
                signature: r.signature,
                url: r.url,
                title: r.title,
                // visits ≥ 2 → isNovelScreen() is false → the operator recognizes it.
                visits: 2,
                firstSeenStep: -1,
                lastSeenStep: -1,
                affordances: new Set(r.affordances),
                triedAffordances: new Set(),
            });
        }
    }
    trail() {
        return this.navigationTrail;
    }
    /** Detects going in circles: visiting the same screen repeatedly recently. */
    loopingScore() {
        const recent = this.navigationTrail.slice(-8);
        if (recent.length < 4)
            return 0;
        const unique = new Set(recent).size;
        return 1 - unique / recent.length;
    }
}
//# sourceMappingURL=memory.js.map