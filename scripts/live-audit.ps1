# Live GodMode exercise battery — drives the MCP (HTTP) + console exactly like a
# plugin client would. Usage: powershell -File scripts/live-audit.ps1
# NOTE: never name a param `$args` (PowerShell automatic variable) — payloads go empty.
$ErrorActionPreference = "Continue"
$root = "E:\godmode"
$mcpPort = 18771
$api = "http://127.0.0.1:$mcpPort"
$results = @()

function Check($name, $cond, $detail = "") {
  $script:results += @{ name = $name; pass = [bool]$cond; detail = $detail }
  Write-Output ("[{0}] {1} {2}" -f ($(if ($cond) { "PASS" } else { "FAIL" }), $name, $detail))
}

function WaitReady($url, $tries = 20) {
  for ($i = 0; $i -lt $tries; $i++) {
    try { $null = Invoke-RestMethod -Uri $url -TimeoutSec 2; return $true } catch { Start-Sleep -Milliseconds 500 }
  }
  return $false
}

function McpCall($tool, $params) {
  $body = @{ name = $tool; arguments = $params } | ConvertTo-Json -Depth 6 -Compress
  return Invoke-RestMethod -Uri "$api/call" -Method Post -Body $body -ContentType "application/json" -Headers @{ "Mcp-Method" = "tools/call" }
}

$jm = Start-Job -ScriptBlock { Set-Location E:\godmode; node bin/godmode-mcp.js --http 18771 }
Check "server-ready" (WaitReady "$api/discover")

try { $d = Invoke-RestMethod -Uri "$api/discover"; Check "discover" ($d.protocol -eq "2026-07-28") $d.protocol }
catch { Check "discover" $false $_ }
try { $t = Invoke-RestMethod -Uri "$api/tools"; Check "tools-list-15" ($t.tools.Count -eq 15) ("count=" + $t.tools.Count) }
catch { Check "tools-list-15" $false $_ }

# status + real payload verification (not just resultType)
try {
  $r = McpCall "godmode_status" @{}
  $eng = $r.structuredContent.result.engines
  Check "status-engines" ($r.resultType -eq "complete" -and $eng.genesis -eq "vendored" -and $eng.adam -eq "vendored") ""
} catch { Check "status-engines" $false $_ }

# remember actually stores via real vendored adam-mcp (returns memory id)
try {
  $r = McpCall "godmode_remember" @{ kind = "episodic"; content = "live-audit-marker-42"; origin = "observation"; confidence = 0.9 }
  $res = $r.structuredContent.result
  Check "remember-payload" ($res._adam -eq "ok" -and $res.result[0].text -match "id") ""
} catch { Check "remember-payload" $false $_ }

# recall a real query against the stored memory
try {
  $r = McpCall "godmode_recall" @{ query = "live-audit-marker-42"; top_k = 3 }
  $res = $r.structuredContent.result
  Check "recall-payload" ($res._adam -eq "ok" -and ($res.result[0].text -match "live-audit-marker-42")) ""
} catch { Check "recall-payload" $false $_ }

# skein orchestrate status (real engine call via PYTHONPATH unavailable in job; still routes)
try {
  $r = McpCall "godmode_orchestrate" @{ op = "status" }
  Check "orchestrate-status" ($r.resultType -eq "complete") ""
} catch { Check "orchestrate-status" $false $_ }

# world simulate provenance contract
try {
  $r = McpCall "godmode_world_simulate" @{}
  Check "world-provenance" ($r.structuredContent.result.provenance -contains "OBSERVED") ""
} catch { Check "world-provenance" $false $_ }

# MRTR confirm for destructive evolve — REAL payload (was broken by $args bug)
try {
  $r = McpCall "godmode_evolve" @{ action = "accept"; proposal_id = "p-live" }
  Check "mrtr-confirm" ($r.resultType -eq "input_required" -and $r.requestState -and ($r.inputRequests[0].message -match "destructive")) ""
} catch { Check "mrtr-confirm" $false $_ }

# background task lifecycle — REAL nested tool+arguments
try {
  $r = McpCall "godmode_task_start" @{ tool = "godmode_status"; arguments = @{} }
  $id = $r.structuredContent.result.task_id
  $ok = $false
  for ($i = 0; $i -lt 20; $i++) {
    Start-Sleep -Milliseconds 500
    $g = Invoke-RestMethod -Uri "$api/tasks/get" -Method Post -Body (@{ task_id = $id } | ConvertTo-Json -Compress) -ContentType "application/json"
    if ($g.task.status -eq "done") { $ok = $true; break }
    if ($g.task.status -eq "failed") { break }
  }
  Check "task-lifecycle" $ok ("id=" + $id)
} catch { Check "task-lifecycle" $false $_ }

# unknown tool honest error
try {
  $r = McpCall "godmode_nonexistent" @{}
  Check "unknown-tool" ($r.structuredContent.result.error -eq "unknown_tool") ""
} catch { Check "unknown-tool" $false $_ }

# header mismatch rejection
try {
  $body = @{ name = "godmode_status"; arguments = @{} } | ConvertTo-Json -Compress
  $null = Invoke-RestMethod -Uri "$api/call" -Method Post -Body $body -ContentType "application/json" -Headers @{ "Mcp-Method" = "wrong/method" }
  Check "header-mismatch" $false "no rejection"
} catch { Check "header-mismatch" ($_.ToString() -match "400") "400 rejected" }

try { $w = Invoke-RestMethod -Uri "$api/.well-known/oauth-protected-resource"; Check "well-known" ($w.godmode_mode -eq "local-open") "" }
catch { Check "well-known" $false $_ }

try {
  $resp = echo '{"jsonrpc":"2.0","id":9,"method":"tools/list","params":{}}' | node $root\bin\godmode-mcp.js
  Check "stdio" ($resp -match "godmode_status") ""
} catch { Check "stdio" $false $_ }

$ju = Start-Job -ScriptBlock { Set-Location E:\godmode; node bin/godmode.js serve --no-open }
Start-Sleep -Seconds 3
try {
  $out = Receive-Job -Job $ju 2>&1 | Out-String
  if ($out -match "(http://127\.0\.0\.1:\d+/)") {
    $curl = $Matches[1]
    $pg = Invoke-WebRequest -Uri $curl -UseBasicParsing
    Check "console-page" ($pg.StatusCode -eq 200 -and $pg.Content -match "GodMode") $curl
    $tr = Invoke-RestMethod -Uri ($curl + "api/trace?since=0")
    Check "console-trace" ($tr.count -gt 0) ("events=" + $tr.count)
    $tk = Invoke-RestMethod -Uri ($curl + "api/tasks")
    Check "console-tasks" ($null -ne $tk.tasks) ""
  } else { Check "console-page" $false "no URL in output" }
} catch { Check "console-page" $false $_.ToString().Substring(0, [Math]::Min(120, $_.ToString().Length)) }

Stop-Job $jm, $ju -ErrorAction SilentlyContinue; Remove-Job $jm, $ju -Force -ErrorAction SilentlyContinue
$failed = @($results | Where-Object { -not $_.pass })
Write-Output ("--- LIVE AUDIT: {0}/{1} passed ---" -f ($results.Count - $failed.Count), $results.Count)
if ($failed.Count -gt 0) { exit 1 }