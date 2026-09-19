// Outcome identity — stable IDs for what runs produce, so the ledger can answer
// "have we solved this before, what did it cost, and which variants are dead."
// family: hash of the NORMALIZED objective (reruns of the same task cluster).
// variant: the run receipt's outcome_hash (what actually happened this time).
// Pure functions; storage lives in runs.js.
import { shaShort } from "../trace.js";

export function normalizeObjective(objective) {
  return String(objective ?? "")
    .toLowerCase()
    .replace(/run[-_ ]?id[:\s]+run-[a-z0-9-]+/g, "") // strip run ids pasted into follow-ups
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

export function familyOf(objective) {
  return "fam-" + shaShort(normalizeObjective(objective));
}
