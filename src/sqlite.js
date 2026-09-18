// node:sqlite wrapper with a TARGETED ExperimentalWarning suppression.
// Older Node releases (22.5–25) emit an ExperimentalWarning on first import of
// node:sqlite; hosts (e.g. LM Studio's log viewer) render any stderr line as
// "Error:", so a scary warning on first run is a real first-impression cost.
// We suppress ONLY that warning, never blanket --no-warnings.
const origEmit = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  const kind = typeof args[0] === "string" ? args[0] : "";
  const msg = String(warning?.message ?? warning ?? "");
  if (kind === "ExperimentalWarning" && msg.includes("node:sqlite")) return;
  return origEmit(warning, ...args);
};

const { DatabaseSync } = await import("node:sqlite");
export { DatabaseSync };