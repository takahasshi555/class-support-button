param(
  [Parameter(Mandatory = $false)]
  [string]$Message = "update app"
)

$ErrorActionPreference = "Stop"

function Run-Step {
  param(
    [string]$Title,
    [scriptblock]$Command
  )

  Write-Host ""
  Write-Host "== $Title =="
  & $Command
}

$nodePath = "C:\Program Files\nodejs"
if (Test-Path $nodePath) {
  $env:PATH = "$nodePath;$env:PATH"
}

Run-Step "Build" {
  npm run build
}

Run-Step "Stage files" {
  git add .
}

$hasStagedChanges = $false
git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  $hasStagedChanges = $true
}

if ($hasStagedChanges) {
  Run-Step "Commit" {
    git commit -m $Message
  }

  Run-Step "Push to GitHub" {
    git push
  }
} else {
  Write-Host ""
  Write-Host "== Commit =="
  Write-Host "No staged changes. Skipping commit and push."
}

Run-Step "Publish Firebase Realtime Database rules" {
  npx firebase-tools deploy --only database
}

Write-Host ""
Write-Host "Done."
Write-Host "Vercel will redeploy automatically after GitHub receives the push."
