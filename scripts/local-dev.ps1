<#
  local-dev.ps1 - send one well-specified task to a local Ollama model.
  Usage:
    .\local-dev.ps1 -TaskFile spec.md [-ContextFiles a.cs,b.cs] [-Target path\to\out.cs] [-Model mimo-v2.6:9b-q4_K_M]
  Writes the model's full reply to .local-dev\last-reply.md.
  If -Target is given, the FIRST fenced code block of the reply is written to that path
  (overwrites; run it on a clean git tree so Sonnet can review with `git diff`).
#>
param(
  [Parameter(Mandatory)][string]$TaskFile,
  [string[]]$ContextFiles = @(),
  [string]$Target,
  [string]$Model = "mimo-v2.6:9b-q4_K_M",
  [int]$NumCtx = 8192,
  [int]$MaxTokens = 2000
)
$ErrorActionPreference = "Stop"
$ollama = "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe"
try { Invoke-RestMethod http://localhost:11434/api/version -TimeoutSec 3 | Out-Null }
catch {
  $env:OLLAMA_FLASH_ATTENTION = "1"; $env:OLLAMA_KV_CACHE_TYPE = "q8_0"
  Start-Process $ollama -ArgumentList "serve" -WindowStyle Hidden
  for ($i=0; $i -lt 20; $i++) { Start-Sleep 1; try { Invoke-RestMethod http://localhost:11434/api/version -TimeoutSec 2 | Out-Null; break } catch {} }
}
$system = @"
You are a precise implementation agent. You receive ONE task spec and optional context files.
Rules: implement exactly what the spec says, nothing more. Do not rename or restructure existing code.
Output format: one short line of notes, then ONE fenced code block containing the COMPLETE new content of the target file.
If the spec is ambiguous or impossible, output only: BLOCKED: <one-line reason>.
"@
$user = "## TASK SPEC`n" + (Get-Content $TaskFile -Raw)
foreach ($f in $ContextFiles) { $user += "`n`n## CONTEXT FILE: $f`n``````n" + (Get-Content $f -Raw) + "`n``````" }
$body = @{
  model = $Model; stream = $false; think = $false
  messages = @(@{role="system";content=$system}, @{role="user";content=$user})
  options = @{ num_ctx = $NumCtx; num_predict = $MaxTokens; temperature = 0.2 }
} | ConvertTo-Json -Depth 6
$r = Invoke-RestMethod -Uri http://localhost:11434/api/chat -Method Post -Body $body -ContentType "application/json" -TimeoutSec 900
$reply = $r.message.content
New-Item -ItemType Directory -Force .local-dev | Out-Null
Set-Content .local-dev\last-reply.md $reply -Encoding UTF8
if ($reply -match '^\s*BLOCKED') { "BLOCKED: see .local-dev\last-reply.md"; exit 2 }
if ($Target) {
  $m = [regex]::Match($reply, '(?s)```[^\n]*\n(.*?)\n```')
  if (-not $m.Success) { "NO_CODE_BLOCK: see .local-dev\last-reply.md"; exit 3 }
  Set-Content $Target $m.Groups[1].Value -Encoding UTF8
  "WROTE $Target ($($r.eval_count) tokens)"
} else { "REPLY saved to .local-dev\last-reply.md ($($r.eval_count) tokens)" }
