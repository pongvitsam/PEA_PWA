# Sync Index.html → docs/app.html for GitHub Pages.
# Preserves/injects config.js + pwa-gas-api.js (google.script.run polyfill).
param(
  [string]$Version = "19"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "Index.html"
$dst = Join-Path $root "docs\app.html"
if (!(Test-Path $src)) { throw "Missing Index.html" }

$html = [System.IO.File]::ReadAllText($src)
$marker = @"
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  
  <script>
"@
$inject = @"
  <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
  <!-- GitHub Pages: polyfill google.script.run → Apps Script API (อย่าลบเมื่อ sync จาก Index.html) -->
  <script src="js/config.js"></script>
  <script src="js/pwa-gas-api.js?v=$Version"></script>
  
  <script>
"@

if ($html -notlike "*$($marker.Trim())*" -and $html -notmatch 'sweetalert2@11"></script>\s*<script>') {
  # fallback: inject before first big <script> after leaflet
}
if ($html -match '(?s)(<script src="https://cdn\.jsdelivr\.net/npm/sweetalert2@11"></script>\s*)(<script>)') {
  $html = $html -replace '(?s)(<script src="https://cdn\.jsdelivr\.net/npm/sweetalert2@11"></script>\s*)(<script>)', @"
`$1  <!-- GitHub Pages: polyfill google.script.run → Apps Script API (อย่าลบเมื่อ sync จาก Index.html) -->
  <script src="js/config.js"></script>
  <script src="js/pwa-gas-api.js?v=$Version"></script>
  
  `$2
"@
} else {
  throw "Could not find sweetalert2 script anchor in Index.html"
}

[System.IO.File]::WriteAllText($dst, $html)
Write-Host "Synced docs/app.html (with pwa-gas-api.js?v=$Version)"
