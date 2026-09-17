import { defaultRegistries } from "./registries.js";
export class PluginManager {
    onError;
    registries;
    plugins = [];
    constructor(onError = () => { }, registries = defaultRegistries) {
        this.onError = onError;
        this.registries = registries;
    }
    register(plugin) {
        if (this.plugins.some((p) => p.name === plugin.name)) {
            throw new Error(`Plugin "${plugin.name}" is already registered`);
        }
        this.plugins.push(plugin);
        if (plugin.onRegister) {
            try {
                plugin.onRegister(this.registries);
            }
            catch (err) {
                this.onError(err, plugin.name);
            }
        }
    }
    list() {
        return this.plugins;
    }
    async sessionStart(ctx) {
        await this.each((p) => p.onSessionStart?.(ctx));
    }
    async percept(ctx, percept, step) {
        await this.each((p) => p.onPercept?.(ctx, percept, step));
    }
    async outcome(ctx, outcome, percept, step) {
        await this.each((p) => p.onOutcome?.(ctx, outcome, percept, step));
    }
    async sessionEnd(ctx, iterations) {
        await this.each((p) => p.onSessionEnd?.(ctx, iterations));
    }
    async each(fn) {
        for (const plugin of this.plugins) {
            try {
                await fn(plugin);
            }
            catch (err) {
                this.onError(err, plugin.name);
            }
        }
    }
}
//# sourceMappingURL=plugin.js.map