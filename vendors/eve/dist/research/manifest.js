/** Structural validation: returns error strings, empty when valid. */
export function validateExperimentSpec(spec) {
    const errors = [];
    if (!spec.experimentId.trim())
        errors.push("experimentId must be non-empty.");
    if (spec.taskIds.length === 0)
        errors.push("at least one taskId is required.");
    if (spec.taskIds.some((t) => !t.trim()))
        errors.push("taskIds must all be non-empty.");
    if (!spec.environment.adapter.trim())
        errors.push("environment.adapter must be non-empty.");
    if (!spec.behaviorModelVersion.trim())
        errors.push("behaviorModelVersion must be non-empty.");
    if (!spec.parameterSetVersion.trim())
        errors.push("parameterSetVersion must be non-empty.");
    if (spec.population.size < 1)
        errors.push("population.size must be >= 1.");
    if (!Number.isFinite(spec.population.size)) {
        errors.push("population.size must be a finite number.");
    }
    if (!Number.isInteger(spec.population.size)) {
        errors.push("population.size must be an integer (fractional sizes diverge from manifests).");
    }
    if (spec.population.kind === "distribution" &&
        (!spec.population.distribution || spec.population.distribution.segments.length === 0)) {
        errors.push("distribution populations require a non-empty distribution.");
    }
    const weights = spec.population.distribution?.segments.map((s) => s.weight) ?? [];
    if (weights.some((w) => !Number.isFinite(w) || w < 0)) {
        errors.push("distribution weights must be finite numbers >= 0.");
    }
    if (weights.length > 0 && weights.every((w) => w === 0)) {
        errors.push("distribution weights must sum to more than 0.");
    }
    if (spec.variants.length === 0)
        errors.push("at least one variant is required.");
    const names = spec.variants.map((v) => v.name);
    if (names.some((n) => !n.trim()))
        errors.push("variant names must all be non-empty.");
    if (new Set(names).size !== names.length)
        errors.push("variant names must be unique.");
    if (spec.seeds.length === 0)
        errors.push("at least one seed is required.");
    const f = spec.datasetSplit.heldOutFraction;
    if (!(f > 0) || !(f < 1))
        errors.push("datasetSplit.heldOutFraction must be strictly between 0 and 1.");
    return errors;
}
/** Deterministic serialization for manifest freezing and review. */
export function renderExperimentJson(spec) {
    return JSON.stringify(spec, null, 2);
}
//# sourceMappingURL=manifest.js.map