# Weavarr installer for Windows.
#
#   irm https://raw.githubusercontent.com/mamoth100/weavarr/main/install.ps1 | iex
#
# Installs Docker Desktop if it is missing (through winget), then downloads
# the compose file into a weavarr folder in your user profile and starts
# Weavarr. Safe to run again: a second run updates Weavarr.
# Optional: set $env:WEAVARR_DIR first to change the install folder.
$ErrorActionPreference = 'Stop'

$Dir = if ($env:WEAVARR_DIR) { $env:WEAVARR_DIR } else { Join-Path $env:USERPROFILE 'weavarr' }
$ComposeUrl = 'https://raw.githubusercontent.com/mamoth100/weavarr/main/docker-compose.pull.yml'

function Say($msg) { Write-Host ""; Write-Host "==> $msg" -ForegroundColor Cyan }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Say "Docker is not installed. Installing Docker Desktop with winget."
  winget install --id Docker.DockerDesktop --exact --accept-source-agreements --accept-package-agreements
  Write-Host ""
  Write-Host "Docker Desktop is installed but needs to be opened once to finish setting up." -ForegroundColor Yellow
  Write-Host "Open it from the Start menu, let it finish (it may ask you to sign out and back in),"
  Write-Host "then run this command again to install Weavarr."
  return
}

# Docker Desktop must be running for any docker command to work.
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  Say "Docker Desktop is installed but not running. Starting it."
  $exe = Join-Path $env:ProgramFiles 'Docker\Docker\Docker Desktop.exe'
  if (Test-Path $exe) { Start-Process $exe }
  $deadline = (Get-Date).AddMinutes(3)
  do {
    Start-Sleep -Seconds 5
    docker info *> $null
  } while ($LASTEXITCODE -ne 0 -and (Get-Date) -lt $deadline)
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop did not come up within three minutes. Open it from the Start menu, wait for it to say it is running, then run this command again." -ForegroundColor Yellow
    return
  }
}

Say "Setting up $Dir"
New-Item -ItemType Directory -Force $Dir | Out-Null
Set-Location $Dir
if (Test-Path docker-compose.yml) { Say "Existing install found, updating." } else { Say "Downloading the compose file." }
Invoke-WebRequest $ComposeUrl -OutFile docker-compose.yml

Say "Starting Weavarr"
docker compose pull
docker compose up -d
docker image prune -f | Out-Null

Say "Weavarr is running."
Write-Host "Open http://localhost:6767 and fill in Settings."
Write-Host "Files live in $Dir. To update later, run this command again."
