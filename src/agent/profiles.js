// Agent profiles — the user-editable definition of what the agent *is*.
// Loaded at call time (no restart). Bundled defaults ship in profiles/; user
// overrides live in .ape/profiles/ and win.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function bundledDir() { return join(root, "profiles"); }
function userDir() {
  const d = process.env.APE_DATA_DIR || join(process.cwd(), ".ape");
  return join(d, "profiles");
}

const VALID_STOPS = ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"];

export function loadProfile(name) {
  const userPath = join(userDir(), `${name}.yaml`);
  const bundlePath = join(bundledDir(), `${name}.yaml`);
  const p = existsSync(userPath) ? userPath : existsSync(bundlePath) ? bundlePath : null;
  if (!p) return null;
  let profile;
  try { profile = YAML.parse(readFileSync(p, "utf8")); } catch { return null; }
  if (!profile?.name || !profile?.model?.provider) return null;
  profile.source = p;
  profile.model = {
    provider: profile.model.provider ?? "auto",
    id: profile.model.id ?? "auto",
    fallback: profile.model.fallback,
  };
  profile.stop_conditions = (profile.stop_conditions ?? ["no_tool_call_in_step", "explicit_final_answer", "budget_exhausted"])
    .filter((s) => VALID_STOPS.includes(s));
  profile.limits = {
    max_steps: profile.limits?.max_steps ?? 12,
    max_tokens: profile.limits?.max_tokens ?? 120000,
    max_wall_seconds: profile.limits?.max_wall_seconds ?? 300,
    max_usd: profile.limits?.max_usd ?? 0.5,
  };
  return profile;
}

export function listProfiles() {
  const names = new Set();
  for (const dir of [bundledDir(), userDir()]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) {
      if (f.endsWith(".yaml")) names.add(f.slice(0, -5));
    }
  }
  return [...names].sort();
}

export function describeProfile(name) {
  const p = loadProfile(name);
  if (!p) return null;
  return {
    name: p.name,
    description: p.description ?? "",
    model: p.model,
    tools: p.tools ?? [],
    limits: p.limits,
    stop_conditions: p.stop_conditions,
    source: p.source,
  };
}