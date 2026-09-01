# Cache-busting deploy: bumps the ?v= version on the CSS/JS links so
# browsers fetch fresh files, then commits and pushes.
# Usage:  .\deploy.ps1 "your commit message"
param([string]$Message = "Update site")

$ErrorActionPreference = "Stop"
$ver = (Get-Date).ToUniversalTime().ToString("yyyyMMddHHmmss")
$enc = New-Object System.Text.UTF8Encoding($false)  # UTF-8, no BOM

foreach ($f in @("index.html", "admin.html")) {
  $path = Join-Path $PSScriptRoot $f
  $text = [System.IO.File]::ReadAllText($path)
  $text = [System.Text.RegularExpressions.Regex]::Replace($text, '\?v=\d+', "?v=$ver")
  [System.IO.File]::WriteAllText($path, $text, $enc)
}

git add -A
git commit -m $Message
git push

Write-Host "Deployed. Asset version is now $ver"
