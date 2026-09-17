# NOTICE — GodMode license split (combined distribution)

- GodMode code (`bin/`, `src/`, `console/`, `skills/`, `mods/`, `schemas/`): **MIT**.
- `vendors/genesis` (MIT), `vendors/eve` (MIT), `vendors/adam` (MIT), `vendors/skein` (MIT): see each `LICENSE`.
- `vendors/eve-miro`: data fabric + in-tree `eve/` are **MIT** (see `vendors/eve-miro/LICENSE`, `NOTICE.md`); `vendors/eve-miro/mirofish/` is **AGPL-3.0** (see `vendors/eve-miro/mirofish/LICENSE`).
- Combined distribution including `mirofish/` is subject to AGPL-3.0 for that component. MIT-only build: `GODMODE_NO_AGPL=1 node scripts/vendor.mjs` (writes `mirofish.EXCLUDED`).
