# NOTICE — APE license split (combined distribution)

- APE code (`bin/`, `src/`, `console/`, `skills/`, `mods/`, `schemas/`): **MIT**.
- `vendors/genesis` (MIT), `vendors/eve` (MIT), `vendors/adam` (MIT), `vendors/skein` (MIT): see each `LICENSE`.
- Every engine ships vendored and commit-pinned via `vendors/manifest.yaml`. No runtime `git clone`, no `npx -y <other-repo>`.
- The only runtime network egress is user-declared connectors (`APE_*` env auth) and configured model providers for the embedded agent — both explicit, both listed by `ape-mcp doctor`.
- `src/agent/freepool/` and `catalog/freepool.json`: APE's own MIT code and data. The design (stacked free tiers, `(provider, model, key)` routing with health scoring, per-window rate accounting reset at UTC midnight, learned ceilings, escalating cooldowns, failover) is inspired by **FreeLLMAPI** by Tashfeen Ahmed — https://github.com/tashfeenahmed/freellmapi — MIT License, Copyright (c) 2026 Tashfeen Ahmed. Clean-room JavaScript port of the ideas; no FreeLLMAPI source code is included and there is no runtime dependency on it.
- The freepool runtime adds network egress to the free-tier hosts in `src/agent/freepool/members.js`, contacted only when the user has set that provider's key; all are listed by `ape-mcp doctor`.
