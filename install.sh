#!/usr/bin/env bash
set -euo pipefail
# GodMode one-liner: curl -fsSL https://raw.githubusercontent.com/fernandogarzaaa/godmode/main/install.sh | bash
DST="${HOME}/.godmode/src"
mkdir -p "$(dirname "$DST")"
if [ -d "$DST/.git" ]; then git -C "$DST" pull --ff-only; else git clone https://github.com/fernandogarzaaa/godmode "$DST"; fi
cd "$DST"
node --version
npm install --omit=dev
node bin/godmode.js doctor
echo "godmode installed at $DST — run: $DST/bin/godmode.js"
