# Release runbook (npm + TUI prebuilts)

Order is load-bearing: **tag → CI builds assets → verify → npm publish.**
Never publish before the release carries all four TUI binaries plus
SHA256SUMS; postinstall downloads them by tag, and a publish without
assets ships a TUI that can only build via cargo.

## 0. Preconditions (on `main`, clean tree)

- `npm test` green (all files in the `test` script), `cargo test --manifest-path tui/Cargo.toml` green.
- `npm run tui:snap` green (capture + snapshots current).
- `package.json` version bumped, `package-lock.json` in sync, CHANGELOG entry written.
- No `console.log` debugging, no stray temp files (`git status --short` clean apart from intended).

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
- Verify after: `npm view ape-mcp version` and
  `npm view ape-mcp dist-tags --json` show the new version as `latest`.

## 5. After

- `npm i -g ape-mcp@<VERSION>` on a clean machine: `ape-mcp doctor`
  green, `ape` banner works (proves the postinstall asset fetch).
- Keep the tag and release forever (postinstall pins downloads to them).
