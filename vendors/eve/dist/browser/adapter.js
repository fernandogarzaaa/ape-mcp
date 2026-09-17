/** Narrow an adapter to its kernel-native interface, when it has one. */
export function asKernelSurface(adapter) {
    const candidate = adapter;
    if (typeof candidate.kernelPercept === "function" && typeof candidate.actKernel === "function") {
        return adapter;
    }
    return null;
}
//# sourceMappingURL=adapter.js.map