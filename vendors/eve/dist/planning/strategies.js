export function strategyWeights(strategy) {
    switch (strategy) {
        case "curious":
            return { noveltyWeight: 1.4, goalWeight: 0.7, surveyBias: 0.25, completionBias: 0.3 };
        case "systematic":
            return { noveltyWeight: 1.0, goalWeight: 0.9, surveyBias: 0.5, completionBias: 0.85 };
        case "goal-directed":
            return { noveltyWeight: 0.5, goalWeight: 1.5, surveyBias: 0.15, completionBias: 0.5 };
    }
}
//# sourceMappingURL=strategies.js.map