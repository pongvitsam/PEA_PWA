param(
  [string]$Description = "auto deploy"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "==> clasp push --force" -ForegroundColor Cyan
clasp push --force
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> clasp deploy" -ForegroundColor Cyan
clasp deploy -i AKfycbwEIi5cZDzvdGqcfqcsJcPjW1pBnTALtZFlGYZDkCYl9MTvOL0wuv4mBOEny4UUzyk9 -d $Description
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "==> done" -ForegroundColor Green
