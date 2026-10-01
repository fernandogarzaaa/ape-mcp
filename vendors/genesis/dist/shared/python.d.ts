/**
 * Resolve a Python interpreter for command templates (`{python}`), tests,
 * and adapter harnesses. Prefers `python`, falls back to `python3`, and
 * throws a clear error when neither is on PATH. The PATH probe runs at
 * most once per process.
 */
export declare function resolvePython(): string;
//# sourceMappingURL=python.d.ts.map