$ErrorActionPreference = "Stop"
# GodMode one-liner: iex (irm https://raw.githubusercontent.com/fernandogarzaaa/godmode/main/install.ps1)
$dst = Join-Path $HOME ".godmode\src"
if (Test-Path (Join-Path $dst ".git")) { git -C $dst pull --ff-only } else { git clone https://github.com/fernandogarzaaa/godmode $dst }
Set-Location $dst
node --version
npm install --omit=dev
node bin/godmode.js doctor
Write-Output "godmode installed at $dst"
