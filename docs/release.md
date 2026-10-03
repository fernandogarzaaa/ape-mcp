# Release runbook (npm + TUI prebuilts)

Order is load-bearing: **tag → CI builds assets → verify → npm publish.**
Never publish before the release carries all four TUI binaries plus
SHA256SUMS; postinstall downloads them by tag, and a publish without
assets ships a TUI that can only build via cargo.

## 0. Preconditions (on `main`, clean tree)

- `npm test` green (all files in the `test` script), `cargo test --manifest-path tui/Cargo.toml` green.
- New test files are wired into the `package.json` `test` script (merges
  have dropped entries before — `scripts/test.mjs` fails the run if any
  declared file is missing, so the suite count can only grow by accident
  of deletion, never shrink silently).
- `npm run tui:snap` green (capture + snapshots current).
- `package.json` version bumped, `package-lock.json` in sync, CHANGELOG entry written.
- No `console.log` debugging, no stray temp files (`git status --short` clean apart from intended).

## One-time repo settings (do once, not per release)

- **Environment `npm-publish` with a required reviewer:** repo Settings →
  Environments → New environment → name `npm-publish` → Required
  reviewers → add yourself. The publish job pauses here on every tag
  until you approve; use the pause to eyeball the release assets.
- **Trusted publishing (already done, verify if publish auth fails):**
  npm package Settings → Trusted Publisher must name workflow
  `publish-npm.yml` in this repo.
- **Install-scripts approval (tell users, not a repo setting):**
  current npm holds `postinstall` behind an approval
  (`npm install-scripts approve ape-mcp`, or answer the install prompt).
  Until approved, the TUI prebuilt is not fetched and `ape` falls back
  to the one-time cargo build. Mention it in release notes; the
  `tui-pack-install` CI job proves both the script and the fallback.

## 1. Dry run on a pre-release tag (proves the workflow without publishing)
```powershell
git tag v<VERSION>-rc.1
git push origin v<VERSION>-rc.1
```

What to check (all in the repo's Actions tab):

- `tui-binaries` completes: 4 build jobs (win-x64, linux-x64,
  darwin-arm64, darwin-x64) + checksums job. The `release` job attaches
  5 files to the `v<VERSION>-rc.1` release: the 4 `ape-tui-*` assets
  plus `SHA256SUMS`.
- `publish-npm` FAILS on the version guard (`tag v<VERSION>-rc.1 does
  not match package.json version <VERSION>`) — that failure is the
  proof it cannot publish a pre-release. Do not "fix" it.
- Asset names match exactly what postinstall requests:
  `ape-tui-win-x64.exe`, `ape-tui-linux-x64`, `ape-tui-darwin-arm64`,
  `ape-tui-darwin-x64`, plus `SHA256SUMS` containing all four.
- Prove the download path from this machine (no publish involved):
  fetch one asset through the real `fetchTui` code against the rc tag,
  e.g. via node with `scripts/tui-fetch.mjs` (`tag: "v<VERSION>-rc.1"`),
  and confirm `{ ok: true }` with verified bytes. A 404 or mismatch
  here blocks the release — the postinstall on user machines would hit
  the same wall.
- Delete the rc release and tag only on explicit confirmation:
  `gh release delete v<VERSION>-rc.1 --yes` then
  `git push origin :v<VERSION>-rc.1` (and locally `git tag -d`).

## 1b. Gate proof without any tag (manual dispatch, always dry-run)

```powershell
gh workflow run publish-npm --ref main -f tag=v<EXISTING> -f dry_run=true
```

This runs the `test` job, then parks `publish` at the `npm-publish`
environment until a reviewer approves it in the Actions UI — approving
proves the gate end to end. Notes:

- Manual runs can never publish: dispatch forces `npm publish --dry-run`
  (`dry_run=false` is rejected up front).
- The version guard still applies: unless `<EXISTING>` matches
  `package.json`, the run fails safe at the guard *after* approval. A
  fully green dry run needs a tag whose version equals the tree — i.e.
  run this again after tagging the real version (dispatch is dry-run,
  so it stays safe).
- Reading a red dry-run: if the tag is already live on npm, expect exit
  1 with `You cannot publish over the previously published versions`
  — even `--dry-run` checks availability against the registry. That
  message IS the pass: the pipeline reached the publish step with valid
  OIDC auth and the registry refused the overwrite, so nothing changed.

## 2. Tag the release

```powershell
git tag v<VERSION>
git push origin v<VERSION>
```

## 3. Verify assets and checksums (before npm publish)

- `tui-binaries` release job green; release `v<VERSION>` shows the same
  5 files.
- Spot-check one checksum: download the asset + SHA256SUMS, compare
  locally (`Get-FileHash -Algorithm SHA256` on Windows,
  `sha256sum -c` on Linux/macOS).
- Confirm `publish-npm`'s version guard passes (tag == package.json).

## 4. Publish to npm

- Manual path (OTP dance): from a fresh clean clone at the tag,
  `npm ci`, `npm test`, `npm pack --dry-run`, then
  `npm publish --access public` (or `--otp=`).
- CI path: `publish-npm` runs automatically on the tag via OIDC
  (`--provenance`). Either path, never both for one version.
  The CI path additionally enforces, in order: version match, all 5
  release assets present (job fails otherwise — this is what caught the
  v1.1.0 asset gap pattern), tests, BOM check, then a human approval in
  the `npm-publish` environment. Approve only after step 3 above.
- Verify after: `npm view ape-mcp version` and
  `npm view ape-mcp dist-tags --json` show the new version as `latest`.

## 5. After

- `npm i -g ape-mcp@<VERSION>` on a clean machine: `ape-mcp doctor`
  green, `ape` banner works (proves the postinstall asset fetch).
- Keep the tag and release forever (postinstall pins downloads to them).
