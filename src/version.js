// Single source of truth for the server version. Every serverInfo,
// discover(), status, and --version surface reads this; nothing hardcodes a
// version string anywhere else (audit: EVE reported the server as v1.0.0
// while the package was 1.0.2). Leaf module — no internal imports, so no
// import cycles.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

let version = "0.0.0";
try {
  const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
  if (typeof pkg.version === "string" && pkg.version) version = pkg.version;
} catch { /* packaged without package.json: fall back to 0.0.0, never crash */ }

export const APE_VERSION = version;
