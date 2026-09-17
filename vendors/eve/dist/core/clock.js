/**
 * Where time comes from.
 *
 * A simulated operator has two different reasons to ask what time it is, and
 * conflating them is what made EVE non-deterministic:
 *
 * - **Modeled human time.** How long a person would have taken to read, decide,
 *   hesitate and type. This is a property of the persona and the screen, it is
 *   computed, and it is the same on every replay.
 * - **Wall-clock time.** How long the host machine actually took. This is a
 *   property of the machine — scheduler pressure, disk cache, whether a browser
 *   was warm — and it differs on every run.
 *
 * Perceived latency, the settle wait, and the session time budget were all
 * reading wall-clock time and feeding the result into appraisal, so machine
 * noise entered the operator's emotional state and, through it, the composite
 * score. Two runs of the same seed could therefore disagree.
 *
 * A {@link Clock} makes the choice explicit. {@link WALL_CLOCK} preserves the
 * old behavior for driving a real browser, where waiting really does have to
 * wait. {@link SimulatedClock} advances only when the model says time passed,
 * so a run over a deterministic surface replays exactly.
 */
const realSleep = (ms) => ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
/** Time as the host machine sees it. Use when driving a real browser. */
export const WALL_CLOCK = {
    now: () => Date.now(),
    sleep: realSleep,
    advance: () => { },
    deterministic: false,
};
/**
 * Time as the model says it passed.
 *
 * Never blocks: a simulated wait is an addition. Two sessions constructed with
 * the same seed against the same deterministic surface therefore observe the
 * same clock values in the same order, whatever the host is doing.
 */
export class SimulatedClock {
    deterministic = true;
    t;
    constructor(origin = 0) {
        this.t = origin;
    }
    now() {
        return this.t;
    }
    advance(ms) {
        // Guard against a negative or non-finite duration reaching the clock:
        // monotonicity is what makes elapsed-time arithmetic safe downstream.
        if (Number.isFinite(ms) && ms > 0)
            this.t += ms;
    }
    async sleep(ms) {
        this.advance(ms);
    }
}
//# sourceMappingURL=clock.js.map