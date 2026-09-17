# Standalone guarantee

`godmode` ships the 5 repos inside `vendors/` (see `vendors/manifest.yaml` + `vendors/vendor-report.json`). Install/CI run with **no `git clone` of sources, no `npx -y <source-repo>`, no network fetch at runtime** — dispatch shells only to in-plugin paths. `godmode doctor` proves presence; `scripts/smoke.mjs` proves router + MRTR offline.
