# Auto-update setup

GodMode re-vendors the 5 source repos automatically. Two triggers feed
`.github/workflows/auto-update.yml` (cron 6h backstop + instant dispatch + manual):

## 1. Instant dispatch (per source repo, one-time setup)

1. Create a PAT: GitHub Settings → Developer settings → Tokens (classic),
   scope `repo` (or fine-grained: contents read on the source, contents+PRs write on godmode).
2. Add it as secret `GODMODE_SYNC_TOKEN` in **each** of the 5 source repos.
3. Copy `docs/notify-godmode.template.yml` to `<source>/.github/workflows/notify-godmode.yml`,
   replacing `REPO_NAME` with one of `genesis | eve | adam | skein | eve-miro`.

Pushes to a source `main` then fire `source-updated` → godmode syncs within minutes.

## 2. Backstop + manual

* Cron runs every 6h and catches anything dispatch missed (compare HEAD vs `vendors/manifest.yaml`).
* Manual: Actions → auto-update → Run workflow (`repos` csv filter, `force` flag).

## 3. What the updater does

resolve SHAs → clone `--depth 1` at SHA → `sync-vendors.mjs` (shared keep-lists) →
manifest pins → rebuild genesis/eve `dist/` → `check-licenses.mjs` (AGPL gate) →
doctor/smoke/tests → **one batched PR, human merge required**.

## 4. Protect `main`

Settings → Branches: require PR before merging, require `ci` + verify status checks.
Without this the bot PR flow can be bypassed.

## 5. Let the bot create PRs

The updater's final step opens a pull request. The default `GITHUB_TOKEN` is only
allowed to do that if the repo setting is enabled:
**godmode → Settings → Actions → General → Workflow permissions → ✅ "Allow GitHub
Actions to create and approve pull requests"**.

Alternative (no setting change): add the PAT as secret `GODMODE_SYNC_TOKEN` in the
**godmode** repo — the workflow uses it (`secrets.GODMODE_SYNC_TOKEN || github.token`).

Symptom if missing: `auto-update` run fails at "Open update PR" with
`GitHub Actions is not permitted to create or approve pull requests`.
