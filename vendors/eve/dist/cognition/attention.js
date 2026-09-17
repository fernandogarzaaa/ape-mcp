import { contrastRatio, parseHexColor, relativeLuminance } from "../vision/pixels.js";
import { goalRelevanceOf } from "./salience.js";
const _WARNING_COLOR_RE = /^#(?:[c-f][0-9a-f][0-6][0-9a-f]{3}|f{2}[0-9a-f]{4})$/i;
function isWarningColor(hex) {
    if (!hex)
        return false;
    const rgb = parseHexColor(hex);
    if (!rgb)
        return false;
    const [r, g, b] = rgb;
    // Perceptually red-dominant: the classic warning signal.
    return r > 150 && r > g * 1.6 && r > b * 1.6;
}
/** Visual salience of one element (size, contrast, color, role). */
export function visualSalience(el, percept) {
    const viewportArea = percept.viewport.width * percept.viewport.height || 1;
    const area = el.box.width * el.box.height;
    const size = Math.min(1, (area / viewportArea) * 30);
    let contrast = 0.3;
    if (el.color && el.backgroundColor) {
        const fg = parseHexColor(el.color);
        const bg = parseHexColor(el.backgroundColor);
        if (fg && bg) {
            const ratio = contrastRatio(relativeLuminance(fg[0], fg[1], fg[2]), relativeLuminance(bg[0], bg[1], bg[2]));
            contrast = Math.min(1, ratio / 12);
        }
    }
    const heading = el.role === "heading" ? 0.5 : 0;
    const warning = isWarningColor(el.color) || isWarningColor(el.backgroundColor) ? 0.6 : 0;
    const control = el.role === "button" || el.role === "textbox" ? 0.25 : 0;
    return Math.min(1.5, size * 0.5 + contrast * 0.4 + heading + warning + control);
}
/** Has this element visibly changed relative to the previous percept? */
function changedSince(el, prev) {
    if (!prev)
        return false;
    const match = prev.elements.find((p) => Math.abs(p.box.x - el.box.x) < 6 && Math.abs(p.box.y - el.box.y) < 6 && p.role === el.role);
    if (!match)
        return true; // appeared
    return match.text.trim() !== el.text.trim();
}
/** F-pattern scanning prior: earlier (top, reading-direction-start) = higher. */
function scanPrior(el, percept, readingDirection) {
    const vw = percept.viewport.width || 1;
    const vh = percept.viewport.height || 1;
    const yNorm = Math.max(0, Math.min(1, el.box.y / vh));
    const xRaw = Math.max(0, Math.min(1, el.box.x / vw));
    const xNorm = readingDirection === "rtl" ? 1 - xRaw : xRaw;
    // Top rows dominate; horizontal position matters most near the top (the
    // "F" shape: two horizontal sweeps, then a vertical scan of the start edge).
    return (1 - yNorm) * 0.7 + (1 - xNorm) * (0.3 * (1 - yNorm * 0.6));
}
/**
 * Allocate one glance of attention to the current percept.
 */
export function allocateAttention(percept, previousPercept, goalKeywords, persona, rng, options = {}) {
    const readingDirection = options.readingDirection ?? "ltr";
    const candidates = percept.elements.filter((el) => el.box.width > 1 && el.box.height > 1 && (el.text.trim() || el.interactive));
    const scored = candidates.map((el) => {
        const goalValue = goalRelevanceOf(el, goalKeywords);
        const changed = changedSince(el, previousPercept);
        // SEEV: salience + (negative) effort via scanning prior + expectancy
        // (changed things attract re-inspection) + value (goal relevance).
        const score = visualSalience(el, percept) * 0.8 +
            scanPrior(el, percept, readingDirection) * (0.4 + persona.traits.thoroughness * 0.4) +
            (changed ? 0.7 : 0) +
            goalValue * 1.2 +
            rng.range(0, 0.15); // perceptual noise
        return { el, score, changed, goalValue };
    });
    scored.sort((a, b) => b.score - a.score);
    // Goal focus: when the goal has strong matches on screen, attention
    // narrows (inattentional blindness for peripheral content).
    const bestGoal = scored.reduce((m, s) => Math.max(m, s.goalValue), 0);
    const goalFocus = Math.min(1, bestGoal * (0.6 + (1 - persona.traits.attentionSpan) * 0.4));
    // Fixation budget: attention span sets how much of the screen is sampled.
    const budget = Math.max(3, Math.round((4 + persona.traits.attentionSpan * 10) * (1 - goalFocus * 0.35)));
    const fixations = [];
    const attendedIds = new Set();
    let last = null;
    let glanceMs = 0;
    for (const s of scored) {
        if (fixations.length >= budget)
            break;
        // Under strong goal focus, low-value peripheral items are skipped even
        // when visually salient.
        if (goalFocus > 0.6 && s.goalValue < 0.1 && visualSalience(s.el, percept) < 0.7) {
            if (!s.changed)
                continue;
        }
        const point = {
            x: s.el.box.x + s.el.box.width / 2,
            y: s.el.box.y + s.el.box.height / 2,
        };
        const saccadePx = last ? Math.hypot(point.x - last.x, point.y - last.y) : 0;
        const words = s.el.text.split(/\s+/).filter(Boolean).length;
        const durationMs = Math.round(Math.max(180, Math.min(900, 200 + words * (60_000 / persona.traits.readingSpeedWpm) * 0.2)) *
            (0.9 + rng.next() * 0.3));
        fixations.push({ elementId: s.el.id, point, durationMs, order: fixations.length, saccadePx });
        attendedIds.add(s.el.id);
        glanceMs += durationMs + saccadePx * 0.05; // ~20px/ms saccade velocity
        last = point;
    }
    // Dialogs always capture attention (attentional capture by onset).
    for (const el of percept.elements) {
        if (el.role === "dialog" || el.role === "alert")
            attendedIds.add(el.id);
    }
    const missedChanges = scored
        .filter((s) => s.changed && !attendedIds.has(s.el.id) && s.el.text.trim())
        .map((s) => s.el);
    return {
        fixations,
        attendedIds,
        missedChanges,
        glanceMs: Math.round(glanceMs),
        goalFocus,
    };
}
/** Restrict a percept to its attended elements (what cognition may use). */
export function attendedPercept(percept, snapshot) {
    return {
        ...percept,
        elements: percept.elements.filter((el) => snapshot.attendedIds.has(el.id)),
    };
}
//# sourceMappingURL=attention.js.map