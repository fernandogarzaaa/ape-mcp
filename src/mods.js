import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readFileSync as rfs } from "node:fs";

function readYamlList(path) {
  try {
    const txt = rfs(path, "utf8");
    const m = txt.match(/mods:\s*\[(.*?)\]/s);
    if (!m) return null;
    return m[1].split(",").map((s) => s.trim().replace(/["']/g, "")).filter(Boolean);
  } catch { return null; }
}

export function loadMods(root) {
  const mods = [];
  const cfgMods = readYamlList(join(root, "godmode.config.yaml")) ?? readYamlList(join(root, "godmode.config.example.yaml")) ?? [];
  const dirs = new Set([...cfgMods.map((m) => join(root, m.replace(/^\.\//, ""))), join(root, "mods", "policy-gates")]);
  for (const d of dirs) {
    const manifest = join(d, "mod.json");
    const hooks = join(d, "hooks.js");
    if (!existsSync(manifest)) continue;
    try {
      const meta = JSON.parse(readFileSync(manifest, "utf8"));
      if (meta.enabled === false) continue;
      mods.push({ name: meta.name ?? d.split(/[/\\]/).pop(), ...meta, hooks: existsSync(hooks) ? {} : {} });
    } catch { /* broken mod files skipped with warning, never crash */ }
  }
  return mods;
}
