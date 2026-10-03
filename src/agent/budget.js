// Budget governor — the only thing between a misconfigured loop and an unbounded bill.
// Not optional polish: max_usd / max_steps / max_tokens / max_wall_seconds all halt
// the loop independently, and the loop checks after EVERY model call and tool call.
export function makeBudget(limits, startTime = Date.now()) {
  return {
    limits,
    steps: 0,
    tokens: 0,
    usd: 0,
    started: startTime,
    // Outstanding child reservations (escrow): committed at spawn, released
    // (minus actual consumption) at completion. Reserved amounts count toward
    // ceilings immediately, so concurrent children cannot be granted
    // overlapping slices of the same remaining budget. Transient by design:
    // never checkpointed (a resumed worker's outstanding children are dead;
    // their rows reconcile to worker_gone and their escrow dies with them).
    reservedSteps: 0,
    reservedTokens: 0,
    reservedUsd: 0,
    lastReason: null,
    spend({ tokens = 0, cost = 0 } = {}) {
      this.tokens += tokens;
      this.usd += cost;
    },
    // Escrow a slice for a child BEFORE forking. Synchronous by contract:
    // callers must reserve in the same tick as slicing so parallel batches
    // observe each other's reservations (JS run-to-completion atomicity).
    reserve({ steps = 0, tokens = 0, cost = 0 } = {}) {
      this.reservedSteps += steps;
      this.reservedTokens += tokens;
      this.reservedUsd += cost;
    },
    // Release escrow minus actuals. Clamped so a double-release can never
    // inflate the budget (fail-closed direction: over-release is absorbed,
    // never converted into free money).
    refund({ steps = 0, tokens = 0, cost = 0 } = {}) {
      this.reservedSteps = Math.max(0, this.reservedSteps - steps);
      this.reservedTokens = Math.max(0, this.reservedTokens - tokens);
      this.reservedUsd = Math.max(0, this.reservedUsd - cost);
    },
    check() {
      const steps = this.steps + this.reservedSteps;
      const tokens = this.tokens + this.reservedTokens;
      const usd = this.usd + this.reservedUsd;
      if (this.limits.max_steps != null && steps >= this.limits.max_steps) return this.halt("max_steps");
      if (this.limits.max_tokens != null && tokens >= this.limits.max_tokens) return this.halt("max_tokens");
      if (this.limits.max_usd != null && usd >= this.limits.max_usd) return this.halt("max_usd");
      if (this.limits.max_wall_seconds != null && Date.now() - this.started >= this.limits.max_wall_seconds * 1000) return this.halt("max_wall_seconds");
      return { exhausted: false };
    },
    halt(reason) {
      this.lastReason = reason;
      return { exhausted: true, reason };
    },
  };
}