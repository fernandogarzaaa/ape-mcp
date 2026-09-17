/**
 * Minimal async-aware typed event bus. Listener errors are collected and
 * surfaced via the onError hook instead of breaking the simulation loop.
 */
export class EventBus {
    onError;
    listeners = new Map();
    constructor(onError = () => { }) {
        this.onError = onError;
    }
    on(event, listener) {
        let set = this.listeners.get(event);
        if (!set) {
            set = new Set();
            this.listeners.set(event, set);
        }
        set.add(listener);
        return () => set.delete(listener);
    }
    async emit(event, payload) {
        const set = this.listeners.get(event);
        if (!set)
            return;
        for (const listener of [...set]) {
            try {
                await listener(payload);
            }
            catch (err) {
                this.onError(err, event);
            }
        }
    }
}
//# sourceMappingURL=events.js.map