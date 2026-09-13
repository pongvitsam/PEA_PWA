param(
  [string]$Description = "auto deploy"
)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

Write-Host "==> clasp push --force" -ForegroundColor Cyan
clasp push --force
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

# @HEAD deployment updates from push; no new version required
$HeadDeploymentId = "AKfycbz9zsy1GKzPwQQcE2J6EWYCq1UYVJ5yBvCdx7DqxVM"
Write-Host "==> clasp redeploy HEAD ($Description)" -ForegroundColor Cyan
clasp redeploy $HeadDeploymentId -V HEAD -d $Description
if ($LASTEXITCODE -ne 0) {
  Write-Host "HEAD redeploy skipped (read-only or unavailable). Push already applied to @HEAD." -ForegroundColor Yellow
}

$LegacyDeploymentId = "AKfycbwEIi5cZDzvdGqcfqcsJcPjW1pBnTALtZFlGYZDkCYl9MTvOL0wuv4mBOEny4UUzyk9"
Write-Host "==> clasp deploy legacy id (optional)" -ForegroundColor DarkGray
clasp deploy -i $LegacyDeploymentId -d $Description
if ($LASTEXITCODE -ne 0) {
  Write-Host "Legacy deploy skipped (likely 200-version limit). Pages uses @HEAD." -ForegroundColor Yellow
  exit 0
}

Write-Host "==> done" -ForegroundColor Green
